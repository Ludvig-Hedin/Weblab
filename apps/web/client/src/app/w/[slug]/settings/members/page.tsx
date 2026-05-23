'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';

import { WorkspaceKind, WorkspaceRole } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';

import type { Id } from '../../../../../../convex/_generated/dataModel';
import { useActiveWorkspace } from '../../_components/workspace-context';

const INVITABLE_ROLES: { value: WorkspaceRole; label: string }[] = [
    { value: WorkspaceRole.ADMIN, label: 'Admin' },
    { value: WorkspaceRole.MEMBER, label: 'Member' },
    { value: WorkspaceRole.VIEWER, label: 'Viewer' },
];

export default function MembersPage() {
    const workspace = useActiveWorkspace();
    const workspaceId = workspace.id as Id<'workspaces'>;
    const caps = useQuery(api.users.capabilities, { workspaceId });
    const canInvite = caps?.includes('workspace.invite') ?? false;
    const canManage = caps?.includes('workspace.manage_members') ?? false;

    const members = useQuery(api.workspaces.listMembers, { workspaceId });
    const isLoading = members === undefined;

    const [email, setEmail] = useState('');
    const [role, setRole] = useState<WorkspaceRole>(WorkspaceRole.MEMBER);
    const [invitePending, setInvitePending] = useState(false);
    const [transferPending, setTransferPending] = useState(false);

    const inviteCreate = useMutation(api.workspaces.inviteCreate);
    const updateRole = useMutation(api.workspaces.updateMemberRole);
    const removeMember = useMutation(api.workspaces.removeMember);
    const transferOwnership = useMutation(api.workspaces.transferOwnership);

    const handleInvite = async () => {
        if (!email.trim()) return;
        setInvitePending(true);
        try {
            await inviteCreate({ workspaceId, email: email.trim(), role });
            toast.success(`Invite sent to ${email}`);
            setEmail('');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to send invite');
        } finally {
            setInvitePending(false);
        }
    };

    const handleUpdateRole = async (userId: Id<'users'>, newRole: WorkspaceRole) => {
        try {
            await updateRole({ workspaceId, userId, role: newRole });
            toast.success('Role updated');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to update role');
        }
    };

    const handleRemove = async (userId: Id<'users'>) => {
        try {
            await removeMember({ workspaceId, userId });
            toast.success('Member removed');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to remove member');
        }
    };

    const handleTransfer = async (userId: Id<'users'>) => {
        setTransferPending(true);
        try {
            await transferOwnership({ workspaceId, newOwnerUserId: userId });
            toast.success('Ownership transferred');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to transfer ownership');
        } finally {
            setTransferPending(false);
        }
    };

    const viewerIsOwner = workspace.viewerRole === WorkspaceRole.OWNER;
    const isPersonal = workspace.kind === WorkspaceKind.PERSONAL;

    return (
        <div className="flex max-w-2xl flex-col gap-8">
            <header>
                <h1 className="text-foreground text-xl font-medium">Members</h1>
                <p className="text-foreground-tertiary mt-1 text-sm">People in {workspace.name}.</p>
            </header>

            {isPersonal && (
                <section className="bg-background-secondary/40 flex flex-col gap-2 rounded-md border p-4">
                    <h2 className="text-foreground text-sm font-medium">
                        Personal workspaces are solo
                    </h2>
                    <p className="text-foreground-tertiary text-xs">
                        Personal workspaces can&apos;t be shared. Create a team workspace to invite
                        collaborators.
                    </p>
                    <div>
                        <Button asChild size="compact" variant="secondary">
                            <Link href="/w/new">Create a team workspace</Link>
                        </Button>
                    </div>
                </section>
            )}

            {!isPersonal && canInvite && (
                <section className="bg-background-secondary/40 flex flex-col gap-3 rounded-md border p-4">
                    <header>
                        <h2 className="text-foreground text-sm font-medium">
                            Invite to workspace: {workspace.name}
                        </h2>
                        <p className="text-foreground-tertiary mt-1 text-xs">
                            This person will become a workspace member. They may access
                            workspace-visible projects based on their role.
                        </p>
                    </header>
                    <div className="flex items-end gap-2">
                        <div className="flex-1">
                            <Label htmlFor="invite-email" className="text-xs">
                                Email
                            </Label>
                            <Input
                                id="invite-email"
                                type="email"
                                placeholder="person@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div className="w-32">
                            <Label className="text-xs">Role</Label>
                            <Select value={role} onValueChange={(v) => setRole(v as WorkspaceRole)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {INVITABLE_ROLES.map((r) => (
                                        <SelectItem key={r.value} value={r.value}>
                                            {r.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button
                            size="compact"
                            disabled={!email.trim() || invitePending}
                            onClick={() => void handleInvite()}
                        >
                            {invitePending ? 'Sending…' : 'Send invite'}
                        </Button>
                    </div>
                </section>
            )}

            <section className="flex flex-col gap-2">
                {isLoading ? (
                    <p className="text-foreground-tertiary text-sm">Loading…</p>
                ) : (
                    (members ?? []).map((m) => (
                        <div
                            key={m._id}
                            className="border-border flex items-center gap-3 rounded-md border p-3"
                        >
                            <div className="flex flex-1 flex-col">
                                <span className="text-foreground text-sm font-medium">
                                    {m.user?.displayName ?? m.user?.email ?? 'Unknown'}
                                </span>
                                {m.user?.email && (
                                    <span className="text-foreground-tertiary text-xs">
                                        {m.user.email}
                                    </span>
                                )}
                            </div>
                            {canManage && m.role !== WorkspaceRole.OWNER ? (
                                <Select
                                    value={m.role}
                                    onValueChange={(v) => {
                                        if (m.user) {
                                            void handleUpdateRole(
                                                m.user.id as Id<'users'>,
                                                v as WorkspaceRole,
                                            );
                                        }
                                    }}
                                >
                                    <SelectTrigger className="w-32">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {INVITABLE_ROLES.map((r) => (
                                            <SelectItem key={r.value} value={r.value}>
                                                {r.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : (
                                <span className="text-foreground-secondary text-xs uppercase">
                                    {m.role}
                                </span>
                            )}
                            {viewerIsOwner && m.role !== WorkspaceRole.OWNER && m.user && (
                                <TransferOwnerButton
                                    user={m.user}
                                    workspaceName={workspace.name}
                                    pending={transferPending}
                                    onConfirm={(userId) =>
                                        void handleTransfer(userId as Id<'users'>)
                                    }
                                />
                            )}
                            {canManage && m.role !== WorkspaceRole.OWNER && m.user && (
                                <RemoveMemberButton
                                    user={m.user}
                                    workspaceName={workspace.name}
                                    onConfirm={(userId) => void handleRemove(userId as Id<'users'>)}
                                />
                            )}
                        </div>
                    ))
                )}
            </section>
        </div>
    );
}

interface MemberActionProps {
    user: { id: string; displayName?: string | null; email?: string | null };
    workspaceName: string;
    onConfirm: (userId: string) => void;
}

function TransferOwnerButton({
    user,
    workspaceName,
    pending,
    onConfirm,
}: MemberActionProps & { pending: boolean }) {
    const name = user.displayName ?? user.email ?? 'this user';
    return (
        <Button
            variant="ghost"
            size="compact"
            disabled={pending}
            onClick={() => {
                if (
                    window.confirm(
                        `Transfer ownership of ${workspaceName} to ${name}? You will be demoted to admin.`,
                    )
                ) {
                    onConfirm(user.id);
                }
            }}
        >
            Make owner
        </Button>
    );
}

function RemoveMemberButton({ user, workspaceName, onConfirm }: MemberActionProps) {
    const name = user.displayName ?? user.email ?? 'this user';
    return (
        <Button
            variant="ghost"
            size="compact"
            onClick={() => {
                if (
                    window.confirm(
                        `Remove ${name} from ${workspaceName}? They will lose access to workspace-visible projects.`,
                    )
                ) {
                    onConfirm(user.id);
                }
            }}
        >
            Remove
        </Button>
    );
}
