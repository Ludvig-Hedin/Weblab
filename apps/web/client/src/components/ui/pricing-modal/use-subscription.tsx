import { useEffect, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';

import { ProductType, ScheduledSubscriptionAction } from '@weblab/stripe';
import { toast } from '@weblab/ui/sonner';

import { useHasAuthCookie } from '@/hooks/use-has-auth-cookie';

export const useSubscription = ({ enabled = true }: { enabled?: boolean } = {}) => {
    // The pricing modal is mounted on public surfaces (landing page,
    // changelog, etc.) so the auth-modal CTA can open it without a route
    // change. Anonymous visitors have no subscription to fetch — gate the
    // query on the auth cookie so they don't pay a 401 round-trip.
    const hasAuthCookie = useHasAuthCookie();
    const subscription = useQuery(
        api.subscriptions.get,
        enabled && hasAuthCookie === true ? {} : 'skip',
    );
    // Convex live queries auto-refresh on data changes, so the previous
    // `refetchInterval` polling is no longer required. Kept the noop shim
    // for caller compatibility.
    const refetchSubscription = () => Promise.resolve();
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
