'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useClerk } from '@clerk/nextjs';
import { useSignIn } from '@clerk/nextjs/legacy';

import { BrandLogo } from '@weblab/ui/brand';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';

import { env } from '@/env';

interface RedeemClientProps {
    ticket: string | null;
}

type RedeemState =
    | { status: 'idle' }
    | { status: 'redeeming' }
    | { status: 'success' }
    | { status: 'error'; message: string };

/**
 * Redeems a one-time Clerk sign-in token (minted by the browser-side
 * `/sign-in/desktop-handoff` page after a successful OAuth or email sign-in)
 * inside the desktop shell's `persist:weblab` cookie partition.
 *
 * Flow:
 *   1. Read `?ticket=` from the URL.
 *   2. `signIn.create({ strategy: 'ticket', ticket })` builds a Clerk
 *      SignIn resource whose status should be `complete` (the ticket is a
 *      "trust this Clerk userId, no second factor required" credential).
 *   3. `setActive({ session: signIn.createdSessionId })` writes the
 *      session cookies into this partition — same path Clerk's own UI uses.
 *   4. `router.push('/projects')`.
 *
 * If the user already has a stale session in this partition, `signOut`
 * runs first so the ticket exchange isn't rejected as "already signed in".
 */
export function RedeemClient({ ticket }: RedeemClientProps) {
    const router = useRouter();
    const { isLoaded: isSignInLoaded, signIn, setActive } = useSignIn();
    const { signOut } = useClerk();
    // Reactive session state. After `setActive` writes the session cookie into
    // the `persist:weblab` partition, `isSignedIn` flips to true once Clerk's
    // client has synced. We gate the `/projects` navigation on it to avoid the
    // cookie-write race described below.
    const { isSignedIn } = useAuth();
    const [state, setState] = useState<RedeemState>({ status: 'idle' });
    // Ticket is one-time; if Clerk rejects it, retrying the same call would
    // hit a "ticket already consumed" error. The latch guards the effect from
    // re-firing on React strict-mode double-mounts in dev.
    const consumedRef = useRef(false);
    // Latches the post-success navigation so it fires exactly once regardless
    // of whether the `isSignedIn` flip or the fallback timeout wins.
    const navigatedRef = useRef(false);

    useEffect(() => {
        if (!isSignInLoaded || !signIn || !setActive) return;
        if (consumedRef.current) return;
        if (!ticket) {
            setState({
                status: 'error',
                message:
                    'Missing sign-in token. Open Weblab from the browser sign-in screen to try again.',
            });
            return;
        }
        consumedRef.current = true;

        void (async () => {
            setState({ status: 'redeeming' });
            try {
                // Clear any leftover session in this partition first. Clerk
                // surfaces "you're already signed in" when a session already
                // exists; redeeming a ticket on top of one is unsafe anyway
                // because we want the ticket's identity to win.
                try {
                    await signOut();
                } catch {
                    // Best-effort — a missing session is the happy path.
                }

                const attempt = await signIn.create({
                    strategy: 'ticket',
                    ticket,
                });

                if (attempt.status !== 'complete' || !attempt.createdSessionId) {
                    // Ticket-based sign-in is single-factor by design; if
                    // Clerk reports anything other than `complete` it's an
                    // expired/consumed ticket or a misconfigured instance.
                    throw new Error(
                        `Sign-in did not complete (status: ${attempt.status ?? 'unknown'}).`,
                    );
                }

                await setActive({ session: attempt.createdSessionId });
                // Don't navigate here. `setActive` writes the session cookie
                // into the partition, but `/projects` is auth-gated — rendering
                // it before the cookie commits bounces back to /sign-in and
                // looks like a failed sign-in. The effect below waits for
                // `isSignedIn` to flip true (cookie committed + client synced)
                // before navigating, with a timeout fallback so a stalled flip
                // never strands the user on the spinner.
                setState({ status: 'success' });
            } catch (err) {
                type ClerkAPIErrorLike = {
                    errors?: Array<{ message?: string; longMessage?: string }>;
                };
                const apiErr = err as ClerkAPIErrorLike;
                const first = apiErr?.errors?.[0];
                const fromApi = first?.longMessage ?? first?.message;
                const fromErr = err instanceof Error ? err.message : null;
                // Plain `??` would prefer an empty-string Clerk message over
                // a populated `Error.message`; explicit non-empty check
                // selects the first useful candidate.
                const candidates = [fromApi, fromErr];
                const picked = candidates.find(
                    (c): c is string => typeof c === 'string' && c.length > 0,
                );
                const message = picked ?? 'Could not finish sign-in. Please try again.';
                if (env.NODE_ENV !== 'production') {
                    console.error('[redeem] ticket exchange failed', err);
                }
                setState({ status: 'error', message });
            }
        })();
    }, [isSignInLoaded, signIn, setActive, signOut, ticket]);

    // Navigate to /projects only once the ticket exchange succeeded AND the
    // session is live (`isSignedIn`). A 4s fallback covers the rare case where
    // the reactive flip lags the cookie commit — navigating then is no worse
    // than the old unconditional push, and avoids an indefinite spinner.
    useEffect(() => {
        if (state.status !== 'success') return;
        if (navigatedRef.current) return;

        if (isSignedIn) {
            navigatedRef.current = true;
            router.replace('/projects');
            return;
        }

        const fallback = window.setTimeout(() => {
            if (navigatedRef.current) return;
            navigatedRef.current = true;
            router.replace('/projects');
        }, 4000);
        return () => window.clearTimeout(fallback);
    }, [state.status, isSignedIn, router]);

    return (
        <div className="relative flex h-screen w-screen items-center justify-center">
            <div className="flex w-full max-w-md flex-col items-center gap-8 px-6 text-center">
                <BrandLogo className="h-5" />
                {state.status === 'error' ? (
                    <>
                        <div className="space-y-2">
                            <h1 className="text-title2 leading-tight">Sign-in failed</h1>
                            <p className="text-foreground-secondary text-regular">
                                {state.message}
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            className="h-11 rounded-full"
                            onClick={() => router.replace('/sign-in?native=1')}
                        >
                            Back to sign in
                        </Button>
                    </>
                ) : (
                    <>
                        <div className="space-y-2">
                            <h1 className="text-title2 leading-tight">Signing you in…</h1>
                            <p className="text-foreground-secondary text-regular">
                                Finishing sign-in from your browser.
                            </p>
                        </div>
                        <Icons.LoadingSpinner className="h-5 w-5 animate-spin" />
                    </>
                )}
            </div>
        </div>
    );
}
