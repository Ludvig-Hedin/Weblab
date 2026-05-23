import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';

import { InvitationStatus } from '@weblab/models';
import { Icons } from '@weblab/ui/icons/index';

import type { Id } from '@convex/_generated/dataModel';
import { useEditorEngine } from '@/components/store/editor';
import { InvitationRow } from './invitation-row';
import { InviteMemberInput } from './invite-member-input';
import { MemberRow } from './member-row';
import { SuggestedTeammates } from './suggested-teammates';

export const MembersContent = () => {
    const editorEngine = useEditorEngine();
    const projectId = editorEngine.projectId;
    const members = useQuery(api.projectMembers.list, {
        projectId: projectId as Id<'projects'>,
    });
    const invitations = useQuery(api.projectInvitations.list, {
        projectId: projectId as Id<'projects'>,
    });
    const loadingMembers = members === undefined;
    const loadingInvitations = invitations === undefined;

    if (loadingMembers || loadingInvitations) {
        return (
            <div className="text-muted-foreground text-small flex h-32 items-center justify-center gap-2 p-3">
                <Icons.LoadingSpinner className="text-foreground-primary h-6 w-6 animate-spin" />
                <div className="text-small">Loading members...</div>
            </div>
        );
    }

    return (
        <>
            <div className="text-muted-foreground text-small border-b border-b-[0.5px] p-3">
                Invite Team Members
            </div>
            <InviteMemberInput projectId={projectId} />
            {members?.map((member) =>
                member.user ? (
                    <MemberRow
                        key={member.user.id}
                        user={
                            {
                                id: member.user.id,
                                email: member.user.email ?? '',
                                firstName: member.user.firstName ?? '',
                                lastName: member.user.lastName ?? '',
                                displayName: member.user.displayName ?? '',
                                avatarUrl: member.user.avatarUrl ?? undefined,
                            } as never
                        }
                        role={member.memberRole as never}
                        projectId={projectId}
                    />
                ) : null,
            )}
            {invitations
                ?.filter((invitation) => invitation.status === InvitationStatus.PENDING)
                .map((invitation) => (
                    <InvitationRow key={invitation._id} invitation={invitation as never} />
                ))}
            <SuggestedTeammates projectId={projectId} />
        </>
    );
};
