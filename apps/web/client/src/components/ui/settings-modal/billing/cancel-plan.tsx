'use client';

import { useState } from 'react';
import { api } from '@convex/_generated/api';
import { useAction } from 'convex/react';
import { useTranslations } from 'next-intl';

import type { BillingSubscription } from '@convex/subscriptions';
import { ScheduledSubscriptionAction } from '@weblab/stripe';
import { Button } from '@weblab/ui/button';
import { toast } from '@weblab/ui/sonner';

import { SubscriptionCancelModal } from '../subscription-cancel-modal';
import { formatDate } from './format';

interface CancelPlanProps {
    subscription: BillingSubscription | null;
    isPro: boolean;
}

export const CancelPlan = ({ subscription, isPro }: CancelPlanProps) => {
    const t = useTranslations('settings.billing.cancel');
    const cancelSubscription = useAction(api.subscriptionActions.cancelSubscription);
    const reactivateSubscription = useAction(api.subscriptionActions.reactivateSubscription);

    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
    const [isBusy, setIsBusy] = useState(false);

    if (!isPro || !subscription) return null;

    const isCancelling =
        subscription.scheduledChange?.scheduledAction === ScheduledSubscriptionAction.CANCELLATION;

    const handleConfirmCancel = async () => {
        setIsBusy(true);
        try {
            await cancelSubscription({});
            toast.success(t('toastCancelSuccess'));
            setIsCancelModalOpen(false);
        } catch (error) {
            console.error('Failed to cancel subscription:', error);
            toast.error(t('toastCancelFailed'));
        } finally {
            setIsBusy(false);
        }
    };

    const handleReactivate = async () => {
        setIsBusy(true);
        try {
            await reactivateSubscription({});
            toast.success(t('toastReactivateSuccess'));
        } catch (error) {
            console.error('Failed to reactivate subscription:', error);
            toast.error(t('toastReactivateFailed'));
        } finally {
            setIsBusy(false);
        }
    };

    return (
        <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
                <p className="text-regularPlus font-medium">
                    {isCancelling ? t('reactivateTitle') : t('cancelTitle')}
                </p>
                <p className="text-small text-muted-foreground">
                    {isCancelling
                        ? t('reactivateDesc', { date: formatDate(subscription.scheduledChange!.scheduledChangeAt) })
                        : t('cancelDesc')}
                </p>
            </div>
            {isCancelling ? (
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleReactivate()}
                    disabled={isBusy}
                >
                    {t('reactivate')}
                </Button>
            ) : (
                <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setIsCancelModalOpen(true)}
                    disabled={isBusy}
                >
                    {t('cancel')}
                </Button>
            )}

            <SubscriptionCancelModal
                open={isCancelModalOpen}
                onOpenChange={setIsCancelModalOpen}
                onConfirmCancel={() => void handleConfirmCancel()}
                isBusy={isBusy}
            />
        </div>
    );
};
