'use client';

import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useSearchParams } from 'next/navigation';
import { Button } from '@weblab/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@weblab/ui/dialog';
import { useEditorEngine } from '@/components/store/editor';
import type { CloudSource } from '@/components/store/editor/sandbox/cloud-source';
import { CloudStudioTemplatesPanel } from './templates-panel';
import { CloudStudioCmsPanel } from './cms-panel';
import { useCloudStudioCopy, type CloudStudioRequest } from './studio-api';

export const CloudStudioTools = observer(({ source }: { source: CloudSource }) => {
    const engine = useEditorEngine();
    const copy = useCloudStudioCopy();
    const params = useSearchParams();
    const [view, setView] = useState<'structure' | 'journal' | null>(() => params.get('cloudPanel') === 'journal' ? 'journal' : params.get('cloudPanel') === 'structure' ? 'structure' : null);
    const [selection, setSelection] = useState<{ path: string; oid: string } | null>(null);
    const [dirty, setDirty] = useState(false);
    const [reloadRequested, setReloadRequested] = useState(false);
    const [failedReload, setFailedReload] = useState(false);
    const inflight = useRef(false);
    const selected = engine.elements.selected[0];
    const oid = selected?.oid, branchId = selected?.branchId;
    useEffect(() => {
        let current = true; setSelection(null);
        const branch = branchId ? engine.branches.getBranchDataById(branchId) : null;
        if (oid && branch && branchId === source.scope.branchId)
            void branch.codeEditor.getJsxElementMetadata(oid).then(metadata => { if (current && metadata) setSelection({ path: metadata.path, oid }); }).catch(() => {});
        return () => { current = false; };
    }, [engine, oid, branchId, source]);
    useEffect(() => {
        if (!reloadRequested || dirty || engine.activeSandbox.cloudSource !== source) return;
        setReloadRequested(false);
        void source.reloadSavedSource().catch(() => setFailedReload(true));
    }, [reloadRequested, dirty, source, engine]);
    async function onOperation(request: CloudStudioRequest) {
        if (inflight.current || engine.activeSandbox.cloudSource !== source) throw new Error('Source changed');
        inflight.current = true;
        try {
            await source.commitSemantic({ transport: request.kind === 'structure' ? 'studio' : 'journal',
                actorId: request.actorId, expectedRevision: request.expectedRevision,
                expectedGeneration: request.expectedGeneration, operation: request.operation });
            const url = new URL(window.location.href); url.searchParams.set('cloudPanel', request.kind);
            window.history.replaceState(window.history.state, '', url);
            setFailedReload(false); setReloadRequested(true);
        } finally { inflight.current = false; }
    }
    function close() {
        if (inflight.current) return;
        const url = new URL(window.location.href); url.searchParams.delete('cloudPanel');
        window.history.replaceState(window.history.state, '', url);
        setView(null);
    }
    return <>
        <Button size="sm" variant="ghost" onClick={() => setView('structure')}>{copy.templates}</Button>
        <Button size="sm" variant="ghost" onClick={() => setView('journal')}>{copy.journal}</Button>
        <Dialog open={view !== null} onOpenChange={open => { if (!open) close(); }}>
            <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
                <DialogHeader><DialogTitle>{view === 'journal' ? copy.journal : copy.templates}</DialogTitle></DialogHeader>
                {view === 'structure' && <CloudStudioTemplatesPanel scope={source.scope} selection={selection} disabled={!source.canWrite} onOperation={onOperation} />}
                {view === 'journal' && <CloudStudioCmsPanel scope={source.scope} disabled={!source.canWrite} onOperation={onOperation} onDirtyChange={setDirty} onOpenPage={path => {
                    const frame = engine.frames.selected[0]?.frame ?? engine.frames.getAll()[0]?.frame;
                    if (!frame || dirty || inflight.current) return;
                    void engine.frames.navigateToPath(frame.id, path).then(close).catch(() => setFailedReload(true));
                }} />}
                {failedReload && <p role="alert" className="text-sm">{copy.reloadRequired}</p>}
            </DialogContent>
        </Dialog>

    </>;
});
