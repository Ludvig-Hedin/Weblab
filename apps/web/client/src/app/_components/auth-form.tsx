'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { SignInMethod } from '@weblab/models/auth';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';

import { sendEmailOtp } from '@/app/login/actions';
import { env } from '@/env';
import { transKeys } from '@/i18n/keys';
import { LocalForageKeys, Routes } from '@/utils/constants';
import { DevLoginButton, LoginButton } from './login-button';

// Per-tab key used to hand the email off to the verify page without putting
// PII (the user's plaintext email) in the URL — which would otherwise leak
// into browser history, the Referer header, and analytics tools.
//
// Must match the key read by /login/verify/page.tsx.
const LOGIN_EMAIL_KEY = 'weblab-login-email';

// Per-tab key tracking the last successful OTP send. Used to enforce a client
// cooldown so visitors can't fire repeated OTP sends from this form before the
// backend rate-limiter kicks in. Pairs with the verify-page resend cooldown.
const LOGIN_OTP_LAST_SEND_KEY = 'weblab-login-otp-last-send';
const OTP_SEND_COOLDOWN_MS = 30_000;

const AUTH_PROVIDERS = new Set(
    (env.NEXT_PUBLIC_AUTH_PROVIDERS ?? '')
        .split(',')
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean),
);

// Surface a dev-mode warning when `NEXT_PUBLIC_AUTH_PROVIDERS` is empty so the
// reviewer notices the OAuth buttons silently disappeared. Wrapped in
// `process.env.NODE_ENV` so this never reaches the production bundle.
if (
    typeof window !== 'undefined' &&
    process.env.NODE_ENV !== 'production' &&
    AUTH_PROVIDERS.size === 0 &&
    !env.NEXT_PUBLIC_SHOW_DEV_LOGIN
) {
    console.warn(
        '[auth-form] No NEXT_PUBLIC_AUTH_PROVIDERS configured — the login form is OTP-only. ' +
            'Set NEXT_PUBLIC_AUTH_PROVIDERS="github,google" in .env.local to enable OAuth.',
    );
}

interface AuthFormProps {
    /** Return URL to forward through OAuth / OTP flows. */
    returnUrl?: string | null;
    /** Optional initial email error (e.g. when redirected back with `missing=email`). */
    initialEmailError?: string | null;
    /**
     * Called right before navigating to the verify page after sending an OTP.
     * Lets surfaces like the auth modal close themselves before navigation.
     */
    onBeforeNavigate?: () => void;
    /** Optional className forwarded to the provider button wrapper. */
    providerButtonClassName?: string;
    /** Layout for OAuth provider buttons. Defaults to vertical stack. */
    providerLayout?: 'stack' | 'row';
}

/**
 * Shared auth form rendering env-gated OAuth provider buttons + email OTP entry.
 * Used by both the standalone /login page and the in-app AuthModal so they
 * stay feature-equivalent and respect `NEXT_PUBLIC_AUTH_PROVIDERS`.
 */
export function AuthForm({
    returnUrl = null,
    initialEmailError = null,
    onBeforeNavigate,
    providerButtonClassName,
    providerLayout = 'row',
}: AuthFormProps) {
    const t = useTranslations();
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [isEmailLoading, setIsEmailLoading] = useState(false);
    const [emailError, setEmailError] = useState<string | null>(initialEmailError);
    const [cooldownSecondsRemaining, setCooldownSecondsRemaining] = useState(0);

    useEffect(() => {
        let stored = 0;
        try {
            stored = Number(sessionStorage.getItem(LOGIN_OTP_LAST_SEND_KEY) ?? '0');
        } catch {
            stored = 0;
        }
        if (!stored || Number.isNaN(stored)) return;
        const elapsed = Date.now() - stored;
        if (elapsed >= OTP_SEND_COOLDOWN_MS) return;
        const remaining = Math.ceil((OTP_SEND_COOLDOWN_MS - elapsed) / 1000);
        setCooldownSecondsRemaining(remaining);
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
    // `[DEV] Sign in as demo user` is supabase-only — it calls
    // `devLogin` which issues a Supabase magic link. In clerk mode it
    // would just bounce through `/sign-in?returnUrl=/projects` without
    // creating a session, leaving the user confused. Hide it unless the
    // active provider is Supabase.
    const showDevLogin =
        env.NEXT_PUBLIC_SHOW_DEV_LOGIN && env.NEXT_PUBLIC_AUTH_PROVIDER !== 'clerk';
    const hasOAuthProvider = showGithub || showGoogle;
    const hasAnyProvider = hasOAuthProvider || showDevLogin;

    async function handleSendCode(e: React.FormEvent) {
        e.preventDefault();
        // Normalize once at the entry point so the OTP send and the verify-
        // page lookup operate on the same string. Pasted emails commonly
        // pick up trailing whitespace or a stray uppercase domain.
        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail) return;
        setIsEmailLoading(true);
        setEmailError(null);
        try {
            const result = await sendEmailOtp(normalizedEmail);
            if (result.error) {
                setEmailError(result.error);
                return;
            }
            // Stash the email in sessionStorage so we don't have to put it in
            // the URL. sessionStorage is per-tab, so the verify page (opened
            // via router.push in the same tab) can read it back.
            try {
                sessionStorage.setItem(LOGIN_EMAIL_KEY, normalizedEmail);
                // Stamp the successful-send timestamp so the cooldown UI
                // survives navigation back to /login.
                sessionStorage.setItem(LOGIN_OTP_LAST_SEND_KEY, String(Date.now()));
            } catch {
                // sessionStorage can throw in private mode or when over quota.
                // The verify page handles a missing email by redirecting back
                // to /login?missing=email, so this fallback is acceptable.
            }
            setCooldownSecondsRemaining(Math.ceil(OTP_SEND_COOLDOWN_MS / 1000));
            const params = new URLSearchParams();
            if (returnUrl) params.set(LocalForageKeys.RETURN_URL, returnUrl);
            // Stamp the time the OTP was sent so the verify page can compute
            // an accurate resend cooldown rather than restarting it on mount.
            params.set('sentAt', String(Date.now()));
            // Let the surface (e.g. modal) close itself before we navigate away.
            onBeforeNavigate?.();
            router.push(`${Routes.LOGIN_VERIFY}?${params.toString()}`);
        } catch {
            setEmailError('Something went wrong. Please try again.');
        } finally {
            setIsEmailLoading(false);
        }
    }

    return (
        <div className="flex flex-col space-y-4">
            {hasOAuthProvider && (
                <div
                    className={
                        providerLayout === 'row'
                            ? 'flex flex-col space-y-2'
                            : 'flex flex-col space-y-2'
                    }
                >
                    {showGithub && (
                        <LoginButton
                            className={providerButtonClassName}
                            returnUrl={returnUrl}
                            method={SignInMethod.GITHUB}
                            icon={<Icons.GitHubLogo className="mr-2 h-4 w-4" />}
                            translationKey="github"
                            providerName="GitHub"
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
                        />
                    )}
                </div>
            )}
            {showDevLogin && (
                <DevLoginButton className={providerButtonClassName} returnUrl={returnUrl} />
            )}
            {hasAnyProvider && (
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
                    placeholder={t(transKeys.welcome.login.emailPlaceholder)}
                    className="placeholder:text-foreground-tertiary"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    // Submit on Enter explicitly: the submit button is disabled
                    // while `!email`, which can suppress the form's implicit
                    // submission. requestSubmit() still runs onSubmit + native
                    // validation.
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            e.currentTarget.form?.requestSubmit();
                        }
                    }}
                    disabled={isEmailLoading}
                    required
                    autoComplete="email"
                    inputMode="email"
                    // /login is the page's sole primary action — focus the
                    // input so desktop users (window opens directly here) can
                    // start typing without a click. Web visitors benefit too.
                    autoFocus
                    // RFC 5321: full address ≤ 254 chars. Anything longer is
                    // either a bug or an abuse attempt.
                    maxLength={254}
                />
                {emailError && <p className="text-small text-red-500">{emailError}</p>}
                <Button
                    type="submit"
                    variant="outline"
                    className="w-full"
                    disabled={isEmailLoading || !email || cooldownSecondsRemaining > 0}
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
            </form>
        </div>
    );
}
