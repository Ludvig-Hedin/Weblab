'use client';

import { useState } from 'react';
import { api } from '@convex/_generated/api';
import { useAction } from 'convex/react';

import { ProjectMemberRole } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Input } from '@weblab/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import { toast } from '@weblab/ui/sonner';

import type { Id } from '@convex/_generated/dataModel';

// Server errors are prefixed with a code (`CONFLICT:`, `BAD_REQUEST:`, ...) —
// strip the code for display. Errors with no recognized prefix are server
// internals (e.g. "RESEND_API_KEY is not set") and must not reach the user.
const KNOWN_ERROR_PREFIXES = ['CONFLICT', 'BAD_REQUEST', 'NOT_FOUND', 'FORBIDDEN'];

function friendlyInviteError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    const prefix = KNOWN_ERROR_PREFIXES.find((code) => message.startsWith(`${code}:`));
    if (prefix) {
        return message.slice(prefix.length + 1).trim();
    }
    return 'Could not send the invitation. Please try again.';
}

export const InviteMemberInput = ({ projectId }: { projectId: string }) => {
    const [email, setEmail] = useState('');
    // Default to EDITOR — granting MANAGER (admin-equivalent) on every invite is too aggressive.
    const [selectedRole, setSelectedRole] = useState<ProjectMemberRole>(ProjectMemberRole.EDITOR);
    const [isLoading, setIsLoading] = useState(false);

    const createInvitation = useAction(api.projectInvitationActions.create);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        try {
            setIsLoading(true);
            await createInvitation({
                inviteeEmail: email.trim().toLowerCase(),
                memberRole: selectedRole,
                projectId: projectId as Id<'projects'>,
            });
            setEmail('');
            toast.success('Invitation sent');
        } catch (error) {
            toast.error('Failed to invite member', {
                description: friendlyInviteError(error),
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
                <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Add email address"
                    className="flex-1 pr-24"
                />
                <Select
                    value={selectedRole}
                    onValueChange={(value) => setSelectedRole(value as ProjectMemberRole)}
                >
                    <SelectTrigger className="text-mini absolute right-0 w-24 rounded-tl-none rounded-bl-none border-0 bg-transparent p-2 focus:ring-0">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={ProjectMemberRole.MANAGER}>
                            <div className="flex flex-col">
                                <span>Manager</span>
                                <span className="text-muted-foreground text-mini">
                                    Can edit, publish, and manage access
                                </span>
                            </div>
                        </SelectItem>
                        <SelectItem value={ProjectMemberRole.EDITOR}>
                            <div className="flex flex-col">
                                <span>Editor</span>
                                <span className="text-muted-foreground text-mini">
                                    Can edit and use AI
                                </span>
                            </div>
                        </SelectItem>
                        <SelectItem value={ProjectMemberRole.REVIEWER}>
                            <div className="flex flex-col">
                                <span>Reviewer</span>
                                <span className="text-muted-foreground text-mini">
                                    Can view and comment
                                </span>
                            </div>
                        </SelectItem>
                        <SelectItem value={ProjectMemberRole.VIEWER}>
                            <div className="flex flex-col">
                                <span>Viewer</span>
                                <span className="text-muted-foreground text-mini">
                                    Can view only
                                </span>
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
