'use client';

import { copyPropertyElementIdentity, propertySelectionKey as key, validatePropertyElement, type PropertyElementIdentity } from './property-selection';

import { useEffect, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import { observer } from 'mobx-react-lite';
import { runInAction } from 'mobx';
import type { FunctionArgs } from 'convex/server';
import type { CloudPropertyApproval } from '@weblab/models';
import { parse, t } from '@weblab/parser/src/packages';
import { readContentPropertyTarget, type ContentPropertySelection, type ContentPropertyTarget } from '@weblab/parser/src/code-edit/content-property-target';
import { Button } from '@weblab/ui/button';
import { Checkbox } from '@weblab/ui/checkbox';
import { Input } from '@weblab/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import { useEditorEngine } from '@/components/store/editor';
import { cloudPropertyTargetIdentity } from '@/components/store/editor/sandbox/cloud-property-approval';
import type { CloudSource } from '@/components/store/editor/sandbox/cloud-source';
import { captureConvexAuthOwner, getConvexHttpClientForOwner } from '@/components/store/lib/convex-http-client';
import { cloudEditorApi } from '@/lib/cloud-editor/api';
import en from '../../../messages/cloud-properties/en.json';
import sv from '../../../messages/cloud-properties/sv.json';

type Option = { id: string; label: string; value: string };
type Selection = {
    element: PropertyElementIdentity; key: string; path: string; target: ContentPropertyTarget; value: string; revision: number;
    generation: number; designRevision: number; preparationId: string; sourceVersion: string;
};
function matches(target: ContentPropertyTarget, element: PropertyElementIdentity, path: string): boolean {
    return target.kind === 'component-literal-href' ? target.oid === element.oid
        : element.tagName.toLowerCase() === 'img' && target.renderMapping.renderer.oid === element.oid &&
            target.renderMapping.renderer.path === path && target.renderMapping.mappingId === element.contentIdentity?.mappingId &&
            element.contentIdentity.itemId === 'single';
}
function hrefSelection(source: string, path: string, oid: string): ContentPropertySelection | null {
    const found: ContentPropertySelection[] = [];
    for (const node of parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] }).program.body) {
        if (!t.isExportNamedDeclaration(node) || !t.isFunctionDeclaration(node.declaration) || !node.declaration.id) continue;
        const target = { kind: 'component-literal-href' as const, exportName: node.declaration.id.name, oid, field: 'href' as const };
        try { readContentPropertyTarget(source, target); found.push({ kind: target.kind, path, exportName: target.exportName, oid }); }
        catch { /* Only supported literal anchors have controls. */ }
    }
    return found.length === 1 ? found[0]! : null;
}

/** The current canvas selection owns these choices; all writes use the existing saved-source path. */
export const ImportedPropertyApproval = observer(({ source, actorId, blocked }: {
    source: CloudSource; actorId: string; blocked: boolean;
}) => {
    const engine = useEditorEngine(), copy = useLocale().startsWith('sv') ? sv : en;
    const selected = engine.elements.selected[0], selectedKey = key(selected);
    const snapshot = source.state.propertyContracts, revision = source.state.savedRevision;
    const design = source.canDesign && !source.isContentMode;
    const [selection, setSelection] = useState<Selection | null>(null);
    const [options, setOptions] = useState<Option[]>([]), [busy, setBusy] = useState(false);
    const [dirty, setDirty] = useState(false), [error, setError] = useState<'failed' | 'savedReload' | 'unknownReload' | null>(null);
    const [refresh, setRefresh] = useState(0);
    const dirtyRef = useRef(false), inFlight = useRef(false), mounted = useRef(true);
    const permissionFlight = useRef(false);
    const currentUi = useRef({ selectedKey, blocked, design }); currentUi.current = { selectedKey, blocked, design };
    const contract = selection ? snapshot?.contracts.find(row => row.path === selection.path) : undefined;
    const binding = contract?.bindings.find(row => selection && cloudPropertyTargetIdentity(row.target) === cloudPropertyTargetIdentity(selection.target));
    const approved = !!binding && contract?.active === true && contract.current === true;
    const pin: CloudPropertyApproval | null = selection && approved && contract && binding ? {
        version: 1, ...source.scope, actorId, path: selection.path, generation: contract.generation,
        preparationId: contract.preparationId, designRevision: contract.designRevision, definitionHash: contract.definitionHash, binding,
    } : null;
    const isCurrent = (value: Selection) => mounted.current && !currentUi.current.blocked &&
        engine.activeSandbox.cloudSource === source && engine.elements.selected.length === 1 &&
        key(engine.elements.selected[0]) === value.key && source.state.propertyContracts?.actorId === actorId &&
        source.state.propertyContracts.preparationId === value.preparationId &&
        source.state.propertyContracts.designRevision === value.designRevision &&
        (source.state.propertyContracts.contracts.find(row => row.path === value.path)?.generation ?? 0) === value.generation &&
        source.state.savedRevision === value.revision && source.getSourceVersion() === value.sourceVersion &&
        !source.state.loading && !source.state.needsReload && source.state.accessReady;
    async function validateLive(element: PropertyElementIdentity, current: () => boolean): Promise<boolean> {
        if (!current()) return false;
        const frame = engine.frames.get(element.frameId), layer = engine.ast.mappings.getMapping(element.frameId)?.get(element.domId);
        if (!frame?.view || frame.frame.branchId !== source.scope.branchId || !layer ||
            layer.oid !== element.oid || layer.instanceId !== element.instanceId) return false;
        const view = frame.view;
        return validatePropertyElement(element, current, () => view.getElementByDomId(element.domId, true));
    }
    const available = !!selection && isCurrent(selection) && !busy && !source.state.pending && error !== 'savedReload' && error !== 'unknownReload';
    useEffect(() => {
        mounted.current = true;
        const release = source.registerLocalWork(() => dirtyRef.current || permissionFlight.current);
        const unload = (event: BeforeUnloadEvent) => { if (dirtyRef.current || permissionFlight.current) { event.preventDefault(); event.returnValue = ''; } };
        window.addEventListener('beforeunload', unload);
        return () => { mounted.current = false; release(); window.removeEventListener('beforeunload', unload); };
    }, [source]);
    useEffect(() => {
        if (dirtyRef.current || inFlight.current || source.state.needsReload) return;
        let live = true;
        setSelection(null); setOptions([]); setError(value => value === 'savedReload' || value === 'unknownReload' ? value : null);
        const branch = engine.branches.getBranchDataById(source.scope.branchId), fs = branch?.codeEditor;
        const owner = captureConvexAuthOwner(), sourceVersion = source.getSourceVersion();
        const current = () => live && owner?.isCurrent() && !currentUi.current.blocked &&
            engine.activeSandbox.cloudSource === source && branch?.codeEditor === fs &&
            engine.elements.selected.length === 1 && key(engine.elements.selected[0]) === selectedKey &&
            source.state.savedRevision === revision && source.getSourceVersion() === sourceVersion && !source.hasLocalWork &&
            currentUi.current.design === design && !source.state.pending && !source.state.needsReload;
        if (!selected?.oid || !fs || !snapshot || snapshot.actorId !== actorId || snapshot.revision !== revision ||
            selected.branchId !== source.scope.branchId || !current()) return;
        const element = copyPropertyElementIdentity({ ...selected, oid: selected.oid });
        void (async () => {
            if (!await validateLive(element, current)) return;
            const metadata = await fs.getJsxElementMetadata(element.oid!);
            if (!metadata || !current()) return;
            const path = metadata.path.replace(/^\/+/, '');
            let resolved: Omit<Selection, 'element' | 'key' | 'sourceVersion'> | null = null;
            if (design && source.state.access?.canApproveImportedProperties) {
                let hint: ContentPropertySelection | null = null;
                if (element.tagName.toLowerCase() === 'a') {
                    const sourceText = await fs.readFile(path);
                    if (typeof sourceText === 'string') hint = hrefSelection(sourceText, path, element.oid!);
                } else if (element.tagName.toLowerCase() === 'img' && element.contentIdentity?.itemId === 'single') {
                    hint = { kind: 'mapped-callsite-enum', oid: element.oid!, mappingId: element.contentIdentity.mappingId, itemId: 'single' };
                }
                if (!hint || !owner || !current()) return;
                await owner.ready; if (!current() || !await validateLive(element, current) || !current()) return;
                const result = await getConvexHttpClientForOwner(owner).action(cloudEditorApi.resolvePropertySelection, {
                    ...source.scope, actorId: actorId as FunctionArgs<typeof cloudEditorApi.resolvePropertySelection>['actorId'],
                    expectedRevision: revision, selection: hint,
                });
                if (!current() || !await validateLive(element, current) || !current() || result.actorId !== actorId || result.revision !== revision || !matches(result.target, element, path)) return;
                resolved = result;
            } else {
                const candidates = snapshot.contracts.flatMap(row => row.active && row.current ? row.bindings.filter(item =>
                    matches(item.target, element, path) && (item.target.kind !== 'component-literal-href' || row.path === path))
                    .map(item => ({ row, item })) : []);
                if (candidates.length !== 1) return;
                const { row, item } = candidates[0]!;
                const text = await fs.readFile(row.path);
                if (typeof text !== 'string') return;
                resolved = { path: row.path, target: item.target, value: readContentPropertyTarget(text, item.target), revision,
                    generation: row.generation, designRevision: row.designRevision, preparationId: row.preparationId };
            }
            if (!resolved || !current() || !await validateLive(element, current) || !current()) return;
            const row = snapshot.contracts.find(item => item.path === resolved.path);
            const prior = row?.active && row.current ? row.bindings.find(item => cloudPropertyTargetIdentity(item.target) === cloudPropertyTargetIdentity(resolved.target)) : null;
            setOptions(prior ? prior.options.map(option => ({ ...option })) : [{ id: crypto.randomUUID(),
                label: resolved.target.kind === 'mapped-callsite-enum' ? copy[resolved.value === 'dark' ? 'dark' : 'light'] : copy.current, value: resolved.value }]);
            setSelection({ ...resolved, element, key: selectedKey, sourceVersion });
        })().catch(() => { /* Unsupported source has no property controls. */ });
        return () => { live = false; };
    }, [source, engine, selectedKey, snapshot, revision, design, actorId, blocked, refresh, copy]);

    function change(next: Option[]) { dirtyRef.current = true; setDirty(true); setOptions(next); setError(null); }
    function discard() { dirtyRef.current = false; setDirty(false); setSelection(null); setRefresh(value => value + 1); setError(null); }
    async function permission(remove: boolean) {
        if (!selection || !available || !design || !source.state.access?.canApproveImportedProperties || inFlight.current || !snapshot) return;
        const captured = selection, owner = captureConvexAuthOwner(), current = () => !!owner?.isCurrent() && isCurrent(captured) && currentUi.current.design;
        if (!current()) return;
        // Only this form's unsaved permission choices are exempted from its own admission check.
        const hadDraft = dirtyRef.current; dirtyRef.current = false;
        if (source.hasLocalWork) { dirtyRef.current = hadDraft; return; }
        inFlight.current = true; permissionFlight.current = true; setBusy(true); setError(null);
        let saved = false, dispatched = false;
        const otherWork = () => {
            permissionFlight.current = false;
            try { return source.hasLocalWork; } finally { permissionFlight.current = true; }
        };
        try {
            await owner!.ready; if (!current() || !await validateLive(captured.element, current) || !current() || otherWork()) throw new Error('Selection changed');
            const client = getConvexHttpClientForOwner(owner!);
            const bindings = contract?.active && contract.current ? contract.bindings.filter(item => item.bindingId !== binding?.bindingId) : [];
            if (!remove) bindings.push({ bindingId: binding?.bindingId ?? crypto.randomUUID(),
                label: captured.target.kind === 'component-literal-href' ? copy.link : copy.tone, target: captured.target, options: options.map(option => ({ ...option })) });
            dispatched = true;
            const result = !bindings.length ? await client.mutation(cloudEditorApi.revokeProperty, { ...source.scope,
                actorId: actorId as FunctionArgs<typeof cloudEditorApi.revokeProperty>['actorId'], path: captured.path, expectedGeneration: captured.generation })
            : await client.action(cloudEditorApi.approveProperty, { ...source.scope,
                actorId: actorId as FunctionArgs<typeof cloudEditorApi.approveProperty>['actorId'], path: captured.path,
                expectedRevision: captured.revision, expectedGeneration: captured.generation,
                expectedPreparationId: captured.preparationId as FunctionArgs<typeof cloudEditorApi.approveProperty>['expectedPreparationId'],
                expectedDesignRevision: captured.designRevision, bindings });
            if (!owner!.isCurrent() || !await validateLive(captured.element, () => owner!.isCurrent() && mounted.current && engine.activeSandbox.cloudSource === source && key(engine.elements.selected[0]) === captured.key))
                throw new Error('Selection changed');
            saved = true; dirtyRef.current = false;
            if (mounted.current) setDirty(false);
            try {
                await source.refreshCapabilities();
                const refreshed = source.state.propertyContracts;
                const row = refreshed?.contracts.find(item => item.path === captured.path);
                if (!owner!.isCurrent() || !await validateLive(captured.element, () => owner!.isCurrent() && mounted.current && engine.activeSandbox.cloudSource === source && key(engine.elements.selected[0]) === captured.key) || refreshed?.actorId !== actorId || !row || row.generation !== result.generation ||
                    row.active !== (bindings.length > 0) || ('definitionHash' in result && row.definitionHash !== result.definitionHash))
                    throw new Error('Permission refresh unavailable');
            } catch {
                runInAction(() => { source.state.needsReload = true; });
                if (mounted.current) setError('savedReload');
            }
        } catch {
            if (dispatched) runInAction(() => { source.state.needsReload = true; });
            if (mounted.current) setError(dispatched ? 'unknownReload' : 'failed');
        }
        finally {
            dirtyRef.current = !saved && hadDraft; inFlight.current = false; permissionFlight.current = false;
            if (mounted.current) { setBusy(false); if (saved) setRefresh(value => value + 1); }
        }
    }
    async function choose(choiceId: string) {
        if (!selection || !pin || !available || design || source.hasLocalWork || inFlight.current || !source.isPropertyApprovalCurrent(pin)) return;
        const captured = selection, owner = captureConvexAuthOwner();
        const current = () => !!owner?.isCurrent() && isCurrent(captured) && !currentUi.current.design;
        if (!current()) return;
        inFlight.current = true; setBusy(true); setError(null);
        try {
            if (!await validateLive(captured.element, current) || !current()) throw new Error('Selection changed');
            const saved = await engine.action.editApprovedProperty({ pin, previousValue: captured.value, choiceId,
                expectedRevision: captured.revision, current, validate: () => validateLive(captured.element, current) });
            if (!owner?.isCurrent() || !await validateLive(captured.element, () => !!owner?.isCurrent() && mounted.current && engine.activeSandbox.cloudSource === source && key(engine.elements.selected[0]) === captured.key)) return;
            if (!saved && mounted.current) setError('failed');
        } catch { if (mounted.current) setError('failed'); }
        finally { inFlight.current = false; if (mounted.current) { setBusy(false); setRefresh(value => value + 1); } }
    }
    if (!selection) return null;
    const tone = selection.target.kind === 'mapped-callsite-enum';
    const keepsCurrent = options.some(option => option.value === selection.value);
    return <section className="space-y-3 border-b p-3 text-xs" aria-label={tone ? copy.tone : copy.link}>
        <h2 className="font-medium">{tone ? copy.tone : copy.link}</h2>
        <p className="text-foreground-secondary">{tone ? copy.page : copy.shared}</p>
        {design ? <>
            {tone ? ['light', 'dark'].map(value => <label key={value} className="flex items-center gap-2">
                <Checkbox checked={options.some(option => option.value === value)} disabled={!available || value === selection.value}
                    onCheckedChange={checked => change(checked ? [...options, { id: value, label: copy[value as 'light' | 'dark'], value }]
                        : options.filter(option => option.value !== value))} />{copy[value as 'light' | 'dark']}
            </label>) : options.map((option, index) => <div key={option.id} className="space-y-1">
                <Input aria-label={`${copy.label} ${index + 1}`} value={option.label} disabled={!available} maxLength={80}
                    onChange={event => change(options.map(item => item.id === option.id ? { ...item, label: event.target.value } : item))} />
                <Input aria-label={`${copy.destination} ${index + 1}`} value={option.value} disabled={!available} maxLength={2048}
                    onChange={event => change(options.map(item => item.id === option.id ? { ...item, value: event.target.value } : item))} />
                {option.value !== selection.value && <Button size="sm" variant="ghost" disabled={!available}
                    onClick={() => change(options.filter(item => item.id !== option.id))}>{copy.remove}</Button>}
            </div>)}
            {!tone && <Button size="sm" variant="outline" disabled={!available || options.length >= 20}
                onClick={() => change([...options, { id: crypto.randomUUID(), label: '', value: '' }])}>{copy.add}</Button>}
            {!keepsCurrent && <p role="status">{copy.keepCurrent}</p>}
            <Button size="sm" className="w-full" disabled={!available || !keepsCurrent || !options.length || options.some(option => !option.label.trim() || !option.value.trim())}
                onClick={() => void permission(false)}>{copy.approve}</Button>
            {approved && <Button size="sm" variant="ghost" disabled={!available || dirty} onClick={() => void permission(true)}>{copy.revoke}</Button>}
        </> : approved && pin ? <Select value={pin.binding.options.find(option => option.value === selection.value)?.id}
            disabled={!available || !source.isPropertyApprovalCurrent(pin) || source.hasLocalWork} onValueChange={choice => void choose(choice)}>
            <SelectTrigger size="sm" aria-label={tone ? copy.tone : copy.link}><SelectValue /></SelectTrigger>
            <SelectContent>{pin.binding.options.map(option => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent>
        </Select> : <p className="text-foreground-secondary">{copy.locked}</p>}
        {dirty && !available && <p role="status">{copy.stale}</p>}
        {dirty && <div className="flex gap-2"><Button size="sm" variant="ghost" disabled={busy}
            onClick={() => { void navigator.clipboard.writeText(JSON.stringify(options, null, 2)).catch(() => setError('failed')); }}>{copy.copy}</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={discard}>{copy.discard}</Button></div>}
        {error && <p role={error === 'failed' ? 'alert' : 'status'} className={error === 'failed' ? 'text-destructive' : undefined}>{copy[error]}</p>}
    </section>;
});
