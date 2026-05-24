'use client';

import { useTranslations } from 'next-intl';

import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@weblab/ui/alert-dialog';
import { Button } from '@weblab/ui/button';

import { ClerkAuthForm } from '@/app/sign-in/_components/clerk-auth-form';
import { transKeys } from '@/i18n/keys';
import { useAuthContext } from '../auth/auth-context';

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
                <ClerkAuthForm providerButtonClassName="!bg-card" />
                <AlertDialogFooter className="flex w-full !justify-center">
                    <Button variant={'ghost'} onClick={() => setIsAuthModalOpen(false)}>
                        {t(transKeys.projects.actions.close)}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
