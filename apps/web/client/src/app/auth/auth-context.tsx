'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import localforage from 'localforage';

import { SignInMethod } from '@weblab/models/auth';
import { toast } from '@weblab/ui/sonner';

import { LocalForageKeys } from '@/utils/constants';
import { devLogin, login } from '../login/actions';

const LAST_SIGN_IN_METHOD_KEY = 'lastSignInMethod';

interface AuthContextType {
    signingInMethod: SignInMethod | null;
    lastSignInMethod: SignInMethod | null;
    isAuthModalOpen: boolean;
    setIsAuthModalOpen: (open: boolean) => void;
    handleLogin: (
        method: SignInMethod.GITHUB | SignInMethod.GOOGLE,
        returnUrl: string | null,
    ) => Promise<void>;
    handleDevLogin: (returnUrl: string | null) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const router = useRouter();
    const [lastSignInMethod, setLastSignInMethod] = useState<SignInMethod | null>(null);
    const [signingInMethod, setSigningInMethod] = useState<SignInMethod | null>(null);
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

    useEffect(() => {
        const getLastSignInMethod = async () => {
            const lastSignInMethod = await localforage.getItem<SignInMethod | null>(
                LAST_SIGN_IN_METHOD_KEY,
            );
            setLastSignInMethod(lastSignInMethod);
        };
        getLastSignInMethod();
    }, []);

    const handleLogin = async (
        method: SignInMethod.GITHUB | SignInMethod.GOOGLE,
        returnUrl: string | null,
    ) => {
        try {
            setSigningInMethod(method);
            // returnUrl is now propagated through the OAuth redirectTo query
            // string by the server action. Existing auth-modal CTAs still stage
            // it in localforage before opening the modal, so drain that value
            // when the button did not receive an explicit returnUrl prop.
            const stagedReturnUrl =
                returnUrl ?? (await localforage.getItem<string>(LocalForageKeys.RETURN_URL));
            await localforage.removeItem(LocalForageKeys.RETURN_URL);
            await localforage.setItem(LAST_SIGN_IN_METHOD_KEY, method);
            await login(method, stagedReturnUrl);
        } catch (error) {
            if (process.env.NODE_ENV !== 'production') {
                console.error('Error signing in with method:', method, error);
            }
            throw error;
        } finally {
            setSigningInMethod(null);
        }
    };

    const handleDevLogin = async (returnUrl: string | null) => {
        try {
            setSigningInMethod(SignInMethod.DEV);
            const stagedReturnUrl =
                returnUrl ?? (await localforage.getItem<string>(LocalForageKeys.RETURN_URL));
            await localforage.removeItem(LocalForageKeys.RETURN_URL);
            await localforage.setItem(LAST_SIGN_IN_METHOD_KEY, SignInMethod.DEV);
            const result = await devLogin();

            if (result?.redirectTo) {
                // Pass returnUrl through the URL query so /auth/redirect can read it.
                let target: string = result.redirectTo;
                if (stagedReturnUrl) {
                    const url = new URL(result.redirectTo, window.location.origin);
                    url.searchParams.set('returnUrl', stagedReturnUrl);
                    target = url.toString();
                }
                router.replace(target);
            }
        } catch (error) {
            if (process.env.NODE_ENV !== 'production') {
                console.error('Error signing in with password:', error);
            }
            const message = error instanceof Error ? error.message : 'Unknown error';
            toast.error('Demo sign-in failed', { description: message });
        } finally {
            setSigningInMethod(null);
        }
    };

    return (
        <AuthContext.Provider
            value={{
                signingInMethod,
                lastSignInMethod,
                handleLogin,
                handleDevLogin,
                isAuthModalOpen,
                setIsAuthModalOpen,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuthContext = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuthContext must be used within a AuthProvider');
    }
    return context;
};
