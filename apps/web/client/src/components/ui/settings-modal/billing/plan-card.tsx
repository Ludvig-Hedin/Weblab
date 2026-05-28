'use client';

import type { BillingSubscription } from '@convex/subscriptions';

import { ScheduledSubscriptionAction } from '@weblab/stripe';
import { Button } from '@weblab/ui/button';

import { formatDate } from './format';

// Treat the top "unlimited" tier (monthlyMessageLimit 99999) as uncapped so we
// don't render a meaningless near-empty progress bar.
const UNLIMITED_THRESHOLD = 99999;

interface UsageSummary {
    monthly: { usageCount: number; limitCount: number };
}

interface PlanCardProps {
    subscription: BillingSubscription | null;
    isPro: boolean;
    usage: UsageSummary | null;
    onUpgrade: () => void;
}

export const PlanCard = ({ subscription, isPro, usage, onUpgrade }: PlanCardProps) => {
    const isCancelling =
        subscription?.scheduledChange?.scheduledAction === ScheduledSubscriptionAction.CANCELLATION;

    const planName = isPro ? (subscription?.product.name ?? 'Pro plan') : 'Free plan';

    const renewalLine = (() => {
        if (isCancelling && subscription) {
            return `Your plan cancels on ${formatDate(subscription.scheduledChange!.scheduledChangeAt)}`;
        }
        if (isPro && subscription) {
            return `Your plan auto-renews on ${formatDate(subscription.currentPeriodEnd)}`;
        }
        return 'Upgrade to unlock more credits and features';
    })();

    const used = usage?.monthly.usageCount ?? 0;
    const limit = usage?.monthly.limitCount ?? 0;
    const isUnlimited = limit >= UNLIMITED_THRESHOLD;
    const pct = limit > 0 && !isUnlimited ? Math.min(100, Math.round((used / limit) * 100)) : 0;

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                    <p className="text-regularPlus font-medium">{planName}</p>
                    <p className="text-small text-muted-foreground">{renewalLine}</p>
                </div>
                <Button variant={isPro ? 'outline' : 'default'} size="sm" onClick={onUpgrade}>
                    {isPro ? 'Change plan' : 'Upgrade'}
                </Button>
            </div>

            {usage && (
                <div className="space-y-1.5">
                    <div className="text-mini text-muted-foreground flex items-center justify-between">
                        <span>Credits this month</span>
                        <span>
                            {isUnlimited
                                ? `${used.toLocaleString()} used · Unlimited`
                                : `${used.toLocaleString()} / ${limit.toLocaleString()}`}
                        </span>
                    </div>
                    {!isUnlimited && (
                        <div
                            className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
                            role="progressbar"
                            aria-valuenow={pct}
                            aria-valuemin={0}
                            aria-valuemax={100}
                        >
                            <div
                                className="bg-foreground h-full rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
