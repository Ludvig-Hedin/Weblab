'use client';

import { useEditorEngine } from '@/components/store/editor';
import { api } from '@/trpc/react';
import { ProjectRole, type User } from '@weblab/models';
import { Avatar, AvatarFallback, AvatarImage } from '@weblab/ui/avatar';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons/index';
import { toast } from '@weblab/ui/sonner';
import { cn } from '@weblab/ui/utils';
import { getInitials } from '@weblab/utility';
import { observer } from 'mobx-react-lite';
import { useState } from 'react';

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
        <div className="py-2 px-3 flex gap-2 items-center group">
            {/* Avatar with online presence dot */}
            <div className="relative shrink-0">
                <Avatar>
                    {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={initials} />}
                    <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <span
                    className={cn(
                        'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background',
                        isOnline ? 'bg-green-500' : 'bg-muted-foreground/30',
                    )}
                />
            </div>

            {/* Name / email */}
            <div className="flex flex-col justify-center gap-0.5 flex-1 min-w-0">
                <div className="truncate">
                    {displayName}
                    {isSelf && (
                        <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>
                    )}
                </div>
                <div className="text-xs text-muted-foreground truncate">{user.email}</div>
            </div>

            {/* Role badge */}
            <span className="text-xs text-muted-foreground capitalize shrink-0">{role}</span>

            {/* Bug fix #8: two-step confirmation — prevents accidental removal */}
            {canRemove && (
                confirming ? (
                    <div className="flex items-center gap-1 shrink-0">
                        <span className="text-xs text-muted-foreground">Remove?</span>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => removeMember.mutate({ userId: user.id, projectId })}
                            disabled={removeMember.isPending}
                        >
                            {removeMember.isPending
                                ? <Icons.LoadingSpinner className="h-3.5 w-3.5 animate-spin" />
                                : <Icons.Check className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground"
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
                        className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        onClick={() => setConfirming(true)}
                    >
                        <Icons.Trash className="h-3.5 w-3.5" />
                    </Button>
                )
            )}
        </div>
    );
});
