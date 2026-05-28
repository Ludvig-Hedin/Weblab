import { redirect } from 'next/navigation';

import { env } from '@/env';
import { getCurrentUser } from '@/utils/auth/current-user';
import { sanitizeReturnUrl } from '@/utils/auth/sanitize-return-url';
import { Routes } from '@/utils/constants';
import { SignInClient } from './sign-in-client';

// Phase 5 entry point. Active when `WEBLAB_AUTH_PROVIDER=clerk`. Previously
// rendered Clerk's prebuilt `<SignIn />` component; now it renders our own
// design-system-matched form (OAuth row + email OTP) powered by Clerk's
// `useSignIn` primitives. No Clerk branding is shown.
//
// The catch-all `[[...rest]]` segment used to exist so Clerk could route its
// internal verification + factor-collection screens under this prefix. With
// custom UI we own those flows ourselves — verification lives at
// `/sign-in/verify`, and SSO callback at `/sign-in/sso-callback`. We keep
// the optional-catch-all so any historical Clerk-routed link still hits the
// sign-in entry instead of 404'ing.

interface SignInPageProps {
    searchParams: Promise<{ returnUrl?: string; email?: string }>;
}

// Loose RFC-5321-ish email shape used only for prefill sanitization. We never
// trust this value as an identifier — it's just echoed into the input field,
// and Clerk re-validates on submit. Anything not matching this pattern is
// dropped so an attacker can't put markup or control characters into the
// initial input value via `?email=`.
const EMAIL_PREFILL_RE = /^[^\s<>"'`]{1,254}@[^\s<>"'`]{1,253}$/;
function sanitizeEmailPrefill(raw: string | undefined): string | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (trimmed.length === 0 || trimmed.length > 254) return null;
    if (!EMAIL_PREFILL_RE.test(trimmed)) return null;
    return trimmed.toLowerCase();
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
    const { returnUrl, email } = await searchParams;
    // Pre-default form: pass through `null` when the input was unsafe or
    // absent so the client knows there's no real returnUrl to thread through
    // OAuth + OTP flows. Comparing against '/projects' as a sentinel would
    // silently break if sanitizeReturnUrl's default ever changed.
    const sanitized = sanitizeReturnUrl(returnUrl);
    const initialEmail = sanitizeEmailPrefill(email);

    // Supabase rollback lever. The legacy `/login` surface was deleted in the
    // migration, so there is no alternate auth UI to fall back to — and
    // `redirect('/sign-in')` from /sign-in is an infinite loop. Until the lever's
    // fate is decided, render the Clerk form (the only working auth) instead of
    // looping. (Fixes the CR-2026-05-... dormant redirect-loop.)
    if (env.WEBLAB_AUTH_PROVIDER !== 'clerk') {
        return <SignInClient returnUrl={sanitized ?? null} initialEmail={initialEmail} />;
    }

    // Already authenticated visitors should never see the sign-in form.
    // Bounce to the sanitized returnUrl when present, otherwise to /projects
    // (which itself forwards to the user's last/personal workspace).
    //
    // Self-loop guard: reject `returnUrl=/sign-in` (and `/sign-up`, which the
    // sign-up page rewrites to `/sign-in`) so a stray caller — e.g.
    // `AuthProvider.setIsAuthModalOpen(true)` fired from a component that
    // happens to render on `/sign-in` itself — can't trap the user in a
    // redirect loop.
    const user = await getCurrentUser();
    if (user) {
        const safeTarget =
            sanitized && sanitized !== Routes.LOGIN && sanitized !== '/sign-up'
                ? sanitized
                : Routes.PROJECTS;
        redirect(safeTarget);
    }

    return <SignInClient returnUrl={sanitized ?? null} initialEmail={initialEmail} />;
}
