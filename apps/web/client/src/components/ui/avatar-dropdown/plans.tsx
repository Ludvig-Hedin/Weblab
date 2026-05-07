'use client';

import { useEffect } from 'react';
import { debounce } from 'lodash';
import { observer } from 'mobx-react-lite';

import { FREE_PRODUCT_CONFIG, ProductType, ScheduledSubscriptionAction } from '@weblab/stripe';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Progress } from '@weblab/ui/progress';

import { useStateManager } from '@/components/store/state';
import { api } from '@/trpc/react';

export const UsageSection = observer(({ open }: { open: boolean }) => {
    const state = useStateManager();
    const { data: subscription, isLoading: subscriptionLoading } = api.subscription.get.useQuery();
    const {
        data: usageData,
        refetch: refetchUsage,
        isLoading: usageLoading,
    } = api.usage.get.useQuery();

    const debouncedRefetchUsage = debounce(refetchUsage, 1000, { leading: true, trailing: false });
    useEffect(() => {
        if (open) {
            debouncedRefetchUsage();
        }
    }, [open]);

    const isLoading = subscriptionLoading || usageLoading;

    const product = subscription?.product ?? FREE_PRODUCT_CONFIG;
    // Bug fix #13: Free plan should read "Free", not "Trial" — there is no trial period.
    const price = product?.type === ProductType.FREE ? 'Free' : 'Active';
    // Bug fix #14: Used to gate the "Get more Credits" upsell — Pro users shouldn't see it.
    const isPro = product?.type === ProductType.PRO;
    const usage = product?.type === ProductType.FREE ? usageData?.daily : usageData?.monthly;

    const usagePercent =
        usage && usage.limitCount > 0 ? (usage.usageCount / usage.limitCount) * 100 : 0;

    const handleGetMoreCredits = () => {
        state.isSubscriptionModalOpen = true;
    };

    const getSubscriptionChangeMessage = () => {
        let message = '';
        if (
            subscription?.scheduledChange?.scheduledAction ===
                ScheduledSubscriptionAction.PRICE_CHANGE &&
            subscription.scheduledChange.price
        ) {
            message = `Your ${subscription.scheduledChange.price.monthlyMessageLimit} credits a month plan starts on ${subscription.scheduledChange.scheduledChangeAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
        } else if (
            subscription?.scheduledChange?.scheduledAction ===
            ScheduledSubscriptionAction.CANCELLATION
        ) {
            message = `Your subscription will end on ${subscription.scheduledChange.scheduledChangeAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
        }

        if (message) {
            return <div className="text-amber text-mini text-balance">{message}</div>;
        }
    };

    return (
        <div className="flex w-full flex-col gap-4 p-4 text-sm">
            <div className="flex items-center justify-between">
                <div>
                    {isLoading ? (
                        <>
                            <div className="bg-muted mb-1 h-4 w-24 animate-pulse rounded text-sm"></div>
                            <div className="text-muted-foreground bg-muted h-4 w-16 animate-pulse rounded"></div>
                        </>
                    ) : (
                        <>
                            <div className="text-sm">{product.name}</div>
                            <div className="text-muted-foreground">{price}</div>
                        </>
                    )}
                </div>
                <div className="text-right">
                    {isLoading ? (
                        <>
                            <div className="bg-muted mb-1 h-4 w-20 animate-pulse rounded text-sm"></div>
                            <div className="text-muted-foreground bg-muted h-4 w-24 animate-pulse rounded"></div>
                        </>
                    ) : (
                        <>
                            <div>
                                {usage?.usageCount ?? 0}{' '}
                                <span className="text-muted-foreground">of</span>{' '}
                                {usage?.limitCount ?? 0}
                            </div>
                            <div className="text-muted-foreground">
                                {usage?.period === 'day' ? 'daily' : 'monthly'} credits used
                            </div>
                        </>
                    )}
                </div>
            </div>
            {!isLoading && getSubscriptionChangeMessage()}
            <Progress value={isLoading ? 0 : usagePercent} className="w-full" />
            {!isPro && (
                <Button
                    className="flex w-full items-center justify-center gap-2 bg-blue-400 text-white hover:bg-blue-500"
                    onClick={handleGetMoreCredits}
                >
                    <Icons.Sparkles className="mr-1 h-4 w-4" /> Get more Credits
                </Button>
            )}
        </div>
    );
});
