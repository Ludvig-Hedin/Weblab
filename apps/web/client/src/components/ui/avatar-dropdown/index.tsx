'use client';

import { useState } from 'react';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import localforage from 'localforage';
import { useTranslations } from 'next-intl';

import { Avatar, AvatarFallback, AvatarImage } from '@weblab/ui/avatar';
import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { getInitials } from '@weblab/utility';

import { useStateManager } from '@/components/store/state';
import { transKeys } from '@/i18n/keys';
import { isClerkMode, useSafeClerk } from '@/utils/auth/safe-clerk';
import { getSignInUrlClient } from '@/utils/auth/sign-in-url';
import { signOutEverywhere } from '@/utils/auth/sign-out';
import { LocalForageKeys } from '@/utils/constants';
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
    // `useSafeClerk` falls back to a no-op `signOut` in supabase mode so we
    // never invoke the raw Clerk hook outside its provider.
    const { signOut: clerkSignOut } = useSafeClerk();
    const t = useTranslations();

    const user = useQuery(api.users.me, {});
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
        t(transKeys.projects.actions.you);
    const initials = getInitials(friendlyName);
    const [open, setOpen] = useState(false);

    const handleSignOut = async () => {
        // Close the dropdown immediately so the user has visual confirmation
        // that sign-out is in progress while the async cleanup runs.
        setOpen(false);
        // Reset MobX modal flags so settings/subscription dialogs from the
        // previous account don't leak across the sign-out boundary.
        stateManager.setIsSettingsModalOpen(false);
        stateManager.setIsSubscriptionModalOpen(false);
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
        // `clerkSignOut` is a no-op in supabase mode (see useSafeClerk).
        // Wrap in try/finally so a thrown Clerk sign-out still hard-navigates
        // to the sign-in route — otherwise the user is stranded with cleared
        // local state but a stale signed-in UI.
        try {
            await signOutEverywhere(isClerkMode() ? () => clerkSignOut() : undefined);
        } catch (err) {
            console.warn('[avatar-dropdown] sign-out failed; forcing navigation anyway', err);
        } finally {
            // Hard-navigate. A soft router.push would keep the React Query
            // cache (incl. user.get) populated, leaving the navbar showing
            // the avatar even after the session cookies were cleared.
            window.location.assign(getSignInUrlClient());
        }
    };

    const handleOpenSubscription = () => {
        stateManager.setSettingsTab(SettingsTabValue.SUBSCRIPTION);
        stateManager.setIsSettingsModalOpen(true);
        setOpen(false);
    };

    const handleOpenSettings = () => {
        stateManager.setSettingsTab(SettingsTabValue.ACCOUNT);
        stateManager.setIsSettingsModalOpen(true);
        setOpen(false);
    };

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
            label: t(transKeys.projects.actions.sendFeedback),
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
                <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full p-0"
                    aria-label={`Open account menu${friendlyName ? ` for ${friendlyName}` : ''}`}
                    aria-haspopup="menu"
                >
                    <Avatar className={className}>
                        {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={initials} />}
                        {/* `delayMs` hides the initials chip during the
                            brief window before `AvatarImage` resolves —
                            otherwise visitors with valid avatars flash the
                            "Y" / "L" placeholder on every cold load. 300ms is
                            long enough to hide the flash on cached avatars
                            (paint <100ms) without leaving a noticeable blank
                            circle on cold network loads. When
                            `user.avatarUrl` is absent, Radix renders the
                            fallback immediately. When it fails to load,
                            Radix swaps to the fallback after the delay. */}
                        <AvatarFallback delayMs={user?.avatarUrl ? 300 : 0}>
                            {user ? initials : ''}
                        </AvatarFallback>
                    </Avatar>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 p-0">
                <div className="flex items-center gap-2 p-3 select-none">
                    <div className="flex flex-col">
                        <span className="text-smallPlus">{friendlyName}</span>
                        <span className="text-mini text-foreground-secondary">{user?.email}</span>
                    </div>
                </div>
                <UsageSection open={open} />
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
