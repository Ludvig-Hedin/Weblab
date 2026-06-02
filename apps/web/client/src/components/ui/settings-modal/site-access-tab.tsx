'use client';

import { useState } from 'react';
import { api } from '@convex/_generated/api';
import { useAction, useMutation, useQuery } from 'convex/react';
import { observer } from 'mobx-react-lite';

import { Avatar, AvatarFallback, AvatarImage } from '@weblab/ui/avatar';
import { Badge } from '@weblab/ui/badge';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import { toast } from '@weblab/ui/sonner';
import { getInitials } from '@weblab/utility';

import type { Id } from '@convex/_generated/dataModel';
import { useEditorEngine } from '@/components/store/editor';

type MemberRole = 'manager' | 'editor' | 'reviewer' | 'viewer';

const ROLES: { value: MemberRole; label: string }[] = [
    { value: 'manager', label: 'Manager' },
    { value: 'editor', label: 'Editor' },
    { value: 'reviewer', label: 'Reviewer' },
    { value: 'viewer', label: 'Viewer' },
];

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

// Surface the human part of a thrown `Error('CODE: message')`, falling back.
const errorMessage = (error: unknown, fallback: string): string => {
    const raw = error instanceof Error ? error.message : '';
    const match = /(?:BAD_REQUEST|NOT_FOUND|FORBIDDEN|UNAUTHENTICATED):\s*([^\n]+)/.exec(raw);
    const message = match?.[1]?.trim();
    return message && message.length > 0 ? message : fallback;
};

export const SiteAccessTab = observer(() => {
    const editorEngine = useEditorEngine();
    const projectId = editorEngine.projectId as Id<'projects'>;

    const me = useQuery(api.users.me, {});
    const members = useQuery(api.projectMembers.list, { projectId });
    const invitations = useQuery(api.projectInvitations.list, { projectId });

    const updateRole = useMutation(api.projectMembers.updateRole);
    const removeMember = useMutation(api.projectMembers.remove);
    const revokeInvite = useMutation(api.projectInvitations.revoke);
    const createInvite = useAction(api.projectInvitationActions.create);

    const [email, setEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<MemberRole>('editor');
    const [isInviting, setIsInviting] = useState(false);
    const [busyUserId, setBusyUserId] = useState<string | null>(null);
    const [busyInviteId, setBusyInviteId] = useState<string | null>(null);

    const pendingInvites = (invitations ?? []).filter((i) => i.status === 'pending');

    const handleInvite = async () => {
        if (!isEmail(email)) {
            toast.error('Enter a valid email address');
            return;
        }
        setIsInviting(true);
        try {
            await createInvite({ projectId, inviteeEmail: email.trim(), memberRole: inviteRole });
            setEmail('');
            toast.success(`Invitation sent to ${email.trim()}`);
        } catch (error) {
            toast.error(errorMessage(error, 'Could not send the invitation. Please try again.'));
        } finally {
            setIsInviting(false);
        }
    };

    const handleRoleChange = async (userId: Id<'users'>, role: MemberRole) => {
        setBusyUserId(userId);
        try {
            await updateRole({ projectId, userId, memberRole: role });
            toast.success('Role updated');
        } catch (error) {
            toast.error(errorMessage(error, 'Could not change the role.'));
        } finally {
            setBusyUserId(null);
        }
    };

    const handleRemove = async (userId: Id<'users'>) => {
        setBusyUserId(userId);
        try {
            await removeMember({ projectId, userId });
            toast.success('Member removed');
        } catch (error) {
            toast.error(errorMessage(error, 'Could not remove the member.'));
        } finally {
            setBusyUserId(null);
        }
    };

    const handleRevoke = async (id: Id<'projectInvitations'>) => {
        setBusyInviteId(id);
        try {
            await revokeInvite({ id });
            toast.success('Invitation revoked');
        } catch (error) {
            toast.error(errorMessage(error, 'Could not revoke the invitation.'));
        } finally {
            setBusyInviteId(null);
        }
    };

    return (
        <div className="divide-border flex flex-col divide-y px-6">
            <section className="space-y-4 py-6">
                <div>
                    <h2 className="text-largePlus">Site access</h2>
                    <p className="text-regular text-foreground-secondary">
                        Manage who can access this site and set their role.
                    </p>
                </div>

                {/* Invite */}
                <div className="flex items-end gap-2">
                    <div className="flex flex-1 flex-col gap-2">
                        <Label className="text-mini">Invite by email</Label>
                        <Input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') void handleInvite();
                            }}
                            placeholder="teammate@company.com"
                            className="bg-background"
                            spellCheck={false}
                            autoCapitalize="off"
                            autoCorrect="off"
                        />
                    </div>
                    <Select
                        value={inviteRole}
                        onValueChange={(v) => setInviteRole(v as MemberRole)}
                    >
                        <SelectTrigger className="h-9 w-32">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {ROLES.map((r) => (
                                <SelectItem key={r.value} value={r.value}>
                                    {r.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button
                        size="sm"
                        className="h-9"
                        onClick={() => void handleInvite()}
                        disabled={isInviting || email.trim().length === 0}
                    >
                        {isInviting && (
                            <Icons.LoadingSpinner className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Invite
                    </Button>
                </div>
            </section>

            {/* Members */}
            <section className="space-y-3 py-6">
                <h3 className="text-regularPlus">Members</h3>
                {members === undefined ? (
                    <div className="text-foreground-secondary flex items-center gap-2 py-2">
                        <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                        <span className="text-small">Loading members…</span>
                    </div>
                ) : members.length === 0 ? (
                    <p className="text-small text-foreground-secondary py-2">
                        No members yet. Invite someone above.
                    </p>
                ) : (
                    <div className="flex flex-col gap-2">
                        {members.map((m) => {
                            const u = m.user;
                            if (!u) return null;
                            const isMe = me?._id === u.id;
                            const label = u.displayName ?? u.email ?? 'Unknown user';
                            return (
                                <div key={u.id} className="flex items-center justify-between gap-3">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <Avatar className="h-8 w-8">
                                            {u.avatarUrl && (
                                                <AvatarImage src={u.avatarUrl} alt={label} />
                                            )}
                                            <AvatarFallback className="text-mini">
                                                {getInitials(label)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0">
                                            <p className="text-regular truncate">
                                                {label}
                                                {isMe && (
                                                    <span className="text-foreground-secondary">
                                                        {' '}
                                                        (You)
                                                    </span>
                                                )}
                                            </p>
                                            {u.email && (
                                                <p className="text-mini text-foreground-secondary truncate">
                                                    {u.email}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Select
                                            value={m.memberRole}
                                            onValueChange={(v) =>
                                                void handleRoleChange(u.id, v as MemberRole)
                                            }
                                            disabled={busyUserId === u.id}
                                        >
                                            <SelectTrigger className="h-8 w-28">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {ROLES.map((r) => (
                                                    <SelectItem key={r.value} value={r.value}>
                                                        {r.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label={isMe ? 'Leave site' : 'Remove member'}
                                            title={isMe ? 'Leave site' : 'Remove member'}
                                            disabled={busyUserId === u.id}
                                            onClick={() => void handleRemove(u.id)}
                                        >
                                            <Icons.Trash className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* Pending invitations */}
            {pendingInvites.length > 0 && (
                <section className="space-y-3 py-6">
                    <h3 className="text-regularPlus">Pending invitations</h3>
                    <div className="flex flex-col gap-2">
                        {pendingInvites.map((invite) => (
                            <div
                                key={invite._id}
                                className="flex items-center justify-between gap-3"
                            >
                                <div className="min-w-0">
                                    <p className="text-regular truncate">{invite.inviteeEmail}</p>
                                    <p className="text-mini text-foreground-secondary">
                                        Invited as {invite.memberRole ?? 'viewer'}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="text-mini">
                                        Pending
                                    </Badge>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={busyInviteId === invite._id}
                                        onClick={() => void handleRevoke(invite._id)}
                                    >
                                        Revoke
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
});
