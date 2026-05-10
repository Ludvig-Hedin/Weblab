'use client';

import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';

import { Avatar, AvatarFallback, AvatarImage } from '@weblab/ui/avatar';
import { Badge } from '@weblab/ui/badge';
import { Button } from '@weblab/ui/button';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { toast } from '@weblab/ui/sonner';
import { getInitials } from '@weblab/utility';

import { api } from '@/trpc/react';
import { createClient } from '@/utils/supabase/client';
import { UserDeleteSection } from './user-delete-section';

export const AccountTab = observer(() => {
    const apiUtils = api.useUtils();
    const { data: user } = api.user.get.useQuery();
    const { mutate: updateProfile, isPending } = api.user.updateProfile.useMutation({
        onSuccess: () => {
            void apiUtils.user.get.invalidate();
            toast.success('Profile updated');
        },
        onError: () => toast.error('Failed to update profile'),
    });

    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [provider, setProvider] = useState<string | null>(null);

    useEffect(() => {
        if (user) {
            setFirstName(user.firstName ?? '');
            setLastName(user.lastName ?? '');
            setDisplayName(user.displayName ?? '');
        }
    }, [user]);

    useEffect(() => {
        const supabase = createClient();
        supabase.auth.getUser().then(({ data }) => {
            const p =
                data.user?.app_metadata?.provider ??
                data.user?.app_metadata?.providers?.[0] ??
                null;
            setProvider(p);
        });
    }, []);

    const isGoogle = provider === 'google';
    const initials = getInitials(user?.displayName ?? user?.firstName ?? '');

    const handleSave = () => {
        updateProfile({ firstName, lastName, displayName });
    };

    return (
        <div className="flex flex-col gap-16 p-6">
            {/* Profile */}
            <section className="border-border bg-background-secondary space-y-4 rounded-lg border p-4">
                <div className="flex items-center gap-2">
                    <h2 className="text-largePlus">Profile</h2>
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
                        <p className="text-mini text-foreground-tertiary mt-1">
                            Avatar will sync from your authentication provider.
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                        <Label className="text-mini">First name</Label>
                        <Input
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            placeholder="Jane"
                            className="text-small h-8"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-mini">Last name</Label>
                        <Input
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            placeholder="Doe"
                            className="text-small h-8"
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Label className="text-mini">Display name</Label>
                    <Input
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="jane.doe"
                        className="text-small h-8"
                    />
                </div>

                <div className="space-y-1.5">
                    <Label className="text-mini">Email</Label>
                    <Input value={user?.email ?? ''} readOnly disabled className="text-small h-8" />
                    {/* Bug fix #28: Replace the dead-end "Email cannot be changed." line with
                        a clear escape hatch (mailto support) until we wire up Supabase's
                        verified-email-change flow. */}
                    <p className="text-mini text-foreground-tertiary">
                        {isGoogle ? (
                            'Email is managed by your Google account.'
                        ) : (
                            <>
                                Email is managed by your authentication provider.{' '}
                                <a
                                    href="mailto:support@weblab.build"
                                    className="hover:text-foreground underline"
                                >
                                    Contact support
                                </a>{' '}
                                to update your email.
                            </>
                        )}
                    </p>
                </div>

                <Button size="sm" onClick={handleSave} disabled={isPending}>
                    {isPending ? 'Saving…' : 'Save changes'}
                </Button>
            </section>

            {/* Danger zone */}
            <UserDeleteSection />
        </div>
    );
});
