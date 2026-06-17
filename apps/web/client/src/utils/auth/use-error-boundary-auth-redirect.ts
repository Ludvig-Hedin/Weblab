'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';

import { env } from '@/env';
import { isChunkLoadError, reloadOnceForChunkError } from '@/app/_components/chunk-error-reloader';
import { isConvexUnauthenticatedError } from '@/utils/auth/convex-unauthenticated';
import { getSignInUrlClient } from '@/utils/auth/sign-in-url';
import { clearSigningOut, isSigningOut } from '@/utils/auth/signing-out';

const SIGN_IN_PATH = '/sign-in';

/**
 * Shared auth/chunk recovery for **segment** error boundaries. A faithful copy
 * of the root error boundary's logic (`src/app/error.tsx`), extracted so the
 * nested `/projects` and `/project/[id]` boundaries don't dead-end a user whose
 * Convex session expired.
 *
 * Without this, a Convex `UNAUTHORIZED` thrown under one of those segments is
 * caught by the *segment* boundary before the root boundary's re-auth redirect
 * can fire — so the user is stranded on a "Something went wrong" card with no
 * sign-in path. This hook bounces a confirmed signed-out session (or an
 * in-flight sign-out) to `/sign-in` with a `returnUrl`, and recovers a stale
 * chunk crash with a guarded one-time reload.
 *
 * Returns whether the caller should render a blank holding screen instead of
 * its error card. The hooks are safe here: segment boundaries render inside
 * RootLayout → ClerkProvider.
 */
export function useErrorBoundaryAuthRedirect(error: Error & { digest?: string }): {
    shouldRenderBlank: boolean;
} {
    const isChunkError = isChunkLoadError(error);
    // Clerk auth state tells a real signed-out session loss apart from a
    // *signed-in* permission error (both surface as "UNAUTHORIZED").
    const { isLoaded, isSignedIn } = useAuth();

    const signingOut = isSigningOut();
    const maybeAuthError = isConvexUnauthenticatedError(error);
    // Bounce on an in-flight sign-out, OR a token-loss error Clerk confirms is
    // signed-out. Never redirect a signed-IN user — a forbidden-resource
    // "UNAUTHORIZED" must fall through to the card.
    const redirectToSignIn = signingOut || (maybeAuthError && isLoaded && isSignedIn === false);
    // While Clerk is still loading we can't classify an auth-looking error —
    // hold the blank screen so the common signed-out path never flashes the card.
    const holdForAuth = maybeAuthError && !isLoaded && !isChunkError;

    const [recovering, setRecovering] = useState(isChunkError);

    useEffect(() => {
        if (redirectToSignIn) {
            // A sign-out gets a clean /sign-in (no returnUrl). A mid-session
            // token loss preserves the current path so re-login returns here —
            // except when already on /sign-in, which would self-loop.
            const path = typeof window !== 'undefined' ? window.location.pathname : '';
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
        // graph (HMR rebuild / deploy). Recover with a guarded one-time reload.
        if (isChunkError && reloadOnceForChunkError()) {
            return;
        }
        setRecovering(false);
        if (env.NODE_ENV !== 'production') {
            console.error('Segment error boundary:', error);
        }
    }, [error, isChunkError, redirectToSignIn, signingOut]);

    return { shouldRenderBlank: recovering || redirectToSignIn || holdForAuth };
}
