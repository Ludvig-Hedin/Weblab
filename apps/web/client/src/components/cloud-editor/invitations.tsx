'use client';

import { useRef, useState } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { Button } from '@weblab/ui/button';
import { Checkbox } from '@weblab/ui/checkbox';
import { Input } from '@weblab/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import type { CloudEditorScope } from '@/lib/cloud-editor/api';
import type { CloudMemberRole } from './content-api';
import { invitationApi, useCloudInvitationCopy } from './invitation-api';

export function CloudInvitations({ scope }: { scope: CloudEditorScope }) {
    const copy = useCloudInvitationCopy();
    const invitations = useQuery(invitationApi.list, scope);
    const create = useAction(invitationApi.create);
    const revoke = useMutation(invitationApi.revoke);
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<CloudMemberRole>('content');
    const [publish, setPublish] = useState(false);
    const [busy, setBusy] = useState(false);
    const [link, setLink] = useState('');
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const pending = useRef(false);
    async function perform(operation: () => Promise<unknown>) {
        if (pending.current) return;
        pending.current = true; setBusy(true); setError(null);
        try { await operation(); } catch (cause) {
            const code = cause instanceof ConvexError ? cause.data : null;
            setError(code === 'CLOUD_INVITATION_EXISTS' ? copy.exists : code === 'CLOUD_INVITATION_LIMIT' ? copy.limit : copy.failed);
        } finally { pending.current = false; setBusy(false); }
    }
    return <section className="ph-no-capture space-y-3 border-b pb-4">
        <h3 className="text-sm font-medium">{copy.title}</h3>
        <form className="space-y-3" onSubmit={event => {
            event.preventDefault();
            void perform(async () => {
                const result = await create({ ...scope, email, role, publish });
                // Fragments are not sent in HTTP requests or Referer headers.
                setLink(`${window.location.origin}/invitation/cloud/${result.invitationId}#${result.token}`);
                setCopied(false); setEmail('');
            });
        }}>
            <label className="block space-y-1 text-xs"><span>{copy.email}</span>
                <Input type="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} disabled={busy} autoComplete="email" />
            </label>
            <div className="flex flex-wrap items-center gap-3">
                <Select value={role} onValueChange={value => { if (value === 'responsible' || value === 'designer' || value === 'content') setRole(value); }} disabled={busy}>
                    <SelectTrigger size="sm" aria-label={copy.role}><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="content">{copy.content}</SelectItem><SelectItem value="designer">{copy.designer}</SelectItem><SelectItem value="responsible">{copy.responsible}</SelectItem></SelectContent>
                </Select>
                <label className="flex items-center gap-2 text-xs"><Checkbox checked={publish} onCheckedChange={value => setPublish(value === true)} disabled={busy} />{copy.publish}</label>
                <Button size="sm" type="submit" disabled={busy || !email.trim()}>{copy.create}</Button>
            </div>
        </form>
        {link && <div className="space-y-2">
            <Input type="password" autoComplete="new-password" aria-label={copy.copy} readOnly value={link} onFocus={event => event.target.select()} />
            <Button size="xs" variant="outline" onClick={() => { void navigator.clipboard.writeText(link).then(() => setCopied(true)).catch(() => setError(copy.failed)); }}>{copied ? copy.copied : copy.copy}</Button>
            <p className="text-foreground-secondary text-xs">{copy.linkHelp}</p>
        </div>}
        {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
        {!!invitations?.length && <div className="space-y-2"><h4 className="text-xs font-medium">{copy.pending}</h4>
            {invitations.map(invitation => <div key={invitation.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate">{invitation.email}</span><Button size="xs" variant="ghost" disabled={busy} onClick={() => { void perform(async () => { await revoke({ ...scope, invitationId: invitation.id }); setLink(''); }); }}>{copy.revoke}</Button>
            </div>)}
        </div>}
    </section>;
}
