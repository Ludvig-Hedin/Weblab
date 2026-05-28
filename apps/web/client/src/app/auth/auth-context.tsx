'use client';

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useState } from 'react';
import { useRouter } from 'next/navigation';

import { getSignInUrlClient } from '@/utils/auth/sign-in-url';

// Post-migration shim. The original AuthContext orchestrated Supabase OAuth
// modals (handleLogin / handleDevLogin). Clerk replaces all of that with its
// own UI at /sign-in. Two auth-gate primitives remain:
//   - `setIsAuthModalOpen(true)` — opens the in-page AuthModal so a non-authed
//     user can sign in without losing in-flight context (e.g. a typed prompt).
//     The modal renders Clerk's auth form inline; the surrounding state stays
//     mounted.
//   - `redirectToSignIn()` — full-page bounce to `/sign-in?returnUrl=…`. Use
//     for CTA buttons like "Get started" where there's no in-flight state to
//     preserve, and on routes that don't mount `<AuthModal />`.
//
// Previously, `setIsAuthModalOpen(true)` did both — opened the modal AND
// pushed to /sign-in — so users saw the modal flash for a frame before the
// navigation took over. These are now separate calls.

interface AuthContextValue {
    isAuthModalOpen: boolean;
    setIsAuthModalOpen: (open: boolean) => void;
    redirectToSignIn: (returnUrl?: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const router = useRouter();
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

    const redirectToSignIn = useCallback(
        (returnUrl?: string) => {
            // Build returnUrl from the current pathname + search so the user
            // lands back where they were (with query params intact, e.g.
            // `/projects?filter=foo`) after sign-in. Hash is intentionally
            // dropped because the server-side `redirect(returnUrl)` doesn't
            // preserve hashes anyway.
            const resolved =
                returnUrl ??
                (typeof window !== 'undefined'
                    ? `${window.location.pathname}${window.location.search}`
                    : '/');
            router.push(getSignInUrlClient(resolved));
        },
        [router],
    );

    return (
        <AuthContext.Provider value={{ isAuthModalOpen, setIsAuthModalOpen, redirectToSignIn }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuthContext(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        // Allow standalone use (e.g. storybook) — fall back to no-ops so the
        // import doesn't crash outside the provider.
        return {
            isAuthModalOpen: false,
            setIsAuthModalOpen: () => undefined,
            redirectToSignIn: () => undefined,
        };
    }
    return ctx;
}
