import { useState } from 'react';
import { api } from '@convex/_generated/api';
import { useAction } from 'convex/react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { ScheduledSubscriptionAction } from '@weblab/stripe';
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
import { useSubscription } from './use-subscription';

const FREE_TIER = {
    name: 'Free',
    price: '$0/month',
    description: 'Prototype and experiment in code with ease.',
    staticFeatures: [
        'Visual code editor access',
        '5 projects',
        'Unlimited styling and code editing',
        'Limited to 1 screenshot per chat',
    ],
    defaultSelectValue: 'daily',
};

export const FreeCard = ({
    delay,
    isUnauthenticated = false,
    isAuthLoading = false,
    onSignupClick,
    variant = 'card',
}: {
    delay: number;
    isUnauthenticated?: boolean;
    /**
     * True while the `users.me` query is still resolving. When true the
     * CTA renders a disabled loading affordance instead of "Get Started
     * Free" / "Current plan", so a signed-in visitor can't click into the
     * wrong flow during the flicker window.
     */
    isAuthLoading?: boolean;
    onSignupClick?: () => void;
    variant?: 'card' | 'flat';
}) => {
    const t = useTranslations();
    const freeFeatures = [
        FREE_TIER.staticFeatures[0],
        FREE_TIER.staticFeatures[1],
        t(transKeys.pricing.freeCard.dailyCreditsFeature),
        t(transKeys.pricing.freeCard.monthlyCreditsFeature),
        FREE_TIER.staticFeatures[2],
        FREE_TIER.staticFeatures[3],
    ];
    const dailyCreditsLabel = t(transKeys.pricing.freeCard.dailyCreditsLabel);
    const { subscription, isPro, setIsCheckingSubscription } = useSubscription({
        enabled: !isUnauthenticated,
    });
    const manageSubscription = useAction(api.subscriptionActions.manageSubscription);
    const [isCheckingOut, setIsCheckingOut] = useState(false);
    const isFree = !isPro;
    const isScheduledCancellation =
        subscription?.scheduledChange?.scheduledAction === ScheduledSubscriptionAction.CANCELLATION;

    const handleDowngradeToFree = async () => {
        try {
            setIsCheckingOut(true);
            const session = await manageSubscription({});

            if (session?.url) {
                window.open(session.url, '_blank');
                setIsCheckingSubscription(true);
            } else {
                throw new Error('No checkout URL received');
            }
        } catch (error) {
            console.error('Error managing subscription:', error);
            toast.error('Error managing subscription', {
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        } finally {
            setIsCheckingOut(false);
        }
    };

    const buttonContent = () => {
        if (isAuthLoading) {
            return (
                <div className="flex items-center gap-2">
                    <Icons.Shadow className="h-4 w-4 animate-spin" />
                </div>
            );
        }

        if (isCheckingOut) {
            return (
                <div className="flex items-center gap-2">
                    <Icons.Shadow className="h-4 w-4 animate-spin" />
                    <span>{t(transKeys.pricing.loading.checkingPayment)}</span>
                </div>
            );
        }

        if (isUnauthenticated) {
            return 'Get Started Free';
        }

        if (isScheduledCancellation) {
            return `Pro plan ends on ${new Date(subscription.scheduledChange!.scheduledChangeAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
        }

        if (isFree) {
            return t(transKeys.pricing.buttons.currentPlan);
        }

        return 'Downgrade to Free Plan';
    };

    const handleButtonClick = () => {
        if (isAuthLoading) return;
        if (isUnauthenticated && onSignupClick) {
            onSignupClick();
        } else {
            void handleDowngradeToFree();
        }
    };

    if (variant === 'flat') {
        return (
            <div className="flex flex-col">
                <div className="space-y-1">
                    <h2 className="text-foreground text-3xl font-light">{FREE_TIER.name}</h2>
                    <p className="text-foreground text-sm font-semibold">{FREE_TIER.price}</p>
                </div>
                <div className="mt-6">
                    <Button
                        variant="outline"
                        size="lg"
                        onClick={handleButtonClick}
                        disabled={
                            isAuthLoading ||
                            isCheckingOut ||
                            (!isUnauthenticated && (isFree || isScheduledCancellation))
                        }
                    >
                        {buttonContent()}
                    </Button>
                </div>
                <div className="border-border-primary my-8 border-t" />
                <div className="flex flex-col gap-3">
                    {freeFeatures.map((feature) => (
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
                    <h2 className="text-title2">{FREE_TIER.name}</h2>
                    <p className="text-foreground-weblab text-largePlus">{FREE_TIER.price}</p>
                </div>
                <div className="border-border-primary -mx-6 my-6 border-[0.5px]" />
                <p className="text-foreground-primary text-title3 text-balance">
                    {FREE_TIER.description}
                </p>
                <div className="border-border-primary -mx-6 my-6 border-[0.5px]" />
                <div className="mb-6 flex flex-col gap-2">
                    <Select value={FREE_TIER.defaultSelectValue} disabled={true}>
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select a plan" />
                        </SelectTrigger>
                        <SelectContent className="z-99">
                            <SelectGroup>
                                <SelectItem value="daily">{dailyCreditsLabel}</SelectItem>
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                    <Button
                        className="w-full"
                        variant="outline"
                        onClick={handleButtonClick}
                        disabled={
                            isAuthLoading ||
                            isCheckingOut ||
                            (!isUnauthenticated && (isFree || isScheduledCancellation))
                        }
                    >
                        {buttonContent()}
                    </Button>
                </div>
                <div className="flex h-42 flex-col gap-2">
                    {freeFeatures.map((feature) => (
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
