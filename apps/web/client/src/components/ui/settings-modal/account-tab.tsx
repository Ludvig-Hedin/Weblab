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
        <div className="flex flex-col gap-8 p-6">
            {/* Profile */}
            <section className="border-border/60 bg-background-secondary/30 space-y-4 rounded-lg border p-4">
                <div className="flex items-center gap-2">
                    <h2 className="text-base font-medium">Profile</h2>
                    {provider && (
                        <Badge variant="secondary" className="text-xs capitalize">
                            {isGoogle ? 'Google' : provider}
                        </Badge>
                    )}
                </div>

                <div className="flex items-center gap-4">
                    <Avatar className="h-14 w-14">
                        {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={initials} />}
                        <AvatarFallback className="text-lg">{initials}</AvatarFallback>
                    </Avatar>
                    <div>
                        <p className="text-sm font-medium">
                            {user?.displayName ?? user?.firstName ?? '—'}
                        </p>
                        <p className="text-muted-foreground text-xs">{user?.email}</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                        <Label className="text-xs">First name</Label>
                        <Input
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            placeholder="First name"
                            className="h-8 text-sm"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">Last name</Label>
                        <Input
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            placeholder="Last name"
                            className="h-8 text-sm"
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Label className="text-xs">Display name</Label>
                    <Input
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Display name"
                        className="h-8 text-sm"
                    />
                </div>

                <div className="space-y-1.5">
                    <Label className="text-xs">Email</Label>
                    <Input
                        value={user?.email ?? ''}
                        readOnly
                        disabled
                        className="h-8 text-sm"
                    />
                    <p className="text-muted-foreground text-xs">
                        {isGoogle
                            ? 'Email is managed by your Google account.'
                            : 'Email cannot be changed.'}
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
