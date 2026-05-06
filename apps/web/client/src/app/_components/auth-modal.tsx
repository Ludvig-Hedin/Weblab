import { useTranslations } from 'next-intl';

import { SignInMethod } from '@weblab/models/auth';
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@weblab/ui/alert-dialog';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';

import { env } from '@/env';
import { transKeys } from '@/i18n/keys';
import { useAuthContext } from '../auth/auth-context';
import { DevLoginButton, LoginButton } from './login-button';

export function AuthModal() {
    const { setIsAuthModalOpen, isAuthModalOpen } = useAuthContext();
    const t = useTranslations();

    return (
        <AlertDialog open={isAuthModalOpen} onOpenChange={setIsAuthModalOpen}>
            <AlertDialogContent className="bg-card !max-w-sm">
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-center text-xl font-normal">
                        {t(transKeys.welcome.login.loginToEdit)}
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-center text-balance">
                        {t(transKeys.welcome.login.shareProjects)}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="flex flex-col space-y-2">
                    <LoginButton
                        className="!bg-card"
                        method={SignInMethod.GITHUB}
                        icon={<Icons.GitHubLogo className="mr-2 h-4 w-4" />}
                        translationKey="github"
                        providerName="GitHub"
                    />
                    <LoginButton
                        className="!bg-card"
                        method={SignInMethod.GOOGLE}
                        icon={<Icons.GoogleLogo viewBox="0 0 24 24" className="mr-2 h-4 w-4" />}
                        translationKey="google"
                        providerName="Google"
                    />
                    {env.NEXT_PUBLIC_SHOW_DEV_LOGIN && (
                        <DevLoginButton className="!bg-card" returnUrl={null} />
                    )}
                </div>
                <AlertDialogFooter className="flex w-full !justify-center">
                    <Button variant={'ghost'} onClick={() => setIsAuthModalOpen(false)}>
                        {t(transKeys.projects.actions.close)}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
