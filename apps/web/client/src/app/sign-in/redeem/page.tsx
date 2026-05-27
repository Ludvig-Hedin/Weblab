import { RedeemClient } from './redeem-client';

// Desktop-side endpoint for the OAuth-handoff flow.
//
// Loaded by the Electron shell after `weblab://auth/handoff?ticket=…` fires:
// `handleDeepLink` (apps/desktop/main.js) translates the deep link into
// `/sign-in/redeem?ticket=…` and loads it in the main window. The client
// component below redeems the Clerk sign-in token, calls `setActive`, and
// lands the user on `/projects`.
//
// Server component is intentionally a thin wrapper so the page can be a
// pure RSC entry without a `'use client'` directive — the redemption work
// has to run in the browser anyway (Clerk's `signIn.create` is a client
// API), and isolating it in a child component keeps SSR fast.

interface RedeemPageProps {
    searchParams: Promise<{ ticket?: string }>;
}

export default async function SignInRedeemPage({ searchParams }: RedeemPageProps) {
    const { ticket } = await searchParams;
    return <RedeemClient ticket={ticket ?? null} />;
}
