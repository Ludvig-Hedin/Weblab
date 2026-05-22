'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
// Use the legacy hooks subpath. `@clerk/nextjs` v7 re-exports the "Future"
// API from its main entry, which is an experimental shape (`SignInFutureResource`)
// missing `authenticateWithRedirect` / `prepareFirstFactor`. The legacy export
// is the stable v6-style API our custom flow targets.
import { useSignIn } from '@clerk/nextjs/legacy';
import { useTranslations } from 'next-intl';

import { SignInMethod } from '@weblab/models/auth';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';

import { LoginButton } from '@/app/_components/login-button';
import { env } from '@/env';
import { transKeys } from '@/i18n/keys';
import { LocalForageKeys } from '@/utils/constants';

// Per-tab key used to hand the email off to /sign-in/verify without putting
// PII in the URL (would leak into history, Referer, analytics).
const SIGN_IN_EMAIL_KEY = 'weblab-clerk-sign-in-email';

// Per-tab key tracking the last successful OTP send. Mirrors the Supabase
// /login form's cooldown so the UX is identical.
const SIGN_IN_OTP_LAST_SEND_KEY = 'weblab-clerk-sign-in-otp-last-send';
const OTP_SEND_COOLDOWN_MS = 30_000;

// Cross-tab durable key. Stores the last email the user attempted to sign in
// with so the form prefills on a future visit. Browsers' autofill kicks in
// the first time someone types but does nothing on cold returns; this fills
// that gap.
const LAST_USED_EMAIL_KEY = 'weblab-clerk-last-email';

const AUTH_PROVIDERS = new Set(
    (env.NEXT_PUBLIC_AUTH_PROVIDERS ?? '')
        .split(',')
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean),
);

interface ClerkAuthFormProps {
    /** Forwarded through OAuth + OTP flows. */
    returnUrl?: string | null;
    /** Optional initial email error (e.g. when redirected back with `missing=email`). */
    initialEmailError?: string | null;
    providerButtonClassName?: string;
}

/**
 * Custom sign-in form for Clerk mode. Renders the same OAuth row + email-OTP
 * layout as the Supabase-backed AuthForm on /login, but drives Clerk's sign-in
 * primitives so we get our own design with no Clerk branding.
 *
 * - OAuth providers use `signIn.authenticateWithRedirect` so Clerk owns the
 *   provider round-trip; we hand it our SSO callback path.
 * - Email uses the `email_code` strategy. The 6-digit code is verified on
 *   `/sign-in/verify`.
 */
export function ClerkAuthForm({
    returnUrl = null,
    initialEmailError = null,
    providerButtonClassName,
}: ClerkAuthFormProps) {
    const t = useTranslations();
    const router = useRouter();
    const { isLoaded, signIn } = useSignIn();

    const [email, setEmail] = useState('');
    const [isEmailLoading, setIsEmailLoading] = useState(false);
    const [emailError, setEmailError] = useState<string | null>(initialEmailError);
    const [cooldownSecondsRemaining, setCooldownSecondsRemaining] = useState(0);
    const [oauthError, setOauthError] = useState<string | null>(null);

    // Hydrate the cooldown from sessionStorage so backing out of /verify keeps
    // the resend timer accurate. Matches AuthForm behavior.
    useEffect(() => {
        let stored = 0;
        try {
            stored = Number(sessionStorage.getItem(SIGN_IN_OTP_LAST_SEND_KEY) ?? '0');
        } catch {
            stored = 0;
        }
        if (!stored || Number.isNaN(stored)) return;
        const elapsed = Date.now() - stored;
        if (elapsed >= OTP_SEND_COOLDOWN_MS) return;
        setCooldownSecondsRemaining(Math.ceil((OTP_SEND_COOLDOWN_MS - elapsed) / 1000));
    }, []);

    // Prefill the email field from the most recent successful send. Runs once
    // on mount; if the user already typed something we don't clobber it.
    useEffect(() => {
        try {
            const last = localStorage.getItem(LAST_USED_EMAIL_KEY);
            if (last) setEmail((prev) => prev || last);
        } catch {
            // localStorage unavailable — no prefill, no crash.
        }
    }, []);

    useEffect(() => {
        if (cooldownSecondsRemaining <= 0) return;
        const id = setInterval(() => {
            setCooldownSecondsRemaining((prev) => (prev <= 1 ? 0 : prev - 1));
        }, 1000);
        return () => clearInterval(id);
    }, [cooldownSecondsRemaining]);

    const showGithub = AUTH_PROVIDERS.has('github');
    const showGoogle = AUTH_PROVIDERS.has('google');
    const hasOAuthProvider = showGithub || showGoogle;

    async function handleOAuth(provider: 'github' | 'google') {
        if (!isLoaded || !signIn) return;
        setOauthError(null);
        const strategy = provider === 'github' ? 'oauth_github' : 'oauth_google';
        try {
            await signIn.authenticateWithRedirect({
                strategy,
                // Clerk needs an in-app callback to finalize the session it
                // built from the OAuth provider redirect. /sign-in/sso-callback
                // mounts <AuthenticateWithRedirectCallback /> for that.
                redirectUrl: '/sign-in/sso-callback',
                // `??` falls through only on null/undefined, but an empty
                // returnUrl from a stripped query param should also default
                // to /projects — guard with the explicit ternary instead.
                redirectUrlComplete: returnUrl && returnUrl.length > 0 ? returnUrl : '/projects',
            });
        } catch (err) {
            if (env.NODE_ENV !== 'production') {
                console.error('[clerk-auth-form] OAuth failed', err);
            }
            const message = err instanceof Error ? err.message : 'Please try again.';
            setOauthError(message);
        }
    }

    async function handleSendCode(e: React.FormEvent) {
        e.preventDefault();
        if (!isLoaded || !signIn) return;
        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail) return;
        setIsEmailLoading(true);
        setEmailError(null);
        try {
            // Single-call path: passing `strategy: 'email_code'` to `create`
            // both starts the SignIn attempt and ships the OTP email — the
            // previous two-call sequence (`create` then `prepareFirstFactor`)
            // doubled the round-trip count and was the visible "loads for a
            // few seconds before the code page" delay.
            await signIn.create({
                strategy: 'email_code',
                identifier: normalizedEmail,
            });

            try {
                sessionStorage.setItem(SIGN_IN_EMAIL_KEY, normalizedEmail);
                sessionStorage.setItem(SIGN_IN_OTP_LAST_SEND_KEY, String(Date.now()));
                // Persist across tabs / page reloads for next visit autofill.
                // localStorage (not sessionStorage) so the browser remembers
                // even after the tab is closed. Cleared on successful verify.
                localStorage.setItem(LAST_USED_EMAIL_KEY, normalizedEmail);
            } catch {
                // Storage can throw in private mode or when over quota.
                // /sign-in/verify handles a missing email by redirecting back.
            }
            setCooldownSecondsRemaining(Math.ceil(OTP_SEND_COOLDOWN_MS / 1000));

            const params = new URLSearchParams();
            if (returnUrl) params.set(LocalForageKeys.RETURN_URL, returnUrl);
            params.set('sentAt', String(Date.now()));
            router.push(`/sign-in/verify?${params.toString()}`);
        } catch (err) {
            // Clerk surfaces a ClerkAPIResponseError-shaped object on failure;
            // unwrap the first message for user-facing display.
            const fallback = 'Something went wrong. Please try again.';
            type ClerkAPIErrorLike = { errors?: Array<{ message?: string; longMessage?: string }> };
            const apiErr = err as ClerkAPIErrorLike;
            const first = apiErr?.errors?.[0];
            setEmailError(first?.longMessage ?? first?.message ?? fallback);
        } finally {
            setIsEmailLoading(false);
        }
    }

    return (
        <div className="flex flex-col space-y-4">
            {hasOAuthProvider && (
                <div className="flex flex-col space-y-2">
                    {showGithub && (
                        <LoginButton
                            className={providerButtonClassName}
                            returnUrl={returnUrl}
                            method={SignInMethod.GITHUB}
                            icon={<Icons.GitHubLogo className="mr-2 h-4 w-4" />}
                            translationKey="github"
                            providerName="GitHub"
                            onClickOverride={() => handleOAuth('github')}
                        />
                    )}
                    {showGoogle && (
                        <LoginButton
                            className={providerButtonClassName}
                            returnUrl={returnUrl}
                            method={SignInMethod.GOOGLE}
                            icon={<Icons.GoogleLogo viewBox="0 0 24 24" className="mr-2 h-4 w-4" />}
                            translationKey="google"
                            providerName="Google"
                            onClickOverride={() => handleOAuth('google')}
                        />
                    )}
                </div>
            )}
            {oauthError && <p className="text-small text-red-500">{oauthError}</p>}
            {hasOAuthProvider && (
                <div className="flex items-center gap-3">
                    <div className="bg-border h-px flex-1" />
                    <span className="text-small text-foreground-tertiary">or</span>
                    <div className="bg-border h-px flex-1" />
                </div>
            )}
            <form
                onSubmit={(event) => {
                    void handleSendCode(event);
                }}
                className="space-y-2"
            >
                <Input
                    type="email"
                    // `name` is the trigger browser autofill keys off of.
                    // Without it, Chrome/Safari skip the saved-credential
                    // suggestion entirely.
                    name="email"
                    id="weblab-sign-in-email"
                    placeholder={t(transKeys.welcome.login.emailPlaceholder)}
                    className="placeholder:text-foreground-tertiary"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            e.currentTarget.form?.requestSubmit();
                        }
                    }}
                    disabled={isEmailLoading || !isLoaded}
                    required
                    autoComplete="email"
                    inputMode="email"
                    // Sign-in page's sole primary action — focus the input so
                    // desktop users can start typing without a click. Matches
                    // the Supabase /login form.
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    maxLength={254}
                />
                {emailError && <p className="text-small text-red-500">{emailError}</p>}
                <Button
                    type="submit"
                    variant="outline"
                    className="w-full"
                    disabled={isEmailLoading || !email || cooldownSecondsRemaining > 0 || !isLoaded}
                >
                    {isEmailLoading ? (
                        <>
                            <Icons.LoadingSpinner className="mr-2 h-4 w-4 animate-spin" />
                            {t(transKeys.welcome.login.sending)}
                        </>
                    ) : cooldownSecondsRemaining > 0 ? (
                        `Resend in ${cooldownSecondsRemaining}s`
                    ) : (
                        t(transKeys.welcome.login.email)
                    )}
                </Button>
                <p className="text-small text-foreground-tertiary">
                    Don&apos;t have an account?{' '}
                    {/* `next/link` keeps the navigation client-side so we don't
                        tear down the ClerkProvider tree (and lose the in-flight
                        signIn singleton) on every nav between /sign-in and
                        /sign-up. Raw <a> would do a full reload. */}
                    <Link
                        href={
                            returnUrl
                                ? `/sign-up?${new URLSearchParams({ returnUrl }).toString()}`
                                : '/sign-up'
                        }
                        className="text-foreground-secondary hover:text-foreground-primary underline transition-colors duration-200"
                    >
                        Sign up
                    </Link>
                </p>
            </form>
        </div>
    );
}
