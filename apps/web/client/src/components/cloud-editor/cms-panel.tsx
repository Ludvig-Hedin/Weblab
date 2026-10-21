'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from 'convex/react';
import { Button } from '@weblab/ui/button';
import { Input } from '@weblab/ui/input';
import { Textarea } from '@weblab/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import type { CloudEditorScope } from '@/lib/cloud-editor/api';
import { acknowledgeJournalDraft } from '@/lib/cloud-editor/journal-state';
import type { JournalItem } from '@convex/lib/cloudStudioContent';
import { cloudStudioApi, useCloudStudioCopy, listJournalDrafts, writeJournalDraft, clearJournalDraft, journalDraftEntries, dismissJournalDraftEntry,
    type CloudJournalDraft, type CloudStudioOnOperation, type JournalOperation } from './studio-api';

type Draft = CloudJournalDraft;
export interface CloudStudioCmsPanelProps {
    scope: CloudEditorScope; disabled?: boolean; onOperation: CloudStudioOnOperation;
    onDirtyChange?: (dirty: boolean) => void;
    onOpenPage?: (path: string) => void;
}
/** Field drafts remain pinned to their opened item revision and approval generation. */
export function CloudStudioCmsPanel({ scope, disabled = false, onOperation, onDirtyChange, onOpenPage }: CloudStudioCmsPanelProps) {
    const copy = useCloudStudioCopy();
    const data = useQuery(cloudStudioApi.journal, scope);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [discardTarget, setDiscardTarget] = useState<{ item: JournalItem | null; recoveryEntries?: Array<{ key: string; raw: string }> } | null>(null);
    const [archived, setArchived] = useState(false);
    const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
    const [restoredScope, setRestoredScope] = useState<string | null>(null);
    const [recoveryBlocked, setRecoveryBlocked] = useState(false);
    const [storageFailed, setStorageFailed] = useState(false);
    const [recoveryCopies, setRecoveryCopies] = useState<Draft[]>([]);
    const [writerId] = useState(() => crypto.randomUUID());
    const activeScope = data ? JSON.stringify([scope.projectId, scope.branchId, data.actorId]) : null;
    const mounted = useRef({ draft, activeScope });
    mounted.current = { draft, activeScope };
    useEffect(() => {
        if (!data || !activeScope || restoredScope === activeScope) return;
        setRestoredScope(activeScope); setRecoveryBlocked(false); setStorageFailed(false);
        setDiscardTarget(null);
        setDraft(null);
        try {
            const copies = listJournalDrafts(window.localStorage, scope, data.actorId);
            setRecoveryCopies(copies); setDraft(copies.length === 1 ? copies[0]! : null);
        }
        catch { setFailed(true); setRecoveryBlocked(true); }
    }, [activeScope, data, scope, restoredScope]);
    const dirty = draft !== null && (draft.item.revision === 0 || JSON.stringify(draft.item) !== JSON.stringify(draft.original));
    useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
    useEffect(() => {
        if (!dirty) return;
        const preserve = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', preserve);
        return () => window.removeEventListener('beforeunload', preserve);
    }, [dirty]);
    const open = (item: JournalItem | null) => {
        if (!data?.studio) return;
        setFailed(false);
        const next: Draft | null = item ? { version: 1, projectId: scope.projectId, branchId: scope.branchId,
            writerId, changeId: crypto.randomUUID(), updatedAt: Date.now(), ancestors: [],
            item: structuredClone(item), original: structuredClone(item), actorId: data.actorId, generation: data.studio.settings.generation } : null;
        if (next?.item.revision === 0) {
            try { writeJournalDraft(window.localStorage, next); }
            catch { setFailed(true); setStorageFailed(true); return; }
        }
        setDraft(next);
        setDiscardTarget(null);
    };
    const choose = (item: JournalItem | null) => { if (dirty) setDiscardTarget({ item }); else open(item); };
    const conflict = !!draft && (!data || draft.projectId !== scope.projectId || draft.branchId !== scope.branchId || draft.actorId !== data.actorId || draft.generation !== data.studio?.settings.generation ||
        !data.studio.settings.active || (draft.item.revision > 0 && data.studio.items.find(item => item.key === draft.item.key)?.revision !== draft.original.revision));
    const locked = disabled || busy || recoveryBlocked || conflict || !data?.studio?.settings.active;
    const run = async (operation: JournalOperation) => {
        if (!data?.studio || locked || !draft) return;
        const submitted = draft;
        const stillSubmitted = () => mounted.current.draft === submitted && mounted.current.activeScope === activeScope;
        setBusy(true); setFailed(false);
        try {
            await onOperation({ kind: 'journal', actorId: data.actorId, expectedRevision: data.revision,
                expectedGeneration: draft.generation, operation });
            try { clearJournalDraft(window.localStorage, submitted); } catch { if (stillSubmitted()) setFailed(true); }
            if (stillSubmitted()) {
                setDraft(current => acknowledgeJournalDraft(current, submitted, mounted.current.activeScope));
                try { setRecoveryCopies(listJournalDrafts(window.localStorage, submitted, submitted.actorId)); }
                catch { setFailed(true); setRecoveryBlocked(true); }
            }
        }
        catch { if (stillSubmitted()) setFailed(true); }
        finally { setBusy(false); }
    };
    const persist = (next: Draft) => {
        // Persist in the input event, before a route transition can unmount React.
        const owned: Draft = { ...next, writerId, changeId: crypto.randomUUID(), updatedAt: Date.now(),
            ancestors: next.writerId === writerId ? next.ancestors : [...next.ancestors, { writerId: next.writerId, changeId: next.changeId }] };
        try { writeJournalDraft(window.localStorage, owned); }
        catch { setFailed(true); setStorageFailed(true); return; }
        setStorageFailed(false); setDraft(owned);
    };
    const update = (patch: Partial<JournalItem>) => { if (draft) persist({ ...draft, item: { ...draft.item, ...patch } }); };
    const updateValues = (patch: Partial<JournalItem['values']>) => { if (draft) persist({ ...draft, item: { ...draft.item, values: { ...draft.item.values, ...patch } } }); };
    const discard = () => {
        if (!discardTarget) return;
        try {
            if (recoveryBlocked && data) {
                for (const entry of discardTarget.recoveryEntries ?? []) {
                    dismissJournalDraftEntry(window.localStorage, entry);
                }
                setRecoveryBlocked(false);
            }
            else if (draft) clearJournalDraft(window.localStorage, draft);
            if (data) setRecoveryCopies(listJournalDrafts(window.localStorage, scope, data.actorId));
        }
        catch { setFailed(true); return; }
        open(discardTarget.item);
    };
    const download = () => {
        let content: string | null = draft ? JSON.stringify(draft.item, null, 2) : null;
        try { if (!content && data) content = JSON.stringify(journalDraftEntries(window.localStorage, scope, data.actorId), null, 2); }
        catch { setFailed(true); return; }
        if (!content) return;
        const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = `journal-${draft?.item.slug || 'draft'}.json`; link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    if (!data || restoredScope !== activeScope || (draft && (draft.actorId !== data.actorId || draft.projectId !== scope.projectId || draft.branchId !== scope.branchId)))
        return <p className="p-3 text-xs text-foreground-secondary">{copy.loading}</p>;
    if (!data.studio && !draft) return <p className="p-3 text-xs text-foreground-secondary">{copy.notConfigured}</p>;
    const item = draft?.item;
    const visible = data.studio?.items.filter(entry => entry.archived === archived) ?? [];
    return <section className="space-y-4 p-3" aria-label={copy.journal}>
        <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-medium">{copy.journal}</h3>
            <Button size="sm" disabled={disabled || busy || recoveryBlocked || !data.studio?.settings.active} onClick={() => choose({ key: crypto.randomUUID().replace(/-/g, ''), slug: '', revision: 0, status: 'draft', archived: false,
                values: { title: '', excerpt: '', body: '' } })}>{copy.newItem}</Button>
        </div>
        {onOpenPage && <Button size="sm" variant="ghost" disabled={busy || dirty} onClick={() => onOpenPage(item && item.revision > 0 && !item.archived ? `/journal/${draft!.original.slug}` : '/journal')}>{copy.openJournal}</Button>}
        {failed && <p role="alert" className="text-xs text-destructive">{copy.error}</p>}
        {storageFailed && <p role="alert" className="text-xs text-destructive">{copy.storageFailed}</p>}
        {dirty && !storageFailed && <p className="text-xs text-foreground-secondary">{copy.recoverySaved}</p>}
        {busy && <p role="status" className="text-xs text-foreground-secondary">{copy.working}</p>}
        {conflict && !busy && <p role="alert" className="text-xs text-destructive">{copy.draftConflict}</p>}
        {recoveryBlocked && <div className="flex gap-2"><Button size="sm" variant="ghost" onClick={download}>{copy.downloadDraft}</Button><Button size="sm" variant="ghost" onClick={() => {
            try { setDiscardTarget({ item: null, recoveryEntries: journalDraftEntries(window.localStorage, scope, data.actorId) }); }
            catch { setFailed(true); }
        }}>{copy.discardRecoveries}</Button></div>}
        {recoveryCopies.filter(saved => saved.writerId !== draft?.writerId).length > 0 && <div className="space-y-2 border-y py-3">
            <p className="text-xs text-foreground-secondary">{copy.savedDrafts}</p>
            {recoveryCopies.filter(saved => saved.writerId !== draft?.writerId).map(saved => <Button key={saved.writerId} size="sm" variant="ghost" disabled={busy || dirty} onClick={() => {
                setDraft(saved); setFailed(false); setStorageFailed(false);
            }}>{saved.item.values.title || saved.item.slug || copy.newTitle} · {new Date(saved.updatedAt).toLocaleString()}</Button>)}
        </div>}
        {discardTarget && <div className="space-y-2 border-y py-3 text-xs"><p>{discardTarget.recoveryEntries ? copy.discardRecoveriesQuestion : copy.discardQuestion}</p><div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={discard}>{copy.discard}</Button>
            <Button size="sm" variant="ghost" onClick={() => setDiscardTarget(null)}>{copy.keepEditing}</Button>
        </div></div>}
        <div className="flex gap-2"><Button size="xs" variant={!archived ? 'secondary' : 'ghost'} onClick={() => setArchived(false)}>{copy.active}</Button>
            <Button size="xs" variant={archived ? 'secondary' : 'ghost'} onClick={() => setArchived(true)}>{copy.archived}</Button></div>
        {!visible.length && <p className="text-xs text-foreground-secondary">{copy.emptyJournal}</p>}
        <ul className="divide-y">{visible.map(entry => <li key={entry.key}><button type="button" disabled={busy || recoveryBlocked} className="flex w-full items-center justify-between gap-3 py-2 text-left text-sm" onClick={() => choose(entry)}>
            <span className="truncate">{entry.values.title}</span><span className="text-xs text-foreground-secondary">{entry.archived ? copy.archived : entry.status === 'ready' ? copy.ready : copy.draft}</span>
        </button></li>)}</ul>
        {draft && item && <form className="space-y-3 border-t pt-4" onSubmit={event => {
            event.preventDefault();
            void run(item.archived ? { kind: 'restore', key: item.key, expectedItemRevision: draft.original.revision, values: item.values }
                : { kind: 'save', key: item.key, expectedItemRevision: draft.original.revision, slug: item.slug, values: item.values, status: 'draft' });
        }}>
            <label className="block space-y-1 text-xs"><span>{copy.title}</span><Input required maxLength={160} disabled={locked} value={item.values.title} onChange={event => updateValues({ title: event.target.value })} /></label>
            <label className="block space-y-1 text-xs"><span>{copy.slug}</span><Input required maxLength={64} pattern="[a-z0-9]+(-[a-z0-9]+)*" disabled={locked || item.archived} value={item.slug} onChange={event => update({ slug: event.target.value })} /></label>
            <label className="block space-y-1 text-xs"><span>{copy.excerpt}</span><Textarea rows={2} maxLength={500} disabled={locked} value={item.values.excerpt} onChange={event => updateValues({ excerpt: event.target.value })} /></label>
            <label className="block space-y-1 text-xs"><span>{copy.body}</span><Textarea rows={8} maxLength={30_000} disabled={locked} value={item.values.body} onChange={event => updateValues({ body: event.target.value })} /></label>
            <Select disabled={locked} value={item.values.cover?.path ?? '__none'} onValueChange={path => updateValues({ cover: path === '__none' ? undefined : { path, alt: item.values.cover?.alt ?? '' } })}>
                <SelectTrigger aria-label={copy.cover}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none">{copy.noCover}</SelectItem>
                    {data.assets.map(path => <SelectItem key={path} value={path}>{path.split('/').pop()}</SelectItem>)}
                    {item.values.cover && !data.assets.includes(item.values.cover.path) && <SelectItem value={item.values.cover.path} disabled>{item.values.cover.path.split('/').pop()}</SelectItem>}
                </SelectContent></Select>
            {item.values.cover && <label className="block space-y-1 text-xs"><span>{copy.alt}</span><Input maxLength={500} disabled={locked} value={item.values.cover.alt} onChange={event => updateValues({ cover: { path: item.values.cover!.path, alt: event.target.value } })} /></label>}
            <div className="flex flex-wrap gap-2">
                {item.archived ? <Button size="sm" type="button" disabled={locked} onClick={() => void run({ kind: 'restore', key: item.key, expectedItemRevision: draft.original.revision, values: item.values })}>{copy.restore}</Button> : <>
                    <Button size="sm" type="submit" disabled={locked}>{copy.saveDraft}</Button>
                    <Button size="sm" type="button" variant="secondary" disabled={locked || !item.values.title.trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug)} onClick={() => void run({ kind: 'save', key: item.key, expectedItemRevision: draft.original.revision,
                        slug: item.slug, values: item.values, status: 'ready' })}>{copy.markReady}</Button>
                    {item.revision > 0 && <Button size="sm" type="button" variant="ghost" title={dirty ? copy.savedFirst : copy.archiveHelp} disabled={locked || dirty} onClick={() => void run({ kind: 'archive', key: item.key, expectedItemRevision: draft.original.revision })}>{copy.archive}</Button>}
                </>}
                <Button size="sm" type="button" variant="ghost" disabled={busy} onClick={() => choose(null)}>{copy.close}</Button>
                {(dirty || conflict || failed) && <Button size="sm" type="button" variant="ghost" onClick={download}>{copy.downloadDraft}</Button>}
            </div>
            <p className="text-xs text-foreground-secondary">{copy.readyHelp}</p>
        </form>}
    </section>;
}
