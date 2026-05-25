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

    // Supabase rollback lever. The legacy `/login` surface was deleted in the
    // migration, so there is no alternate auth UI to fall back to — and
    // `redirect('/sign-in')` from /sign-in is an infinite loop. Until the lever's
    // fate is decided, render the Clerk form (the only working auth) instead of
    // looping. (Fixes the CR-2026-05-... dormant redirect-loop.)
    if (env.WEBLAB_AUTH_PROVIDER !== 'clerk') {
        return <SignInClient returnUrl={sanitized ?? null} />;
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
