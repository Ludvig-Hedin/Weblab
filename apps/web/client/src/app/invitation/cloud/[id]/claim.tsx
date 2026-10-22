'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth, useClerk } from '@clerk/nextjs';
import { useAction, useConvexAuth } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useRouter } from 'next/navigation';
import { Button } from '@weblab/ui/button';
import type { Id } from '@convex/_generated/dataModel';
import { invitationApi, useCloudInvitationCopy } from '@/components/cloud-editor/invitation-api';
import { CloudInvitationSignIn } from '@/components/cloud-editor/invitation-sign-in';
import { invitationSessionUsable } from '@/components/cloud-editor/invitation-sign-in-state';
import { InvitationLifecycle, runInvitationClaim } from '@/components/cloud-editor/invitation-lifecycle';

export function CloudInvitationClaim({ invitationId }: { invitationId: string }) {
    const copy = useCloudInvitationCopy();
    const { userId, sessionId, isLoaded } = useAuth();
    const clerk = useClerk();
    const { isAuthenticated, isLoading } = useConvexAuth();
    const claim = useAction(invitationApi.claim);
    const router = useRouter();
    const [credential, setCredential] = useState<{ storageKey: string; token: string | null; stored: boolean } | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const storageKey = `cloud-invitation:${invitationId}`;
    const token = credential?.storageKey === storageKey ? credential.token : null;
    const stored = credential?.storageKey === storageKey && credential.stored;
    const validId = /^[a-z0-9]{16,64}$/.test(invitationId);
    const ready = useRef<() => boolean>(() => false);
    ready.current = () => validId && !!token && !!stored && isLoaded && !isLoading && isAuthenticated
        && !!userId && !!sessionId && clerk.user?.id === userId && clerk.session?.id === sessionId
        && invitationSessionUsable(clerk.session);
    const [lifecycle] = useState(() => new InvitationLifecycle(() => ({
        userId: clerk.user === undefined ? undefined : clerk.user?.id ?? null,
        sessionId: clerk.session === undefined ? undefined : clerk.session?.id ?? null,
    }), () => ready.current()));
    lifecycle.setScope(JSON.stringify([invitationId, token]));
    useEffect(() => {
        lifecycle.mount();
        const unsubscribe = clerk.addListener(({ user, session }) => {
            if (lifecycle.observe({ userId: user === undefined ? undefined : user?.id ?? null,
                sessionId: session === undefined ? undefined : session?.id ?? null })) {
                setBusy(false); setError(null);
            }
        });
        return () => { lifecycle.unmount(); unsubscribe(); };
    }, [clerk, lifecycle]);
    useEffect(() => {
        let value = window.location.hash.slice(1);
        let persisted = false;
        try {
            if (/^[a-f0-9]{64}$/.test(value)) sessionStorage.setItem(storageKey, value);
            else value = sessionStorage.getItem(storageKey) ?? '';
            persisted = /^[a-f0-9]{64}$/.test(value);
        } catch { /* Keep the bearer visible locally, but refuse acceptance without recovery storage. */ }
        setCredential({ storageKey, token: /^[a-f0-9]{64}$/.test(value) ? value : null, stored: persisted });
        setBusy(false); setError(null);
        if (window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname);
    }, [storageKey]);
    async function accept() {
        if (!token) return;
        const operation = lifecycle.begin();
        if (!operation) return;
        setBusy(true); setError(null);
        await runInvitationClaim(operation,
            () => claim({ invitationId: invitationId as Id<'cloudEditorInvitations'>, token }), {
                success: result => {
                    try {
                        if (operation.current() && sessionStorage.getItem(storageKey) === token) sessionStorage.removeItem(storageKey);
                    } catch { /* Membership is committed; storage is only local recovery. */ }
                    if (operation.current()) router.replace(`/project/${result.projectId}`);
                },
                failure: cause => {
                    const code = cause instanceof ConvexError ? cause.data : null;
                    setError(code === 'CLOUD_INVITATION_MEMBER_EXISTS' ? copy.memberExists : code === 'CLOUD_INVITATION_AUTH_UNAVAILABLE' ? copy.authUnavailable : copy.unavailable);
                },
                finish: () => setBusy(false),
            });
    }
    return <main className="flex min-h-screen items-center justify-center p-6"><div className="w-full max-w-sm space-y-4">
        <h1 className="text-xl font-medium">{copy.openTitle}</h1>
        <p className="text-foreground-secondary text-sm">{copy.openHelp}</p>
        {!credential ? <p role="status">{copy.loading}</p> : !validId || !token ? <p role="alert">{copy.unavailable}</p> : <>
            <CloudInvitationSignIn key={invitationId} disabled={!stored || busy}>
                {!isLoaded || isLoading ? <p role="status">{copy.loading}</p> : <Button disabled={busy || !ready.current()} onClick={() => void accept()}>{busy ? copy.accepting : copy.accept}</Button>}
            </CloudInvitationSignIn>
            {!stored && <p role="alert" className="text-sm">{copy.storageUnavailable}</p>}
        </>}
        {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
    </div></main>;
}
