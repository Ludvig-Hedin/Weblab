'use client';

import { useState } from 'react';

import { ProjectRole } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Input } from '@weblab/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import { toast } from '@weblab/ui/sonner';

import { api } from '@/trpc/react';

export const InviteMemberInput = ({ projectId }: { projectId: string }) => {
    const apiUtils = api.useUtils();
    const [email, setEmail] = useState('');
    // Bug fix #7: Default to EDITOR — giving every new invitee ADMIN rights was too aggressive.
    const [selectedRole, setSelectedRole] = useState<ProjectRole>(ProjectRole.EDITOR);
    const [isLoading, setIsLoading] = useState(false);

    const createInvitation = api.invitation.create.useMutation({
        onSuccess: () => {
            // Bug fix #4: Clear form and give clear success feedback so the user
            // doesn't double-submit thinking nothing happened.
            setEmail('');
            toast.success('Invitation sent');
            apiUtils.invitation.list.invalidate();
            apiUtils.invitation.suggested.invalidate();
        },
        onError: (error) => {
            toast.error('Failed to invite member', {
                description: error instanceof Error ? error.message : String(error),
            });
        },
    });

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        try {
            setIsLoading(true);
            await createInvitation.mutateAsync({
                inviteeEmail: email,
                role: selectedRole,
                projectId,
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form
            className="flex items-center justify-between gap-2 border-b p-3"
            onSubmit={handleSubmit}
        >
            <div className="relative flex flex-1 items-center gap-2">
                {/* Bug fix #9: pr-24 reserves space so email text never runs under the Select trigger */}
                <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Add email address"
                    className="flex-1 pr-24"
                />
                <Select
                    value={selectedRole}
                    onValueChange={(value) => setSelectedRole(value as ProjectRole)}
                >
                    <SelectTrigger className="absolute right-0 w-24 rounded-tl-none rounded-bl-none border-0 bg-transparent p-2 text-xs focus:ring-0">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={ProjectRole.ADMIN}>
                            <div className="flex flex-col">
                                <span>Admin</span>
                                <span className="text-muted-foreground text-xs">
                                    Can edit and manage members
                                </span>
                            </div>
                        </SelectItem>
                        <SelectItem value={ProjectRole.EDITOR}>
                            <div className="flex flex-col">
                                <span>Editor</span>
                                <span className="text-muted-foreground text-xs">
                                    Can edit the project
                                </span>
                            </div>
                        </SelectItem>
                        <SelectItem value={ProjectRole.VIEWER}>
                            <div className="flex flex-col">
                                <span>Viewer</span>
                                <span className="text-muted-foreground text-xs">Can view only</span>
                            </div>
                        </SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <Button type="submit" disabled={!email || isLoading}>
                Invite
            </Button>
        </form>
    );
};
