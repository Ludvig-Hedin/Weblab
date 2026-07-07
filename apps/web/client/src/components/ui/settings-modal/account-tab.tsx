'use client';

import { useEffect, useRef, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { api } from '@convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { Avatar, AvatarFallback, AvatarImage } from '@weblab/ui/avatar';
import { Badge } from '@weblab/ui/badge';
import { Button } from '@weblab/ui/button';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { toast } from '@weblab/ui/sonner';
import { getInitials } from '@weblab/utility';

import { UserDeleteSection } from './user-delete-section';

export const AccountTab = observer(() => {
    const t = useTranslations('settings.account');
    const user = useQuery(api.users.me, {});
    const updateProfileMutation = useMutation(api.users.updateProfile);
    const [isPending, setIsPending] = useState(false);

    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [provider, setProvider] = useState<string | null>(null);

    // Seed the form once from the loaded user. `user` is a reactive Convex
    // query that re-emits a fresh object on any update/re-subscription; without
    // this guard the effect re-ran on every emit and clobbered whatever the
    // user was typing but hadn't saved yet. The ref resets when the modal
    // remounts, so reopening re-seeds from the latest DB values.
    const seededRef = useRef(false);
    useEffect(() => {
        if (user && !seededRef.current) {
            seededRef.current = true;
            setFirstName(user.firstName ?? '');
            setLastName(user.lastName ?? '');
            setDisplayName(user.displayName ?? '');
        }
    }, [user]);

    const { user: clerkUser } = useUser();
    useEffect(() => {
        // Clerk's external-account `provider` strings are prefixed with
        // `oauth_` (e.g. `oauth_google`, `oauth_github`). Strip for display.
        const raw = clerkUser?.externalAccounts?.[0]?.provider ?? null;
        setProvider(raw ? raw.replace(/^oauth_/, '') : null);
    }, [clerkUser]);

    const isGoogle = provider === 'google';
    const initials = getInitials(user?.displayName ?? user?.firstName ?? '');

    const handleSave = async () => {
        // updateProfile is tri-state (absent / string / null). Map cleared
        // or whitespace-only inputs to null so the field is actually unset
        // instead of stored as '' (which reads as "set" downstream).
        const normalize = (value: string): string | null => {
            const trimmed = value.trim();
            return trimmed === '' ? null : trimmed;
        };
        const normalizedFirstName = normalize(firstName);
        const normalizedLastName = normalize(lastName);
        if ((normalizedFirstName?.length ?? 0) > 64 || (normalizedLastName?.length ?? 0) > 64) {
            toast.error(t('toastFailed'));
            return;
        }
        setIsPending(true);
        try {
            await updateProfileMutation({
                firstName: normalizedFirstName,
                lastName: normalizedLastName,
                displayName: normalize(displayName),
            });
            toast.success(t('toastSuccess'));
        } catch {
            toast.error(t('toastFailed'));
        } finally {
            setIsPending(false);
        }
    };

    return (
        <div className="divide-border flex flex-col divide-y px-6">
            {/* Profile */}
            <section className="space-y-4 py-6">
                <div className="flex items-center gap-2">
                    <h2 className="text-largePlus">{t('profileTitle')}</h2>
                    {provider && (
                        <Badge variant="secondary" className="text-mini capitalize">
                            {isGoogle ? 'Google' : provider}
                        </Badge>
                    )}
                </div>

                <div className="flex items-center gap-4">
                    <Avatar className="h-14 w-14">
                        {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={initials} />}
                        <AvatarFallback className="text-largePlus">{initials}</AvatarFallback>
                    </Avatar>
                    <div>
                        <p className="text-regularPlus">
                            {user?.displayName ?? user?.firstName ?? '—'}
                        </p>
                        <p className="text-mini text-foreground-tertiary">{user?.email}</p>
                        {/* Bug fix #29: Avatar upload UI removed for now — keep it read-only
                            and let it sync from the auth provider until we ship a proper
                            storage-backed upload flow. */}
                        <p className="text-mini text-foreground-tertiary mt-1">{t('avatarSync')}</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                        <Label className="text-mini">{t('firstNameLabel')}</Label>
                        <Input
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            placeholder={t('firstNamePlaceholder')}
                            className="text-small h-8"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-mini">{t('lastNameLabel')}</Label>
                        <Input
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            placeholder={t('lastNamePlaceholder')}
                            className="text-small h-8"
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <Label className="text-mini">{t('displayNameLabel')}</Label>
                    <Input
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder={t('displayNamePlaceholder')}
                        className="text-small h-8"
                    />
                </div>

                <div className="space-y-2">
                    <Label className="text-mini">{t('emailLabel')}</Label>
                    <Input value={user?.email ?? ''} readOnly disabled className="text-small h-8" />
                    {/* Bug fix #28: Replace the dead-end "Email cannot be changed." line with
                        a clear escape hatch (mailto support) until we wire up Supabase's
                        verified-email-change flow. */}
                    <p className="text-mini text-foreground-tertiary">
                        {isGoogle ? (
                            t('emailManagedByGoogle')
                        ) : (
                            <>
                                {t('emailManagedByProvider')}{' '}
                                <a
                                    href="mailto:support@weblab.build"
                                    className="hover:text-foreground underline"
                                >
                                    {t('contactSupport')}
                                </a>{' '}
                                {t('emailUpdateSuffix')}
                            </>
                        )}
                    </p>
                </div>

                <Button size="sm" onClick={() => void handleSave()} disabled={isPending}>
                    {isPending ? t('saving') : t('saveChanges')}
                </Button>
            </section>

            {/* Danger zone */}
            <UserDeleteSection />
        </div>
    );
});
