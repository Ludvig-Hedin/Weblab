import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { SignInMethod } from '@weblab/models/auth';
import { Button } from '@weblab/ui/button';
import { cn } from '@weblab/ui/utils';

import { env } from '@/env';
import { transKeys } from '@/i18n/keys';
import { useAuthContext } from '../auth/auth-context';

interface LoginButtonProps {
    className?: string;
    returnUrl?: string | null;
    method: SignInMethod.GITHUB | SignInMethod.GOOGLE;
    icon: React.ReactNode;
    translationKey: keyof typeof transKeys.welcome.login;
    providerName: string;
    /**
     * Override the click handler. When provided, the Supabase-backed
     * `handleLogin` from AuthContext is skipped — used by the Clerk sign-in
     * surface to drive Clerk's `authenticateWithRedirect` instead. The button
     * tracks its own loading state in that case so the spinner stays in sync.
     */
    onClickOverride?: () => Promise<void> | void;
}

export const LoginButton = ({
    className,
    returnUrl,
    method,
    icon,
    translationKey,
    providerName,
    onClickOverride,
}: LoginButtonProps) => {
    const t = useTranslations();
    const { lastSignInMethod, handleLogin, signingInMethod } = useAuthContext();
    const [isOverrideLoading, setIsOverrideLoading] = useState(false);
    const isLastSignInMethod = lastSignInMethod === method;
    const isSigningIn = onClickOverride ? isOverrideLoading : signingInMethod === method;
    const isAnySigningIn = onClickOverride ? isOverrideLoading : !!signingInMethod;

    const handleLoginClick = async () => {
        try {
            if (onClickOverride) {
                setIsOverrideLoading(true);
                await onClickOverride();
                return;
            }
            await handleLogin(method, returnUrl ?? null);
        } catch (error) {
            if (env.NODE_ENV !== 'production') {
                console.error(`Error signing in with ${providerName}:`, error);
            }
            toast.error(`Error signing in with ${providerName}`, {
                description: error instanceof Error ? error.message : 'Please try again.',
            });
        } finally {
            if (onClickOverride) setIsOverrideLoading(false);
        }
    };

    return (
        <div className="relative w-full">
            <Button
                variant="outline"
                className={cn(
                    'text-active text-small bg-background-weblab w-full items-center justify-center',
                    className,
                )}
                onClick={() => void handleLoginClick()}
                disabled={isAnySigningIn}
                loading={isSigningIn}
            >
                {!isSigningIn && icon}
                {isSigningIn && <span className="sr-only">Signing in...</span>}
                {t(transKeys.welcome.login[translationKey])}
            </Button>
            {isLastSignInMethod && (
                <span
                    className="bg-background text-foreground-secondary border-border pointer-events-none absolute -top-1.5 right-2 inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] leading-none font-medium"
                    aria-label={t(transKeys.welcome.login.lastUsed)}
                >
                    {t(transKeys.welcome.login.lastUsed)}
                </span>
            )}
        </div>
    );
};

export const DevLoginButton = ({
    className,
    returnUrl,
}: {
    className?: string;
    returnUrl: string | null;
}) => {
    const { handleDevLogin, signingInMethod } = useAuthContext();
    const isSigningIn = signingInMethod === SignInMethod.DEV;

    return (
        <Button
            variant="outline"
            className={cn('text-active text-small w-full', className)}
            onClick={() => {
                void handleDevLogin(returnUrl);
            }}
            disabled={!!signingInMethod}
            loading={isSigningIn}
        >
            {isSigningIn ? (
                <span className="sr-only">Signing in...</span>
            ) : (
                <>
                    {'[DEV] Sign in as demo user'}
                    <span className="sr-only"> (developer mode)</span>
                </>
            )}
        </Button>
    );
};
