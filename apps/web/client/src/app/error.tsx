'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@clerk/nextjs';

import { Button } from '@weblab/ui/button';

import { isConvexUnauthenticatedError } from '@/utils/auth/convex-unauthenticated';
import { getSignInUrlClient } from '@/utils/auth/sign-in-url';
import { clearSigningOut, isSigningOut } from '@/utils/auth/signing-out';
import { Routes } from '@/utils/constants';
import { isChunkLoadError, reloadOnceForChunkError } from './_components/chunk-error-reloader';

const SIGN_IN_PATH = '/sign-in';

export default function RootErrorBoundary({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const isChunkError = isChunkLoadError(error);
    // Clerk auth state lets us tell a real signed-out session loss apart from a
    // *signed-in* permission error (both surface as "UNAUTHORIZED"). Hooks are
    // safe here: the root error boundary renders inside RootLayout → inside
    // ClerkProvider; with no provider Clerk returns `isLoaded: false` defaults.
    const { isLoaded, isSignedIn } = useAuth();

    const signingOut = isSigningOut();
    const maybeAuthError = isConvexUnauthenticatedError(error);
    // Bounce to /sign-in when a sign-out is in flight, OR a token-loss error is
    // confirmed signed-out by Clerk. Never redirect a signed-IN user — a
    // forbidden-resource "UNAUTHORIZED" must fall through to the card.
    const redirectToSignIn = signingOut || (maybeAuthError && isLoaded && isSignedIn === false);
    // While Clerk is still loading we can't classify an auth-looking error — hold
    // the blank screen so the common signed-out path never flashes the card.
    const holdForAuth = maybeAuthError && !isLoaded && !isChunkError;

    // Hide the error card while a chunk-load failure is being recovered so the
    // reload doesn't flash "Something went wrong" first.
    const [recovering, setRecovering] = useState(isChunkError);

    useEffect(() => {
        if (redirectToSignIn) {
            // A sign-out gets a clean /sign-in (no returnUrl). A mid-session
            // token loss preserves the current path so re-login returns here —
            // except when already on /sign-in, which would self-loop.
            const path = typeof window !== 'undefined' ? window.location.pathname : '';
            // Exact `/sign-in` or a `/sign-in/...` sub-route (sso-callback,
            // verify, …) — NOT a `startsWith` that would also swallow an
            // unrelated `/sign-information`-style path.
            const onSignInPage = path === SIGN_IN_PATH || path.startsWith(`${SIGN_IN_PATH}/`);
            clearSigningOut();
            const returnUrl =
                !signingOut && !onSignInPage && typeof window !== 'undefined'
                    ? window.location.pathname + window.location.search
                    : null;
            // Hard navigation: a soft router push would keep the crashed,
            // signed-out React tree mounted (stale navbar/avatar, dead queries).
            window.location.assign(getSignInUrlClient(returnUrl));
            return;
        }
        // A chunk-load failure reaching the render boundary means a stale module
        // graph (HMR rebuild / deploy). Recover with a guarded one-time reload
        // instead of stranding the user on a dead-end error card.
        if (isChunkError && reloadOnceForChunkError()) {
            return;
        }
        // Reload was guarded (already retried → broken build) — reveal the card.
        setRecovering(false);
        // process.env.NODE_ENV is statically inlined by Next on the client;
        // `env.NODE_ENV` lives in the SERVER schema and THROWS in the browser —
        // which made the error boundary itself crash inside this effect and
        // storm the console on every boundary render.
        if (process.env.NODE_ENV !== 'production') {
            console.error('Root error boundary:', error);
        }
    }, [error, isChunkError, redirectToSignIn, signingOut]);

    const reference = error?.digest ?? null;

    if (recovering || redirectToSignIn || holdForAuth) {
        return <div className="bg-background min-h-screen" aria-hidden="true" />;
    }

    return (
        <div className="bg-background flex min-h-screen items-center justify-center px-6">
            <div className="border-border bg-card w-full max-w-md rounded-2xl border p-8 text-center shadow-2xl">
                <p className="text-foreground-tertiary text-sm">Unexpected error</p>
                <h1 className="text-foreground mt-3 text-3xl font-semibold">
                    Something went wrong
                </h1>
                <p className="text-foreground-secondary mt-4 text-sm leading-6">
                    We hit an unexpected error. Try again or return home.
                </p>
                {reference && (
                    <div className="border-border bg-background mt-4 rounded-md border p-3 text-left">
                        <p className="text-foreground-tertiary text-xs">Error reference</p>
                        <p className="text-foreground-secondary mt-1 font-mono text-xs break-all">
                            {reference}
                        </p>
                    </div>
                )}
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                    <Button onClick={() => reset()}>Try again</Button>
                    <Button variant="outline" asChild>
                        <Link href={Routes.HOME}>Go home</Link>
                    </Button>
                </div>
            </div>
        </div>
    );
}
