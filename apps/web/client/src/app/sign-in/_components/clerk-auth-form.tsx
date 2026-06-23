'use client';

import { useEffect, useMemo, useState } from 'react';
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

const DEFAULT_AUTH_PROVIDERS = 'github,google';
const AUTH_PROVIDERS = new Set(
    (env.NEXT_PUBLIC_AUTH_PROVIDERS?.trim() || DEFAULT_AUTH_PROVIDERS)
        .split(',')
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean),
);

interface ClerkAuthFormProps {
    /** Forwarded through OAuth + OTP flows. */
    returnUrl?: string | null;
    /** Optional initial email error (e.g. when redirected back with `missing=email`). */
    initialEmailError?: string | null;
    /**
     * Optional initial email value. Used by the desktop-handoff bounce so
     * the email the user typed in the Electron shell is prefilled in the
     * browser sign-in form (avoiding having to re-type it after the
     * `weblab://` → handoff round-trip).
     */
    initialEmail?: string | null;
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

// Domains offered as one-tap completions while the user types the local part
// of their email. Ordered by global prevalence so the most likely match sits
// at the top of the suggestion list.
const COMMON_EMAIL_DOMAINS = [
    'gmail.com',
    'outlook.com',
    'hotmail.com',
    'icloud.com',
    'yahoo.com',
] as const;
const MAX_EMAIL_SUGGESTIONS = 5;

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
    initialEmail = null,
    providerButtonClassName,
}: ClerkAuthFormProps) {
    const t = useTranslations();
    const router = useRouter();
    const { signOut } = useClerk();
    const { isLoaded: isSignInLoaded, signIn } = useSignIn();
    const { isLoaded: isSignUpLoaded, signUp } = useSignUp();
    const isLoaded = isSignInLoaded && isSignUpLoaded;

    const [email, setEmail] = useState(initialEmail ?? '');
    const [isEmailLoading, setIsEmailLoading] = useState(false);
    const [emailError, setEmailError] = useState<string | null>(initialEmailError);
    const [cooldownSecondsRemaining, setCooldownSecondsRemaining] = useState(0);
    const [oauthError, setOauthError] = useState<string | null>(null);

    // Email domain autocomplete. `isInputFocused` gates the dropdown to the
    // active field; `menuDismissed` lets Escape hide it without blurring;
    // `highlightedIndex` drives keyboard navigation (-1 = nothing highlighted).
    const [isInputFocused, setIsInputFocused] = useState(false);
    const [menuDismissed, setMenuDismissed] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);

    const hasEmail = email.trim().length > 0;

    // Floating-label gate. Empty + unfocused → the label rests inside the field
    // (acting as the placeholder). Focused OR has-value → it floats up onto the
    // top border and the "your@email.com" hint takes over inside the field.
    const isEmailFloating = isInputFocused || hasEmail;

    // Build domain completions from whatever the user has typed. Before the
    // `@`, every common domain is offered; after it, the list narrows to
    // domains that prefix-match what's been typed. A fully-typed known domain
    // yields no suggestions (the menu closes on its own).
    const { local: emailLocalPart, suggestions: emailSuggestions } = useMemo(() => {
        const trimmed = email.trim().toLowerCase();
        const atIndex = trimmed.indexOf('@');
        const local = atIndex === -1 ? trimmed : trimmed.slice(0, atIndex);
        const typedDomain = atIndex === -1 ? '' : trimmed.slice(atIndex + 1);

        // Need a local part, and bail if it's malformed (spaces, a second @).
        if (!local || /[\s@]/.test(local) || (atIndex !== -1 && typedDomain.includes('@'))) {
            return { local, suggestions: [] as string[] };
        }

        const matches = COMMON_EMAIL_DOMAINS.filter((domain) =>
            atIndex === -1 ? true : domain.startsWith(typedDomain) && domain !== typedDomain,
        ).slice(0, MAX_EMAIL_SUGGESTIONS);

        return { local, suggestions: matches };
    }, [email]);

    const showSuggestions =
        isInputFocused && !menuDismissed && !isEmailLoading && emailSuggestions.length > 0;

    // Keep the highlight valid as the list changes; an out-of-range index
    // (list shrank while typing) collapses back to "nothing highlighted".
    useEffect(() => {
        if (highlightedIndex >= emailSuggestions.length) setHighlightedIndex(-1);
    }, [emailSuggestions.length, highlightedIndex]);

    function applyEmailSuggestion(domain: string) {
        // Focus stays on the input throughout: pointer selection is guarded by
        // the option's onMouseDown preventDefault, and keyboard selection never
        // leaves the field — so the user can submit immediately after picking.
        setEmail(`${emailLocalPart}@${domain}`);
        setHighlightedIndex(-1);
        setMenuDismissed(true);
    }

    function handleEmailKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (showSuggestions) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlightedIndex((prev) => (prev + 1) % emailSuggestions.length);
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlightedIndex((prev) => (prev <= 0 ? emailSuggestions.length : prev) - 1);
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                setMenuDismissed(true);
                setHighlightedIndex(-1);
                return;
            }
            if (e.key === 'Enter' && highlightedIndex >= 0) {
                e.preventDefault();
                const picked = emailSuggestions[highlightedIndex];
                if (picked) applyEmailSuggestion(picked);
                return;
            }
        }
        // Default: submit the form (matches the prior single-button behavior).
        if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
        }
    }

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

        // Desktop path: same handoff as OAuth. Cloudflare Turnstile (Clerk's
        // bot-protection CAPTCHA, required for the sign-up branch of the
        // email/OTP flow) fails to initialize inside Electron's embedded
        // Chromium — "Error: 600010" — because the headless / non-default
        // browser fingerprint trips Turnstile's environment checks. Routing
        // through the user's real default browser sidesteps the entire
        // CAPTCHA problem. The email is forwarded as a hint so the browser
        // sign-in page can prefill the input.
        const desktop = getDesktopBridge();
        if (desktop?.openExternal) {
            setIsEmailLoading(true);
            setEmailError(null);
            try {
                const handoffUrl = new URL('/sign-in/desktop-handoff', window.location.origin);
                handoffUrl.searchParams.set('email', normalizedEmail);
                if (returnUrl && returnUrl.length > 0) {
                    handoffUrl.searchParams.set('returnUrl', returnUrl);
                }
                const handed = await desktop.openExternal(handoffUrl.toString());
                if (handed === false) {
                    setEmailError(
                        'Could not open your default browser. Check that one is set as default.',
                    );
                }
            } catch (err) {
                if (env.NODE_ENV !== 'production') {
                    console.error('[clerk-auth-form] desktop email handoff failed', err);
                }
                setEmailError('Could not open your default browser. Please try again.');
            } finally {
                setIsEmailLoading(false);
            }
            return;
        }

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
                        // TODO(bug-hunt): if the retry itself throws
                        // `isAlreadySignedInError` (signOut didn't fully clear
                        // the session — happens in Electron's persist:weblab
                        // when cookies haven't flushed), we fall through to
                        // the sign-up branch with a stale error. See
                        // CODE_REVIEW_BACKLOG.md → "Bug Hunt 2026-05-28 —
                        // Desktop auth" for the proposed fix.
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

    return (
        <div className="flex w-full flex-col items-center space-y-4">
            {hasOAuthProvider && (
                // Vertical stack of full-width provider pills, 16px gap. Each
                // shows its logo + "Continue with …" label, centered.
                <div className="flex w-full flex-col gap-4">
                    {showGoogle && (
                        <Button
                            type="button"
                            variant="outline"
                            size="pill"
                            onClick={() => void handleOAuth('google')}
                            disabled={!isLoaded}
                            className={cn('w-full gap-2.5', providerButtonClassName)}
                        >
                            <Icons.GoogleLogo viewBox="0 0 24 24" />
                            {t(transKeys.welcome.login.continueGoogle)}
                        </Button>
                    )}
                    {showGithub && (
                        <Button
                            type="button"
                            variant="outline"
                            size="pill"
                            onClick={() => void handleOAuth('github')}
                            disabled={!isLoaded}
                            className={cn('w-full gap-2.5', providerButtonClassName)}
                        >
                            <Icons.GitHubLogo />
                            {t(transKeys.welcome.login.continueGithub)}
                        </Button>
                    )}
                    {showVercel && (
                        <Button
                            type="button"
                            variant="outline"
                            size="pill"
                            onClick={() => void handleOAuth('vercel')}
                            disabled={!isLoaded}
                            className={cn('w-full gap-2.5', providerButtonClassName)}
                        >
                            <VercelLogo />
                            {t(transKeys.welcome.login.continueVercel)}
                        </Button>
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
                <div className="relative w-full">
                    <Input
                        type="email"
                        // `name` is the trigger browser autofill keys off of.
                        // Without it, Chrome/Safari skip the saved-credential
                        // suggestion entirely.
                        name="email"
                        id="weblab-sign-in-email"
                        // Hint shows only once the label has floated up, so the
                        // resting label and the placeholder never overlap.
                        placeholder={
                            isEmailFloating ? t(transKeys.welcome.login.emailPlaceholder) : ''
                        }
                        // Fully rounded, border-only (no fill). h-11 (44px)
                        // matches the OAuth pills. `pr-12` reserves room for the
                        // inline submit arrow; `pl-5` mirrors the pill padding.
                        // `dark:bg-transparent` overrides the Input default fill
                        // so the field stays border-only in dark mode.
                        className="placeholder:text-foreground-tertiary border-border h-11 w-full rounded-full bg-transparent pr-12 pl-5 text-left dark:bg-transparent"
                        value={email}
                        onChange={(e) => {
                            setEmail(e.target.value);
                            setMenuDismissed(false);
                            setHighlightedIndex(-1);
                        }}
                        onFocus={() => {
                            setIsInputFocused(true);
                            setMenuDismissed(false);
                        }}
                        onBlur={() => setIsInputFocused(false)}
                        onKeyDown={handleEmailKeyDown}
                        disabled={isEmailLoading || !isLoaded}
                        required
                        autoComplete="email"
                        inputMode="email"
                        role="combobox"
                        aria-expanded={showSuggestions}
                        aria-controls="weblab-email-suggestions"
                        aria-autocomplete="list"
                        aria-activedescendant={
                            highlightedIndex >= 0
                                ? `weblab-email-suggestion-${highlightedIndex}`
                                : undefined
                        }
                        // Sign-in page's sole primary action — focus the input so
                        // desktop users can start typing without a click. Matches
                        // the Supabase /login form.
                        autoFocus
                        maxLength={254}
                    />
                    {/* Floating label. Rests inside the field as the placeholder
                        when empty + unfocused; floats onto the top border (with a
                        `bg-background` chip that cuts the pill outline) once the
                        field is focused or filled. `pointer-events-none` lets the
                        click fall through to focus the input — `htmlFor` keeps the
                        a11y association. Text x is 20px in both states (resting
                        `left-5`; floated `left-3.5` + `px-1.5`) so it floats
                        straight up with no horizontal jump. */}
                    <label
                        htmlFor="weblab-sign-in-email"
                        className={cn(
                            'pointer-events-none absolute z-10 origin-left transition-all duration-200 ease-out motion-reduce:transition-none',
                            isEmailFloating
                                ? 'text-mini text-foreground-secondary bg-background top-0 left-3.5 -translate-y-1/2 rounded-full px-1.5'
                                : 'text-regular text-foreground-tertiary top-1/2 left-5 -translate-y-1/2',
                        )}
                    >
                        {t(transKeys.welcome.login.emailLabel)}
                    </label>
                    {/* Inline submit. Circular by design — rounded-full is the
                        sanctioned escape for a glyph button nested in a field.
                        Fades + scales in only once the field has content. The
                        empty state is hidden via opacity/scale (not `disabled`)
                        so it reaches opacity-0 — `disabled:opacity-50` from the
                        Button base would otherwise pin it at 50%. It's removed
                        from the tab order and the a11y tree while hidden, and
                        pointer-events-none blocks clicks. */}
                    <Button
                        type="submit"
                        variant="default"
                        size="icon-sm"
                        loading={isEmailLoading}
                        aria-label={t(transKeys.welcome.login.email)}
                        aria-hidden={!hasEmail}
                        tabIndex={hasEmail ? 0 : -1}
                        disabled={isEmailLoading || cooldownSecondsRemaining > 0 || !isLoaded}
                        className={cn(
                            'absolute top-1/2 right-1.5 -translate-y-1/2 rounded-full transition-all duration-200 ease-out motion-reduce:transition-none',
                            hasEmail
                                ? 'scale-100 opacity-100'
                                : 'pointer-events-none scale-50 opacity-0',
                        )}
                    >
                        {!isEmailLoading && <Icons.ArrowRight />}
                    </Button>
                    {showSuggestions && (
                        // Listbox follows the combobox `aria-activedescendant`
                        // pattern: focus stays on the input, options are native
                        // buttons (interactive role → keyboard-safe) kept out of
                        // the tab order with tabIndex -1.
                        <div
                            id="weblab-email-suggestions"
                            role="listbox"
                            className="border-border bg-popover motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 absolute top-[calc(100%+8px)] right-0 left-0 z-20 overflow-hidden rounded-2xl border p-1 shadow-lg motion-safe:duration-150"
                        >
                            {emailSuggestions.map((domain, i) => (
                                <button
                                    key={domain}
                                    type="button"
                                    id={`weblab-email-suggestion-${i}`}
                                    role="option"
                                    aria-selected={i === highlightedIndex}
                                    tabIndex={-1}
                                    // Block the input blur a pointer press would
                                    // otherwise fire before onClick lands.
                                    onMouseDown={(e) => e.preventDefault()}
                                    onMouseEnter={() => setHighlightedIndex(i)}
                                    onClick={() => applyEmailSuggestion(domain)}
                                    className={cn(
                                        'text-small flex w-full items-center rounded-xl px-4 py-2.5 text-left transition-colors',
                                        // `bg-accent` is the design-system's
                                        // "hover inside menus/dropdowns/popovers"
                                        // token (#f4f4f4 light / #353535 dark).
                                        // The old `bg-background-hover` (#232323)
                                        // sat one hex-step off the popover surface
                                        // (#222222) and was invisible in dark mode.
                                        i === highlightedIndex
                                            ? 'bg-accent text-foreground-primary'
                                            : 'text-foreground-secondary',
                                    )}
                                >
                                    <span className="truncate">
                                        <span className="text-foreground-tertiary">
                                            {emailLocalPart}@
                                        </span>
                                        {domain}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                {emailError && (
                    <p className="text-small text-destructive w-full text-center">{emailError}</p>
                )}
                {cooldownSecondsRemaining > 0 && !emailError && (
                    <p className="text-small text-foreground-tertiary w-full text-center">
                        {`You can resend a code in ${cooldownSecondsRemaining}s`}
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
            {/* Mount point for Clerk's Smart CAPTCHA widget (Cloudflare
                Turnstile). Without this element, Clerk logs "Cannot
                initialize Smart CAPTCHA widget because the `clerk-captcha`
                DOM element was not found" and falls back to Invisible
                Turnstile, which is the harder-to-pass variant and is the
                source of the 600010 errors we hit in the Electron shell.
                The visible widget renders on-demand only (when Clerk needs
                a bot challenge), so it's invisible in the common case. */}
            <div id="clerk-captcha" className="w-full" />
        </div>
    );
}
