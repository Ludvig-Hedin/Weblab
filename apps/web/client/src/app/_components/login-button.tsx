import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { SignInMethod } from '@weblab/models/auth';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import { transKeys } from '@/i18n/keys';
import { useAuthContext } from '../auth/auth-context';

interface LoginButtonProps {
    className?: string;
    returnUrl?: string | null;
    method: SignInMethod.GITHUB | SignInMethod.GOOGLE;
    icon: React.ReactNode;
    translationKey: keyof typeof transKeys.welcome.login;
    providerName: string;
}

export const LoginButton = ({
    className,
    returnUrl,
    method,
    icon,
    translationKey,
    providerName,
}: LoginButtonProps) => {
    const t = useTranslations();
    const { lastSignInMethod, handleLogin, signingInMethod } = useAuthContext();
    const isLastSignInMethod = lastSignInMethod === method;
    const isSigningIn = signingInMethod === method;

    const handleLoginClick = async () => {
        try {
            await handleLogin(method, returnUrl ?? null);
        } catch (error) {
            if (process.env.NODE_ENV !== 'production') {
                console.error(`Error signing in with ${providerName}:`, error);
            }
            toast.error(`Error signing in with ${providerName}`, {
                description: error instanceof Error ? error.message : 'Please try again.',
            });
        }
    };

    return (
        <div className={cn('flex w-full flex-col items-center', className)}>
            <Button
                variant="outline"
                className={cn(
                    'text-active text-small w-full items-center justify-center',
                    isLastSignInMethod
                        ? 'text-small border-blue-300 bg-blue-100 text-blue-900 hover:border-blue-500/70 hover:bg-blue-200/50 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-100 dark:hover:border-blue-500 dark:hover:bg-blue-800'
                        : 'bg-background-weblab',
                )}
                onClick={handleLoginClick}
                disabled={!!signingInMethod}
            >
                {isSigningIn ? (
                    <Icons.LoadingSpinner
                        className="mr-2 h-4 w-4 animate-spin"
                        aria-hidden="true"
                    />
                ) : (
                    icon
                )}
                {isSigningIn && <span className="sr-only">Signing in...</span>}
                {t(transKeys.welcome.login[translationKey])}
            </Button>
            {isLastSignInMethod && (
                <p className="text-small mt-1 text-blue-500">
                    {t(transKeys.welcome.login.lastUsed)}
                </p>
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
        >
            {isSigningIn ? (
                <>
                    <Icons.LoadingSpinner
                        className="mr-2 h-4 w-4 animate-spin"
                        aria-hidden="true"
                    />
                    <span className="sr-only">Signing in...</span>
                </>
            ) : (
                <>
                    {'[DEV] Sign in as demo user'}
                    <span className="sr-only"> (developer mode)</span>
                </>
            )}
        </Button>
    );
};
