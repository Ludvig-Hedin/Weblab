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
    searchParams: Promise<{ returnUrl?: string }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
    const { returnUrl } = await searchParams;
    // Pre-default form: pass through `null` when the input was unsafe or
    // absent so the client knows there's no real returnUrl to thread through
    // OAuth + OTP flows. Comparing against '/projects' as a sentinel would
    // silently break if sanitizeReturnUrl's default ever changed.
    const sanitized = sanitizeReturnUrl(returnUrl);

    // Under Supabase mode the new sign-in surface is inert — Clerk has no
    // session and the bridge isn't wired. The legacy `/login` route directory
    // was removed in the Clerk migration, so send visitors who land here from
    // bookmarks or stale links back to the live /sign-in entry (this fallback
    // branch is the documented Supabase rollback lever and is intentionally
    // preserved).
    if (env.WEBLAB_AUTH_PROVIDER !== 'clerk') {
        // Forward the sanitized returnUrl only — never the raw input — so an
        // attacker can't bounce open-redirect targets (e.g. `//evil.com`)
        // through this surface into downstream auth handlers that may not
        // re-sanitize themselves.
        const params = new URLSearchParams();
        if (sanitized) params.set('returnUrl', sanitized);
        const qs = params.toString();
        redirect(`/sign-in${qs ? `?${qs}` : ''}`);
    }

    // Already authenticated visitors should never see the sign-in form.
    // Bounce to the sanitized returnUrl when present, otherwise to /projects
    // (which itself forwards to the user's last/personal workspace).
    const user = await getCurrentUser();
    if (user) {
        redirect(sanitized ?? Routes.PROJECTS);
    }

    return <SignInClient returnUrl={sanitized ?? null} />;
}
