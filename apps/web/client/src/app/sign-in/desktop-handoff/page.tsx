import { redirect } from 'next/navigation';
import { auth as clerkAuth, clerkClient } from '@clerk/nextjs/server';

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

export default async function DesktopHandoffPage() {
    const { userId } = await clerkAuth();

    // Not signed in: send to the normal sign-in form, then bounce back here
    // once a session exists. Encoding the path keeps `sanitizeReturnUrl`
    // happy (same-origin, no scheme).
    if (!userId) {
        const returnUrl = '/sign-in/desktop-handoff';
        redirect(`/sign-in?returnUrl=${encodeURIComponent(returnUrl)}`);
    }

    const ticket = await createTicketFor(userId);

    // Hand the ticket to the desktop via the custom protocol. The client
    // component sets `window.location.href` so the OS protocol handler fires
    // and Electron's `open-url` event delivers it to `handleDeepLink`.
    return <DesktopHandoffClient ticket={ticket} />;
}
