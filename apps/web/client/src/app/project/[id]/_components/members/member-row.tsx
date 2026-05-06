'use client';

import { useState } from 'react';
import { observer } from 'mobx-react-lite';

import type { User } from '@weblab/models';
import { ProjectRole } from '@weblab/models';
import { Avatar, AvatarFallback, AvatarImage } from '@weblab/ui/avatar';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons/index';
import { toast } from '@weblab/ui/sonner';
import { cn } from '@weblab/ui/utils';
import { getInitials } from '@weblab/utility';

import { useEditorEngine } from '@/components/store/editor';
import { api } from '@/trpc/react';

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

    const apiUtils = api.useUtils();
    const [confirming, setConfirming] = useState(false);

    const removeMember = api.member.remove.useMutation({
        onSuccess: () => {
            setConfirming(false);
            apiUtils.member.list.invalidate();
            toast.success(`${displayName} removed from project`);
        },
        onError: (error) => {
            setConfirming(false);
            toast.error('Failed to remove member', {
                description: error instanceof Error ? error.message : String(error),
            });
        },
    });

    // Owners can't be removed; neither can the current user's own row
    const canRemove = role !== ProjectRole.OWNER && !isSelf;

    return (
        <div className="group flex items-center gap-2 px-3 py-2">
            {/* Avatar with online presence dot */}
            <div className="relative shrink-0">
                <Avatar>
                    {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={initials} />}
                    <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <span
                    className={cn(
                        'border-background absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full border-2',
                        isOnline ? 'bg-green-500' : 'bg-muted-foreground/30',
                    )}
                />
            </div>

            {/* Name / email */}
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
                <div className="truncate">
                    {displayName}
                    {isSelf && <span className="text-muted-foreground ml-1.5 text-xs">(you)</span>}
                </div>
                <div className="text-muted-foreground truncate text-xs">{user.email}</div>
            </div>

            {/* Role badge */}
            <span className="text-muted-foreground shrink-0 text-xs capitalize">{role}</span>

            {/* Bug fix #8: two-step confirmation — prevents accidental removal */}
            {canRemove &&
                (confirming ? (
                    <div className="flex shrink-0 items-center gap-1">
                        <span className="text-muted-foreground text-xs">Remove?</span>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-6 w-6"
                            onClick={() => removeMember.mutate({ userId: user.id, projectId })}
                            disabled={removeMember.isPending}
                        >
                            {removeMember.isPending ? (
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
                            disabled={removeMember.isPending}
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
