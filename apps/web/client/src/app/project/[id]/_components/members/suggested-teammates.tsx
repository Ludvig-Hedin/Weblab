import { api } from '@convex/_generated/api';
import { useAction, useQuery } from 'convex/react';

import { ProjectMemberRole } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Separator } from '@weblab/ui/separator';

import type { Id } from '@convex/_generated/dataModel';

interface SuggestedTeammateProps {
    projectId: string;
}

export const SuggestedTeammates = ({ projectId }: SuggestedTeammateProps) => {
    const suggestedUsers = useQuery(api.projectInvitations.suggested, {
        projectId: projectId as Id<'projects'>,
    });
    const createInvitation = useAction(api.projectInvitationActions.create);

    if (suggestedUsers?.length === 0) {
        return <div className="h-2"></div>;
    }

    return (
        <div className="flex flex-col gap-2 p-3">
            <Separator />
            <div className="space-y-0.5">
                <div className="text-small">Suggested Teammates</div>
                <div className="text-muted-foreground text-mini">
                    Invite relevant people to collaborate
                </div>
            </div>
            <div className="flex gap-0.5">
                {suggestedUsers
                    ?.filter((email): email is string => !!email)
                    .map((email) => (
                        <Button
                            key={email}
                            variant="secondary"
                            size="sm"
                            className="rounded-xl font-normal"
                            onClick={() => {
                                void createInvitation({
                                    projectId: projectId as Id<'projects'>,
                                    inviteeEmail: email,
                                    memberRole: ProjectMemberRole.EDITOR,
                                });
                            }}
                        >
                            {email}
                            <Icons.PlusCircled className="ml-1 size-4" />
                        </Button>
                    ))}
            </div>
        </div>
    );
};
