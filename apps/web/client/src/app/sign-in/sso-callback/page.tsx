'use client';

import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';

import { Icons } from '@weblab/ui/icons';

// Clerk's SSO callback handler. Invoked by Clerk after a GitHub/Google/etc.
// OAuth round-trip completes. Mounted at /sign-in/sso-callback so it lives
// inside the same auth surface as the Clerk-driven sign-in page.

export default function SsoCallbackPage() {
    return (
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-4">
            <Icons.LoadingSpinner className="text-foreground-secondary h-6 w-6 animate-spin" />
            <p className="text-foreground-secondary text-small">Finishing sign-in…</p>

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

            {/*
              CRITICAL — Clerk Smart CAPTCHA mount point.

              An OAuth round-trip for a *new* user resolves here:
              AuthenticateWithRedirectCallback → handleRedirectCallback →
              signUp.create(). When Clerk bot protection is enabled, that
              signUp.create() must solve a Cloudflare Turnstile challenge,
              and the widget can only render into an element with
              id="clerk-captcha". Without it Clerk logs:

                "Cannot initialize Smart CAPTCHA widget because the
                 `clerk-captcha` DOM element was not found; falling back to
                 Invisible CAPTCHA widget"

              then the invisible widget throws `[Cloudflare Turnstile] Error:
              600010` and the POST /v1/client/sign_ups returns 400 — leaving
              the user stranded on this page forever (no redirect to
              /profile-setup). The sign-in form at /sign-in already mounts
              this div for email sign-ups; the OAuth callback needs its own
              copy because handleRedirectCallback runs here, on a different
              page. Rendered alongside the callback so it exists in the DOM
              the moment the challenge fires.
            */}
            <div id="clerk-captcha" className="w-full max-w-sm" />
        </div>
    );
}
