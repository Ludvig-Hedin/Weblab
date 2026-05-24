'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import localforage from 'localforage';

import { getSignInUrlClient } from '@/utils/auth/sign-in-url';
import { LocalForageKeys } from '@/utils/constants';

export const AuthRedirect = ({ children }: { children: React.ReactNode }) => {
    const router = useRouter();
    const { isLoaded, isSignedIn } = useAuth();

    useEffect(() => {
        if (!isLoaded) return;
        if (isSignedIn) return;
        const pathname = window.location.pathname;
        void localforage.setItem(LocalForageKeys.RETURN_URL, pathname);
        router.push(getSignInUrlClient(pathname));
    }, [router, isLoaded, isSignedIn]);

    return <>{children}</>;
};
