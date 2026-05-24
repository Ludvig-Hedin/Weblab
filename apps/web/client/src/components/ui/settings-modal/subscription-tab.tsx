'use client';

import { useState } from 'react';
import { api } from '@convex/_generated/api';
import { useAction } from 'convex/react';
import { observer } from 'mobx-react-lite';

import { ScheduledSubscriptionAction } from '@weblab/stripe';
import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { Separator } from '@weblab/ui/separator';
import { toast } from '@weblab/ui/sonner';

import { useStateManager } from '@/components/store/state';
import { useSubscription } from '../pricing-modal/use-subscription';

export const SubscriptionTab = observer(() => {
    const stateManager = useStateManager();
    const { subscription, isPro } = useSubscription();
    const [isManageDropdownOpen, setIsManageDropdownOpen] = useState(false);
    const [isLoadingPortal, setIsLoadingPortal] = useState(false);

    const manageSubscription = useAction(api.subscriptionActions.manageSubscription);

    const handleUpgradePlan = () => {
        stateManager.setIsSubscriptionModalOpen(true);
        stateManager.setIsSettingsModalOpen(false);
        setIsManageDropdownOpen(false);
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
            toast.error('Failed to create portal session');
        } finally {
            setIsLoadingPortal(false);
        }
    };

    // Bug fix #11: The previous custom "Are you sure?" modal was misleading — it didn't
    // actually cancel anything, it just opened the Stripe portal afterwards. Skip the
    // fake confirm and send the user straight to the Stripe billing portal where the
    // real cancel flow lives.
    const handleCancelSubscription = async () => {
        setIsManageDropdownOpen(false);
        await openPortal();
    };

    const handleManageBilling = async () => {
        if (isPro && subscription) {
            await openPortal();
        }
    };

    return (
        <div className="flex flex-col p-8">
            {/* Subscription Section */}
            <div className="space-y-6">
                <div>
                    <h2 className="text-title3 mb-2">Subscription</h2>
                    <p className="text-muted-foreground text-small">
                        Manage your subscription plan and billing
                    </p>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center justify-between py-4">
                        <div className="space-y-1">
                            <p className="text-regularPlus font-medium">Current Plan</p>
                            <p className="text-small text-muted-foreground">
                                {isPro ? (
                                    subscription?.scheduledChange?.scheduledAction ===
                                    ScheduledSubscriptionAction.CANCELLATION ? (
                                        <>
                                            Pro plan (cancelling on{' '}
                                            {new Date(
                                                subscription.scheduledChange.scheduledChangeAt,
                                            ).toLocaleDateString()}
                                            )
                                        </>
                                    ) : (
                                        <>
                                            Pro plan -{' '}
                                            {subscription?.price?.monthlyMessageLimit ||
                                                'Unlimited'}{' '}
                                            messages per month
                                        </>
                                    )
                                ) : (
                                    'You are currently on the Free plan'
                                )}
                            </p>
                        </div>
                        <DropdownMenu
                            open={isManageDropdownOpen}
                            onOpenChange={setIsManageDropdownOpen}
                        >
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm">
                                    Manage
                                    <Icons.ChevronDown className="ml-1 h-3 w-3" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                                {!isPro && (
                                    <DropdownMenuItem
                                        onClick={handleUpgradePlan}
                                        className="cursor-pointer"
                                    >
                                        <Icons.Sparkles className="mr-2 h-4 w-4" />
                                        Upgrade plan
                                    </DropdownMenuItem>
                                )}
                                {isPro &&
                                    subscription?.scheduledChange?.scheduledAction !==
                                        ScheduledSubscriptionAction.CANCELLATION && (
                                        <DropdownMenuItem
                                            onClick={handleUpgradePlan}
                                            className="cursor-pointer"
                                        >
                                            <Icons.Sparkles className="mr-2 h-4 w-4" />
                                            Change plan
                                        </DropdownMenuItem>
                                    )}
                                {isPro && (
                                    <DropdownMenuItem
                                        onClick={() => {
                                            subscription?.scheduledChange?.scheduledAction ===
                                            ScheduledSubscriptionAction.CANCELLATION
                                                ? void handleManageBilling()
                                                : void handleCancelSubscription();
                                        }}
                                        disabled={isLoadingPortal}
                                        className="group text-destructive hover:text-destructive cursor-pointer"
                                    >
                                        <Icons.CrossS className="text-destructive group-hover:text-destructive mr-2 h-4 w-4" />
                                        {subscription?.scheduledChange?.scheduledAction ===
                                        ScheduledSubscriptionAction.CANCELLATION
                                            ? 'Reactivate subscription'
                                            : 'Cancel subscription'}
                                    </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    <Separator />

                    {/* Payment Section */}
                    <div className="flex items-center justify-between py-4">
                        <div className="space-y-1">
                            <p className="text-regularPlus font-medium">Payment</p>
                            <p className="text-small text-muted-foreground">
                                Manage your payment methods and billing details
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleManageBilling()}
                            disabled={isLoadingPortal || !isPro}
                        >
                            {isLoadingPortal ? 'Opening...' : 'Manage'}
                        </Button>
                    </div>

                    {/* Bug fix #11: Make it clear cancellation happens in Stripe's portal. */}
                    {isPro && (
                        <p className="text-mini text-muted-foreground">
                            Manage your subscription, including cancellation, in the Stripe billing
                            portal.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
});
