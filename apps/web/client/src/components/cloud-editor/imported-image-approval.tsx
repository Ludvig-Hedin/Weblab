'use client';
import { useEffect, useRef, useState } from 'react';
import { useClerk, useSession } from '@clerk/nextjs';
import { observer } from 'mobx-react-lite';
import type { CloudImageApproval, CloudImageAsset } from '@weblab/models/actions';
import type { ContentImageTarget, ContentImageValue } from '@weblab/parser/src/code-edit/content-image-target';
import type { ObjectImageRenderMapping } from '@weblab/parser/src/code-edit/content-image-render-mapping';
import type { CloudSource } from '@/components/store/editor/sandbox/cloud-source';
import { captureConvexAuthOwner, getConvexHttpClientForOwner } from '@/components/store/lib/convex-http-client';
import { useEditorEngine } from '@/components/store/editor';
import { cloudEditorApi } from '@/lib/cloud-editor/api';
import { Button } from '@weblab/ui/button';
import { Checkbox } from '@weblab/ui/checkbox';
import { Input } from '@weblab/ui/input';
import { CloudImageUpload, useCloudImageCopy } from './image-upload';
import { ImportedImageClient, readImportedImageDraft, type ImportedImageDraft } from './imported-image-client';
import type { FunctionArgs } from 'convex/server';

export type ImportedImageSelection = {
    scopeKey: string; selectionKey: string; actorId: string; oid: string; frameId: string; domId: string;
    contentIdentity: { mappingId: string; itemId: 'single' }; revision: number; path: string;
    target: ContentImageTarget; value: ContentImageValue; renderMapping: ObjectImageRenderMapping;
    asset: CloudImageAsset; generation: number; designRevision: number; pin: CloudImageApproval | null; conflictingFamily: string | null;
};
type Props = { source: CloudSource; scopeKey: string; selection: ImportedImageSelection | null; selectedKey: string;
    actorId: string; selectedIdentity: { mappingId: string; oid: string } | null; resolutionPending: boolean;
    current: (selection: ImportedImageSelection) => boolean; validate: (selection: ImportedImageSelection) => Promise<boolean>;
    readAsset: (url: string) => Promise<Blob | null>; onDraftChange: (selection: ImportedImageSelection | null) => void };
type Draft = ImportedImageDraft;

export const ImportedImageApproval = observer(({ source, scopeKey, selection, selectedKey, actorId, selectedIdentity, resolutionPending, current, validate, readAsset, onDraftChange }: Props) => {
    const copy = useCloudImageCopy(), engine = useEditorEngine(), clerk = useClerk(), { session } = useSession();
    const [draft, setDraft] = useState<Draft | null>(null), [busy, setBusy] = useState(false), [failed, setFailed] = useState(false), [storageFailed, setStorageFailed] = useState(false);
    const [preview, setPreview] = useState<string | null>(null);
    const dirty = useRef(false), saving = useRef(false), mounted = useRef(true);
    const draftKey = useRef<string | null>(null);
    const latest = useRef({ current, selection, session }); latest.current = { current, selection, session };
    const active = useRef<AbortController | null>(null);
    const design = source.canDesign && !source.isContentMode;
    const identity = selection ? { mappingId: selection.renderMapping.mappingId, oid: selection.oid } : selectedIdentity;
    const key = identity ? `weblab:cloud-image-alt:v2:${JSON.stringify([scopeKey, identity.mappingId, identity.oid])}` : null;
    const persist = (value: Draft | null) => {
        const storageKey = draftKey.current ?? key;
        if (!storageKey) return false;
        try {
            if (value) {
                let count = 0; for (let i = 0; i < sessionStorage.length; i++) if (sessionStorage.key(i)?.startsWith('weblab:cloud-image-alt:v2:')) count++;
                if (count >= 20 && sessionStorage.getItem(storageKey) === null) throw new Error('Draft limit');
                sessionStorage.setItem(storageKey, JSON.stringify(value));
            } else sessionStorage.removeItem(storageKey);
            setStorageFailed(false); return true;
        } catch { setStorageFailed(true); return false; }
    };
    const discard = () => {
        if (persist(null)) { dirty.current = false; draftKey.current = null; setDraft(null); onDraftChange(null); }
    };
    useEffect(() => {
        mounted.current = true;
        const release = source.registerLocalWork(() => dirty.current || saving.current);
        const unload = (event: BeforeUnloadEvent) => { if (dirty.current || saving.current) { event.preventDefault(); event.returnValue = ''; } };
        window.addEventListener('beforeunload', unload);
        return () => { mounted.current = false; active.current?.abort(); release(); window.removeEventListener('beforeunload', unload); };
    }, [source]);
    useEffect(() => {
        if (dirty.current && draftKey.current !== key) {
            // An unresolved draft is already stored under its original image. Do not carry it onto a new selection.
            dirty.current = false; draftKey.current = null; setDraft(null); onDraftChange(null); return;
        }
        if (!key || !identity || (!selection && resolutionPending) || dirty.current) return;
        setDraft(null); setFailed(false);
        try {
            const raw = sessionStorage.getItem(key); if (!raw) return;
            const stored = readImportedImageDraft(raw, { ...source.scope, actorId, ...identity });
            if (selection && stored.pin.path !== selection.path) throw new Error('Invalid draft');
            dirty.current = true; draftKey.current = key; setDraft(stored);
            if (selection) onDraftChange(selection);
        } catch { setStorageFailed(true); }
    }, [key, selection, source, onDraftChange, resolutionPending, actorId]);
    useEffect(() => {
        const controller = new AbortController(); active.current?.abort(); active.current = controller;
        return () => controller.abort();
    }, [selectedKey, session?.id, design]);
    useEffect(() => {
        let live = true, url: string | null = null; setPreview(null);
        if (selection) void readAsset(selection.value.src).then(blob => {
            if (live && blob) { url = URL.createObjectURL(blob); setPreview(url); }
        }).catch(() => {});
        return () => { live = false; if (url) URL.revokeObjectURL(url); };
    }, [selection?.value.src, readAsset]);
    const pin = draft?.pin ?? selection?.pin;
    const stale = !!draft && (draft.revision !== source.state.savedRevision || !source.isImageApprovalCurrent(draft.pin));
    const available = !!selection && current(selection) && !source.state.pending && !source.state.needsReload && !source.state.loading;
    const editable = available && !design && !!pin && source.isImageApprovalCurrent(pin) && !stale;
    const capture = (selected: ImportedImageSelection) => {
        const owner = captureConvexAuthOwner(), captured = session, controller = active.current, capturedMode = source.isContentMode;
        const check = () => !!owner?.isCurrent() && !!captured && !controller?.signal.aborted && latest.current.session?.id === captured.id &&
            clerk.session?.id === captured.id && clerk.user?.id === captured.user.id && source.isContentMode === capturedMode && latest.current.current(selected);
        if (!owner || !captured || !controller || !check()) throw new Error('Image selection changed');
        const guard = () => { if (!check()) throw new Error('Image selection changed'); };
        return { owner, guard, check, client: new ImportedImageClient({ session: captured, current: check, signal: AbortSignal.any([controller.signal, owner.signal]) }) };
    };
    async function permission(field: 'src' | 'alt' | 'upload', enabled: boolean) {
        if (!selection || !available || !design || busy || draft || source.hasLocalWork || selection.conflictingFamily) return;
        const selected = selection; setBusy(true); setFailed(false);
        try {
            const captured = capture(selected); captured.guard();
            if (!await validate(selected)) throw new Error('Image selection changed'); captured.guard();
            await captured.owner.ready; captured.guard();
            const client = getConvexHttpClientForOwner(captured.owner);
            const fields = new Set(selected.pin?.binding.fields ?? []);
            if (field !== 'upload') { if (enabled) fields.add(field); else fields.delete(field); }
            const uploads = fields.has('src') && (field === 'upload' ? enabled : selected.pin?.binding.allowImageUploads ?? false);
            if (!fields.size) {
                await client.mutation(cloudEditorApi.revokeImage, { ...source.scope, actorId: selected.actorId as FunctionArgs<typeof cloudEditorApi.revokeImage>['actorId'], path: selected.path, expectedGeneration: selected.generation });
            } else {
                const inspection = await captured.client.inspect({ ...source.scope, actorId: selected.actorId as Parameters<typeof captured.client.inspect>[0]['actorId'],
                    expectedRevision: selected.revision, path: selected.asset.path, expectedHash: selected.asset.hash }, selected.asset.bytes);
                captured.guard(); if (!await validate(selected)) throw new Error('Image selection changed'); captured.guard();
                await client.action(cloudEditorApi.approveImage, { ...source.scope, actorId: selected.actorId as Parameters<typeof captured.client.inspect>[0]['actorId'], expectedRevision: selected.revision,
                    expectedGeneration: selected.generation, selection: { oid: selected.oid, ...selected.contentIdentity }, bindingId: selected.pin?.binding.bindingId ?? selected.contentIdentity.mappingId,
                    fields: [...fields], allowImageUploads: uploads, inspection });
            }
            captured.guard(); await source.refreshCapabilities(); captured.guard();
        } catch { if (mounted.current) setFailed(true); }
        finally { if (mounted.current) setBusy(false); }
    }
    async function save() {
        if (!selection || !draft || !editable || busy || saving.current || !pin?.binding.fields.includes('alt')) return;
        const selected = selection; saving.current = true; setBusy(true); setFailed(false); dirty.current = false;
        let saved = false;
        try {
            const captured = capture(selected); if (!await validate(selected)) throw new Error('Image selection changed'); captured.guard();
            saving.current = false; // The action owns the source lease from this point.
            saved = await engine.action.editApprovedImportedImage({ pin: draft.pin, field: 'alt', value: draft.value, expectedRevision: draft.revision, current: captured.check });
            if (saved && persist(null)) { draftKey.current = null; setDraft(null); onDraftChange(null); } else { saved = false; setFailed(true); }
        } catch { if (mounted.current) setFailed(true); }
        finally { dirty.current = !saved; saving.current = false; if (mounted.current) setBusy(false); }
    }
    if (!selection) return draft ? <div className="space-y-2 text-xs">
        <label className="block space-y-1"><span>{copy.alt}</span><Input readOnly value={draft.value} /></label>
        <p role="alert">{copy.stale}</p>
        <Button size="xs" variant="ghost" onClick={discard}>{copy.discard}</Button>
        {storageFailed && <p role="alert">{copy.storageFailed}</p>}
    </div> : <p className="text-foreground-secondary text-xs">{copy.unsupported}</p>;
    const policy = selection.pin?.binding;
    return <div className="space-y-3 text-xs">
        <div className="bg-background-secondary flex h-24 items-center justify-center overflow-hidden rounded-sm">
            {preview ? <img src={preview} alt="" className="h-full w-full object-contain" /> : <span className="text-foreground-tertiary">{copy.image}</span>}
        </div>
        {pin && <p className="text-foreground-secondary">{copy.ratio.replace('{width}', String(pin.binding.aspectRatio.width)).replace('{height}', String(pin.binding.aspectRatio.height))}</p>}
        {draft && !current(selection) && <p>{copy.draftPinned}</p>}
        {design ? <div className="space-y-2">
            <p className="text-foreground-secondary">{copy.currentOnly}</p>
            {(['src', 'alt', 'upload'] as const).map(field => <label key={field} className="flex items-center gap-2">
                <Checkbox checked={field === 'upload' ? policy?.allowImageUploads ?? false : policy?.fields.includes(field) ?? false}
                    disabled={!available || busy || !!draft || !!selection.conflictingFamily || (field === 'upload' && !policy?.fields.includes('src'))}
                    onCheckedChange={value => { void permission(field, value === true); }} />
                <span>{field === 'src' ? copy.allowSource : field === 'alt' ? copy.allowAlt : copy.allow}</span>
            </label>)}
            {selection.conflictingFamily && <p role="alert">{copy.conflicting}</p>}
        </div> : <>
            {pin?.binding.fields.includes('src') && pin.binding.allowImageUploads && <>
                <CloudImageUpload disabled={!editable || busy || !!draft} onUpload={async file => {
                    if (!editable || !pin || !selection || source.hasLocalWork) return false;
                    setBusy(true);
                    try {
                        const selected = selection, captured = capture(selected);
                        if (!await validate(selected)) return false; captured.guard();
                        return await engine.action.uploadApprovedImportedImage({ pin, expectedRevision: selected.revision, current: captured.check }, file,
                            (target, currentLease) => captured.client.prepare(target, file, currentLease));
                    } finally { if (mounted.current) setBusy(false); }
                }} />
            </>}
            {!pin && <p className="text-foreground-secondary">{copy.unapproved}</p>}
        </>}
            <label className="block space-y-1"><span>{copy.alt}</span><Input maxLength={1000} value={draft?.value ?? selection.value.alt}
                readOnly={!editable || busy || !pin?.binding.fields.includes('alt')} onChange={event => {
                    if (!pin || !editable) return;
                    const next = draft ?? { pin, previous: selection.value.alt, value: '', revision: selection.revision };
                    const updated = { ...next, value: event.target.value }; dirty.current = true; draftKey.current = key; setDraft(updated); onDraftChange(selection); persist(updated);
                }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void save(); } }} /></label>
        {draft && <div className="flex gap-1"><Button size="xs" disabled={!editable || busy} onClick={() => { void save(); }}>{copy.save}</Button>
            <Button size="xs" variant="ghost" disabled={busy} onClick={discard}>{copy.discard}</Button></div>}
        {stale && <p role="alert">{copy.stale}</p>}
        {failed && <p role="alert">{copy.failed}</p>}
        {storageFailed && <p role="alert">{copy.storageFailed}</p>}
    </div>;
});
