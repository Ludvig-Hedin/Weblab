'use client';

import { useEffect, useRef, useState } from 'react';
import { useConvex } from 'convex/react';
import { useTranslations } from 'next-intl';
import type { Id } from '@convex/_generated/dataModel';
import { Button } from '@weblab/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@weblab/ui/dialog';
import { useProjectCapabilities } from '@/hooks/use-project-capabilities';
import { useSafeClerkAuth } from '@/utils/auth/safe-clerk';
import { acquirePublishingRequest, cancelPublishing, releasePublishingRequest, requestPublishing, type PublishingAuth, type PublishingInputs, type PublishingMethod } from '@/lib/local-publishing';
import { sanityBlogApi, type BlogConnection } from '@/lib/sanity-blog-api';
import { contentStatusSchema, publicationDrafts, togglePublicationSelection, type ContentSelection, type ContentStatus, type PublicationDraft } from '@/lib/sanity-publication-selection';
import { useWorkingLevelActive } from '@/components/working-level/editor-gate';
import { SanityPublicationSelection } from './publication-selection';

/** Content mode can prepare a private copy without mounting the code editor. */
export function NativeContentPreparation({ projectId, branchId, blocked = false, dialog = true, beforePrepare, onBegin }: {
    projectId: string; branchId: string; blocked?: boolean; dialog?: boolean;
    beforePrepare?(assertCurrent: () => void): Promise<void>;
    onBegin?(): void;
}) {
    const t = useTranslations('editor.publishing');
    const client = useConvex();
    const auth = useSafeClerkAuth();
    const { canPublish, isLoading } = useProjectCapabilities(projectId);
    const active = useWorkingLevelActive();
    const [native, setNative] = useState(false);
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [connection, setConnection] = useState<BlogConnection | null>(null);
    const [status, setStatus] = useState<ContentStatus | null>(null);
    const [rows, setRows] = useState<PublicationDraft[]>([]);
    const [cursor, setCursor] = useState<string | null>(null);
    const [selected, setSelected] = useState<ContentSelection[]>([]);
    const selectionChanged = useRef(false);
    const owner = useRef<symbol | null>(null);
    const generation = useRef(0);
    const mounted = useRef(true);
    const busyRef = useRef(false);
    const refreshNeeded = useRef(false);
    const userId = 'userId' in auth ? auth.userId : null;
    const scopeKey = `${projectId}:${branchId}:${userId}`;
    const previousScope = useRef(scopeKey);
    const visible = !dialog || open;
    const latest = useRef({ scopeKey, auth, canPublish, isLoading, active, visible, blocked, beforePrepare });
    latest.current = { scopeKey, auth, canPublish, isLoading, active, visible, blocked, beforePrepare };

    function invalidate() {
        if (owner.current) {
            void cancelPublishing(window.weblabNative?.publishing, () => { generation.current++; }).then(ok => {
                if (!ok && mounted.current) setError(t('cancelFailed'));
            });
        } else generation.current++;
    }

    useEffect(() => {
        mounted.current = true;
        setNative(!!window.weblabNative?.publishing);
        return () => { invalidate(); mounted.current = false; };
    }, []);
    useEffect(() => {
        if (previousScope.current !== scopeKey) { invalidate(); previousScope.current = scopeKey; }
        setOpen(false); setConnection(null); setStatus(null); setRows([]); setCursor(null); setSelected([]); setError(null);
        selectionChanged.current = false;
        refreshNeeded.current = !dialog;
    }, [scopeKey]);
    useEffect(() => { if (!active || !canPublish) invalidate(); }, [active, canPublish]);
    useEffect(() => { refreshNeeded.current = visible; }, [visible, scopeKey]);

    async function run(task: (request: <M extends PublishingMethod>(method: M, input: Omit<PublishingInputs[M], keyof PublishingAuth>) => Promise<unknown>, assertCurrent: () => void) => Promise<void>, editing = false) {
        if (busyRef.current) return;
        const lease = acquirePublishingRequest();
        if (!lease) { setError(t('working')); return; }
        owner.current = lease;
        busyRef.current = true; setBusy(true); setError(null);
        const captured = { projectId, branchId };
        const key = scopeKey; const epoch = generation.current;
        const assertCurrent = () => {
            const now = latest.current;
            if (!mounted.current || generation.current !== epoch || now.scopeKey !== key || !now.active || !now.visible ||
                !now.canPublish || now.isLoading || !now.auth.isSignedIn) throw new Error(t('scopeChanged'));
            if (editing && now.blocked) throw new Error(t('content.saveFirst'));
        };
        try {
            assertCurrent();
            const bridge = window.weblabNative?.publishing;
            if (!bridge) throw new Error(t('unavailable'));
            const request = <M extends PublishingMethod>(method: M, input: Omit<PublishingInputs[M], keyof PublishingAuth>) => requestPublishing(bridge, captured, method, input,
                async () => 'getToken' in latest.current.auth ? latest.current.auth.getToken() : null, assertCurrent);
            await task(request, assertCurrent);
        } catch (cause) {
            if (mounted.current && generation.current === epoch && latest.current.scopeKey === key) setError(cause instanceof Error ? cause.message : t('failed'));
        } finally {
            releasePublishingRequest(lease);
            if (owner.current === lease) owner.current = null;
            busyRef.current = false;
            if (mounted.current) setBusy(false);
        }
    }

    async function refresh() {
        await run(async (request, assertCurrent) => {
            const value = await client.query(sanityBlogApi.connection, { projectId: projectId as Id<'projects'>, branchId: branchId as Id<'branches'> });
            assertCurrent();
            // The desktop app's approved website profile decides which site can be prepared.
            if (!value?.sanityProjectId || value.dataset !== 'production') {
                setConnection(null); setRows([]); setCursor(null); return;
            }
            const page = await client.query(publicationDrafts, { projectId: value.projectId, branchId: value.branchId, connectionId: value.id, connectionRevision: value.revision });
            assertCurrent();
            setConnection(value); setRows(page.items); setCursor(page.cursor);
            const result = contentStatusSchema.parse(await request('contentStatus', {}));
            setStatus(result);
            if (result.status === 'pending') { setSelected(result.selections); selectionChanged.current = false; }
            else if (!selectionChanged.current) setSelected(result.status === 'absent' ? [] : result.selections);
        });
    }
    const refreshLatest = useRef(refresh); refreshLatest.current = refresh;
    useEffect(() => {
        if (!native || !visible || !active || !canPublish || isLoading || blocked || busy || busyRef.current || !refreshNeeded.current) return;
        refreshNeeded.current = false;
        void refreshLatest.current();
    }, [native, visible, active, canPublish, isLoading, blocked, busy, scopeKey]);

    async function prepare(resume: boolean, recovery = false) {
        const value = connection;
        if (!value) return;
        const pins = [...selected];
        onBegin?.();
        await run(async (request, assertCurrent) => {
            if (!resume) await latest.current.beforePrepare?.(assertCurrent);
            assertCurrent();
            const input = { connectionId: value.id, connectionRevision: value.revision, selections: pins };
            const result = contentStatusSchema.parse(await (resume ? request('resumeContent', { ...input, recovery }) : request('prepareContent', input)));
            setStatus(result); selectionChanged.current = false;
            if (result.status !== 'absent') setSelected(result.selections);
        }, true);
    }
    async function more() {
        const value = connection; const after = cursor;
        if (!value || !after) return;
        await run(async (_request, assertCurrent) => {
            const page = await client.query(publicationDrafts, { projectId: value.projectId, branchId: value.branchId, connectionId: value.id, connectionRevision: value.revision, cursor: after });
            assertCurrent();
            setRows(previous => [...new Map([...previous, ...page.items].map(row => [row.id, row])).values()]); setCursor(page.cursor);
        });
    }

    if (!native || !canPublish || isLoading) return null;
    const body = <div className="space-y-3 text-small">
        {error && <p role="alert" className="text-red-400">{error}</p>}
        {busy && <p role="status">{t('working')}</p>}
        {blocked && <p>{t('content.saveFirst')}</p>}
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void refresh()}>{t('refresh')}</Button>
        {connection ? <SanityPublicationSelection rows={rows} selected={selected} status={status} busy={busy || blocked} hasMore={!!cursor}
            onToggle={(row, checked) => { selectionChanged.current = true; setSelected(previous => togglePublicationSelection(previous, row, checked)); }}
            onMore={() => void more()} onPrepare={() => void prepare(false)} onResume={() => void prepare(true)} onRecover={() => void prepare(true, true)} />
            : !busy && !error && <p>{t('content.unsupported')}</p>}
    </div>;
    if (!dialog) return body;
    return <>
        <Button variant="outline" disabled={!active} onClick={() => setOpen(true)}>{t('content.button')}</Button>
        <Dialog open={open} onOpenChange={value => { if (!value) invalidate(); setOpen(value); }}>
            <DialogContent className="bg-background border-border-popover max-h-[85vh] overflow-y-auto p-5 sm:max-w-[600px]">
                <DialogHeader><DialogTitle>{t('content.title')}</DialogTitle><DialogDescription>{t('content.dialogDescription')}</DialogDescription></DialogHeader>
                {body}
            </DialogContent>
        </Dialog>
    </>;
}
