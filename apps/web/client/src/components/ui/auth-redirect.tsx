'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import localforage from 'localforage';

import { useSafeClerkAuth } from '@/utils/auth/safe-clerk';
import { getSignInUrlClient } from '@/utils/auth/sign-in-url';
import { LocalForageKeys } from '@/utils/constants';
import { createClient } from '@/utils/supabase/client';

export const AuthRedirect = ({ children }: { children: React.ReactNode }) => {
    // Memoize so the supabase client reference is stable across renders;
    // otherwise the effect below re-runs every render and re-fires getSession().
    const supabase = useMemo(() => createClient(), []);
    const router = useRouter();
    // `useSafeClerkAuth` returns a stub when running in supabase mode — the
    // raw `useAuth()` from `@clerk/nextjs` would throw because we don't mount
    // `<ClerkProvider>` outside of clerk mode.
    const { isLoaded: clerkLoaded, isSignedIn: clerkSignedIn } = useSafeClerkAuth();

    useEffect(() => {
        const provider = process.env.NEXT_PUBLIC_AUTH_PROVIDER ?? 'supabase';

        const redirectIfSignedOut = async () => {
            if (provider === 'clerk') {
                // Wait for Clerk to finish hydrating its session before
                // deciding. Otherwise a fresh load bounces signed-in users
                // through the sign-in page once for no reason.
                if (!clerkLoaded) return;
                if (clerkSignedIn) return;
            } else {
                const {
                    data: { session },
                } = await supabase.auth.getSession();
                if (session) return;
            }
            const pathname = window.location.pathname;
            await localforage.setItem(LocalForageKeys.RETURN_URL, pathname);
            router.push(getSignInUrlClient(pathname));
        };
        redirectIfSignedOut();
    }, [router, supabase, clerkLoaded, clerkSignedIn]);
    return <>{children}</>;
};
