'use client';

import { useState } from 'react';
import { api } from '@convex/_generated/api';
import { useAction, useQuery } from 'convex/react';
import { observer } from 'mobx-react-lite';
import { useLocale, useTranslations } from 'next-intl';

import { PRO_PRODUCT_CONFIG, ScheduledSubscriptionAction } from '@weblab/stripe';
import { Badge } from '@weblab/ui/badge';
import { Button } from '@weblab/ui/button';
import { Progress } from '@weblab/ui/progress';
import { toast } from '@weblab/ui/sonner';

import { useStateManager } from '@/components/store/state';
import { formatPrice } from '../pricing-modal/pro-card';
import { useSubscription } from '../pricing-modal/use-subscription';

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
    const t = useTranslations('settings.subscription');
    const locale = useLocale();
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

    const formatDate = (ts: number) =>
        new Date(ts).toLocaleDateString(locale, {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
        });

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
            toast.error(t('toastPortalFailed'));
        } finally {
            setIsLoadingPortal(false);
        }
    };

    return (
        <div className="divide-border flex flex-col divide-y px-6">
            {/* Current plan */}
            <section className="space-y-4 py-6">
                <h2 className="text-largePlus">{t('currentPlanTitle')}</h2>

                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <p className="text-title3">{isPro ? t('pro') : t('free')}</p>
                            {isCancelling && scheduledAt && (
                                <Badge variant="secondary" className="text-mini">
                                    {t('cancels', { date: formatDate(scheduledAt) })}
                                </Badge>
                            )}
                            {isChanging && scheduledAt && (
                                <Badge variant="secondary" className="text-mini">
                                    {t('changes', { date: formatDate(scheduledAt) })}
                                </Badge>
                            )}
                        </div>
                        <p className="text-small text-foreground-tertiary">
                            {planPrice}
                            {messageLimit
                                ? t('messagesSuffix', { count: messageLimit.toLocaleString() })
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
                                {isLoadingPortal ? t('opening') : t('resumePlan')}
                            </Button>
                        ) : isPro ? (
                            <Button size="sm" variant="outline" onClick={openUpgradeModal}>
                                {t('changePlan')}
                            </Button>
                        ) : (
                            <Button size="sm" onClick={openUpgradeModal}>
                                {t('upgradeButton')}
                            </Button>
                        )}
                    </div>
                </div>
            </section>

            {/* Usage */}
            <section className="space-y-4 py-6">
                <h2 className="text-largePlus">{t('usageTitle')}</h2>
                {usage === undefined ? (
                    <p className="text-small text-foreground-tertiary">{t('loadingUsage')}</p>
                ) : isPro ? (
                    <UsageRow
                        label={t('thisBillingPeriod')}
                        used={usage.monthly.usageCount}
                        limit={usage.monthly.limitCount}
                    />
                ) : (
                    <div className="space-y-4">
                        <UsageRow
                            label={t('today')}
                            used={usage.daily.usageCount}
                            limit={usage.daily.limitCount}
                        />
                        <UsageRow
                            label={t('thisMonth')}
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
                        <h2 className="text-largePlus">{t('billingTitle')}</h2>
                        <p className="text-regular text-foreground-tertiary">
                            {isPro ? t('billingDescriptionPro') : t('billingDescriptionFree')}
                        </p>
                    </div>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void openPortal()}
                        disabled={!isPro || isLoadingPortal}
                    >
                        {isLoadingPortal ? t('opening') : t('manageBilling')}
                    </Button>
                </div>
            </section>
        </div>
    );
});
