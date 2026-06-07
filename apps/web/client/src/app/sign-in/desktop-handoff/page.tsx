import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth as clerkAuth, clerkClient } from '@clerk/nextjs/server';

import { BrandLogo } from '@weblab/ui/brand';

import { DesktopHandoffClient } from './handoff-client';

// Browser-side endpoint for the desktop OAuth handoff.
//
// Flow:
//   1. Desktop renderer calls `weblabNative.openExternal(<this page URL>)`
//      → the user's real default browser opens here.
//   2. Server reads the current Clerk session.
//        - Signed out: redirect into the normal `/sign-in` form with
//          `returnUrl` pointing back at this page, so once OAuth (or email
//          OTP) finishes in the browser the flow lands back here with a
//          valid session.
//        - Signed in: mint a one-time Clerk sign-in token bound to that
//          Clerk user, then hand the ticket to the desktop via the
//          `weblab://auth/handoff?ticket=...` deep link.
//   3. Desktop's `handleDeepLink` (apps/desktop/main.js) routes the deep
//      link to `/sign-in/redeem?ticket=...`, which redeems the ticket
//      client-side via `signIn.create({ strategy: 'ticket', ticket })`,
//      calls `setActive`, and lands the user on `/projects`.
//
// We deliberately render through a tiny client component (`<DesktopHandoffClient/>`)
// instead of redirecting server-side to a `weblab://` URL: Next.js' `redirect`
// emits an HTTP 3xx into a custom scheme, which most browsers refuse to
// follow. A page that sets `window.location.href = "weblab://..."` is the
// pattern that actually triggers the OS protocol handler.

// Server actions sit in the same route segment to keep token creation on
// the server. The `userId` here is the Clerk-side identity, NOT the Convex
// user `_id` — `signInTokens.createSignInToken` requires the Clerk userId.
async function createTicketFor(userId: string): Promise<string> {
    const client = await clerkClient();
    const token = await client.signInTokens.createSignInToken({
        userId,
        // Short TTL — the desktop redeems immediately after the deep link
        // fires. 60 seconds covers a slow OS protocol-handler launch plus
        // the desktop window's load of `/sign-in/redeem`.
        expiresInSeconds: 60,
    });
    return token.token;
}

// Friendly fallback rendered when the Clerk Backend API call fails (network
// outage, rate limit, account suddenly disabled). Without this, an uncaught
// throw from `createTicketFor` falls through to Next.js' global error
// boundary — the user sees a generic crash page with no way back. The
// component is intentionally minimal: same chrome as the success path so the
// shell doesn't flash a wildly different layout on error.
function HandoffErrorScreen({ message }: { message: string }) {
    return (
        <div className="relative flex h-screen w-screen items-center justify-center">
            <div className="flex w-full max-w-md flex-col items-center gap-8 px-6 text-center">
                <BrandLogo className="h-5" />
                <div className="space-y-2">
                    <h1 className="text-title2 leading-tight">Couldn&apos;t finish sign-in</h1>
                    <p className="text-foreground-secondary text-regular">{message}</p>
                </div>
                <Link
                    href="/sign-in"
                    className="text-foreground-primary text-small underline underline-offset-4 transition-opacity hover:opacity-80"
                >
                    Back to sign in
                </Link>
            </div>
        </div>
    );
}

interface DesktopHandoffPageProps {
    // Both forwarded by the Electron renderer when the user clicked an OAuth
    // or email button. `email` prefills the sign-in form so the user doesn't
    // have to retype it after the OS browser opens. `provider` is currently
    // informational only — kept so a future iteration can deep-link straight
    // into a specific OAuth provider from the sign-in form.
    searchParams: Promise<{ email?: string; provider?: string }>;
}

export default async function DesktopHandoffPage({ searchParams }: DesktopHandoffPageProps) {
    const params = await searchParams;
    const { userId } = await clerkAuth();

    // Not signed in: send to the normal sign-in form, then bounce back here
    // once a session exists. Encoding the path keeps `sanitizeReturnUrl`
    // happy (same-origin, no scheme).
    if (!userId) {
        // Preserve email + provider hints on the returnUrl so they survive
        // the round-trip: after the user signs in, /sign-in redirects back
        // to /sign-in/desktop-handoff?email=…&provider=… (this same page),
        // which then mints the ticket. Forwarding `email` on the OUTER
        // /sign-in URL also lets the form prefill the input immediately.
        const handoffBack = new URLSearchParams();
        if (params.email) handoffBack.set('email', params.email);
        if (params.provider) handoffBack.set('provider', params.provider);
        const handoffQuery = handoffBack.toString();
        const returnUrl =
            handoffQuery.length > 0
                ? `/sign-in/desktop-handoff?${handoffQuery}`
                : '/sign-in/desktop-handoff';

        const signInQuery = new URLSearchParams();
        signInQuery.set('returnUrl', returnUrl);
        if (params.email) signInQuery.set('email', params.email);
        redirect(`/sign-in?${signInQuery.toString()}`);
    }

    // Wrap the Clerk Backend API call so transient failures (network blip,
    // rate limit, account disabled between the auth check and the token
    // mint) render an actionable error instead of falling through to
    // Next.js' global error boundary.
    let ticket: string;
    try {
        ticket = await createTicketFor(userId);
    } catch (err) {
        const detail = err instanceof Error ? err.message : 'Unknown error';
        // Log on the server so ops can see the upstream error code; never
        // surface raw Clerk error text to the user (it can include internal
        // identifiers).
        console.error('[desktop-handoff] createSignInToken failed', detail);
        return (
            <HandoffErrorScreen message="We couldn't start the handoff back to the desktop app. Please try signing in again." />
        );
    }

    // Hand the ticket to the desktop via the custom protocol. The client
    // component sets `window.location.href` so the OS protocol handler fires
    // and Electron's `open-url` event delivers it to `handleDeepLink`.
    return <DesktopHandoffClient ticket={ticket} />;
}
