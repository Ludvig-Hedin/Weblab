'use client';

import { useState } from 'react';
import localforage from 'localforage';
import { useTranslations } from 'next-intl';

import { Avatar, AvatarFallback, AvatarImage } from '@weblab/ui/avatar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { getInitials } from '@weblab/utility';

import { useStateManager } from '@/components/store/state';
import { transKeys } from '@/i18n/keys';
import { api } from '@/trpc/react';
import { LocalForageKeys, Routes } from '@/utils/constants';
import { createClient } from '@/utils/supabase/client';
import { openFeedbackWidget, resetTelemetry } from '@/utils/telemetry';
import { SettingsTabValue } from '../settings-modal/helpers';
import { UsageSection } from './plans';

/**
 * "alex.morgan+tag@example.com" → "Alex". Returns null when the local part
 * can't produce a readable name so callers fall back to a generic label.
 */
function deriveFirstNameFromEmail(email: string | null | undefined): string | null {
    if (!email) return null;
    const local = email.split('@')[0]?.split('+')[0] ?? '';
    const firstWord = local
        .split(/[._-]+/)
        .map((w) => w.replace(/[^a-zA-Z]/g, ''))
        .filter(Boolean)[0];
    if (!firstWord || firstWord.length < 2) return null;
    return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
}

export const CurrentUserAvatar = ({ className }: { className?: string }) => {
    const stateManager = useStateManager();
    const supabase = createClient();
    const t = useTranslations();

    const { data: user } = api.user.get.useQuery();
    // Pick the most flattering, least-email-y label available. If
    // `displayName` matches the email sentinel (OTP signup skipped), fall
    // back to firstName → derived name → "You" so we never display the raw
    // email as if it were the user's name.
    const displayNameLooksLikeEmail =
        !!user?.displayName && !!user?.email && user.displayName === user.email;
    const friendlyName =
        user?.firstName ||
        (displayNameLooksLikeEmail ? null : user?.displayName) ||
        deriveFirstNameFromEmail(user?.email) ||
        'You';
    const initials = getInitials(friendlyName);
    const [open, setOpen] = useState(false);

    const handleSignOut = async () => {
        // Reset MobX modal flags so settings/subscription dialogs from the
        // previous account don't leak across the sign-out boundary.
        stateManager.isSettingsModalOpen = false;
        stateManager.isSubscriptionModalOpen = false;
        // Clear analytics/feedback identities before signing out
        void resetTelemetry();
        // Clear user-scoped offline state so the next sign-in (potentially a
        // different account) doesn't inherit the previous user's cached
        // projects, pending imports, or return-url. lastSignInMethod is
        // intentionally preserved (UX hint for the login screen).
        try {
            const projectCache = localforage.createInstance({
                name: 'weblab',
                storeName: 'projects-cache',
            });
            await Promise.allSettled([
                localforage.removeItem(LocalForageKeys.RETURN_URL),
                localforage.removeItem(LocalForageKeys.PENDING_LOCAL_IMPORT),
                localforage.removeItem(LocalForageKeys.LAST_OPENED_PROJECT_ID),
                projectCache.clear(),
            ]);
        } catch (err) {
            console.warn('[avatar-dropdown] failed to clear offline state on sign-out', err);
        }
        await supabase.auth.signOut();
        // Hard-navigate to /login. A soft router.push would keep the
        // React Query cache (incl. user.get) populated, leaving the navbar
        // showing the avatar even after the session cookie was cleared.
        window.location.assign(Routes.LOGIN);
    };

    const handleOpenSubscription = () => {
        stateManager.settingsTab = SettingsTabValue.SUBSCRIPTION;
        stateManager.isSettingsModalOpen = true;
        setOpen(false);
    };

    const handleOpenSettings = () => {
        stateManager.settingsTab = SettingsTabValue.ACCOUNT;
        stateManager.isSettingsModalOpen = true;
        setOpen(false);
    };

    // i18n: signOut, subscriptions, settings keys exist under projects.actions.
    // No "Send Feedback" key in en.json yet — leave hardcoded for now.
    const BUTTONS = [
        {
            label: t(transKeys.projects.actions.subscriptions),
            icon: Icons.CreditCard,
            onClick: handleOpenSubscription,
        },
        {
            label: t(transKeys.projects.actions.settings),
            icon: Icons.Gear,
            onClick: handleOpenSettings,
        },
        {
            label: 'Send Feedback', // TODO: add transKeys.projects.actions.sendFeedback
            icon: Icons.MessageSquare,
            onClick: () => {
                void openFeedbackWidget();
                setOpen(false);
            },
        },
        {
            label: t(transKeys.projects.actions.signOut),
            icon: Icons.Exit,
            onClick: handleSignOut,
        },
    ];

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <button>
                    <Avatar className={className}>
                        {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={initials} />}
                        <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-72 p-0">
                <div className="flex items-center gap-2 p-3 select-none">
                    <div className="flex flex-col">
                        <span className="text-smallPlus">{friendlyName}</span>
                        <span className="text-mini text-foreground-secondary">{user?.email}</span>
                    </div>
                </div>
                <DropdownMenuSeparator />
                <UsageSection open={open} />
                <DropdownMenuSeparator />
                <div className="p-2">
                    {BUTTONS.map((button) => {
                        const IconComponent = button.icon;
                        return (
                            <DropdownMenuItem
                                key={button.label}
                                className="cursor-pointer"
                                onClick={button.onClick}
                            >
                                <div className="center group flex flex-row items-center">
                                    <IconComponent className="mr-2" />
                                    {button.label}
                                </div>
                            </DropdownMenuItem>
                        );
                    })}
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
