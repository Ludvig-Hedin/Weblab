'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useAction, useQuery } from 'convex/react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { APP_NAME } from '@weblab/constants';
import { Button } from '@weblab/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@weblab/ui/dialog';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { toast } from '@weblab/ui/sonner';

import { isClerkMode, useSafeClerk } from '@/utils/auth/safe-clerk';
import { getSignInUrlClient } from '@/utils/auth/sign-in-url';
import { signOutEverywhere } from '@/utils/auth/sign-out';

export const UserDeleteSection = observer(() => {
    const t = useTranslations('settings.delete');
    const router = useRouter();
    const { signOut: clerkSignOut } = useSafeClerk();
    const user = useQuery(api.users.me);
    const deleteAccount = useAction(api.userActions.remove);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteEmail, setDeleteEmail] = useState('');
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [showFinalDeleteConfirm, setShowFinalDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDeleteAccount = () => {
        setShowDeleteModal(true);
    };

    const handleDeleteConfirm = () => {
        setShowDeleteModal(false);
        setShowFinalDeleteConfirm(true);
    };

    const handleFinalDeleteAccount = async () => {
        if (isDeleting) return;
        setIsDeleting(true);
        try {
            await deleteAccount({});
            await handleDeleteSuccess();
        } catch (error) {
            toast.error(t('toastFailed'));
            console.error('Failed to delete account', error);
            setIsDeleting(false);
        }
    };

    const handleDeleteSuccess = async () => {
        toast.success(t('toastSuccess'));

        setShowFinalDeleteConfirm(false);
        setDeleteEmail('');
        setDeleteConfirmText('');

        await signOutEverywhere(isClerkMode() ? () => clerkSignOut() : undefined);
        router.push(getSignInUrlClient());
    };

    const canProceedWithDelete = deleteEmail === user?.email && deleteConfirmText === 'DELETE';

    return (
        <>
            {/* Delete Account Section */}
            <div className="flex items-center justify-between py-6">
                <div className="space-y-1">
                    <p className="text-regularPlus font-medium">{t('sectionTitle')}</p>
                    <p className="text-small text-muted-foreground">{t('sectionDescription')}</p>
                </div>
                <Button variant="destructive" size="sm" onClick={handleDeleteAccount}>
                    {t('deleteButton')}
                </Button>
            </div>

            {/* Delete Account Confirmation Modal */}
            <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{t('confirmTitle')}</DialogTitle>
                        <DialogDescription asChild className="pt-2">
                            <div className="space-y-2">
                                <p>{t('confirmIntro')}</p>
                                <div className="text-regular space-y-1">
                                    {(
                                        [
                                            'bullet1',
                                            'bullet2',
                                            'bullet3',
                                            'bullet4',
                                            'bullet5',
                                            'bullet6',
                                        ] as const
                                    ).map((key) => (
                                        <div key={key} className="flex items-start gap-2">
                                            <span className="mt-0.5">•</span>
                                            <span>
                                                {key === 'bullet2'
                                                    ? t(key, { appName: APP_NAME })
                                                    : t(key)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="delete-email">{t('emailLabel')}</Label>
                            <Input
                                id="delete-email"
                                type="email"
                                value={deleteEmail}
                                onChange={(e) => setDeleteEmail(e.target.value)}
                                placeholder={user?.email || ''}
                                className="w-full"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="delete-confirm">{t('confirmLabel')}</Label>
                            <Input
                                id="delete-confirm"
                                value={deleteConfirmText}
                                onChange={(e) => setDeleteConfirmText(e.target.value)}
                                placeholder="DELETE"
                                className="w-full"
                            />
                        </div>
                    </div>
                    <DialogFooter className="flex-col gap-3 sm:flex-row sm:gap-2">
                        <Button
                            variant="outline"
                            onClick={() => {
                                setShowDeleteModal(false);
                                setDeleteEmail('');
                                setDeleteConfirmText('');
                            }}
                            className="order-2 sm:order-1"
                        >
                            {t('cancelButton')}
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteConfirm}
                            disabled={!canProceedWithDelete}
                            className="order-1 sm:order-2"
                        >
                            {canProceedWithDelete ? t('deleteAccountButton') : t('lockedButton')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Final Delete Confirmation Modal */}
            <Dialog open={showFinalDeleteConfirm} onOpenChange={setShowFinalDeleteConfirm}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('finalTitle')}</DialogTitle>
                        <DialogDescription className="pt-2">
                            {t('finalDescription')}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="flex-col gap-3 sm:flex-row sm:gap-2">
                        <Button
                            variant="outline"
                            onClick={() => {
                                setShowFinalDeleteConfirm(false);
                                setDeleteEmail('');
                                setDeleteConfirmText('');
                            }}
                            className="order-2 sm:order-1"
                        >
                            {t('cancelButton')}
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => void handleFinalDeleteAccount()}
                            disabled={isDeleting}
                            className="order-1 sm:order-2"
                        >
                            {isDeleting ? t('deleting') : t('confirmDeleteButton')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
});
