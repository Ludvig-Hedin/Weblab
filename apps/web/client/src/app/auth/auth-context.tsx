'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import localforage from 'localforage';

import { SignInMethod } from '@weblab/models/auth';
import { toast } from '@weblab/ui/sonner';

import { env } from '@/env';
import { LocalForageKeys } from '@/utils/constants';
import { devLogin, login } from '../login/actions';

const LAST_SIGN_IN_METHOD_KEY = 'lastSignInMethod';

function isNextRedirectSignal(error: unknown): boolean {
    return (
        error instanceof Error &&
        (error.message === 'NEXT_REDIRECT' ||
            ('digest' in error &&
                typeof error.digest === 'string' &&
                error.digest.startsWith('NEXT_REDIRECT')))
    );
}

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
        void getLastSignInMethod();
    }, []);

    const handleLogin = async (
        method: SignInMethod.GITHUB | SignInMethod.GOOGLE,
        returnUrl: string | null,
    ) => {
        try {
            setSigningInMethod(method);
            // returnUrl is propagated through the OAuth redirectTo query string by
            // the server action. Existing auth-modal CTAs stage it in localforage
            // before opening the modal, so drain that value when the button did
            // not receive an explicit returnUrl prop. Skip stale staged returnUrls
            // (a previous modal dismiss, an abandoned chat draft) so bookmarking
            // /login does not send users to /projects/new?resumeCreate=1.
            let stagedReturnUrl: string | null = returnUrl;
            if (!stagedReturnUrl) {
                const stored = await localforage.getItem<string>(LocalForageKeys.RETURN_URL);
                const { loadAiPromptCreateDraft, AI_PROMPT_CREATE_RESUME_PATH } =
                    await import('@/components/ai-prompt-composer/create-draft');
                if (stored === AI_PROMPT_CREATE_RESUME_PATH) {
                    const draft = await loadAiPromptCreateDraft();
                    stagedReturnUrl = draft ? stored : null;
                } else {
                    stagedReturnUrl = stored;
                }
            }
            await localforage.removeItem(LocalForageKeys.RETURN_URL);
            await localforage.setItem(LAST_SIGN_IN_METHOD_KEY, method);

            // Desktop shell: run the OAuth provider screens in the user's real
            // browser. Embedded webviews have no access to saved logins
            // (no autofill) and Google outright blocks OAuth inside them. The
            // server action returns the provider URL instead of redirecting in
            // place; the Electron preload opens it externally. Supabase then
            // redirects to `weblab://auth/callback`, which the shell loads back
            // into this window so the PKCE exchange runs in the same cookie jar
            // that started the flow.
            const openOAuth =
                typeof window !== 'undefined' ? window.weblabNative?.openOAuth : undefined;
            if (openOAuth) {
                const result = await login(method, stagedReturnUrl, true);
                if (!result?.url) {
                    throw new Error('Sign-in failed: no provider URL returned.');
                }
                const opened = await openOAuth(result.url);
                if (!opened) {
                    throw new Error('Could not open your browser to continue sign-in.');
                }
                return;
            }

            await login(method, stagedReturnUrl);
        } catch (error) {
            if (isNextRedirectSignal(error)) {
                return;
            }
            if (env.NODE_ENV !== 'production') {
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
            // devLogin redirects the browser via Next.js redirect() — it never
            // returns a value. The page navigates away through Supabase magic-link
            // → /auth/callback → app, identical to the OAuth flow.
            await devLogin(stagedReturnUrl);
        } catch (error) {
            if (isNextRedirectSignal(error)) {
                return;
            }
            if (env.NODE_ENV !== 'production') {
                console.error('Error signing in (demo):', error);
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
