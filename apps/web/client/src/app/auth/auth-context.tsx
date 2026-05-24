'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useState } from 'react';
import { useRouter } from 'next/navigation';

// Post-migration shim. The original AuthContext orchestrated Supabase OAuth
// modals (handleLogin / handleDevLogin). Clerk replaces all of that with its
// own UI at /sign-in, so the only surface we still need is
// `setIsAuthModalOpen(true)` — call sites use it to gate an action behind
// auth. We redirect to /sign-in instead of opening a modal.

interface AuthContextValue {
    isAuthModalOpen: boolean;
    setIsAuthModalOpen: (open: boolean) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const router = useRouter();
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

    const setOpen = (open: boolean) => {
        setIsAuthModalOpen(open);
        if (open) {
            // Bounce to Clerk's sign-in instead of opening a custom modal.
            // returnUrl is built from the current pathname so the user lands
            // back where they were after sign-in.
            const returnUrl = typeof window !== 'undefined' ? window.location.pathname : '/';
            const params = new URLSearchParams({ returnUrl });
            router.push(`/sign-in?${params.toString()}`);
        }
    };

    return (
        <AuthContext.Provider value={{ isAuthModalOpen, setIsAuthModalOpen: setOpen }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuthContext(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        // Allow standalone use (e.g. storybook) — fall back to a no-op so the
        // import doesn't crash outside the provider.
        return {
            isAuthModalOpen: false,
            setIsAuthModalOpen: () => undefined,
        };
    }
    return ctx;
}
