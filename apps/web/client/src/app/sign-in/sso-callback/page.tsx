'use client';

import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';

// Clerk's SSO callback handler. Invoked by Clerk after a GitHub/Google/etc.
// OAuth round-trip completes. Mounted at /sign-in/sso-callback so it lives
// inside the same auth surface as the Clerk-driven sign-in page.

export default function SsoCallbackPage() {
    return (
        <AuthenticateWithRedirectCallback
            signInForceRedirectUrl="/projects"
            signUpForceRedirectUrl="/profile-setup"
        />
    );
}
