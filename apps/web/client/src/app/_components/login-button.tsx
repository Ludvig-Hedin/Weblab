import { transKeys } from '@/i18n/keys';
import { SignInMethod } from '@weblab/models/auth';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
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
            console.error(`Error signing in with ${providerName}:`, error);
            toast.error(`Error signing in with ${providerName}`, {
                description: error instanceof Error ? error.message : 'Please try again.',
            });
        }
    };

    return (
        <div className={cn('flex flex-col items-center w-full', className)}>
            <Button
                variant="outline"
                className={cn(
                    'w-full items-center justify-center text-active text-small',
                    isLastSignInMethod
                        ? 'bg-blue-100 dark:bg-blue-950 border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-100 text-small hover:bg-blue-200/50 dark:hover:bg-blue-800 hover:border-blue-500/70 dark:hover:border-blue-500'
                        : 'bg-background-onlook',
                )}
                onClick={handleLoginClick}
                disabled={!!signingInMethod}
            >
                {isSigningIn ? (
                    <Icons.LoadingSpinner className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                    icon
                )}
{t(transKeys.welcome.login[translationKey])}
            </Button>
            {isLastSignInMethod && (
                <p className="text-blue-500 text-small mt-1">{t(transKeys.welcome.login.lastUsed)}</p>
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
            className={cn('w-full text-active text-small', className)}
            onClick={() => {
                void handleDevLogin(returnUrl);
            }}
            disabled={!!signingInMethod}
        >
            {isSigningIn ? (
                <Icons.LoadingSpinner className="w-4 h-4 mr-2 animate-spin" />
            ) : 'DEV MODE: Sign in as demo user'}
        </Button>
    );
};
