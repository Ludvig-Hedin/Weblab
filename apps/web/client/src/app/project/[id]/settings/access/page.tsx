'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useAction, useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';

import { ProjectAccessMode, ProjectMemberRole, WorkspaceRole } from '@weblab/models';
import { Avatar, AvatarFallback, AvatarImage } from '@weblab/ui/avatar';
import { Button } from '@weblab/ui/button';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';

import type { Id } from '@convex/_generated/dataModel';
import { useProjectCapabilities } from '@/hooks/use-project-capabilities';

const MEMBER_ROLE_LABEL: Record<ProjectMemberRole, string> = {
    [ProjectMemberRole.MANAGER]: 'Manager',
    [ProjectMemberRole.EDITOR]: 'Editor',
    [ProjectMemberRole.REVIEWER]: 'Reviewer',
    [ProjectMemberRole.VIEWER]: 'Viewer',
};

const WORKSPACE_ROLE_LABEL: Record<WorkspaceRole, string> = {
    [WorkspaceRole.OWNER]: 'Workspace owner',
    [WorkspaceRole.ADMIN]: 'Workspace admin',
    [WorkspaceRole.MEMBER]: 'Workspace member',
    [WorkspaceRole.VIEWER]: 'Workspace viewer',
};

export default function ProjectAccessPage() {
    const params = useParams<{ id: string }>();
    const projectId = params.id as Id<'projects'>;

    const project = useQuery(api.projects.get, { projectId });
    const isLoading = project === undefined;
    const { canManageAccess, canInvite } = useProjectCapabilities(projectId);

    const access = useQuery(api.projects.listAccess, projectId ? { projectId } : 'skip');
    const accessLoading = access === undefined;

    const setAccessMutation = useMutation(api.projects.setAccessMode);
    const setAccess = async (accessMode: ProjectAccessMode) => {
        try {
            await setAccessMutation({ projectId, accessMode });
            toast.success('Access updated');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to update access');
        }
    };

    const updateMemberRoleMutation = useMutation(api.projectMembers.updateRole);
    const updateMemberRole = async (userId: Id<'users'>, memberRole: ProjectMemberRole) => {
        try {
            await updateMemberRoleMutation({ projectId, userId, memberRole });
            toast.success('Role updated');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to update role');
        }
    };

    const removeMemberMutation = useMutation(api.projectMembers.remove);
    const removeMember = async (userId: Id<'users'>) => {
        try {
            await removeMemberMutation({ projectId, userId });
            toast.success('Member removed');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to remove member');
        }
    };

    const revokeInviteMutation = useMutation(api.projectInvitations.revoke);
    const revokeInvite = async (id: Id<'projectInvitations'>) => {
        try {
            await revokeInviteMutation({ id });
            toast.success('Invitation revoked');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to revoke invitation');
        }
    };

    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<ProjectMemberRole>(ProjectMemberRole.EDITOR);
    const createInviteAction = useAction(api.projectInvitationActions.create);
    const [isCreatingInvite, setIsCreatingInvite] = useState(false);
    const createInvite = async (inviteeEmail: string, memberRole: ProjectMemberRole) => {
        setIsCreatingInvite(true);
        try {
            await createInviteAction({ projectId, inviteeEmail, memberRole });
            toast.success(`Invite sent to ${inviteeEmail}`);
            setInviteEmail('');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to send invite');
        } finally {
            setIsCreatingInvite(false);
        }
    };

    if (isLoading) {
        return <div className="p-6 text-sm">Loading…</div>;
    }
    if (!project) {
        return <div className="p-6 text-sm">Project not found.</div>;
    }

    const currentMode =
        (project as { accessMode?: ProjectAccessMode }).accessMode ?? ProjectAccessMode.WORKSPACE;

    return (
        <div className="mx-auto flex max-w-2xl flex-col gap-8 p-6">
            <header>
                <h1 className="text-foreground text-xl font-medium">Project access</h1>
                <p className="text-foreground-tertiary mt-1 text-sm">
                    Control who can see {project.name}.
                </p>
            </header>

            <section className="flex flex-col gap-3">
                <h2 className="text-foreground text-sm font-medium">Who has access?</h2>
                <div className="flex flex-col gap-2">
                    <AccessOption
                        active={currentMode === ProjectAccessMode.WORKSPACE}
                        label="Everyone in the workspace can access"
                        description="Workspace members will see this project on their dashboard. Their role in the workspace controls what they can do."
                        disabled={!canManageAccess}
                        onSelect={() => void setAccess(ProjectAccessMode.WORKSPACE)}
                    />
                    <AccessOption
                        active={currentMode === ProjectAccessMode.RESTRICTED}
                        label="Restricted to selected people"
                        description="Only workspace owners/admins and explicit project members can see this project. Normal workspace members will lose access."
                        disabled={!canManageAccess}
                        onSelect={() => void setAccess(ProjectAccessMode.RESTRICTED)}
                    />
                </div>
            </section>

            {canInvite && (
                <section className="bg-background-secondary/40 flex flex-col gap-3 rounded-md border p-4">
                    <header>
                        <h2 className="text-foreground text-sm font-medium">
                            Invite to project only: {project.name}
                        </h2>
                        <p className="text-foreground-tertiary mt-1 text-xs">
                            This person will only access this project. They will not become a
                            workspace member and will not see other workspace projects.
                        </p>
                    </header>
                    <div className="flex items-end gap-2">
                        <div className="flex-1">
                            <Label htmlFor="project-invite-email" className="text-xs">
                                Email
                            </Label>
                            <Input
                                id="project-invite-email"
                                type="email"
                                placeholder="person@example.com"
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                            />
                        </div>
                        <div className="w-32">
                            <Label className="text-xs">Role</Label>
                            <Select
                                value={inviteRole}
                                onValueChange={(v) => setInviteRole(v as ProjectMemberRole)}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {(Object.values(ProjectMemberRole) as ProjectMemberRole[]).map(
                                        (role) => (
                                            <SelectItem key={role} value={role}>
                                                {MEMBER_ROLE_LABEL[role]}
                                            </SelectItem>
                                        ),
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button
                            size="compact"
                            disabled={!inviteEmail.trim() || isCreatingInvite}
                            onClick={() => void createInvite(inviteEmail.trim(), inviteRole)}
                        >
                            {isCreatingInvite ? 'Sending…' : 'Send invite'}
                        </Button>
                    </div>
                </section>
            )}

            <section className="flex flex-col gap-6">
                <h2 className="text-foreground text-sm font-medium">People with access</h2>

                {/* Workspace inherited */}
                {accessLoading ? (
                    <p className="text-foreground-tertiary text-sm">Loading…</p>
                ) : access && access.workspaceInherited.length > 0 ? (
                    <div className="flex flex-col gap-2">
                        <p className="text-foreground-tertiary text-xs">
                            Inherited from workspace. Always retains access.
                        </p>
                        {access.workspaceInherited.map((m) => (
                            <PersonRow
                                key={m.userId}
                                displayName={m.displayName}
                                email={m.email}
                                avatarUrl={m.avatarUrl}
                                rightSlot={
                                    <span className="text-foreground-tertiary text-xs">
                                        {WORKSPACE_ROLE_LABEL[m.workspaceRole]}
                                    </span>
                                }
                            />
                        ))}
                    </div>
                ) : null}

                {/* Direct project members */}
                <div className="flex flex-col gap-2">
                    <h3 className="text-foreground text-sm font-medium">
                        People with project access
                    </h3>
                    {accessLoading ? (
                        <p className="text-foreground-tertiary text-sm">Loading…</p>
                    ) : access?.directMembers.length === 0 ? (
                        <p className="text-foreground-tertiary text-sm">
                            No one has direct access to this project yet.
                        </p>
                    ) : (
                        access?.directMembers.map((m) => (
                            <PersonRow
                                key={m.userId}
                                displayName={m.displayName}
                                email={m.email}
                                avatarUrl={m.avatarUrl}
                                rightSlot={
                                    canManageAccess ? (
                                        <>
                                            <Select
                                                value={m.memberRole}
                                                onValueChange={(v) =>
                                                    void updateMemberRole(
                                                        m.userId,
                                                        v as ProjectMemberRole,
                                                    )
                                                }
                                            >
                                                <SelectTrigger className="w-32">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {(
                                                        Object.values(
                                                            ProjectMemberRole,
                                                        ) as ProjectMemberRole[]
                                                    ).map((role) => (
                                                        <SelectItem key={role} value={role}>
                                                            {MEMBER_ROLE_LABEL[role]}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Button
                                                variant="ghost"
                                                size="compact"
                                                onClick={() => void removeMember(m.userId)}
                                            >
                                                Remove
                                            </Button>
                                        </>
                                    ) : (
                                        <span className="text-foreground-tertiary text-xs">
                                            {MEMBER_ROLE_LABEL[m.memberRole]}
                                        </span>
                                    )
                                }
                            />
                        ))
                    )}
                </div>

                {/* Pending invitations */}
                {access && access.pendingInvites.length > 0 && (
                    <div className="flex flex-col gap-2">
                        <h3 className="text-foreground text-sm font-medium">Pending invitations</h3>
                        {access.pendingInvites.map((inv) => (
                            <div
                                key={inv.id}
                                className="border-border flex items-center gap-3 rounded-md border p-3"
                            >
                                <div className="flex flex-1 flex-col">
                                    <span className="text-foreground text-sm font-medium">
                                        {inv.email}
                                    </span>
                                    <span className="text-foreground-tertiary text-xs">
                                        {MEMBER_ROLE_LABEL[inv.memberRole]} · expires{' '}
                                        {new Date(inv.expiresAt).toLocaleDateString()}
                                    </span>
                                </div>
                                {(canManageAccess || canInvite) && (
                                    <Button
                                        variant="ghost"
                                        size="compact"
                                        onClick={() => void revokeInvite(inv.id)}
                                    >
                                        Revoke
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}

function PersonRow({
    displayName,
    email,
    avatarUrl,
    rightSlot,
}: {
    displayName: string | null;
    email: string | null;
    avatarUrl: string | null;
    rightSlot: React.ReactNode;
}) {
    const initial = (displayName ?? email ?? '?').slice(0, 1).toUpperCase();
    return (
        <div className="border-border flex items-center gap-3 rounded-md border p-3">
            <Avatar className="h-8 w-8">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName ?? ''} />}
                <AvatarFallback>{initial}</AvatarFallback>
            </Avatar>
            <div className="flex flex-1 flex-col">
                <span className="text-foreground text-sm font-medium">
                    {displayName ?? email ?? 'Unknown'}
                </span>
                {email && displayName && email !== displayName && (
                    <span className="text-foreground-tertiary text-xs">{email}</span>
                )}
            </div>
            <div className="flex items-center gap-2">{rightSlot}</div>
        </div>
    );
}

function AccessOption({
    active,
    label,
    description,
    disabled,
    onSelect,
}: {
    active: boolean;
    label: string;
    description: string;
    disabled: boolean;
    onSelect: () => void;
}) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onSelect}
            className={`border-border flex flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors ${
                active
                    ? 'border-foreground/40 bg-background-secondary'
                    : 'hover:bg-background-secondary/50'
            } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
        >
            <div className="flex w-full items-center gap-2">
                <span className="text-foreground text-sm font-medium">{label}</span>
                {active && <span className="text-foreground-tertiary ml-auto text-xs">Active</span>}
            </div>
            <p className="text-foreground-tertiary text-xs">{description}</p>
        </button>
    );
}
