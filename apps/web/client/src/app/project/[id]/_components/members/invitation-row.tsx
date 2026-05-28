import { useEffect, useRef, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useMutation } from 'convex/react';

import type { ProjectInvitation } from '@weblab/db';
import { constructInvitationLink } from '@weblab/email';
import { Avatar, AvatarFallback } from '@weblab/ui/avatar';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { toast } from '@weblab/ui/sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';
import { getInitials } from '@weblab/utility';

import type { Id } from '@convex/_generated/dataModel';
import { env } from '@/env';

export const InvitationRow = ({ invitation }: { invitation: ProjectInvitation }) => {
    const initials = getInitials(invitation.inviteeEmail ?? '');
    const [isCopied, setIsCopied] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);
    const cancelInvitation = useMutation(api.projectInvitations.revoke);
    const copiedResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Clear the "Copied" indicator timer if the row unmounts before it
    // resolves; without this React warns about setState-after-unmount and
    // the timer keeps a stale closure alive.
    useEffect(
        () => () => {
            if (copiedResetRef.current) clearTimeout(copiedResetRef.current);
        },
        [],
    );

    const copyInvitationLink = async () => {
        try {
            await navigator.clipboard.writeText(
                constructInvitationLink(env.NEXT_PUBLIC_SITE_URL, invitation.id, invitation.token),
            );
            setIsCopied(true);
            toast.success('Invitation link copied to clipboard');
            if (copiedResetRef.current) clearTimeout(copiedResetRef.current);
            copiedResetRef.current = setTimeout(() => {
                setIsCopied(false);
                copiedResetRef.current = null;
            }, 2000);
        } catch (error) {
            console.error('Failed to copy invitation link:', error);
            toast.error('Failed to copy invitation link');
            setIsCopied(false);
        }
    };

    const handleCancel = async () => {
        if (isCancelling) return;
        setIsCancelling(true);
        try {
            await cancelInvitation({ id: invitation.id as Id<'projectInvitations'> });
        } catch (error) {
            console.error('Failed to cancel invitation:', error);
            toast.error('Failed to cancel invitation');
            setIsCancelling(false);
        }
        // On success the row unmounts (invite list re-queries); no need to
        // reset isCancelling.
    };

    return (
        <div className="flex items-center gap-2 px-3 py-2">
            <Avatar>
                <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="text-muted-foreground text-small flex flex-1 flex-col justify-center gap-0.5">
                <div>Pending Invitation</div>
                <div className="text-mini truncate">{invitation.inviteeEmail}</div>
            </div>
            <div className="flex flex-row items-center justify-center">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={copyInvitationLink}>
                            {isCopied ? (
                                <Icons.Check className="text-muted-foreground size-4 transition-colors" />
                            ) : (
                                <Icons.Copy className="text-muted-foreground size-4 transition-colors" />
                            )}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        {isCopied ? 'Copied to clipboard' : 'Copy Invitation Link'}
                    </TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            disabled={isCancelling}
                            onClick={() => void handleCancel()}
                        >
                            <Icons.MailX className="text-muted-foreground size-4 transition-colors" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Cancel Invitation</TooltipContent>
                </Tooltip>
            </div>
        </div>
    );
};
