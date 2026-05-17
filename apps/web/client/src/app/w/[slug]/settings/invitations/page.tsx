'use client';

import { toast } from 'sonner';

import { InvitationStatus } from '@weblab/models';
import { Button } from '@weblab/ui/button';

import { api } from '@/trpc/react';
import { useActiveWorkspace } from '../../_components/workspace-context';

const STATUS_LABEL: Record<InvitationStatus, string> = {
    [InvitationStatus.PENDING]: 'Pending',
    [InvitationStatus.ACCEPTED]: 'Accepted',
    [InvitationStatus.REVOKED]: 'Revoked',
    [InvitationStatus.EXPIRED]: 'Expired',
};

export default function InvitationsPage() {
    const workspace = useActiveWorkspace();
    const utils = api.useUtils();
    const { data: invitations, isLoading } = api.workspaceInvitation.list.useQuery({
        workspaceId: workspace.id,
    });

    const revoke = api.workspaceInvitation.revoke.useMutation({
        onSuccess: async () => {
            toast.success('Invite revoked');
            await utils.workspaceInvitation.list.invalidate({ workspaceId: workspace.id });
        },
        onError: (err) => toast.error(err.message),
    });

    return (
        <div className="flex max-w-2xl flex-col gap-6">
            <header>
                <h1 className="text-foreground text-xl font-medium">Invitations</h1>
                <p className="text-foreground-tertiary mt-1 text-sm">
                    Pending and historical invites for {workspace.name}.
                </p>
            </header>
            <section className="flex flex-col gap-2">
                {isLoading ? (
                    <p className="text-foreground-tertiary text-sm">Loading…</p>
                ) : (invitations ?? []).length === 0 ? (
                    <p className="text-foreground-tertiary text-sm">No invitations.</p>
                ) : (
                    (invitations ?? []).map((inv) => (
                        <div
                            key={inv.id}
                            className="border-border flex items-center gap-3 rounded-md border p-3"
                        >
                            <div className="flex flex-1 flex-col">
                                <span className="text-foreground text-sm font-medium">
                                    {inv.email}
                                </span>
                                <span className="text-foreground-tertiary text-xs">
                                    {STATUS_LABEL[inv.status]} · {inv.role}
                                    {inv.status === InvitationStatus.PENDING &&
                                        ` · expires ${new Date(inv.expiresAt).toLocaleDateString()}`}
                                </span>
                            </div>
                            {inv.status === InvitationStatus.PENDING && (
                                <Button
                                    variant="ghost"
                                    size="compact"
                                    onClick={() => revoke.mutate({ id: inv.id })}
                                >
                                    Revoke
                                </Button>
                            )}
                        </div>
                    ))
                )}
            </section>
        </div>
    );
}
