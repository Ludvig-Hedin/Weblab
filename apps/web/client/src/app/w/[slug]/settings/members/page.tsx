'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { WorkspaceRole } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';

import { api } from '@/trpc/react';
import { useActiveWorkspace } from '../../_components/workspace-context';

const INVITABLE_ROLES: { value: WorkspaceRole; label: string }[] = [
    { value: WorkspaceRole.ADMIN, label: 'Admin' },
    { value: WorkspaceRole.MEMBER, label: 'Member' },
    { value: WorkspaceRole.VIEWER, label: 'Viewer' },
];

export default function MembersPage() {
    const workspace = useActiveWorkspace();
    const utils = api.useUtils();
    const { data: caps } = api.user.capabilities.useQuery({ workspaceId: workspace.id });
    const canInvite = caps?.includes('workspace.invite') ?? false;
    const canManage = caps?.includes('workspace.manage_members') ?? false;

    const { data: members, isLoading } = api.workspaceMember.list.useQuery({
        workspaceId: workspace.id,
    });

    const [email, setEmail] = useState('');
    const [role, setRole] = useState<WorkspaceRole>(WorkspaceRole.MEMBER);

    const inviteMutation = api.workspaceInvitation.create.useMutation({
        onSuccess: async () => {
            toast.success(`Invite sent to ${email}`);
            setEmail('');
            await utils.workspaceInvitation.list.invalidate({ workspaceId: workspace.id });
        },
        onError: (err) => toast.error(err.message),
    });

    const updateRole = api.workspaceMember.updateRole.useMutation({
        onSuccess: async () => {
            toast.success('Role updated');
            await utils.workspaceMember.list.invalidate({ workspaceId: workspace.id });
        },
        onError: (err) => toast.error(err.message),
    });

    const removeMember = api.workspaceMember.remove.useMutation({
        onSuccess: async () => {
            toast.success('Member removed');
            await utils.workspaceMember.list.invalidate({ workspaceId: workspace.id });
        },
        onError: (err) => toast.error(err.message),
    });

    const transferOwnership = api.workspaceMember.transferOwnership.useMutation({
        onSuccess: async () => {
            toast.success('Ownership transferred');
            await utils.workspaceMember.list.invalidate({ workspaceId: workspace.id });
            await utils.workspace.list.invalidate();
            await utils.workspace.getBySlug.invalidate({ slug: workspace.slug });
        },
        onError: (err) => toast.error(err.message),
    });

    const viewerIsOwner = workspace.viewerRole === WorkspaceRole.OWNER;

    return (
        <div className="flex max-w-2xl flex-col gap-8">
            <header>
                <h1 className="text-foreground text-xl font-medium">Members</h1>
                <p className="text-foreground-tertiary mt-1 text-sm">People in {workspace.name}.</p>
            </header>

            {canInvite && (
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
                            disabled={!email.trim() || inviteMutation.isPending}
                            onClick={() =>
                                inviteMutation.mutate({
                                    workspaceId: workspace.id,
                                    email: email.trim(),
                                    role,
                                })
                            }
                        >
                            {inviteMutation.isPending ? 'Sending…' : 'Send invite'}
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
                            key={m.id}
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
                                    onValueChange={(v) =>
                                        updateRole.mutate({
                                            workspaceId: workspace.id,
                                            userId: m.user?.id ?? '',
                                            role: v as WorkspaceRole,
                                        })
                                    }
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
                                    pending={transferOwnership.isPending}
                                    onConfirm={(userId) =>
                                        transferOwnership.mutate({
                                            workspaceId: workspace.id,
                                            toUserId: userId,
                                        })
                                    }
                                />
                            )}
                            {canManage && m.role !== WorkspaceRole.OWNER && m.user && (
                                <RemoveMemberButton
                                    user={m.user}
                                    workspaceName={workspace.name}
                                    onConfirm={(userId) =>
                                        removeMember.mutate({
                                            workspaceId: workspace.id,
                                            userId,
                                        })
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
    user: { id: string; displayName: string | null; email: string | null };
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
