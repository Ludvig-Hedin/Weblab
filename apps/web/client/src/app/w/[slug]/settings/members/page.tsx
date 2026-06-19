'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';

import { WorkspaceKind, WorkspaceRole } from '@weblab/models';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@weblab/ui/alert-dialog';
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

    // Identify the viewer so we never render self-targeted management
    // actions. `removeMember` rejects removing self (BAD_REQUEST: use
    // leave()), so an un-filtered Remove button on the caller's own row
    // only ever produces a toast.error — confusing dead UI.
    const me = useQuery(api.users.me, {});
    const currentUserId = me?._id;

    const members = useQuery(api.workspaces.listMembers, { workspaceId });
    const isLoading = members === undefined;

    const [email, setEmail] = useState('');
    const [role, setRole] = useState<WorkspaceRole>(WorkspaceRole.MEMBER);
    const [invitePending, setInvitePending] = useState(false);
    const [transferPending, setTransferPending] = useState(false);
    // Workspace invites have no email delivery (unlike project invites), so we
    // surface a shareable accept link the inviter can copy and send.
    const [inviteLink, setInviteLink] = useState<string | null>(null);

    const inviteCreate = useMutation(api.workspaces.inviteCreate);
    const updateRole = useMutation(api.workspaces.updateMemberRole);
    const removeMember = useMutation(api.workspaces.removeMember);
    const transferOwnership = useMutation(api.workspaces.transferOwnership);

    const handleInvite = async () => {
        const trimmedEmail = email.trim();
        if (!trimmedEmail) return;
        setInvitePending(true);
        try {
            const invitation = await inviteCreate({ workspaceId, email: trimmedEmail, role });
            // No email is sent for workspace invites — build the accept link
            // (mirrors the /invitation/workspace/[id]?token= route) and hand it
            // to the inviter to share. The previous "Invite sent" toast was a
            // lie: nothing was delivered, so invitees could never join.
            const link = `${window.location.origin}/invitation/workspace/${invitation._id}?token=${invitation.token}`;
            setInviteLink(link);
            try {
                await navigator.clipboard.writeText(link);
                toast.success('Invite link copied to clipboard', {
                    description: `Send it to ${trimmedEmail} to join ${workspace.name}.`,
                });
            } catch {
                toast.success('Invite link created', {
                    description: 'Copy the link below and send it to the invitee.',
                });
            }
            setEmail('');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to create invite');
        } finally {
            setInvitePending(false);
        }
    };

    const handleCopyInviteLink = () => {
        if (!inviteLink) return;
        void navigator.clipboard.writeText(inviteLink).then(
            () => toast.success('Copied'),
            () => toast.error('Copy failed'),
        );
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
                <h1 className="text-foreground text-title3 font-medium">Members</h1>
                <p className="text-foreground-tertiary text-small mt-1">
                    People in {workspace.name}.
                </p>
            </header>

            {isPersonal && (
                <section className="bg-background-secondary/40 flex flex-col gap-2 rounded-md border p-4">
                    <h2 className="text-foreground text-smallPlus">Personal workspaces are solo</h2>
                    <p className="text-foreground-tertiary text-mini">
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
                        <h2 className="text-foreground text-smallPlus">
                            Invite to workspace: {workspace.name}
                        </h2>
                        <p className="text-foreground-tertiary text-mini mt-1">
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
                            {invitePending ? 'Creating…' : 'Create invite link'}
                        </Button>
                    </div>
                    {inviteLink && (
                        <div className="border-border bg-background flex items-center gap-2 rounded-md border p-2">
                            <Input
                                readOnly
                                value={inviteLink}
                                className="text-mini flex-1"
                                onFocus={(e) => e.currentTarget.select()}
                            />
                            <Button
                                size="compact"
                                variant="secondary"
                                onClick={handleCopyInviteLink}
                            >
                                Copy link
                            </Button>
                        </div>
                    )}
                    <p className="text-foreground-tertiary text-mini">
                        We don&apos;t email invites yet — copy this link and send it to the person
                        you&apos;re inviting.
                    </p>
                </section>
            )}

            <section className="flex flex-col gap-2">
                {isLoading ? (
                    <p className="text-foreground-tertiary text-small">Loading…</p>
                ) : (
                    (members ?? []).map((m) => (
                        <div
                            key={m._id}
                            className="border-border flex items-center gap-3 rounded-md border p-3"
                        >
                            <div className="flex flex-1 flex-col">
                                <span className="text-foreground text-smallPlus">
                                    {m.user?.displayName ?? m.user?.email ?? 'Unknown'}
                                </span>
                                {m.user?.email && (
                                    <span className="text-foreground-tertiary text-mini">
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
                                <span className="text-foreground-secondary text-mini uppercase">
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
                            {canManage &&
                                m.role !== WorkspaceRole.OWNER &&
                                m.user &&
                                m.user.id !== currentUserId && (
                                    <RemoveMemberButton
                                        user={m.user}
                                        workspaceName={workspace.name}
                                        onConfirm={(userId) =>
                                            void handleRemove(userId as Id<'users'>)
                                        }
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
    const [open, setOpen] = useState(false);
    return (
        <>
            <Button variant="ghost" size="compact" disabled={pending} onClick={() => setOpen(true)}>
                Make owner
            </Button>
            <AlertDialog open={open} onOpenChange={setOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Transfer ownership</AlertDialogTitle>
                        <AlertDialogDescription>
                            Transfer ownership of {workspaceName} to {name}? You will be demoted to
                            admin.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                onConfirm(user.id);
                                setOpen(false);
                            }}
                        >
                            Transfer
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

function RemoveMemberButton({ user, workspaceName, onConfirm }: MemberActionProps) {
    const name = user.displayName ?? user.email ?? 'this user';
    const [open, setOpen] = useState(false);
    return (
        <>
            <Button variant="ghost" size="compact" onClick={() => setOpen(true)}>
                Remove
            </Button>
            <AlertDialog open={open} onOpenChange={setOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove member</AlertDialogTitle>
                        <AlertDialogDescription>
                            Remove {name} from {workspaceName}? They will lose access to
                            workspace-visible projects.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                onConfirm(user.id);
                                setOpen(false);
                            }}
                        >
                            Remove
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
