'use client';

import { useState } from 'react';
import { api } from '@convex/_generated/api';
import { useMutation } from 'convex/react';
import { observer } from 'mobx-react-lite';

import type { User } from '@weblab/models';
import { ProjectRole } from '@weblab/models';
import { Avatar, AvatarFallback, AvatarImage } from '@weblab/ui/avatar';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons/index';
import { toast } from '@weblab/ui/sonner';
import { cn } from '@weblab/ui/utils';
import { getInitials } from '@weblab/utility';

import type { Id } from '@convex/_generated/dataModel';
import { useEditorEngine } from '@/components/store/editor';

interface MemberRowProps {
    user: User;
    role: ProjectRole;
    projectId: string;
}

export const MemberRow = observer(({ user, role, projectId }: MemberRowProps) => {
    const editorEngine = useEditorEngine();
    const isOnline = editorEngine.presence.isOnline(user.id);
    // Bug fix #10: hide the remove button on our own row (not just OWNER rows)
    const isSelf = user.id === editorEngine.presence.currentUserId;

    // Bug fix #5: use || so empty-string displayName falls through to email
    const displayName = user.firstName || user.displayName || user.email || '';
    const initials = getInitials(displayName);

    const [confirming, setConfirming] = useState(false);
    const [isRemoving, setIsRemoving] = useState(false);

    const removeMember = useMutation(api.projectMembers.remove);

    const handleRemove = async () => {
        setIsRemoving(true);
        try {
            await removeMember({
                userId: user.id as Id<'users'>,
                projectId: projectId as Id<'projects'>,
            });
            setConfirming(false);
            toast.success(`${displayName} removed from project`);
        } catch (error) {
            setConfirming(false);
            toast.error('Failed to remove member', {
                description: error instanceof Error ? error.message : String(error),
            });
        } finally {
            setIsRemoving(false);
        }
    };

    // Owners can't be removed; neither can the current user's own row
    const canRemove = role !== ProjectRole.OWNER && !isSelf;

    return (
        <div className="group flex items-center gap-2 px-3 py-2">
            {/* Avatar with online presence dot */}
            <div className="relative shrink-0">
                <Avatar>
                    {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={displayName} />}
                    <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <span
                    className={cn(
                        'border-background absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full border-2',
                        isOnline ? 'bg-foreground-success' : 'bg-muted-foreground/30',
                    )}
                />
            </div>

            {/* Name / email */}
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
                <div className="truncate">
                    {displayName}
                    {isSelf && (
                        <span className="text-muted-foreground text-mini ml-1.5">(you)</span>
                    )}
                </div>
                <div className="text-muted-foreground text-mini truncate">{user.email}</div>
            </div>

            {/* Role badge */}
            <span className="text-muted-foreground text-mini shrink-0 capitalize">{role}</span>

            {/* Bug fix #8: two-step confirmation — prevents accidental removal */}
            {canRemove &&
                (confirming ? (
                    <div className="flex shrink-0 items-center gap-1">
                        <span className="text-muted-foreground text-mini">Remove?</span>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-6 w-6"
                            onClick={() => void handleRemove()}
                            disabled={isRemoving}
                        >
                            {isRemoving ? (
                                <Icons.LoadingSpinner className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <Icons.Check className="h-3.5 w-3.5" />
                            )}
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground h-6 w-6"
                            onClick={() => setConfirming(false)}
                            disabled={isRemoving}
                        >
                            <Icons.CrossS className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                ) : (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={() => setConfirming(true)}
                    >
                        <Icons.Trash className="h-3.5 w-3.5" />
                    </Button>
                ))}
        </div>
    );
});
