'use client';

import type { ReactNode } from 'react';
import { Component, useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';

import { Button } from '@weblab/ui/button';
import { Checkbox } from '@weblab/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@weblab/ui/dialog';
import { Input } from '@weblab/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';

import type { CloudMember, CloudMemberRole } from './content-api';
import type { CloudEditorScope } from '@/lib/cloud-editor/api';
import { useCloudEditorCopy } from '@/lib/cloud-editor/copy';
import { cloudContentApi } from './content-api';
import { CloudPreviewAllowance } from './preview-allowance';
import { CloudInvitations } from './invitations';

function RoleSelect({
    value,
    onChange,
    disabled,
    label,
}: {
    value: CloudMemberRole;
    onChange: (role: CloudMemberRole) => void;
    disabled?: boolean;
    label: string;
}) {
    const copy = useCloudEditorCopy();
    return (
        <Select
            value={value}
            disabled={disabled}
            onValueChange={(role) => {
                if (role === 'content' || role === 'designer' || role === 'responsible')
                    onChange(role);
            }}
        >
            <SelectTrigger size="sm" aria-label={label}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="content">{copy.memberContent}</SelectItem>
                <SelectItem value="designer">{copy.memberDesigner}</SelectItem>
                <SelectItem value="responsible">{copy.memberResponsible}</SelectItem>
            </SelectContent>
        </Select>
    );
}

function MemberRow({
    member,
    busy,
    onSave,
    onRemove,
}: {
    member: CloudMember;
    busy: boolean;
    onSave: (email: string, role: CloudMemberRole, publish: boolean) => Promise<boolean>;
    onRemove: (userId: CloudMember['userId']) => Promise<boolean>;
}) {
    const copy = useCloudEditorCopy();
    const [role, setRole] = useState(member.role);
    const [publish, setPublish] = useState(member.publish);
    const [confirmRemove, setConfirmRemove] = useState(false);
    const name = member.displayName || member.email || copy.memberUnavailable;
    const changed = role !== member.role || publish !== member.publish;
    return (
        <li className="space-y-2 border-b py-3 last:border-0">
            <div className="min-w-0">
                <p className="truncate text-sm font-medium">{name}</p>
                {member.displayName && member.email && (
                    <p className="text-foreground-secondary truncate text-xs">{member.email}</p>
                )}
                {!member.active && (
                    <p className="text-foreground-secondary text-xs">{copy.memberInactive}</p>
                )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
                <RoleSelect
                    value={role}
                    onChange={setRole}
                    disabled={busy || member.isCreator || !member.email}
                    label={`${copy.memberRole}: ${name}`}
                />
                <label className="flex items-center gap-2 text-xs">
                    <Checkbox checked={publish} disabled={busy || member.isCreator || !member.email} onCheckedChange={value => setPublish(value === true)} />
                    {copy.memberPublish}
                </label>
                {changed && (
                    <Button
                        size="xs"
                        disabled={busy || !member.email}
                        onClick={() => {
                            if (member.email) void onSave(member.email, role, publish);
                        }}
                    >
                        {copy.memberSave}
                    </Button>
                )}
                {!member.isCreator && (
                    <Button
                        size="xs"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setConfirmRemove(true)}
                    >
                        {copy.memberRemove}
                    </Button>
                )}
            </div>
            {confirmRemove && (
                <div className="space-y-2 text-xs">
                    <p>{copy.memberConfirmRemove}</p>
                    <div className="flex gap-2">
                        <Button
                            size="xs"
                            variant="destructive"
                            disabled={busy}
                            onClick={() => {
                                void onRemove(member.userId);
                            }}
                        >
                            {copy.memberRemove}
                        </Button>
                        <Button
                            size="xs"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => setConfirmRemove(false)}
                        >
                            {copy.cancel}
                        </Button>
                    </div>
                </div>
            )}
        </li>
    );
}

function MemberList({ scope }: { scope: CloudEditorScope }) {
    const copy = useCloudEditorCopy();
    const members = useQuery(cloudContentApi.listMembers, scope);
    const setMember = useMutation(cloudContentApi.setMember);
    const removeMember = useMutation(cloudContentApi.removeMember);
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<CloudMemberRole>('content');
    // This form can update an existing account. Keep its saved publishing grant
    // while publishing is unavailable, rather than silently replacing it with false.
    const publish =
        members?.find((member) => member.email?.toLowerCase() === email.trim().toLowerCase())
            ?.publish ?? false;
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const inFlight = useRef(false);

    async function perform(operation: () => Promise<unknown>): Promise<boolean> {
        if (inFlight.current) return false;
        inFlight.current = true;
        setBusy(true);
        setError(null);
        setSaved(false);
        try {
            await operation();
            setSaved(true);
            return true;
        } catch (cause) {
            const code = cause instanceof ConvexError ? cause.data : null;
            setError(
                code === 'CLOUD_MEMBER_NOT_FOUND'
                    ? copy.memberNotFound
                    : code === 'CLOUD_WORKSPACE_AUTHORITY_CONFLICT'
                      ? copy.memberAuthorityConflict
                      : code === 'CLOUD_CREATOR_PROTECTED'
                        ? copy.memberCreatorProtected
                        : copy.memberFailed,
            );
            return false;
        } finally {
            inFlight.current = false;
            setBusy(false);
        }
    }

    const save = (address: string, nextRole: CloudMemberRole, nextPublish: boolean) =>
        perform(() =>
            setMember({
                ...scope,
                email: address.trim(),
                role: nextRole,
                publish: nextPublish,
            }),
        );

    return (
        <div className="space-y-4">
            <CloudPreviewAllowance scope={scope} />
            <CloudInvitations key={`${scope.projectId}:${scope.branchId}`} scope={scope} />
            <form
                className="space-y-3 border-b pb-4"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (members === undefined) return;
                    void save(email, role, publish).then((success) => {
                        if (success) setEmail('');
                    });
                }}
            >
                <label className="block space-y-1 text-xs">
                    <span>{copy.memberEmail}</span>
                    <Input
                        type="email"
                        required
                        maxLength={254}
                        value={email}
                        disabled={busy}
                        onChange={(event) => {
                            setEmail(event.target.value);
                            setSaved(false);
                        }}
                        autoComplete="email"
                    />
                </label>
                <div className="flex flex-wrap items-center gap-3">
                    <RoleSelect
                        value={role}
                        onChange={setRole}
                        disabled={busy}
                        label={copy.memberRole}
                    />
                    <label className="flex items-center gap-2 text-xs">
                        <Checkbox checked={publish} disabled />
                        {copy.memberPublish}
                    </label>
                    <Button
                        size="sm"
                        type="submit"
                        disabled={busy || members === undefined || !email.trim()}
                    >
                        {copy.memberAdd}
                    </Button>
                </div>
                <p className="text-foreground-secondary text-xs">{copy.memberExistingOnly}</p>
            </form>
            {error && (
                <p role="alert" className="text-destructive text-sm">
                    {error}
                </p>
            )}
            {saved && (
                <p role="status" className="text-foreground-secondary text-xs">
                    {copy.memberSaved}
                </p>
            )}
            {members === undefined ? (
                <p role="status" className="text-sm">
                    {copy.loading}
                </p>
            ) : (
                <ul>
                    {members.map((member) => (
                        <MemberRow
                            key={`${member.userId}:${member.role}:${member.publish}`}
                            member={member}
                            busy={busy}
                            onSave={save}
                            onRemove={(userId) => perform(() => removeMember({ ...scope, userId }))}
                        />
                    ))}
                </ul>
            )}
        </div>
    );
}

// Permission can change while the live members query is mounted, including
// when a responsible member lowers their own role. Keep that failure in the dialog.
class MembersAccessBoundary extends Component<
    { children: ReactNode; fallback: string },
    { failed: boolean }
> {
    state = { failed: false };
    static getDerivedStateFromError() {
        return { failed: true };
    }
    render() {
        return this.state.failed ? (
            <p role="alert" className="text-sm">
                {this.props.fallback}
            </p>
        ) : (
            this.props.children
        );
    }
}

/** Mount only for a current responsible member with canManage. The server rechecks every write. */
export function CloudMembers({ scope }: { scope: CloudEditorScope }) {
    const copy = useCloudEditorCopy();
    const [open, setOpen] = useState(false);
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm">
                    {copy.members}
                </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{copy.members}</DialogTitle>
                    <DialogDescription>
                        {copy.membersDescription} {copy.cloudPublishingUnavailable}
                    </DialogDescription>
                </DialogHeader>
                {open && (
                    <MembersAccessBoundary fallback={copy.memberListUnavailable}>
                        <MemberList scope={scope} />
                    </MembersAccessBoundary>
                )}
            </DialogContent>
        </Dialog>
    );
}
