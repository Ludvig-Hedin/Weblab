'use client';

import { useState } from 'react';
import { api } from '@convex/_generated/api';
import { useAction, useMutation, useQuery } from 'convex/react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

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
import { useConfirm } from '@/components/ui/confirm-dialog';

type MemberRole = 'manager' | 'editor' | 'reviewer' | 'viewer';

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

// Surface the human part of a thrown `Error('CODE: message')`, falling back.
const errorMessage = (error: unknown, fallback: string): string => {
    const raw = error instanceof Error ? error.message : '';
    const match = /(?:BAD_REQUEST|NOT_FOUND|FORBIDDEN|UNAUTHENTICATED):\s*([^\n]+)/.exec(raw);
    const message = match?.[1]?.trim();
    return message && message.length > 0 ? message : fallback;
};

export const SiteAccessTab = observer(() => {
    const t = useTranslations('settings.siteAccess');
    const editorEngine = useEditorEngine();
    const projectId = editorEngine.projectId as Id<'projects'>;

    const ROLES: { value: MemberRole; label: string }[] = [
        { value: 'manager', label: t('roleManager') },
        { value: 'editor', label: t('roleEditor') },
        { value: 'reviewer', label: t('roleReviewer') },
        { value: 'viewer', label: t('roleViewer') },
    ];

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
    const { confirm, dialog: confirmDialog } = useConfirm();

    const pendingInvites = (invitations ?? []).filter((i) => i.status === 'pending');

    const handleInvite = async () => {
        if (!isEmail(email)) {
            toast.error(t('toastInvalidEmail'));
            return;
        }
        setIsInviting(true);
        try {
            await createInvite({ projectId, inviteeEmail: email.trim(), memberRole: inviteRole });
            setEmail('');
            toast.success(t('toastInviteSent', { email: email.trim() }));
        } catch (error) {
            toast.error(errorMessage(error, t('toastInviteFailed')));
        } finally {
            setIsInviting(false);
        }
    };

    const handleRoleChange = async (userId: Id<'users'>, role: MemberRole) => {
        setBusyUserId(userId);
        try {
            await updateRole({ projectId, userId, memberRole: role });
            toast.success(t('toastRoleUpdated'));
        } catch (error) {
            toast.error(errorMessage(error, t('toastRoleFailed')));
        } finally {
            setBusyUserId(null);
        }
    };

    const handleRemove = async (userId: Id<'users'>, isMe: boolean) => {
        // Destructive + immediate: removing a member (or leaving, which drops
        // your own access) must confirm first — there's no undo.
        const ok = await confirm({
            title: isMe ? t('confirmLeaveTitle') : t('confirmRemoveTitle'),
            description: isMe ? t('confirmLeaveDesc') : t('confirmRemoveDesc'),
            confirmLabel: isMe ? t('confirmLeaveBtn') : t('confirmRemoveBtn'),
            destructive: true,
        });
        if (!ok) return;
        setBusyUserId(userId);
        try {
            await removeMember({ projectId, userId });
            toast.success(isMe ? t('toastLeft') : t('toastMemberRemoved'));
        } catch (error) {
            toast.error(errorMessage(error, t('toastRemoveFailed')));
        } finally {
            setBusyUserId(null);
        }
    };

    const handleRevoke = async (id: Id<'projectInvitations'>) => {
        setBusyInviteId(id);
        try {
            await revokeInvite({ id });
            toast.success(t('toastRevoked'));
        } catch (error) {
            toast.error(errorMessage(error, t('toastRevokeFailed')));
        } finally {
            setBusyInviteId(null);
        }
    };

    return (
        <div className="divide-border flex flex-col divide-y px-6">
            <section className="space-y-4 py-6">
                <div>
                    <h2 className="text-largePlus">{t('title')}</h2>
                    <p className="text-regular text-foreground-secondary">
                        {t('description')}
                    </p>
                </div>

                {/* Invite */}
                <div className="flex items-end gap-2">
                    <div className="flex flex-1 flex-col gap-2">
                        <Label className="text-mini">{t('inviteLabel')}</Label>
                        <Input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') void handleInvite();
                            }}
                            placeholder={t('invitePlaceholder')}
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
                        {isInviting ? t('inviting') : t('inviteButton')}
                    </Button>
                </div>
            </section>

            {/* Members */}
            <section className="space-y-3 py-6">
                <h3 className="text-regularPlus">{t('membersTitle')}</h3>
                {members === undefined ? (
                    <div className="text-foreground-secondary flex items-center gap-2 py-2">
                        <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                        <span className="text-small">{t('loadingMembers')}</span>
                    </div>
                ) : members.length === 0 ? (
                    <p className="text-small text-foreground-secondary py-2">
                        {t('noMembers')}
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
                                                        {t('you')}
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
                                            aria-label={isMe ? t('leaveSite') : t('removeMember')}
                                            title={isMe ? t('leaveSite') : t('removeMember')}
                                            disabled={busyUserId === u.id}
                                            onClick={() => void handleRemove(u.id, isMe)}
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
                    <h3 className="text-regularPlus">{t('pendingTitle')}</h3>
                    <div className="flex flex-col gap-2">
                        {pendingInvites.map((invite) => (
                            <div
                                key={invite._id}
                                className="flex items-center justify-between gap-3"
                            >
                                <div className="min-w-0">
                                    <p className="text-regular truncate">{invite.inviteeEmail}</p>
                                    <p className="text-mini text-foreground-secondary">
                                        {t('invitedAs', { role: invite.memberRole ?? 'viewer' })}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="text-mini">
                                        {t('pending')}
                                    </Badge>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={busyInviteId === invite._id}
                                        onClick={() => void handleRevoke(invite._id)}
                                    >
                                        {t('revoke')}
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}
            {confirmDialog}
        </div>
    );
});
