import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';

import { PriceKey, PRO_PRODUCT_CONFIG } from '@weblab/stripe';
import { Badge } from '@weblab/ui/badge';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { MotionCard } from '@weblab/ui/motion-card';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@weblab/ui/select';
import { toast } from '@weblab/ui/sonner';

import { transKeys } from '@/i18n/keys';
import { api } from '@/trpc/react';
import { LegacyPromotion } from './legacy-promotion';
import { useSubscription } from './use-subscription';

export const formatPrice = (cents: number) => `$${Math.round(cents / 100)}/month`;

const PRO_FEATURES = [
    'Unlimited projects',
    'Deploy to a custom domain',
    'Collaborate with your team',
    'Turn projects into templates',
];

export const ProCard = ({
    delay,
    isUnauthenticated = false,
    onSignupClick,
    variant = 'card',
}: {
    delay: number;
    isUnauthenticated?: boolean;
    onSignupClick?: () => void;
    variant?: 'card' | 'flat';
}) => {
    const t = useTranslations();
    const locale = useLocale();
    const { subscription, isPro, refetchSubscription, setIsCheckingSubscription } = useSubscription(
        { enabled: !isUnauthenticated },
    );
    const { mutateAsync: checkout } = api.subscription.checkout.useMutation();
    const { mutateAsync: getPriceId } = api.subscription.getPriceId.useMutation();
    const { mutateAsync: updateSubscription } = api.subscription.update.useMutation();
    const { mutateAsync: releaseSubscriptionSchedule } =
        api.subscription.releaseSubscriptionSchedule.useMutation();

    const [isCheckingOut, setIsCheckingOut] = useState(false);
    const [selectedTier, setSelectedTier] = useState<PriceKey>(PriceKey.PRO_MONTHLY_TIER_1);

    const selectedTierData = PRO_PRODUCT_CONFIG.prices.find((tier) => tier.key === selectedTier);
    const isNewTierSelected = selectedTier !== subscription?.price.key;
    const isPendingTierSelected =
        selectedTier !== subscription?.price.key &&
        selectedTier === subscription?.scheduledChange?.price?.key;
    const scheduledPlanStartDate =
        subscription?.scheduledChange?.scheduledChangeAt.toLocaleDateString(locale, {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
        }) ?? '';

    if (!PRO_PRODUCT_CONFIG.prices.length) {
        throw new Error('No pro tiers found');
    }

    const handleCheckout = async () => {
        try {
            if (isPro) {
                if (isPendingTierSelected) {
                    await handleCancelScheduledDowngrade();
                } else if (isNewTierSelected) {
                    await updateExistingSubscription();
                } else {
                    throw new Error('No action to perform');
                }
            } else {
                await createCheckoutSession();
            }
        } catch (error) {
            toast.error(t(transKeys.pricing.toasts.error.title), {
                description: error instanceof Error ? error.message : 'Unknown error',
            });
            console.error('Payment error:', error);
        } finally {
            setIsCheckingOut(false);
        }
    };

    const handleCancelScheduledDowngrade = async () => {
        try {
            if (
                !subscription?.scheduledChange?.scheduledChangeAt ||
                !subscription.scheduledChange.stripeSubscriptionScheduleId
            ) {
                throw new Error('No scheduled downgrade found.');
            }
            setIsCheckingOut(true);
            await releaseSubscriptionSchedule({
                subscriptionScheduleId: subscription.scheduledChange.stripeSubscriptionScheduleId,
            });
            void refetchSubscription();
            toast.success('Scheduled downgrade canceled!');
        } catch (error) {
            console.error('Error canceling scheduled downgrade:', error);
            toast.error('Error canceling scheduled downgrade', {
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        } finally {
            setIsCheckingOut(false);
        }
    };

    const createCheckoutSession = async () => {
        try {
            setIsCheckingOut(true);
            const stripePriceId = await getPriceId({ priceKey: selectedTier });
            const session = await checkout({ priceId: stripePriceId });

            if (!session?.url) {
                throw new Error('No checkout URL received');
            }

            window.open(session.url, '_blank');
            setIsCheckingSubscription(true);
        } catch (error) {
            toast.error(t('pricing.toasts.error.title'), {
                description: error instanceof Error ? error.message : 'Unknown error',
            });
            console.error('Payment error:', error);
        } finally {
            setIsCheckingOut(false);
        }
    };

    const updateExistingSubscription = async () => {
        try {
            if (!subscription?.stripeSubscriptionId) {
                throw new Error('No subscription ID found');
            }

            setIsCheckingOut(true);
            const stripePriceId = await getPriceId({ priceKey: selectedTier });
            await updateSubscription({
                stripePriceId,
                stripeSubscriptionId: subscription.stripeSubscriptionId,
                stripeSubscriptionItemId: subscription.stripeSubscriptionItemId,
            });

            void refetchSubscription();
            toast.success('Subscription updated!');
        } catch (error) {
            toast.error(t('pricing.toasts.error.title'), {
                description: error instanceof Error ? error.message : 'Unknown error',
            });
            console.error('Payment error:', error);
        } finally {
            setIsCheckingOut(false);
        }
    };

    useEffect(() => {
        if (subscription?.price.key) {
            setSelectedTier(subscription.price.key);
        }
    }, [subscription?.price.key]);

    const buttonContent = () => {
        if (isCheckingOut) {
            return (
                <div className="flex items-center gap-2">
                    <Icons.Shadow className="h-4 w-4 animate-spin" />
                    <span>{t(transKeys.pricing.loading.checkingPayment)}</span>
                </div>
            );
        }

        if (isUnauthenticated) {
            return t(transKeys.pricing.buttons.getStarted);
        }

        if (!isPro) {
            return t(transKeys.pricing.buttons.upgrade);
        }

        if (!isNewTierSelected) {
            return 'Current plan';
        }

        if (isPendingTierSelected) {
            return 'Cancel Scheduled Downgrade';
        }

        return 'Update plan';
    };

    const handleButtonClick = () => {
        if (isUnauthenticated && onSignupClick) {
            onSignupClick();
        } else {
            void handleCheckout();
        }
    };

    const creditsSelector = (
        <Select value={selectedTier} onValueChange={(value) => setSelectedTier(value as PriceKey)}>
            <SelectTrigger className="h-9 w-auto min-w-[196px] rounded-full text-sm">
                <SelectValue placeholder={t(transKeys.pricing.credits.selectPlaceholder)} />
            </SelectTrigger>
            <SelectContent className="z-99">
                <SelectGroup>
                    {PRO_PRODUCT_CONFIG.prices.map((value) => (
                        <SelectItem key={value.key} value={value.key}>
                            <div className="flex items-center gap-2">
                                {value.description}
                                {value.key === subscription?.price.key && (
                                    <Badge variant="secondary">
                                        {t(transKeys.pricing.credits.currentPlan)}
                                    </Badge>
                                )}
                                {value.key === subscription?.scheduledChange?.price?.key && (
                                    <Badge variant="secondary">
                                        {t(transKeys.pricing.credits.pending)}
                                    </Badge>
                                )}
                            </div>
                        </SelectItem>
                    ))}
                </SelectGroup>
            </SelectContent>
        </Select>
    );

    if (variant === 'flat') {
        return (
            <div className="flex flex-col">
                <div className="space-y-1">
                    <h2 className="text-foreground text-3xl font-light">
                        {t(transKeys.pricing.plans.pro.name)}
                    </h2>
                    <p className="text-foreground text-sm font-semibold">
                        {formatPrice(selectedTierData?.cost ?? 0)}
                    </p>
                </div>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                    <Button
                        size="sm"
                        className="rounded-full"
                        onClick={handleButtonClick}
                        disabled={isCheckingOut || (!isUnauthenticated && !isNewTierSelected)}
                    >
                        {buttonContent()}
                    </Button>
                    {creditsSelector}
                </div>
                {isPendingTierSelected && isPro && (
                    <div className="text-small mt-2 text-balance text-amber-500">
                        {t('pricing.scheduledPlanStart', {
                            date: scheduledPlanStartDate,
                        })}
                    </div>
                )}
                <div className="border-border-primary my-8 border-t" />
                <div className="flex flex-col gap-3">
                    {PRO_FEATURES.map((feature) => (
                        <div
                            key={feature}
                            className="text-foreground-secondary flex items-start gap-3 text-sm"
                        >
                            <Icons.CheckCircled className="mt-0.5 h-4 w-4 flex-shrink-0" />
                            <span>{feature}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <MotionCard
            className="w-[360px]"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay }}
        >
            <motion.div className="flex h-full flex-col p-6">
                <div className="space-y-1">
                    <h2 className="text-title2">{t(transKeys.pricing.plans.pro.name)}</h2>
                    <p className="text-foreground-weblab text-largePlus">
                        {formatPrice(selectedTierData?.cost ?? 0)}
                    </p>
                </div>
                <div className="border-border-primary -mx-6 my-6 border-[0.5px]" />
                <p className="text-foreground-primary text-title3 text-balance">
                    {t(transKeys.pricing.plans.pro.description)}
                </p>
                <div className="border-border-primary -mx-6 my-6 border-[0.5px]" />
                <div className="mb-6 flex flex-col gap-2">
                    {creditsSelector}
                    <Button
                        className="w-full"
                        onClick={handleButtonClick}
                        disabled={isCheckingOut || (!isUnauthenticated && !isNewTierSelected)}
                    >
                        {buttonContent()}
                    </Button>

                    {isPendingTierSelected && isPro && (
                        <div className="text-small text-balance text-amber-500">
                            {t('pricing.scheduledPlanStart', {
                                date: scheduledPlanStartDate,
                            })}
                        </div>
                    )}
                    {!isPro && <LegacyPromotion />}
                </div>
                <div className="flex flex-col gap-2">
                    {PRO_FEATURES.map((feature) => (
                        <div
                            key={feature}
                            className="text-foreground-secondary/80 flex items-center gap-3 text-sm"
                        >
                            <Icons.CheckCircled className="text-foreground-secondary/80 h-5 w-5" />
                            <span>{feature}</span>
                        </div>
                    ))}
                </div>
            </motion.div>
        </MotionCard>
    );
};
