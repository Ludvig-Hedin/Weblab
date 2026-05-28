'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';

import { InvitationStatus, WorkspaceKind } from '@weblab/models';
import { Button } from '@weblab/ui/button';

import type { Id } from '@convex/_generated/dataModel';
import { useActiveWorkspace } from '../../_components/workspace-context';

const STATUS_LABEL: Record<InvitationStatus, string> = {
    [InvitationStatus.PENDING]: 'Pending',
    [InvitationStatus.ACCEPTED]: 'Accepted',
    [InvitationStatus.REVOKED]: 'Revoked',
    [InvitationStatus.EXPIRED]: 'Expired',
};

export default function InvitationsPage() {
    const workspace = useActiveWorkspace();
    const isPersonal = workspace.kind === WorkspaceKind.PERSONAL;
    const workspaceId = workspace.id as Id<'workspaces'>;
    // `users.capabilities` resolves to [] (never throws) for callers without
    // access, so it's safe to gate on. `inviteList` itself calls
    // `requireCap('workspace.invite')` and THROWS for members/viewers — and
    // there's no error boundary in the /w tree, so an un-gated query here
    // takes down the whole app shell when a non-admin opens this URL directly
    // (the settings nav hides the link, but the route is still reachable).
    const caps = useQuery(api.users.capabilities, isPersonal ? 'skip' : { workspaceId });
    const capsLoading = !isPersonal && caps === undefined;
    const canInvite = caps?.includes('workspace.invite') ?? false;
    const invitations = useQuery(
        api.workspaces.inviteList,
        isPersonal || !canInvite ? 'skip' : { workspaceId },
    );
    const isLoading = !isPersonal && (capsLoading || (canInvite && invitations === undefined));

    const revokeMutation = useMutation(api.workspaces.inviteRevoke);
    const [revokingIds, setRevokingIds] = useState<Set<string>>(new Set());
    const revoke = async (invitationId: Id<'workspaceInvitations'>) => {
        setRevokingIds((prev) => new Set(prev).add(invitationId));
        try {
            await revokeMutation({ invitationId });
            toast.success('Invite revoked');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to revoke invite');
        } finally {
            setRevokingIds((prev) => {
                const next = new Set(prev);
                next.delete(invitationId);
                return next;
            });
        }
    };

    return (
        <div className="flex max-w-2xl flex-col gap-6">
            <header>
                <h1 className="text-foreground text-title3 font-medium">Invitations</h1>
                <p className="text-foreground-tertiary text-small mt-1">
                    Pending and historical invites for {workspace.name}.
                </p>
            </header>
            {isPersonal ? (
                <section className="bg-background-secondary/40 flex flex-col gap-2 rounded-md border p-4">
                    <h2 className="text-foreground text-smallPlus">Personal workspaces are solo</h2>
                    <p className="text-foreground-tertiary text-mini">
                        Personal workspaces can&apos;t have invitations. Create a team workspace to
                        invite collaborators.
                    </p>
                    <div>
                        <Button asChild size="compact" variant="secondary">
                            <Link href="/w/new">Create a team workspace</Link>
                        </Button>
                    </div>
                </section>
            ) : !canInvite && !capsLoading ? (
                <section className="bg-background-secondary/40 flex flex-col gap-2 rounded-md border p-4">
                    <h2 className="text-foreground text-smallPlus">View-only access</h2>
                    <p className="text-foreground-tertiary text-mini">
                        You don&apos;t have permission to manage invitations for {workspace.name}.
                        Ask a workspace admin or owner to change your role.
                    </p>
                </section>
            ) : (
                <section className="flex flex-col gap-2">
                    {isLoading ? (
                        <p className="text-foreground-tertiary text-small">Loading…</p>
                    ) : (invitations ?? []).length === 0 ? (
                        <p className="text-foreground-tertiary text-small">No invitations.</p>
                    ) : (
                        (invitations ?? []).map((inv) => (
                            <div
                                key={inv._id}
                                className="border-border flex items-center gap-3 rounded-md border p-3"
                            >
                                <div className="flex flex-1 flex-col">
                                    <span className="text-foreground text-smallPlus">
                                        {inv.email}
                                    </span>
                                    <span className="text-foreground-tertiary text-mini">
                                        {STATUS_LABEL[inv.status as InvitationStatus]} · {inv.role}
                                        {inv.status === InvitationStatus.PENDING &&
                                            ` · expires ${new Date(
                                                inv.expiresAt,
                                            ).toLocaleDateString()}`}
                                    </span>
                                </div>
                                {inv.status === InvitationStatus.PENDING && (
                                    <Button
                                        variant="ghost"
                                        size="compact"
                                        disabled={revokingIds.has(inv._id)}
                                        onClick={() => void revoke(inv._id)}
                                    >
                                        Revoke
                                    </Button>
                                )}
                            </div>
                        ))
                    )}
                </section>
            )}
        </div>
    );
}
