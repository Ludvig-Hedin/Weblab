'use client';

import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useQuery } from 'convex/react';
import { Button } from '@weblab/ui/button';
import { Input } from '@weblab/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import type { ImportedStudioOperation } from '@convex/lib/cloudImportedStudioState';
import type { CloudSource } from '@/components/store/editor/sandbox/cloud-source';
import { captureConvexAuthOwner } from '@/components/store/lib/convex-http-client';
import { cloudEditorApi } from '@/lib/cloud-editor/api';
import { useCloudStudioCopy, type CloudImportedStudioApprovalRequest, type CloudImportedStudioPinRequest, type CloudImportedStudioRequest } from './studio-api';

export interface ImportedTemplatesPanelProps {
    source: CloudSource;
    disabled?: boolean;
    onOperation: (request: CloudImportedStudioRequest) => Promise<void>;
    onApproval: (request: CloudImportedStudioApprovalRequest) => Promise<void>;
    onOpenPage: (path: string) => void;
}

/** The parent owns captured transport, source admission, recovery and acknowledged reload. */
export const ImportedTemplatesPanel = observer(({ source, disabled = false, onOperation, onApproval, onOpenPage }: ImportedTemplatesPanelProps) => {
    const copy = useCloudStudioCopy();
    const actorId = source.state.access?.actorId;
    const data = useQuery(cloudEditorApi.importedStudio, actorId ? { ...source.scope, actorId } : 'skip');
    const [slug, setSlug] = useState('');
    const [pageId, setPageId] = useState('');
    const [slotKey, setSlotKey] = useState('');
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    const inflight = useRef(false), mounted = useRef(true);
    const latest = useRef({ source, actorId, data });
    latest.current = { source, actorId, data };
    const identity = JSON.stringify([source.scope.projectId, source.scope.branchId, actorId]);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    useEffect(() => { setSlug(''); setPageId(''); setSlotKey(''); setFailed(false); }, [identity]);

    if (!actorId || !data || data.actorId !== actorId) return <p className="text-foreground-secondary text-xs">{copy.loading}</p>;
    if (!data.enabled) return <p className="text-foreground-secondary text-xs">{copy.importedUnavailable}</p>;
    const locked = disabled || busy || !source.canWrite || source.hasLocalWork || source.state.pending || source.state.loading || source.state.needsReload || data.revision !== source.state.savedRevision;
    const page = data.pages.find(item => item.id === pageId) ?? data.pages[0];
    const slot = page?.slots.find(item => item.key === slotKey) ?? page?.slots[0];
    const slotPolicy = data.recipe?.slots.find(item => item.key === slot?.key);
    const validSlug = slug.length > 0 && slug.length <= 64 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && !/[^a-z0-9-]/.test(slug);

    function capture(): { pin: CloudImportedStudioPinRequest; sameScope: () => boolean } {
        if (locked || inflight.current || !data?.enabled || !actorId) throw new Error('Studio unavailable');
        const owner = captureConvexAuthOwner();
        if (!owner?.isCurrent()) throw new Error('Account changed');
        const projectId = source.scope.projectId, branchId = source.scope.branchId;
        const capturedData = data;
        const sameScope = () => mounted.current && owner.isCurrent() && latest.current.source === source &&
            source.scope.projectId === projectId && source.scope.branchId === branchId &&
            latest.current.actorId === actorId && source.state.access?.actorId === actorId;
        const current = () => {
            const now = latest.current.data;
            return sameScope() && !!now?.enabled && now.actorId === actorId && now.revision === capturedData.revision &&
                now.generation === capturedData.generation && now.preparationId === capturedData.preparationId &&
                now.designRevision === capturedData.designRevision && now.recipeFingerprint === capturedData.recipeFingerprint &&
                now.current === capturedData.current && now.canApprove === capturedData.canApprove &&
                source.state.savedRevision === capturedData.revision && !source.state.loading && !source.state.needsReload;
        };
        const pin: CloudImportedStudioPinRequest = { projectId, branchId, actorId, expectedRevision: data.revision,
            expectedGeneration: data.generation, expectedPreparationId: data.preparationId,
            expectedDesignRevision: data.designRevision, expectedRecipeFingerprint: data.recipeFingerprint, current };
        if (!current()) throw new Error('Studio changed');
        return { pin, sameScope };
    }

    async function run(operation: ImportedStudioOperation | 'reapprove' | 'pause') {
        if (locked || inflight.current) return;
        let captured: ReturnType<typeof capture>;
        try { captured = capture(); } catch { setFailed(true); return; }
        inflight.current = true; setBusy(true); setFailed(false);
        try {
            if (!captured.pin.current()) throw new Error('Studio changed');
            if (typeof operation === 'string') await onApproval({ ...captured.pin, kind: operation });
            else await onOperation({ ...captured.pin, kind: 'imported-structure', operation });
            // The acknowledged write may advance revision/generation. Only actor and scope
            // must still match before clearing the successfully submitted page address.
            if (captured.sameScope() && typeof operation !== 'string' && operation.kind === 'createPage') {
                setSlug(value => value === operation.slug ? '' : value);
            }
        } catch { if (captured.sameScope()) setFailed(true); }
        finally { inflight.current = false; if (mounted.current) setBusy(false); }
    }

    return <section className="space-y-4 p-3" aria-label={copy.templates}>
        {failed && <p role="alert" className="text-destructive text-xs">{copy.error}</p>}
        {busy && <p role="status" className="text-foreground-secondary text-xs">{copy.working}</p>}
        {!data.recipe ? <>
            <p className="text-foreground-secondary text-xs">{data.canApprove ? copy.importedSetupHelp : copy.importedNotConfigured}</p>
            {data.canApprove && <Button size="sm" disabled={locked} onClick={() => void run({ kind: 'capture', label: copy.basicPage,
                blockLabel: copy.textBlock, slots: [{ key: 'body', max: 10 }] })}>{copy.importedApproveTemplate}</Button>}
        </> : <>
            {data.canApprove && <div className="space-y-2 border-b pb-4">
                {!data.current && <p className="text-foreground-secondary text-xs">{copy.importedReapproveHelp}</p>}
                <Button size="sm" variant={data.current ? 'ghost' : 'outline'} disabled={locked}
                    onClick={() => void run(data.current ? 'pause' : 'reapprove')}>{data.current ? copy.importedPause : copy.importedReapprove}</Button>
            </div>}
            {!data.current && <p className="text-foreground-secondary text-xs">{copy.importedPaused}</p>}
            {data.current && <form className="space-y-2" onSubmit={event => { event.preventDefault(); if (validSlug) void run({ kind: 'createPage', templateId: 'basic-page-v1', slug }); }}>
                <p className="text-xs">{data.recipe.label}</p>
                <label className="block space-y-1 text-xs"><span>{copy.pageSlug}</span><Input value={slug} onChange={event => setSlug(event.target.value)}
                    disabled={locked} maxLength={64} pattern="[a-z0-9]+(-[a-z0-9]+)*" required placeholder={copy.importedSlugPlaceholder} /></label>
                <p className="text-foreground-secondary text-xs">{copy.importedNavigationHelp}</p>
                <Button size="sm" type="submit" disabled={locked || !validSlug || data.pages.length >= 20}>{copy.createPage}</Button>
                {data.pages.length >= 20 && <p className="text-foreground-secondary text-xs">{copy.importedPageLimit}</p>}
            </form>}
            {page ? <div className="space-y-3 border-t pt-4">
                <div className="flex items-center gap-2">
                    <Select value={page.id} onValueChange={value => { setPageId(value); setSlotKey(''); }} disabled={busy}>
                        <SelectTrigger aria-label={copy.importedChoosePage}><SelectValue /></SelectTrigger>
                        <SelectContent>{data.pages.map(item => <SelectItem key={item.id} value={item.id}>/{item.slug}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" disabled={disabled || busy || source.hasLocalWork || source.state.loading || source.state.pending || source.state.needsReload}
                        onClick={() => onOpenPage(`/${page.slug}`)}>{copy.importedOpenPage}</Button>
                </div>
                {data.current && slot && slotPolicy && <>
                    <Select value={slot.key} onValueChange={setSlotKey} disabled={locked}>
                        <SelectTrigger aria-label={copy.approvedSlot}><SelectValue /></SelectTrigger>
                        <SelectContent>{page.slots.map((item, index) => <SelectItem key={item.key} value={item.key}>{copy.slot} {index + 1}</SelectItem>)}</SelectContent>
                    </Select>
                    {slot.instances.map((instance, index) => <div key={instance.id} className="flex flex-wrap items-center gap-1 text-xs">
                        <span className="mr-auto">{data.recipe!.blockLabel} {index + 1}</span>
                        <Button size="xs" variant="ghost" disabled={locked || index === 0} onClick={() => void run({ kind: 'moveBlock', pageId: page.id, slotKey: slot.key, instanceId: instance.id, position: index - 1 })}>{copy.moveUp}</Button>
                        <Button size="xs" variant="ghost" disabled={locked || index === slot.instances.length - 1} onClick={() => void run({ kind: 'moveBlock', pageId: page.id, slotKey: slot.key, instanceId: instance.id, position: index + 1 })}>{copy.moveDown}</Button>
                        <Button size="xs" variant="ghost" disabled={locked || slot.instances.length <= slotPolicy.min} onClick={() => void run({ kind: 'removeBlock', pageId: page.id, slotKey: slot.key, instanceId: instance.id })}>{copy.remove}</Button>
                    </div>)}
                    <Button size="sm" disabled={locked || slot.instances.length >= slotPolicy.max} onClick={() => void run({ kind: 'insertBlock', pageId: page.id,
                        slotKey: slot.key, blockId: 'text-block-v1', position: slot.instances.length })}>{copy.addBlock}</Button>
                    {slot.instances.length >= slotPolicy.max && <p className="text-foreground-secondary text-xs">{copy.importedBlockLimit}</p>}
                </>}
            </div> : data.current && <p className="text-foreground-secondary text-xs">{copy.importedNoPages}</p>}
        </>}
        {!busy && (source.state.needsReload ? <p role="status" className="text-foreground-secondary text-xs">{copy.importedReloadRequired}</p>
            : locked && <p role="status" className="text-foreground-secondary text-xs">{copy.importedWait}</p>)}
    </section>;
});
