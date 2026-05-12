import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { SignInMethod } from '@weblab/models/auth';
import { Button } from '@weblab/ui/button';
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
                variant={isLastSignInMethod ? 'accent' : 'outline'}
                className={cn(
                    'text-active text-small w-full items-center justify-center',
                    !isLastSignInMethod && 'bg-background-weblab',
                )}
                onClick={handleLoginClick}
                disabled={!!signingInMethod}
                loading={isSigningIn}
            >
                {!isSigningIn && icon}
                {isSigningIn && <span className="sr-only">Signing in...</span>}
                {t(transKeys.welcome.login[translationKey])}
            </Button>
            {isLastSignInMethod && (
                <p className="text-small text-foreground-positive mt-1">
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
