'use client';

import { useState } from 'react';
import { api } from '@convex/_generated/api';
import { useAction, useQuery } from 'convex/react';
import { observer } from 'mobx-react-lite';

import { PRO_PRODUCT_CONFIG, ScheduledSubscriptionAction } from '@weblab/stripe';
import { Badge } from '@weblab/ui/badge';
import { Button } from '@weblab/ui/button';
import { Progress } from '@weblab/ui/progress';
import { toast } from '@weblab/ui/sonner';

import { useStateManager } from '@/components/store/state';
import { formatPrice } from '../pricing-modal/pro-card';
import { useSubscription } from '../pricing-modal/use-subscription';

const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });

const UsageRow = ({ label, used, limit }: { label: string; used: number; limit: number }) => {
    const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <p className="text-small text-foreground-secondary">{label}</p>
                <p className="text-small text-foreground-tertiary tabular-nums">
                    {used.toLocaleString()} / {limit > 0 ? limit.toLocaleString() : '∞'}
                </p>
            </div>
            <Progress value={pct} />
        </div>
    );
};

export const SubscriptionTab = observer(() => {
    const stateManager = useStateManager();
    const { subscription, isPro } = useSubscription();
    const usage = useQuery(api.usage.get, {});
    const [isLoadingPortal, setIsLoadingPortal] = useState(false);

    const manageSubscription = useAction(api.subscriptionActions.manageSubscription);

    const scheduledAction = subscription?.scheduledChange?.scheduledAction;
    const isCancelling = scheduledAction === ScheduledSubscriptionAction.CANCELLATION;
    const isChanging = scheduledAction === ScheduledSubscriptionAction.PRICE_CHANGE;
    const scheduledAt = subscription?.scheduledChange?.scheduledChangeAt;

    const priceConfig = PRO_PRODUCT_CONFIG.prices.find((p) => p.key === subscription?.price.key);
    const planPrice = isPro ? formatPrice(priceConfig?.cost ?? 0) : '$0/month';
    const messageLimit = isPro
        ? subscription?.price?.monthlyMessageLimit
        : usage?.monthly.limitCount;

    const openUpgradeModal = () => {
        stateManager.setIsSubscriptionModalOpen(true);
        stateManager.setIsSettingsModalOpen(false);
    };

    const openPortal = async () => {
        setIsLoadingPortal(true);
        try {
            const session = (await manageSubscription({})) as { url?: string } | null;
            if (session?.url) {
                window.open(session.url, '_blank');
            }
        } catch (error) {
            console.error('Failed to create portal session:', error);
            toast.error('Failed to open billing portal');
        } finally {
            setIsLoadingPortal(false);
        }
    };

    return (
        <div className="divide-border flex flex-col divide-y px-6">
            {/* Current plan */}
            <section className="space-y-4 py-6">
                <h2 className="text-largePlus">Current plan</h2>

                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <p className="text-title3">{isPro ? 'Pro' : 'Free'}</p>
                            {isCancelling && scheduledAt && (
                                <Badge variant="secondary" className="text-mini">
                                    Cancels {formatDate(scheduledAt)}
                                </Badge>
                            )}
                            {isChanging && scheduledAt && (
                                <Badge variant="secondary" className="text-mini">
                                    Changes {formatDate(scheduledAt)}
                                </Badge>
                            )}
                        </div>
                        <p className="text-small text-foreground-tertiary">
                            {planPrice}
                            {messageLimit
                                ? ` · ${messageLimit.toLocaleString()} messages / month`
                                : ''}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        {isCancelling ? (
                            <Button
                                size="sm"
                                onClick={() => void openPortal()}
                                disabled={isLoadingPortal}
                            >
                                {isLoadingPortal ? 'Opening…' : 'Resume plan'}
                            </Button>
                        ) : isPro ? (
                            <Button size="sm" variant="outline" onClick={openUpgradeModal}>
                                Change plan
                            </Button>
                        ) : (
                            <Button size="sm" onClick={openUpgradeModal}>
                                Upgrade to Pro
                            </Button>
                        )}
                    </div>
                </div>
            </section>

            {/* Usage */}
            <section className="space-y-4 py-6">
                <h2 className="text-largePlus">Usage</h2>
                {usage === undefined ? (
                    <p className="text-small text-foreground-tertiary">Loading usage…</p>
                ) : isPro ? (
                    <UsageRow
                        label="This billing period"
                        used={usage.monthly.usageCount}
                        limit={usage.monthly.limitCount}
                    />
                ) : (
                    <div className="space-y-4">
                        <UsageRow
                            label="Today"
                            used={usage.daily.usageCount}
                            limit={usage.daily.limitCount}
                        />
                        <UsageRow
                            label="This month"
                            used={usage.monthly.usageCount}
                            limit={usage.monthly.limitCount}
                        />
                    </div>
                )}
            </section>

            {/* Billing */}
            <section className="space-y-4 py-6">
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                        <h2 className="text-largePlus">Billing</h2>
                        <p className="text-regular text-foreground-tertiary">
                            {isPro
                                ? 'Manage your payment method, invoices, and cancellation in the Stripe portal.'
                                : 'Upgrade to a paid plan to manage payment details and invoices.'}
                        </p>
                    </div>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void openPortal()}
                        disabled={!isPro || isLoadingPortal}
                    >
                        {isLoadingPortal ? 'Opening…' : 'Manage billing'}
                    </Button>
                </div>
            </section>
        </div>
    );
});
