'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useClerk } from '@clerk/nextjs';
// Use the legacy hooks subpath. `@clerk/nextjs` v7 re-exports the "Future"
// API from its main entry, which is an experimental shape (`SignInFutureResource`)
// missing `authenticateWithRedirect` / `prepareFirstFactor`. The legacy export
// is the stable v6-style API our custom flow targets.
import { useSignIn, useSignUp } from '@clerk/nextjs/legacy';
import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { cn } from '@weblab/ui/utils';

import { env } from '@/env';
import { transKeys } from '@/i18n/keys';
import { LocalForageKeys } from '@/utils/constants';

// Per-tab key used to hand the email off to /sign-in/verify without putting
// PII in the URL (would leak into history, Referer, analytics).
const SIGN_IN_EMAIL_KEY = 'weblab-clerk-sign-in-email';

// Per-tab key flagging whether the active Clerk attempt is a sign-in (existing
// user) or sign-up (new user). Verify page uses this to call the right
// `attempt*` method.
const SIGN_IN_MODE_KEY = 'weblab-clerk-sign-in-mode';
export type ClerkOtpMode = 'sign-in' | 'sign-up';

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

// Inline Vercel triangle. No icon component exists for it in `@weblab/ui` yet;
// inlining avoids adding a one-off to the shared package.
function VercelLogo({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            className={className}
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden
        >
            <path d="M12 3l10 18H2L12 3z" />
        </svg>
    );
}

// `oauth_*` strategy literal for each provider. Pinned here so the strategy
// → Clerk-provider mapping lives in one place.
type ClerkOAuthProvider = 'github' | 'google' | 'vercel';
const OAUTH_STRATEGIES = {
    github: 'oauth_github',
    google: 'oauth_google',
    vercel: 'oauth_vercel',
} as const;

function isAlreadySignedInError(err: unknown) {
    type ClerkAPIErrorLike = {
        errors?: Array<{
            code?: string;
            message?: string;
            longMessage?: string;
        }>;
    };
    const apiErr = err as ClerkAPIErrorLike;
    const first = apiErr?.errors?.[0];
    const text = `${first?.code ?? ''} ${first?.message ?? ''} ${first?.longMessage ?? ''}`;
    return /already\s+signed\s+in|session.*exist|signed_in/i.test(text);
}

/**
 * Custom sign-in / sign-up form for Clerk mode. Renders a single OTP form
 * that handles both existing and new users — we try `signIn.create` first
 * and fall back to `signUp.create` when Clerk reports the identifier isn't
 * registered yet. The UI is identical for either case (no password, no
 * separate sign-up surface).
 */
export function ClerkAuthForm({
    returnUrl = null,
    initialEmailError = null,
    providerButtonClassName,
}: ClerkAuthFormProps) {
    const t = useTranslations();
    const router = useRouter();
    const { signOut } = useClerk();
    const { isLoaded: isSignInLoaded, signIn } = useSignIn();
    const { isLoaded: isSignUpLoaded, signUp } = useSignUp();
    const isLoaded = isSignInLoaded && isSignUpLoaded;

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
    // Vercel is shown unconditionally — env-gating it requires touching
    // `NEXT_PUBLIC_AUTH_PROVIDERS` (other agent's WIP). Clerk must have
    // Vercel OAuth configured in its dashboard for the redirect to succeed;
    // if it isn't, the click surfaces the API error to `oauthError` below.
    const showVercel = true;
    const hasOAuthProvider = showGithub || showGoogle || showVercel;

    // Desktop bridge surface — only present when running inside the Electron
    // shell (preload.js exposes `window.weblabNative`). Used to detect "are
    // we in desktop?" and to hand OAuth flows off to the OS browser, since
    // Google blocks OAuth inside embedded Chromium and the other providers
    // mis-configure the OAuth `client_id` when not in a real browser
    // context. The result is the user seeing "Access blocked: Authorization
    // Error — Missing required parameter: client_id" the moment any
    // provider page loads inside Electron.
    type WeblabNativeBridge = {
        target?: string;
        openExternal?: (url: string) => Promise<boolean | undefined>;
    };
    function getDesktopBridge(): WeblabNativeBridge | null {
        if (typeof window === 'undefined') return null;
        const w = window as unknown as { weblabNative?: WeblabNativeBridge };
        return w.weblabNative?.target === 'desktop' ? w.weblabNative : null;
    }

    async function handleOAuth(provider: ClerkOAuthProvider) {
        if (!isLoaded || !signIn) return;
        setOauthError(null);

        // Desktop path: open the system browser at `/sign-in/desktop-handoff`
        // and let the user sign in there. The handoff page mints a Clerk
        // sign-in token, fires `weblab://auth/handoff?ticket=…`, and the
        // desktop shell finishes the flow at `/sign-in/redeem`. No
        // `authenticateWithRedirect` call here — that would either run
        // inside Electron's `persist:weblab` partition (Google blocks it)
        // or open a custom auth window (previous approach: client_id was
        // missing or the third-party cookie checks rejected it).
        const desktop = getDesktopBridge();
        if (desktop?.openExternal) {
            try {
                const handoffUrl = new URL('/sign-in/desktop-handoff', window.location.origin);
                // Forward a hint about which provider the user picked. The
                // handoff page itself doesn't need it (Clerk's signed-in
                // check handles the routing), but it lets the in-browser
                // sign-in page pre-trigger the same OAuth provider on
                // arrival in a future iteration.
                handoffUrl.searchParams.set('provider', provider);
                if (returnUrl && returnUrl.length > 0) {
                    handoffUrl.searchParams.set('returnUrl', returnUrl);
                }
                const handed = await desktop.openExternal(handoffUrl.toString());
                if (handed === false) {
                    setOauthError(
                        'Could not open your default browser. Check that one is set as default.',
                    );
                }
            } catch (err) {
                if (env.NODE_ENV !== 'production') {
                    console.error('[clerk-auth-form] desktop OAuth handoff failed', err);
                }
                setOauthError('Could not open your default browser. Please try again.');
            }
            return;
        }

        const signInResource = signIn;
        async function startOAuth() {
            await signInResource.authenticateWithRedirect({
                strategy: OAUTH_STRATEGIES[provider],
                // Clerk needs an in-app callback to finalize the session it
                // built from the OAuth provider redirect. /sign-in/sso-callback
                // mounts <AuthenticateWithRedirectCallback /> for that.
                redirectUrl: '/sign-in/sso-callback',
                // `??` falls through only on null/undefined, but an empty
                // returnUrl from a stripped query param should also default
                // to /projects — guard with the explicit ternary instead.
                redirectUrlComplete: returnUrl && returnUrl.length > 0 ? returnUrl : '/projects',
            });
        }

        try {
            await startOAuth();
        } catch (err) {
            let flowError = err;
            // Mirror the email/OTP path: when the persisted Clerk session is
            // stale (page rendered signed-out but the client still has a
            // leftover session — common in the Electron shell, where the
            // `persist:weblab` cookie jar outlives a logout), authenticate-
            // WithRedirect throws "you're already signed in". Clear the
            // stale session client-side and retry once before surfacing the
            // error. Without this, desktop users with a leftover session
            // see the OAuth buttons do nothing (Clerk surfaces an empty /
            // generic message that renders as a blank error line).
            if (isAlreadySignedInError(err)) {
                try {
                    await signOut();
                    await startOAuth();
                    return;
                } catch (retryError) {
                    flowError = retryError;
                }
            }
            if (env.NODE_ENV !== 'production') {
                console.error('[clerk-auth-form] OAuth failed', flowError);
            }
            // Prefer Clerk's structured error fields over the generic
            // `Error.message` — `ClerkAPIResponseError.message` is often a
            // short summary like "Failed to authenticate", while the
            // user-facing text lives at `errors[0].longMessage`.
            type ClerkAPIErrorLike = {
                errors?: Array<{ message?: string; longMessage?: string }>;
            };
            const apiErr = flowError as ClerkAPIErrorLike;
            const first = apiErr?.errors?.[0];
            const fallback = 'Please try again.';
            // Pick the first non-empty candidate. Plain `??` would accept an
            // empty-string `longMessage` over a populated `message`, which
            // some Clerk error shapes surface; explicit length-check is the
            // safest selector.
            const candidates = [
                first?.longMessage,
                first?.message,
                flowError instanceof Error ? flowError.message : undefined,
            ];
            const picked = candidates.find(
                (c): c is string => typeof c === 'string' && c.length > 0,
            );
            setOauthError(picked ?? fallback);
        }
    }

    async function handleSendCode(e: React.FormEvent) {
        e.preventDefault();
        if (!isLoaded || !signIn || !signUp) return;
        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail) return;
        setIsEmailLoading(true);
        setEmailError(null);

        // Inner helper: try the sign-in path first, fall back to sign-up when
        // Clerk reports the identifier isn't registered. Returns the resolved
        // mode so the verify page can call the matching attempt method.
        async function startOtpFlow(): Promise<ClerkOtpMode> {
            if (!signIn || !signUp) throw new Error('Clerk not loaded.');
            const signInResource = signIn;
            const signUpResource = signUp;
            async function createSignInAttempt() {
                await signInResource.create({
                    strategy: 'email_code',
                    identifier: normalizedEmail,
                });
            }

            try {
                await createSignInAttempt();
                return 'sign-in';
            } catch (err) {
                let flowError = err;
                if (isAlreadySignedInError(err)) {
                    await signOut();
                    try {
                        await createSignInAttempt();
                        return 'sign-in';
                    } catch (retryError) {
                        flowError = retryError;
                    }
                }
                type ClerkAPIErrorLike = {
                    errors?: Array<{
                        code?: string;
                        message?: string;
                        longMessage?: string;
                    }>;
                };
                const apiErr = flowError as ClerkAPIErrorLike;
                const code = apiErr?.errors?.[0]?.code;
                // `form_identifier_not_found` is Clerk's "no user with this
                // email" error. Anything else (network, rate limit, identifier
                // invalid) we propagate so the outer catch shows it.
                if (code !== 'form_identifier_not_found') throw flowError;
                await signUpResource.create({ emailAddress: normalizedEmail });
                await signUpResource.prepareEmailAddressVerification({
                    strategy: 'email_code',
                });
                return 'sign-up';
            }
        }

        try {
            const mode = await startOtpFlow();
            try {
                sessionStorage.setItem(SIGN_IN_EMAIL_KEY, normalizedEmail);
                sessionStorage.setItem(SIGN_IN_MODE_KEY, mode);
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
            type ClerkAPIErrorLike = {
                errors?: Array<{ message?: string; longMessage?: string }>;
            };
            const apiErr = err as ClerkAPIErrorLike;
            const first = apiErr?.errors?.[0];
            setEmailError(first?.longMessage ?? first?.message ?? fallback);
        } finally {
            setIsEmailLoading(false);
        }
    }

    // Square, icon-only OAuth button. Sits in a row alongside its siblings.
    // The visual height matches the email submit button (h-11 = 44px) so the
    // form has a single button-height system.
    const oauthButtonClass =
        'flex h-11 flex-1 items-center justify-center rounded-full border border-border bg-background-weblab text-foreground-primary transition-colors hover:bg-background-secondary disabled:cursor-not-allowed disabled:opacity-60';

    return (
        <div className="flex w-full flex-col items-center space-y-4">
            {hasOAuthProvider && (
                <div className="flex w-full items-center justify-center gap-2">
                    {showGithub && (
                        <button
                            type="button"
                            aria-label={t(transKeys.welcome.login.github)}
                            // `title` surfaces the same label as a hover
                            // tooltip — the buttons are icon-only so sighted
                            // mouse users get parity with screen readers.
                            title={t(transKeys.welcome.login.github)}
                            onClick={() => void handleOAuth('github')}
                            disabled={!isLoaded}
                            className={cn(oauthButtonClass, providerButtonClassName)}
                        >
                            <Icons.GitHubLogo className="h-5 w-5" />
                            <span className="sr-only">{t(transKeys.welcome.login.github)}</span>
                        </button>
                    )}
                    {showGoogle && (
                        <button
                            type="button"
                            aria-label={t(transKeys.welcome.login.google)}
                            title={t(transKeys.welcome.login.google)}
                            onClick={() => void handleOAuth('google')}
                            disabled={!isLoaded}
                            className={cn(oauthButtonClass, providerButtonClassName)}
                        >
                            <Icons.GoogleLogo viewBox="0 0 24 24" className="h-5 w-5" />
                            <span className="sr-only">{t(transKeys.welcome.login.google)}</span>
                        </button>
                    )}
                    {showVercel && (
                        <button
                            type="button"
                            aria-label="Sign in with Vercel"
                            title="Sign in with Vercel"
                            onClick={() => void handleOAuth('vercel')}
                            disabled={!isLoaded}
                            className={cn(oauthButtonClass, providerButtonClassName)}
                        >
                            <VercelLogo className="h-5 w-5" />
                            <span className="sr-only">Sign in with Vercel</span>
                        </button>
                    )}
                </div>
            )}
            {oauthError && (
                <p className="text-small text-destructive w-full text-center">{oauthError}</p>
            )}
            {hasOAuthProvider && (
                <div className="flex w-full items-center gap-3">
                    <div className="bg-border h-px flex-1" />
                    <span className="text-small text-foreground-tertiary">or</span>
                    <div className="bg-border h-px flex-1" />
                </div>
            )}
            <form
                onSubmit={(event) => {
                    void handleSendCode(event);
                }}
                className="w-full space-y-2"
            >
                <Input
                    type="email"
                    // `name` is the trigger browser autofill keys off of.
                    // Without it, Chrome/Safari skip the saved-credential
                    // suggestion entirely.
                    name="email"
                    id="weblab-sign-in-email"
                    placeholder={t(transKeys.welcome.login.emailPlaceholder)}
                    // Fully rounded, border-only (no fill), centered text. h-11
                    // (44px) matches the OAuth buttons. `dark:bg-transparent`
                    // overrides the Input default of `dark:bg-input/30` which
                    // would otherwise paint a filled background in dark mode.
                    // `py-0 leading-none` collapses the default `py-1` so the
                    // browser centers the text/placeholder against the full
                    // 44px box instead of within a 36px content area — fixes
                    // the placeholder sitting slightly above center.
                    className="placeholder:text-foreground-tertiary border-border h-11 w-full rounded-full bg-transparent py-0 text-center leading-none dark:bg-transparent"
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
                {emailError && (
                    <p className="text-small text-destructive w-full text-center">{emailError}</p>
                )}
                <Button
                    type="submit"
                    variant="outline"
                    // `text-[14px]` pins the label to 14px so it doesn't grow
                    // alongside other `text-regular` defaults. `h-11` keeps
                    // visual height aligned with OAuth buttons.
                    className="h-11 w-full rounded-full text-[14px]"
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
                {/* Hint at what the "Continue with email" action does — the
                    flow uses Clerk's `email_code` strategy, so the next step
                    is a 6-digit code in their inbox, not a password prompt.
                    Hidden during loading/cooldown to avoid competing with the
                    button's status text. */}
                {!isEmailLoading && cooldownSecondsRemaining === 0 && (
                    <p className="text-small text-foreground-tertiary w-full text-center">
                        We&apos;ll email you a code
                    </p>
                )}
                <p className="text-small text-foreground-tertiary w-full text-center">
                    Don&apos;t have an account?{' '}
                    {/* /sign-up redirects to /sign-in; the form below already
                        creates the account on first OTP if the email isn't
                        registered. Link kept for accessibility / bookmarks. */}
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
