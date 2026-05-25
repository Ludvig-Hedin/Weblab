'use client';

import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';

// Clerk's SSO callback handler. Invoked by Clerk after a GitHub/Google/etc.
// OAuth round-trip completes. Mounted at /sign-in/sso-callback so it lives
// inside the same auth surface as the Clerk-driven sign-in page.

export default function SsoCallbackPage() {
    return (
        <AuthenticateWithRedirectCallback
            // Sign-IN: use a FALLBACK (not force) redirect so the per-flow
            // `redirectUrlComplete` set in `handleOAuth` (the user's returnUrl,
            // defaulting to /projects) wins. A force URL would override it,
            // dropping the returnUrl on every OAuth deep-link sign-in. With
            // fallback, returnUrl is honored and /projects is used only when no
            // returnUrl was set — strictly better-or-equal to the old behavior.
            signInFallbackRedirectUrl="/projects"
            // Sign-UP stays FORCED: a brand-new OAuth user must always land on
            // profile-setup regardless of any returnUrl.
            signUpForceRedirectUrl="/profile-setup"
        />
    );
}
