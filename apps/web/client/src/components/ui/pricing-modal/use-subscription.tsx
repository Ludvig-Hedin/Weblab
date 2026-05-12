import { useEffect, useState } from 'react';

import { ProductType, ScheduledSubscriptionAction } from '@weblab/stripe';
import { toast } from '@weblab/ui/sonner';

import { useStateManager } from '@/components/store/state';
import { useHasAuthCookie } from '@/hooks/use-has-auth-cookie';
import { api } from '@/trpc/react';

export const useSubscription = ({ enabled = true }: { enabled?: boolean } = {}) => {
    const state = useStateManager();
    // The pricing modal is mounted on public surfaces (landing page,
    // changelog, etc.) so the auth-modal CTA can open it without a route
    // change. Anonymous visitors have no subscription to fetch — gate the
    // query on the Supabase cookie so they don't pay a 401 round-trip.
    const hasAuthCookie = useHasAuthCookie();
    const { data: subscription, refetch: refetchSubscription } = api.subscription.get.useQuery(
        undefined,
        {
            enabled: enabled && hasAuthCookie === true,
            refetchInterval: state.isSubscriptionModalOpen ? 3000 : false,
        },
    );
    const [isCheckingSubscription, setIsCheckingSubscription] = useState(false);
    const isPro = subscription?.product.type === ProductType.PRO;
    const scheduledChange = subscription?.scheduledChange;

    useEffect(() => {
        if (isCheckingSubscription && isPro) {
            if (scheduledChange?.scheduledAction === ScheduledSubscriptionAction.PRICE_CHANGE) {
                toast.success('Subscription updated successfully!');
            } else if (
                scheduledChange?.scheduledAction === ScheduledSubscriptionAction.CANCELLATION
            ) {
                toast.success('Subscription cancelled successfully!');
            } else {
                toast.success('Subscription activated successfully!');
            }
            setIsCheckingSubscription(false);
        }
    }, [isPro, scheduledChange?.scheduledAction, isCheckingSubscription]);

    return {
        subscription,
        isPro,
        refetchSubscription,
        isCheckingSubscription,
        setIsCheckingSubscription,
    };
};
