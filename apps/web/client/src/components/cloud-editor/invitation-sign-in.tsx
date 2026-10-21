'use client';

import type { FormEvent, ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { useClerk, useSession } from '@clerk/nextjs';
import { useSignIn } from '@clerk/nextjs/legacy';
import { useLocale } from 'next-intl';

import { Button } from '@weblab/ui/button';
import { Input } from '@weblab/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@weblab/ui/input-otp';

import type { InvitationSignInAttempt } from './invitation-sign-in-state';
import en from '../../../messages/cloud-invitation-auth/en.json';
import sv from '../../../messages/cloud-invitation-auth/sv.json';
import { InvitationLifecycle } from './invitation-lifecycle';
import {
    invitationEmailFactor,
    invitationSessionUsable,
    invitationSignInNext,
} from './invitation-sign-in-state';

type Blocked = 'secondFactor' | 'unsupported' | 'sessionBlocked';
const COOLDOWN_MS = 30_000;

/** Authentication only. Invitation acceptance and verified-email authority stay in the parent/backend. */
export function CloudInvitationSignIn({
    children,
    disabled = false,
}: {
    children: ReactNode;
    disabled?: boolean;
}) {
    const copy = useLocale().startsWith('sv') ? sv : en;
    const clerk = useClerk();
    const { isLoaded: sessionLoaded, session } = useSession();
    const { isLoaded, signIn, setActive } = useSignIn();
    const inputId = useId();
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [attempt, setAttempt] = useState<{
        resource: InvitationSignInAttempt;
        id: string;
        emailAddressId: string;
    } | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const [blocked, setBlocked] = useState<Blocked | null>(null);
    const [remaining, setRemaining] = useState(0);
    const deadline = useRef(0);
    const allowed = useRef(!disabled);
    allowed.current = !disabled;
    const [lifecycle] = useState(
        () =>
            new InvitationLifecycle(
                () => ({
                    userId: clerk.user === undefined ? undefined : (clerk.user?.id ?? null),
                    sessionId:
                        clerk.session === undefined ? undefined : (clerk.session?.id ?? null),
                }),
                () => allowed.current,
            ),
    );
    lifecycle.setScope(String(disabled));
    useEffect(() => {
        lifecycle.mount();
        const unsubscribe = clerk.addListener(({ user, session: currentSession }) => {
            if (
                !lifecycle.observe({
                    userId: user === undefined ? undefined : (user?.id ?? null),
                    sessionId:
                        currentSession === undefined ? undefined : (currentSession?.id ?? null),
                })
            )
                return;
            setBusy(false);
            setAttempt(null);
            setCode('');
            setEmail('');
            setError(false);
            setBlocked(null);
        });
        return () => {
            lifecycle.unmount();
            unsubscribe();
        };
    }, [clerk, lifecycle]);
    useEffect(() => {
        if (disabled) {
            setBusy(false);
            setAttempt(null);
            setCode('');
        }
    }, [disabled]);
    useEffect(() => {
        if (remaining === 0) return;
        const timer = window.setInterval(
            () => setRemaining(Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000))),
            500,
        );
        return () => window.clearInterval(timer);
    }, [remaining]);

    function begin() {
        if (!isLoaded || !sessionLoaded) return null;
        const operation = lifecycle.begin();
        if (!operation) return null;
        setBusy(true);
        setError(false);
        return {
            ...operation,
            finish: () => {
                if (operation.finish()) setBusy(false);
            },
        };
    }
    function cooldown() {
        deadline.current = Date.now() + COOLDOWN_MS;
        setRemaining(COOLDOWN_MS / 1000);
    }
    async function send(event: FormEvent) {
        event.preventDefault();
        if (
            !signIn ||
            session ||
            Date.now() < deadline.current ||
            !email.trim() ||
            email.length > 320
        )
            return;
        const operation = begin();
        if (!operation) return;
        try {
            cooldown(); // Includes uncertain sends; no immediate duplicate after a lost reply.
            const result = await signIn.create({ identifier: email.trim() });
            if (!operation.current()) return;
            if (!result.id || clerk.client?.signIn.id !== result.id) {
                setBlocked('unsupported');
                return;
            }
            const factor = invitationEmailFactor(result);
            if (factor?.strategy !== 'email_code') {
                setBlocked(
                    result.status === 'needs_second_factor' ? 'secondFactor' : 'unsupported',
                );
                return;
            }
            const id = result.id;
            await result.prepareFirstFactor({
                strategy: 'email_code',
                emailAddressId: factor.emailAddressId,
            });
            if (!operation.current() || result.id !== id || clerk.client?.signIn.id !== id) return;
            setAttempt({ resource: result, id, emailAddressId: factor.emailAddressId });
            setCode('');
        } catch {
            if (operation.current()) setError(true);
        } finally {
            operation.finish();
        }
    }
    async function resend() {
        if (!attempt || Date.now() < deadline.current) return;
        if (clerk.client?.signIn.id !== attempt.id || attempt.resource.id !== attempt.id) {
            setBlocked('unsupported');
            return;
        }
        const operation = begin();
        if (!operation) return;
        try {
            cooldown();
            await attempt.resource.prepareFirstFactor({
                strategy: 'email_code',
                emailAddressId: attempt.emailAddressId,
            });
            if (!operation.current() || clerk.client?.signIn.id !== attempt.id) return;
            setCode('');
        } catch {
            if (operation.current()) setError(true);
        } finally {
            operation.finish();
        }
    }
    async function verify(event: FormEvent) {
        event.preventDefault();
        if (!attempt || !setActive || !/^\d{6}$/.test(code)) return;
        if (clerk.client?.signIn.id !== attempt.id || attempt.resource.id !== attempt.id) {
            setBlocked('unsupported');
            return;
        }
        const operation = begin();
        if (!operation) return;
        try {
            const result = await attempt.resource.attemptFirstFactor({
                strategy: 'email_code',
                code,
            });
            if (
                !operation.current() ||
                result.id !== attempt.id ||
                clerk.client?.signIn.id !== attempt.id
            )
                return;
            setCode('');
            const next = invitationSignInNext(result, clerk.client?.sessions ?? []);
            if (next.kind !== 'activate') {
                setBlocked(
                    next.kind === 'second-factor'
                        ? 'secondFactor'
                        : next.kind === 'session-blocked'
                          ? 'sessionBlocked'
                          : 'unsupported',
                );
                return;
            }
            // No navigation or invitation claim follows activation. Reactive session
            // state must independently expose an active, task-free session first.
            const target = clerk.client?.sessions.find((item) => item.id === next.sessionId);
            if (!target?.user?.id || !invitationSessionUsable(target)) return;
            const targetOwner = { userId: target.user.id, sessionId: target.id };
            if (!operation.activate(targetOwner)) return;
            await setActive({
                session: next.sessionId,
                navigate: ({ session: activating }) => {
                    if (
                        !operation.current() ||
                        activating.id !== targetOwner.sessionId ||
                        activating.user?.id !== targetOwner.userId ||
                        !invitationSessionUsable(activating)
                    ) {
                        throw new Error('Invitation sign-in changed');
                    }
                },
            });
            if (!operation.current()) return;
        } catch {
            if (operation.current()) setError(true);
        } finally {
            operation.finish();
        }
    }
    async function switchAccount() {
        const captured = clerk.session;
        if (!captured) return;
        const operation = begin();
        if (!operation) return;
        try {
            await clerk.signOut(() => undefined, { sessionId: captured.id });
            if (!operation.current()) return;
        } catch {
            if (operation.current()) setError(true);
        } finally {
            operation.finish();
        }
    }
    function restart() {
        const operation = begin();
        if (!operation) return;
        setAttempt(null);
        setCode('');
        setBlocked(null);
        setError(false);
        operation.finish();
    }
    const unavailable = disabled || busy || !isLoaded || !sessionLoaded;
    return (
        <div className="space-y-4">
            {!isLoaded || !sessionLoaded ? (
                <p role="status" className="text-sm">
                    {copy.loading}
                </p>
            ) : session ? (
                <>
                    {invitationSessionUsable(session) ? (
                        busy ? (
                            <p role="status" className="text-sm">
                                {copy.working}
                            </p>
                        ) : (
                            children
                        )
                    ) : (
                        <p role="alert" className="text-sm">
                            {copy.sessionBlocked}
                        </p>
                    )}
                    <Button
                        variant="ghost"
                        disabled={unavailable}
                        onClick={() => void switchAccount()}
                    >
                        {copy.switchAccount}
                    </Button>
                </>
            ) : blocked ? (
                <>
                    <p role="alert" className="text-sm">
                        {copy[blocked]}
                    </p>
                    <Button variant="outline" disabled={unavailable} onClick={restart}>
                        {copy.tryAnother}
                    </Button>
                </>
            ) : attempt ? (
                <form onSubmit={verify} className="space-y-4">
                    <label htmlFor={`${inputId}-code`} className="text-sm">
                        {copy.code}
                    </label>
                    <InputOTP
                        id={`${inputId}-code`}
                        aria-label={copy.code}
                        autoComplete="one-time-code"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        value={code}
                        onChange={setCode}
                        disabled={unavailable}
                    >
                        <InputOTPGroup>
                            {[0, 1, 2, 3, 4, 5].map((index) => (
                                <InputOTPSlot key={index} index={index} />
                            ))}
                        </InputOTPGroup>
                    </InputOTP>
                    <Button type="submit" disabled={unavailable || !/^\d{6}$/.test(code)}>
                        {busy ? copy.working : copy.verify}
                    </Button>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            disabled={unavailable || remaining > 0}
                            onClick={() => void resend()}
                        >
                            {remaining > 0
                                ? copy.resendWait.replace('{seconds}', String(remaining))
                                : copy.resend}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            disabled={unavailable}
                            onClick={restart}
                        >
                            {copy.changeEmail}
                        </Button>
                    </div>
                </form>
            ) : (
                <form onSubmit={send} className="space-y-4">
                    <p className="text-foreground-secondary text-sm">{copy.existingAccount}</p>
                    <div className="space-y-2">
                        <label htmlFor={inputId} className="text-sm">
                            {copy.email}
                        </label>
                        <Input
                            id={inputId}
                            type="email"
                            autoComplete="email"
                            maxLength={320}
                            required
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            disabled={unavailable}
                        />
                    </div>
                    <Button type="submit" disabled={unavailable || !email.trim() || remaining > 0}>
                        {busy
                            ? copy.working
                            : remaining > 0
                              ? copy.resendWait.replace('{seconds}', String(remaining))
                              : copy.send}
                    </Button>
                </form>
            )}
            {error && (
                <p role="alert" className="text-destructive text-sm">
                    {copy.failed}
                </p>
            )}
        </div>
    );
}
