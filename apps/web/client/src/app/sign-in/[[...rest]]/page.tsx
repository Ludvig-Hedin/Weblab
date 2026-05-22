import { redirect } from 'next/navigation';

import { env } from '@/env';
import { sanitizeReturnUrl } from '@/utils/auth/sanitize-return-url';
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
    // session and the bridge isn't wired. Send visitors who land here from
    // bookmarks or stale links back to the active /login page so they can
    // actually authenticate.
    if (env.WEBLAB_AUTH_PROVIDER !== 'clerk') {
        const params = new URLSearchParams();
        if (returnUrl) params.set('returnUrl', returnUrl);
        const qs = params.toString();
        redirect(`/login${qs ? `?${qs}` : ''}`);
    }

    return <SignInClient returnUrl={sanitized ?? null} />;
}
