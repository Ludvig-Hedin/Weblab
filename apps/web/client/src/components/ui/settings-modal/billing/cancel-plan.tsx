'use client';

import { useState } from 'react';
import { api } from '@convex/_generated/api';
import { useAction } from 'convex/react';

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
            toast.success('Subscription set to cancel at period end');
            setIsCancelModalOpen(false);
        } catch (error) {
            console.error('Failed to cancel subscription:', error);
            toast.error('Failed to cancel subscription');
        } finally {
            setIsBusy(false);
        }
    };

    const handleReactivate = async () => {
        setIsBusy(true);
        try {
            await reactivateSubscription({});
            toast.success('Subscription reactivated');
        } catch (error) {
            console.error('Failed to reactivate subscription:', error);
            toast.error('Failed to reactivate subscription');
        } finally {
            setIsBusy(false);
        }
    };

    return (
        <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
                <p className="text-regularPlus font-medium">
                    {isCancelling ? 'Reactivate plan' : 'Cancel plan'}
                </p>
                <p className="text-small text-muted-foreground">
                    {isCancelling
                        ? `Your plan cancels on ${formatDate(subscription.scheduledChange!.scheduledChangeAt)}. Reactivate to keep it.`
                        : "If you cancel, you'll keep full access to your plan features until the end of your billing period."}
                </p>
            </div>
            {isCancelling ? (
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleReactivate()}
                    disabled={isBusy}
                >
                    Reactivate
                </Button>
            ) : (
                <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setIsCancelModalOpen(true)}
                    disabled={isBusy}
                >
                    Cancel
                </Button>
            )}

            <SubscriptionCancelModal
                open={isCancelModalOpen}
                onOpenChange={setIsCancelModalOpen}
                onConfirmCancel={() => void handleConfirmCancel()}
            />
        </div>
    );
};
