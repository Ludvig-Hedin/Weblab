'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useConvex, useConvexConnectionState } from 'convex/react';
import { Button } from '@weblab/ui/button';
import { Input } from '@weblab/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import { Textarea } from '@weblab/ui/textarea';
import { applyBlogOperations, blogEditableTextKeys, BLOG_TEXT_STYLES, newBlogDocument, parseBlogDocument, type BlogOperation, type BlogSummary } from '@convex/lib/sanityBlogContract';
import type { Id } from '@convex/_generated/dataModel';
import { sanityBlogApi, type BlogConnection, type BlogConnectionScope, type BlogDraft, type BlogDraftSummary } from '@/lib/sanity-blog-api';
import { acceptBlogRecoveryEdit, appendBlogOperation, blogOperationsAfterSave, listBlogRecovery, removeBlogRecovery, sameBlogRecoveryScope, writeBlogRecovery,
    listBlogCreateRecovery, previewBlogOperations, removeBlogCreateRecovery, sameBlogCreateScope, validateBlogRecovery, writeBlogCreateRecovery,
    type BlogCreateCheckpoint, type BlogCreateScope, type BlogRecoveryCheckpoint, type BlogRecoveryScope } from '@/lib/sanity-blog-recovery';
import { useWorkingLevel } from '@/components/working-level/provider';
import { useWorkingLevelActive, useWorkingLevelLifecycle } from '@/components/working-level/editor-gate';
import { NativeContentPreparation } from './native-preparation';

interface Session {
    scope: BlogRecoveryScope;
    draft: BlogDraft;
    documentJson: string;
    operations: BlogOperation[];
    writerId: string;
    checkpoint: BlogRecoveryCheckpoint | null;
    saveIntent?: BlogRecoveryCheckpoint['saveIntent'];
}
type Notice = 'unavailable' | 'loadFailed' | 'saveFailed' | 'createFailed' | 'invalid' | 'editRefused' | 'recoveryInvalid' | 'storageFailed' | 'saved' | 'conflict' | 'permission' | null;
function record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function string(value: unknown): string { return typeof value === 'string' ? value : ''; }
function records(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.map(record).filter((item): item is Record<string, unknown> => item !== null) : []; }
function hasUniqueKeys(items: Record<string, unknown>[]): boolean {
    return items.every((item) => typeof item._key === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(item._key)) && new Set(items.map((item) => item._key)).size === items.length;
}
function checkpointFor(session: Session): BlogRecoveryCheckpoint {
    return { ...session.scope, version: 1, writerId: session.writerId, token: crypto.randomUUID(), draftRevision: session.draft.revision,
        providerRevision: session.draft.providerRevision, operationsJson: JSON.stringify(session.operations), documentJson: session.documentJson, updatedAt: Date.now(),
        ...(session.saveIntent ? { saveIntent: session.saveIntent } : {}) };
}
function failureNotice(error: unknown, fallback: Notice = 'saveFailed'): Notice {
    const message = error instanceof Error ? error.message : '';
    return /CONFLICT|revision|stale/i.test(message) ? 'conflict' : /FORBIDDEN|UNAUTHORIZED|permission|capability/i.test(message) ? 'permission' : fallback;
}

export interface SanityBlogWorkspaceProps {
    projectId: string;
    branchId: string;
    onClose?: () => void;
    prepareCloseRef?: MutableRefObject<(() => boolean) | null>;
}

export function SanityBlogWorkspace({ projectId, branchId, onClose, prepareCloseRef }: SanityBlogWorkspaceProps) {
    const t = useTranslations('sanityBlog');
    const { userId, level } = useWorkingLevel();
    const lifecycle = useWorkingLevelLifecycle();
    const active = useWorkingLevelActive();
    const [openStyle, setOpenStyle] = useState<{ writerId: string; blockKey: string } | null>(null);
    useEffect(() => { if (!active) setOpenStyle(null); }, [active]);
    const client = useConvex();
    const { isWebSocketConnected: connected } = useConvexConnectionState();
    const scopeKey = JSON.stringify([userId, projectId, branchId]);
    const scopeRef = useRef(scopeKey);
    scopeRef.current = scopeKey;
    const [displayedScope, setDisplayedScope] = useState(scopeKey);
    const mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const [connection, setConnection] = useState<BlogConnection | null | undefined>(undefined);
    const connectionRef = useRef<BlogConnection | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const sessionRef = useRef<Session | null>(null);
    const [published, setPublished] = useState<BlogSummary[]>([]);
    const [publishedCursor, setPublishedCursor] = useState<string | null>(null);
    const [drafts, setDrafts] = useState<BlogDraftSummary[]>([]);
    const [draftCursor, setDraftCursor] = useState<string | null>(null);
    const [recoveries, setRecoveries] = useState<BlogRecoveryCheckpoint[]>([]);
    const [notice, setNotice] = useState<Notice>(null);
    const [unavailable, setUnavailable] = useState(false);
    const [busy, setBusy] = useState(false);
    const [saving, setSaving] = useState(false);
    const [retry, setRetry] = useState(0);
    const request = useRef(0);
    const [sanityProjectId, setSanityProjectId] = useState('');
    const [dataset, setDataset] = useState('production');
    const [newPost, setNewPost] = useState<BlogCreateCheckpoint | null>(null);
    const newPostRef = useRef<BlogCreateCheckpoint | null>(null);
    const [createRecoveries, setCreateRecoveries] = useState<BlogCreateCheckpoint[]>([]);
    const putNewPost = useCallback((next: BlogCreateCheckpoint | null) => { newPostRef.current = next; setNewPost(next); }, []);

    const putSession = useCallback((next: Session | null) => { sessionRef.current = next; setSession(next); }, []);
    const checkpoint = useCallback((): boolean => {
        const current = sessionRef.current;
        try {
            const create = newPostRef.current;
            if (create && !writeBlogCreateRecovery(window.localStorage, create, create.token)) { setNotice('storageFailed'); return false; }
            if (!current?.operations.length) return true;
            const captured = current.checkpoint;
            if (captured && writeBlogRecovery(window.localStorage, captured, captured.token)) return true;
        } catch { /* Preserve the accepted state and refuse teardown. */ }
        setNotice('storageFailed');
        return false;
    }, []);
    useEffect(() => {
        if (prepareCloseRef) prepareCloseRef.current = checkpoint;
        return () => { if (prepareCloseRef) prepareCloseRef.current = null; };
    }, [checkpoint, prepareCloseRef]);
    useEffect(() => lifecycle?.prepare(async () => {
        if (!checkpoint()) throw new Error('Blog draft recovery unavailable');
    }), [lifecycle, checkpoint]);
    useEffect(() => {
        const beforeUnload = (event: BeforeUnloadEvent) => {
            if (!checkpoint()) { event.preventDefault(); event.returnValue = ''; }
        };
        window.addEventListener('beforeunload', beforeUnload);
        return () => window.removeEventListener('beforeunload', beforeUnload);
    }, [checkpoint]);

    function connectionScope(value: BlogConnection): BlogConnectionScope {
        return { projectId: projectId as Id<'projects'>, branchId: branchId as Id<'branches'>, connectionId: value.id, connectionRevision: value.revision };
    }
    function pin(value: BlogConnection) {
        const key = scopeKey;
        return () => mounted.current && scopeRef.current === key && connectionRef.current?.id === value.id && connectionRef.current.revision === value.revision;
    }
    function creationScope(value: BlogConnection): BlogCreateScope | null {
        return userId ? { ownerId: userId, projectId, branchId, connectionId: value.id, connectionRevision: value.revision } : null;
    }
    function refreshCreateRecovery(value: BlogConnection) {
        const scope = creationScope(value);
        if (!scope) return;
        try { setCreateRecoveries(listBlogCreateRecovery(window.localStorage, scope)); }
        catch { setNotice('storageFailed'); }
    }
    async function loadPages(value: BlogConnection, more: 'published' | 'drafts' | null = null) {
        const current = pin(value);
        const result = await Promise.allSettled([
            more === 'drafts' ? Promise.resolve(null) : client.action(sanityBlogApi.list, { ...connectionScope(value), ...(more === 'published' && publishedCursor ? { cursor: publishedCursor } : {}) }),
            more === 'published' ? Promise.resolve(null) : client.query(sanityBlogApi.drafts, { ...connectionScope(value), ...(more === 'drafts' && draftCursor ? { cursor: draftCursor } : {}) }),
        ]);
        if (!current()) return;
        const publishedResult = result[0]!; const draftResult = result[1]!;
        if (publishedResult.status === 'fulfilled' && publishedResult.value) {
            const page = publishedResult.value;
            setPublished((previous) => more === 'published' ? [...previous, ...page.items.filter((item) => !previous.some((prior) => prior.documentId === item.documentId))] : page.items);
            setPublishedCursor(page.cursor);
        }
        if (draftResult.status === 'fulfilled' && draftResult.value) {
            const page = draftResult.value;
            setDrafts((previous) => more === 'drafts' ? [...previous, ...page.items.filter((item) => !previous.some((prior) => prior.id === item.id))] : page.items);
            setDraftCursor(page.cursor);
        }
        if (result.some((item) => item.status === 'rejected')) setNotice('loadFailed');
    }
    useEffect(() => {
        const key = scopeKey;
        if (!checkpoint()) return;
        setDisplayedScope(key);
        request.current++;
        putSession(null); setRecoveries([]); putNewPost(null); setCreateRecoveries([]); setPublished([]); setDrafts([]);
        connectionRef.current = null; setConnection(undefined); setUnavailable(false); setNotice(null); setBusy(false); setSaving(false);
        if (!userId) return;
        void client.query(sanityBlogApi.connection, { projectId: projectId as Id<'projects'>, branchId: branchId as Id<'branches'> }).then((value) => {
            if (!mounted.current || scopeRef.current !== key) return;
            connectionRef.current = value; setConnection(value);
            if (value) { refreshCreateRecovery(value); void loadPages(value); }
        }, () => {
            if (!mounted.current || scopeRef.current !== key) return;
            setUnavailable(true); setNotice('unavailable');
        });
        // Query refreshes update lists only. They never overwrite an edited document.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scopeKey, retry, client, checkpoint, putSession, putNewPost]);

    const owned = session?.scope.ownerId === userId && session.scope.projectId === projectId && session.scope.branchId === branchId
        && session.scope.connectionId === connection?.id && session.scope.connectionRevision === connection.revision ? session : null;
    const dirty = !!owned?.operations.length;
    const editableDocumentJson = owned?.documentJson;
    const editableTextKeys = useMemo(() => editableDocumentJson ? blogEditableTextKeys(record(JSON.parse(editableDocumentJson)) ?? {}) : new Set<string>(), [editableDocumentJson]);

    function installDraft(draft: BlogDraft, value: BlogConnection) {
        if (!userId) return;
        parseBlogDocument(draft.documentJson);
        const scope: BlogRecoveryScope = { ownerId: userId, projectId, branchId, connectionId: value.id, connectionRevision: value.revision, documentId: draft.documentId, draftId: draft.id };
        const next: Session = { scope, draft, documentJson: draft.documentJson, operations: [], writerId: crypto.randomUUID(), checkpoint: null };
        putSession(next); setOpenStyle(null); putNewPost(null); setNotice(null); refreshCreateRecovery(value);
        try { setRecoveries(listBlogRecovery(window.localStorage, scope, draft.revision, draft.providerRevision, draft.documentJson)); }
        catch { setRecoveries([]); setNotice('storageFailed'); }
    }
    async function openDocument(documentId: string) {
        if (!connection || !userId || busy || saving || !checkpoint()) return;
        const value = connection; const current = pin(value); const token = ++request.current;
        setBusy(true); setNotice(null);
        try {
            const draft = await client.action(sanityBlogApi.open, { ...connectionScope(value), documentId });
            if (!current() || token !== request.current || !checkpoint()) return;
            const latest = sessionRef.current;
            if (latest?.operations.length && latest.draft.documentId === documentId) {
                if (latest.saveIntent) mergeSavedReceipt(latest, JSON.parse(latest.saveIntent.operationsJson) as BlogOperation[], draft);
                else if (draft.revision !== latest.draft.revision || draft.providerRevision !== latest.draft.providerRevision) setNotice('conflict');
                return;
            }
            installDraft(draft, value);
            void loadPages(value, 'drafts');
        } catch (error) { if (current() && token === request.current) setNotice(failureNotice(error, 'loadFailed')); }
        finally { if (current() && token === request.current) setBusy(false); }
    }
    async function connect() {
        if (!userId || busy || connection || unavailable) return;
        const key = scopeKey; setBusy(true); setNotice(null);
        try {
            const value = await client.action(sanityBlogApi.connect, { projectId: projectId as Id<'projects'>, branchId: branchId as Id<'branches'>, sanityProjectId, dataset });
            if (!mounted.current || scopeRef.current !== key) return;
            connectionRef.current = value; setConnection(value); refreshCreateRecovery(value); void loadPages(value);
        } catch { if (mounted.current && scopeRef.current === key) setNotice('loadFailed'); }
        finally { if (mounted.current && scopeRef.current === key) setBusy(false); }
    }
    function startNewPost() {
        if (!connection || busy || saving || !checkpoint()) return;
        const scope = creationScope(connection);
        if (!scope) return;
        const next: BlogCreateCheckpoint = { ...scope, version: 1, writerId: crypto.randomUUID(), token: crypto.randomUUID(), operationId: crypto.randomUUID(),
            title: '', slug: '', publishedAt: new Date().toISOString().slice(0, 10), updatedAt: Date.now() };
        if (!writeBlogCreateRecovery(window.localStorage, next, null)) { setNotice('storageFailed'); return; }
        putNewPost(next); setNotice(null);
    }
    function editNewPost(field: 'title' | 'slug' | 'publishedAt', value: string) {
        const current = newPostRef.current;
        const scope = connection ? creationScope(connection) : null;
        if (!current || !scope || !sameBlogCreateScope(current, scope) || current.submitted || busy) return;
        const next = { ...current, [field]: value, token: crypto.randomUUID(), updatedAt: Date.now() };
        if (!writeBlogCreateRecovery(window.localStorage, next, current.token)) { setNotice('storageFailed'); return; }
        putNewPost(next); setNotice(null);
    }
    function resumeNewPost(captured: BlogCreateCheckpoint) {
        const scope = connection ? creationScope(connection) : null;
        if (!scope || !sameBlogCreateScope(captured, scope) || busy || saving || !checkpoint()) return;
        const next = { ...captured, writerId: crypto.randomUUID(), token: crypto.randomUUID(), updatedAt: Date.now() };
        if (!writeBlogCreateRecovery(window.localStorage, next, null)) { setNotice('storageFailed'); return; }
        putNewPost(next); setNotice(null);
        // The chosen source is consumed only after a new durable writer copy exists.
        removeBlogCreateRecovery(window.localStorage, captured);
        if (connection) refreshCreateRecovery(connection);
    }
    async function createPost() {
        if (!connection || !newPost || busy || saving || !checkpoint()) return;
        const value = connection; const current = pin(value); let form = newPost; const token = ++request.current;
        try { newBlogDocument(`weblab-${form.operationId}`, form.title, form.slug, `${form.publishedAt}T00:00:00.000Z`); }
        catch { setNotice('invalid'); return; }
        if (!form.submitted) {
            const next = { ...form, token: crypto.randomUUID(), updatedAt: Date.now(), submitted: { title: form.title, slug: form.slug, publishedAt: form.publishedAt } };
            if (!writeBlogCreateRecovery(window.localStorage, next, form.token)) { setNotice('storageFailed'); return; }
            form = next; putNewPost(next);
        }
        setBusy(true); setNotice(null);
        try {
            const draft = await client.mutation(sanityBlogApi.create, { ...connectionScope(value), operationId: form.operationId,
                title: form.submitted!.title, slug: form.submitted!.slug, publishedAt: `${form.submitted!.publishedAt}T00:00:00.000Z` });
            if (!current() || token !== request.current || !checkpoint()) return;
            if (!removeBlogCreateRecovery(window.localStorage, form)) { setNotice('storageFailed'); return; }
            installDraft(draft, value); void loadPages(value, 'drafts');
        } catch (error) { if (current() && token === request.current) setNotice(failureNotice(error, 'createFailed')); }
        finally { if (current() && token === request.current) setBusy(false); }
    }
    function edit(operation: BlogOperation) {
        const current = sessionRef.current;
        if (!active || !owned || current !== owned || current.draft.archived || busy) return;
        let next: Session;
        try {
            const frozenPrefix = current.saveIntent ? (JSON.parse(current.saveIntent.operationsJson) as unknown[]).length : 0;
            const operations = appendBlogOperation(current.operations, operation, frozenPrefix);
            next = { ...current, documentJson: previewBlogOperations(current.draft.documentJson, operations), operations };
        } catch { setNotice('editRefused'); return; }
        try {
            const accepted = acceptBlogRecoveryEdit(window.localStorage, checkpointFor(next), current.checkpoint);
            if (!accepted) { setNotice('storageFailed'); return; }
            putSession({ ...next, checkpoint: accepted }); setNotice(null);
        } catch { setNotice('storageFailed'); }
    }
    function recover(captured: BlogRecoveryCheckpoint) {
        if (!active || !owned || dirty || busy || saving || !sameBlogRecoveryScope(owned.scope, captured) ||
            captured.draftRevision !== owned.draft.revision || captured.providerRevision !== owned.draft.providerRevision) return;
        const recovered = validateBlogRecovery(owned.draft.documentJson, captured);
        if (!recovered) { setNotice('recoveryInvalid'); return; }
        try {
            const next: Session = { ...owned, ...recovered };
            const accepted = acceptBlogRecoveryEdit(window.localStorage, checkpointFor(next), null);
            if (!accepted) { setNotice('storageFailed'); return; }
            putSession({ ...next, checkpoint: accepted }); setRecoveries([]); setNotice(null);
        } catch { setNotice('storageFailed'); }
    }
    function mergeSavedReceipt(captured: Session, sentOperations: BlogOperation[], receipt: BlogDraft): boolean {
        const latest = sessionRef.current;
        if (!latest || latest.writerId !== captured.writerId || !sameBlogRecoveryScope(latest.scope, captured.scope) ||
            receipt.id !== captured.draft.id || receipt.documentId !== captured.draft.documentId ||
            receipt.providerRevision !== captured.draft.providerRevision || receipt.revision !== captured.draft.revision + 1 ||
            receipt.documentJson !== captured.saveIntent?.documentJson) { setNotice('conflict'); return false; }
        const remaining = blogOperationsAfterSave(latest.operations, sentOperations);
        if (!remaining) { setNotice('conflict'); return false; }
        try {
            const next: Session = { ...latest, draft: receipt, documentJson: remaining.length ? previewBlogOperations(receipt.documentJson, remaining) : receipt.documentJson,
                operations: remaining, saveIntent: undefined };
            if (remaining.length) {
                const accepted = acceptBlogRecoveryEdit(window.localStorage, checkpointFor(next), latest.checkpoint);
                if (!accepted) { setNotice('storageFailed'); return false; }
                next.checkpoint = accepted;
            } else {
                if (captured.checkpoint && !removeBlogRecovery(window.localStorage, captured.checkpoint)) { setNotice('storageFailed'); return false; }
                next.checkpoint = null;
            }
            putSession(next); setNotice(remaining.length ? null : 'saved');
            return true;
        } catch { setNotice('storageFailed'); return false; }
    }
    async function saveDraft() {
        if (!connection || !owned || !dirty || saving || busy || !connected || !checkpoint()) return;
        let captured = owned; const value = connection; const current = pin(value);
        const sentOperations = captured.saveIntent ? JSON.parse(captured.saveIntent.operationsJson) as BlogOperation[] : captured.operations;
        let savedJson: string;
        try { savedJson = applyBlogOperations(captured.draft.documentJson, JSON.stringify(sentOperations)); }
        catch { setNotice('invalid'); return; }
        if (!captured.saveIntent) {
            try {
                const next = { ...captured, saveIntent: { operationsJson: JSON.stringify(sentOperations), documentJson: savedJson } };
                const accepted = acceptBlogRecoveryEdit(window.localStorage, checkpointFor(next), captured.checkpoint);
                if (!accepted) { setNotice('storageFailed'); return; }
                captured = { ...next, checkpoint: accepted };
                putSession(captured);
            } catch { setNotice('storageFailed'); return; }
        }
        setSaving(true); setNotice(null);
        try {
            const receipt = await client.mutation(sanityBlogApi.save, { ...connectionScope(value), draftId: captured.draft.id,
                expectedRevision: captured.draft.revision, providerRevision: captured.draft.providerRevision, operationsJson: JSON.stringify(sentOperations) });
            if (!current()) return;
            if (mergeSavedReceipt(captured, sentOperations, receipt)) void loadPages(value, 'drafts');
        } catch (error) {
            if (!current()) return;
            // Unknown outcomes retry the original prefix. They must never replace
            // its save intent with newer typing before the old result is known.
            try {
                const receipt = await client.action(sanityBlogApi.open, { ...connectionScope(value), documentId: captured.draft.documentId });
                if (!current()) return;
                if (receipt.revision === captured.draft.revision + 1 && receipt.documentJson === captured.saveIntent?.documentJson) {
                    if (mergeSavedReceipt(captured, sentOperations, receipt)) void loadPages(value, 'drafts');
                } else setNotice(failureNotice(error));
            } catch { if (current()) setNotice(failureNotice(error)); }
        }
        finally { if (current()) setSaving(false); }
    }
    async function archiveDraft() {
        if (!connection || !owned || dirty || busy || saving || !connected) return;
        const captured = owned; const value = connection; const current = pin(value);
        setBusy(true); setNotice(null);
        try {
            const receipt = await client.mutation(sanityBlogApi.archive, { ...connectionScope(value), draftId: captured.draft.id,
                expectedRevision: captured.draft.revision, providerRevision: captured.draft.providerRevision, archived: !captured.draft.archived });
            if (!current() || sessionRef.current !== captured || receipt.id !== captured.draft.id || receipt.documentId !== captured.draft.documentId) return;
            installDraft(receipt, value); void loadPages(value, 'drafts');
        } catch (error) { if (current()) setNotice(failureNotice(error)); }
        finally { if (current()) setBusy(false); }
    }

    const doc = owned ? record(JSON.parse(owned.documentJson)) : null;
    const editable = active && !!owned && !owned.draft.archived && !busy;
    const blocks = Array.isArray(doc?.content) ? doc.content.map((value) => record(value) ?? {}) : [];

    if (displayedScope !== scopeKey) return <p role="status" className="text-foreground-secondary p-5 text-sm">{t('loading')}</p>;

    return <section className="bg-background text-foreground flex min-h-[70vh] w-full flex-col" data-sanity-blog-workspace>
        <header className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
            <div><h1 className="text-base font-medium">{t('title')}</h1><p className="text-foreground-secondary text-xs">{t('draftOnly')}</p></div>
            <div className="flex items-center gap-2">
                {connection && level === 'content' && <NativeContentPreparation projectId={projectId} branchId={branchId} blocked={busy || saving || dirty || !!newPost || !connected} />}
                {connection && <Button variant="outline" disabled={busy || saving} onClick={startNewPost}>{t('newPost')}</Button>}
                {onClose && <Button variant="ghost" onClick={() => { if (checkpoint()) onClose(); }}>{t('close')}</Button>}
            </div>
        </header>
        {notice && <p role={notice === 'saved' ? 'status' : 'alert'} className="px-5 py-3 text-sm">{t(notice)}</p>}
        {!connected && <p role="status" className="text-foreground-secondary px-5 py-2 text-sm">{t('offline')}</p>}
        {unavailable ? <div className="p-5"><Button variant="outline" onClick={() => setRetry((value) => value + 1)}>{t('retry')}</Button></div>
            : connection === undefined ? <p className="text-foreground-secondary p-5 text-sm">{t('loading')}</p>
                : connection === null ? <form className="max-w-lg space-y-4 p-5" onSubmit={(event) => { event.preventDefault(); void connect(); }}>
                    <h2 className="text-sm font-medium">{t('connectTitle')}</h2><p className="text-foreground-secondary text-sm">{t('connectBody')}</p>
                    <Field label={t('sanityProjectId')}><Input value={sanityProjectId} onChange={(event) => setSanityProjectId(event.target.value)} required pattern="[a-z0-9]{1,32}" disabled={busy} /></Field>
                    <Field label={t('dataset')}><Input value={dataset} onChange={(event) => setDataset(event.target.value)} required pattern="[a-z0-9][a-z0-9_-]{0,63}" disabled={busy} /></Field>
                    <Button type="submit" disabled={busy || !connected || !userId}>{busy ? t('loading') : t('connect')}</Button>
                </form> : <div className="flex min-h-0 flex-1 flex-col md:flex-row">
                    <aside className="border-border w-full shrink-0 space-y-5 border-b p-5 md:w-64 md:border-r md:border-b-0">
                        <p className="text-foreground-secondary break-all text-xs">{connection.sanityProjectId} / {connection.dataset}</p>
                        {createRecoveries.filter((item) => item.writerId !== newPost?.writerId).map((captured) => <Button className="w-full justify-start" key={captured.writerId} variant="outline" disabled={busy || saving} onClick={() => resumeNewPost(captured)}>{t('resumeNewPost')}</Button>)}
                        <div><h2 className="mb-2 text-sm font-medium">{t('drafts')}</h2>
                            {drafts.length === 0 && <p className="text-foreground-secondary text-sm">{t('noDrafts')}</p>}
                            {drafts.map((draft) => <button key={draft.id} type="button" disabled={busy || saving} onClick={() => void openDocument(draft.documentId)} className="hover:bg-background-secondary block w-full rounded p-2 text-left text-sm disabled:opacity-50" aria-current={owned?.draft.id === draft.id ? 'page' : undefined}>
                                <span className="block truncate">{draft.title}</span><span className="text-foreground-secondary text-xs">{draft.archived ? t('archived') : t('draft')}</span>
                            </button>)}
                            {draftCursor && <Button variant="ghost" disabled={busy} onClick={() => void loadPages(connection, 'drafts')}>{t('moreDrafts')}</Button>}
                        </div>
                        <div><h2 className="mb-2 text-sm font-medium">{t('published')}</h2>
                            {published.length === 0 && <p className="text-foreground-secondary text-sm">{t('noPublished')}</p>}
                            {published.map((post) => <button key={post.documentId} type="button" disabled={busy || saving} onClick={() => void openDocument(post.documentId)} className="hover:bg-background-secondary block w-full rounded p-2 text-left text-sm disabled:opacity-50"><span className="block truncate">{post.title}</span><span className="text-foreground-secondary text-xs">{post.publishedAt.slice(0, 10)}</span></button>)}
                            {publishedCursor && <Button variant="ghost" disabled={busy} onClick={() => void loadPages(connection, 'published')}>{t('morePublished')}</Button>}
                        </div>
                        <Button variant="ghost" disabled={busy || saving} onClick={() => void loadPages(connection)}>{t('refreshList')}</Button>
                    </aside>
                    <main className="min-w-0 flex-1 p-5">
                        {newPost ? <form className="max-w-2xl space-y-4" onSubmit={(event) => { event.preventDefault(); void createPost(); }}>
                            <h2 className="text-base font-medium">{t('newPost')}</h2>
                            <Field label={t('postTitle')}><Input required value={newPost.title} disabled={busy || !!newPost.submitted} onChange={(event) => editNewPost('title', event.target.value)} /></Field>
                            <Field label={t('slug')}><Input required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={96} value={newPost.slug} disabled={busy || !!newPost.submitted} onChange={(event) => editNewPost('slug', event.target.value)} /></Field>
                            <Field label={t('publishedAt')}><Input required type="date" value={newPost.publishedAt} disabled={busy || !!newPost.submitted} onChange={(event) => editNewPost('publishedAt', event.target.value)} /></Field>
                            {newPost.submitted && <p className="text-foreground-secondary text-sm">{t('createPending')}</p>}
                            <div className="flex gap-2"><Button type="submit" disabled={busy || !connected}>{newPost.submitted ? t('retryCreate') : t('createDraft')}</Button><Button variant="ghost" type="button" disabled={busy} onClick={() => { if (checkpoint()) { putNewPost(null); refreshCreateRecovery(connection); } }}>{t('cancel')}</Button></div>
                        </form> : owned && doc ? <div className="max-w-3xl space-y-5">
                            <div className="flex flex-wrap items-center justify-between gap-3"><span role="status" className="text-foreground-secondary text-sm">{owned.draft.archived ? t('archivedLiveUntouched') : saving ? t('saving') : owned.saveIntent ? t('saveUnconfirmed') : dirty ? t('recoveredOnDevice') : t('draft')}</span>
                                <div className="flex gap-2"><Button variant="outline" disabled={busy || saving || dirty || !connected} onClick={() => void archiveDraft()}>{owned.draft.archived ? t('restoreDraft') : t('archiveDraft')}</Button><Button disabled={!dirty || saving || busy || !connected || owned.draft.archived} onClick={() => void saveDraft()}>{saving ? t('saving') : t('saveDraft')}</Button></div>
                            </div>
                            {!dirty && recoveries.length > 0 && <div className="space-y-2"><p className="text-sm">{t('recoveryFound')}</p>{recoveries.map((captured) => <div className="flex flex-wrap items-center gap-2" key={captured.writerId}><span className="text-foreground-secondary text-xs">{new Date(captured.updatedAt).toLocaleString()}</span><Button variant="outline" size="sm" disabled={busy || saving || owned.draft.archived} onClick={() => recover(captured)}>{t('recover')}</Button><Button variant="ghost" size="sm" onClick={() => { if (removeBlogRecovery(window.localStorage, captured)) setRecoveries((items) => items.filter((item) => item.token !== captured.token || item.writerId !== captured.writerId)); else setNotice('storageFailed'); }}>{t('discardRecovery')}</Button></div>)}</div>}
                            {(['title', 'slug', 'excerpt', 'publishedAt', 'author'] as const).map((field) => <Field key={field} label={t(field === 'title' ? 'postTitle' : field)}>
                                {field === 'excerpt' ? <Textarea value={string(doc[field])} maxLength={280} disabled={!editable} onChange={(event) => edit({ kind: 'set', field, value: event.target.value })} />
                                    : <Input type={field === 'publishedAt' ? 'date' : 'text'} maxLength={field === 'title' ? 10_000 : field === 'slug' ? 96 : field === 'author' ? 1000 : undefined} value={field === 'slug' ? string(record(doc.slug)?.current) : field === 'publishedAt' ? string(doc[field]).slice(0, 10) : string(doc[field])} disabled={!editable} onChange={(event) => edit({ kind: 'set', field, value: field === 'publishedAt' ? `${event.target.value}T00:00:00.000Z` : event.target.value })} />}
                            </Field>)}
                            <Field label={t('categories')}><Input value={Array.isArray(doc.categories) ? doc.categories.join(', ') : ''} disabled={!editable} onChange={(event) => edit({ kind: 'categories', value: event.target.value ? event.target.value.split(',').map((value) => value.trim()) : [] })} /><span className="text-foreground-secondary text-xs">{t('categoriesHelp')}</span></Field>
                            <div className="space-y-4"><h2 className="text-sm font-medium">{t('content')}</h2>{blocks.map((block, index) => {
                                const blockKey = string(block._key); const supported = block._type === 'block' && editableTextKeys.has(blockKey);
                                if (supported) return <div key={`${blockKey}:${index}`} className="space-y-3">
                                    <Select value={string(block.style) || 'normal'} disabled={!editable}
                                        open={active && openStyle?.writerId === owned.writerId && openStyle.blockKey === blockKey}
                                        onOpenChange={(open) => setOpenStyle(open && active ? { writerId: owned.writerId, blockKey } : null)} onValueChange={(style) => {
                                        if (BLOG_TEXT_STYLES.some((value) => value === style)) edit({ kind: 'blockStyle', blockKey, style: style as typeof BLOG_TEXT_STYLES[number] });
                                    }}><SelectTrigger className="w-48" size="sm" aria-label={t('blockStyle', { block: index + 1 })}><SelectValue /></SelectTrigger><SelectContent>{BLOG_TEXT_STYLES.map((style) => <SelectItem key={style} value={style}>{t(`style_${style}`)}</SelectItem>)}</SelectContent></Select>
                                    {records(block.children).map((span, spanIndex) => <div key={string(span._key)} className="space-y-1.5">
                                        <Field label={t('textSpan', { block: index + 1, span: spanIndex + 1 })}><Textarea value={string(span.text)} maxLength={10_000} disabled={!editable} onChange={(event) => edit({ kind: 'span', blockKey, spanKey: string(span._key), text: event.target.value })} /></Field>
                                        <div className="flex gap-1">{(['strong', 'em'] as const).map((decorator) => {
                                            const pressed = Array.isArray(span.marks) && span.marks.includes(decorator);
                                            const reserved = records(block.markDefs).some((mark) => mark._key === 'strong' || mark._key === 'em');
                                            return <Button key={decorator} type="button" size="sm" variant={pressed ? 'secondary' : 'ghost'} aria-pressed={pressed}
                                                aria-label={t(decorator === 'strong' ? 'boldSpan' : 'italicSpan', { block: index + 1, span: spanIndex + 1 })} disabled={!editable || reserved}
                                                onClick={() => edit({ kind: 'decorator', blockKey, spanKey: string(span._key), decorator, enabled: !pressed })}>{t(decorator === 'strong' ? 'bold' : 'italic')}</Button>;
                                        })}</div>
                                    </div>)}
                                    {records(block.markDefs).filter((mark) => mark._type === 'link').map((mark) => <Field key={string(mark._key)} label={t('link')}><Input value={string(mark.href)} maxLength={4096} disabled={!editable} onChange={(event) => edit({ kind: 'link', blockKey, markKey: string(mark._key), href: event.target.value })} /></Field>)}
                                </div>;
                                if (block._type === 'image' && blockKey && hasUniqueKeys(blocks)) return <div key={`${blockKey}:${index}`} className="space-y-3"><p className="text-foreground-secondary text-xs">{t('existingImage', { block: index + 1 })}</p>{(['alt', 'caption'] as const).map((field) => <Field key={field} label={t(field)}><Input value={string(block[field])} maxLength={10_000} disabled={!editable} onChange={(event) => edit({ kind: 'imageText', blockKey, field, value: event.target.value })} /></Field>)}</div>;
                                return <div key={`${blockKey}:${index}`} className="text-foreground-secondary space-y-1 text-sm"><p>{t('readonlyBlock', { block: index + 1 })}</p><p className="whitespace-pre-wrap">{records(block.children).map((span) => string(span.text)).join('')}</p></div>;
                            })}{blocks.length === 0 && <p className="text-foreground-secondary text-sm">{t('emptyContent')}</p>}
                                <Button type="button" variant="outline" size="sm" disabled={!editable || (doc.content !== undefined && doc.content !== null && !hasUniqueKeys(blocks))} onClick={() => edit({ kind: 'appendText', blockKey: crypto.randomUUID(), spanKey: crypto.randomUUID() })}>{t('addParagraph')}</Button>
                            </div>
                            {!!(doc.heroImage || doc.seo) && <p className="text-foreground-secondary text-xs">{t('preservedFields')}</p>}
                        </div> : <p className="text-foreground-secondary text-sm">{busy ? t('loading') : t('selectPost')}</p>}
                    </main>
                </div>}
    </section>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return <label className="block space-y-1.5 text-sm"><span>{label}</span>{children}</label>;
}
