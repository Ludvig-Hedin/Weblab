'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@weblab/ui/dialog';

interface SubscriptionCancelModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirmCancel: () => void;
    isBusy?: boolean;
}

export const SubscriptionCancelModal = ({
    open,
    onOpenChange,
    onConfirmCancel,
    isBusy = false,
}: SubscriptionCancelModalProps) => {
    const t = useTranslations('settings.subscription.cancelModal');

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('title')}</DialogTitle>
                    <DialogDescription className="pt-2">{t('description')}</DialogDescription>
                </DialogHeader>
                <DialogFooter className="flex-col gap-3 sm:flex-row sm:gap-2">
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isBusy}
                        className="order-2 sm:order-1"
                    >
                        {t('keepSubscription')}
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={onConfirmCancel}
                        disabled={isBusy}
                        className="order-1 sm:order-2"
                    >
                        {isBusy ? t('cancelling') : t('cancelSubscription')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
