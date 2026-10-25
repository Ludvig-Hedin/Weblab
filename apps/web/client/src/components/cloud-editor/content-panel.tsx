import { ImportedPropertyApproval } from './imported-property-approval';
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useAction } from 'convex/react';
import type { DomElement } from '@weblab/models';
import { readContentTextTarget } from '@weblab/parser/src/code-edit/content-target';
import { cloudEditorApi } from '@/lib/cloud-editor/api';
import { validTextRenderMapping } from '@/components/store/editor/sandbox/cloud-source';
import { observer } from 'mobx-react-lite';

import { EditorAttributes } from '@weblab/constants';
import { parse, t } from '@weblab/parser';

import type { CloudContentSelection } from './content-approval';
import type { CloudSource } from '@/components/store/editor/sandbox/cloud-source';
import { useEditorEngine } from '@/components/store/editor';
import { useCloudEditorCopy } from '@/lib/cloud-editor/copy';
import { CloudContentApproval } from './content-approval';
import { selectedComponentTextTarget } from './component-text-selection';
import { readContentImageTarget } from '@weblab/parser/src/code-edit/content-image-target';
import { captureConvexAuthOwner, getConvexHttpClientForOwner } from '@/components/store/lib/convex-http-client';
import { ImportedImageApproval, type ImportedImageSelection } from './imported-image-approval';
import type { FunctionArgs } from 'convex/server';

function selectedLeafKey(element: DomElement | undefined): string {
    return JSON.stringify([element?.branchId, element?.frameId, element?.domId, element?.instanceId, element?.oid,
        element?.contentIdentity?.mappingId, element?.contentIdentity?.itemId]);
}

/** Read literals from saved source, never from computed styles or arbitrary DOM attributes. */
function selectedLiterals(
    code: string,
    oid: string,
): Pick<CloudContentSelection, 'tag' | 'attributes' | 'plainText'> | null {
    const ast = parse(code, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
    let result: Pick<CloudContentSelection, 'tag' | 'attributes' | 'plainText'> | null = null;
    t.traverseFast(ast, (node) => {
        if (!t.isJSXElement(node) || !t.isJSXIdentifier(node.openingElement.name)) return;
        if (
            !node.openingElement.attributes.some(
                (attribute) =>
                    t.isJSXAttribute(attribute) &&
                    t.isJSXIdentifier(attribute.name, { name: EditorAttributes.DATA_WEBLAB_ID }) &&
                    t.isStringLiteral(attribute.value) &&
                    attribute.value.value === oid,
            )
        )
            return;
        const attributes: Record<string, string> = {};
        for (const attribute of node.openingElement.attributes) {
            if (!t.isJSXAttribute(attribute) || !t.isJSXIdentifier(attribute.name)) continue;
            const value = t.isStringLiteral(attribute.value)
                ? attribute.value
                : t.isJSXExpressionContainer(attribute.value) &&
                    t.isStringLiteral(attribute.value.expression)
                  ? attribute.value.expression
                  : null;
            if (value) attributes[attribute.name.name] = value.value;
        }
        const plainText =
            !node.openingElement.selfClosing &&
            node.children.length > 0 &&
            node.children.every(
                (child) =>
                    t.isJSXText(child) ||
                    (t.isJSXExpressionContainer(child) && t.isStringLiteral(child.expression)) ||
                    (t.isJSXElement(child) &&
                        t.isJSXIdentifier(child.openingElement.name, { name: 'br' }) &&
                        child.openingElement.selfClosing),
            );
        result = { tag: node.openingElement.name.name, attributes, plainText };
    });
    return result;
}

/** Resolve the selected DOM identity against saved source before offering approval. */
const ScopedContentPanel = observer(
    ({ source, scopeKey, actorId }: { source: CloudSource; scopeKey: string; actorId: string }) => {
        const engine = useEditorEngine();
        const copy = useCloudEditorCopy();
        const selected = engine.elements.selected[0];
        const selectedKey = selectedLeafKey(selected);
        const resolveSelection = useAction(cloudEditorApi.resolveTextSelection);
        const [selection, setSelection] = useState<CloudContentSelection | null>(null);
        const [pinnedDraft, setPinnedDraft] = useState<CloudContentSelection | null>(null);
        const [imageSelection, setImageSelection] = useState<ImportedImageSelection | null>(null);
        const [pinnedImageDraft, setPinnedImageDraft] = useState<ImportedImageSelection | null>(null);
        const [imageResolution, setImageResolution] = useState({ key: '', pending: true });
        const [imageDraftVersion, setImageDraftVersion] = useState(0);
        const oid = selected?.oid;
        const branchId = selected?.branchId;
        const revision = source?.state.savedRevision;
        const attributeWritePending = source.state.attributeWritePending;
        const textSnapshot = source.state.textContracts;
        const imageSnapshot = source.state.imageContracts;
        const contentMode = source.isContentMode;
        const selectedImage = source.state.profile === 'imported-next-v1' && selected?.tagName.toLowerCase() === 'img';
        // Identity survives this image's own pending save; fresh-write readiness is checked separately.
        const imageCurrent = useCallback((candidate: ImportedImageSelection) =>
            engine.activeSandbox.cloudSource === source && candidate.scopeKey === scopeKey && candidate.actorId === actorId &&
            engine.elements.selected.length === 1 && source.state.accessReady &&
            source.state.imageContracts?.actorId === actorId && candidate.selectionKey === selectedLeafKey(engine.elements.selected[0]) &&
            source.state.savedRevision === candidate.revision && !source.state.needsReload && !source.state.loading,
        [engine, source, scopeKey, actorId]);
        const validateImage = useCallback(async (candidate: ImportedImageSelection) => {
            if (!imageCurrent(candidate)) return false;
            const frame = engine.frames.get(candidate.frameId), layers = engine.ast.mappings.getMapping(candidate.frameId);
            if (!frame?.view || frame.frame.branchId !== source.scope.branchId || !layers) return false;
            const matches: DomElement[] = [];
            for (const layer of layers.values()) {
                if (layer.oid !== candidate.oid) continue;
                const live = await frame.view.getElementByDomId(layer.domId, true);
                if (!imageCurrent(candidate) || !live || live.instanceId !== layer.instanceId || live.frameId !== candidate.frameId) return false;
                if (live.tagName.toLowerCase() === 'img' && live.branchId === source.scope.branchId && live.oid === candidate.oid &&
                    live.contentIdentity?.mappingId === candidate.contentIdentity.mappingId && live.contentIdentity.itemId === 'single') matches.push(live);
            }
            return matches.length === 1 && matches[0]?.domId === candidate.domId && matches[0]?.instanceId === candidate.instanceId;
        }, [engine, source, imageCurrent]);
        const selectionReady = !source.hasLocalWork && !source.state.pending && !source.state.needsReload && !source.state.loading;
        useEffect(() => {
            let current = true;
            setSelection((previous) =>
                previous?.scopeKey === scopeKey && previous.selectionKey === selectedKey ? previous : null,
            );
            setImageSelection(previous => previous?.scopeKey === scopeKey && previous.selectionKey === selectedKey ? previous : null);
            const branch = branchId ? engine.branches.getBranchDataById(branchId) : null;
            const codeEditor = branch?.codeEditor;
            const hint = selected?.contentIdentity ? { ...selected.contentIdentity } : undefined;
            const selectedFrame = selected?.frameId;
            const selectedDom = selected?.domId;
            const sourceVersion = source.getSourceVersion();
            const capturedPin = selected ? source.resolveRenderedTextApproval(selected) : null;
            const capturedImagePin = selected ? source.resolveRenderedImageApproval(selected) : null;
            const authOwner = captureConvexAuthOwner();
            const stillCurrent = () => current && (!selectedImage || authOwner?.isCurrent()) && engine.activeSandbox.cloudSource === source &&
                engine.elements.selected.length === 1 && selectedLeafKey(engine.elements.selected[0]) === selectedKey &&
                branch?.codeEditor === codeEditor && branch?.sandbox.cloudSource === source &&
                source.state.savedRevision === revision && source.getSourceVersion() === sourceVersion &&
                source.isContentMode === contentMode && source.state.accessReady &&
                (source.state.profile === 'imported-next-v1' ? source.state.textContracts?.actorId === actorId : source.state.contracts?.actorId === actorId) &&
                !source.hasLocalWork && !source.state.pending && !source.state.needsReload && !source.state.loading;
            const currentLeaf = async (): Promise<boolean> => {
                if (!stillCurrent() || !selectedFrame || !selectedDom || !hint) return false;
                const frame = engine.frames.get(selectedFrame);
                const layers = engine.ast.mappings.getMapping(selectedFrame);
                if (!frame?.view || frame.frame.branchId !== branchId || !layers) return false;
                const matches: DomElement[] = [];
                for (const layer of layers.values()) {
                    if (layer.oid !== oid) continue;
                    const live = await frame.view.getElementByDomId(layer.domId, true);
                    if (!stillCurrent() || !live || live.frameId !== selectedFrame || live.instanceId !== layer.instanceId) return false;
                    if ((!selectedImage || live.tagName.toLowerCase() === 'img') && live.branchId === branchId && live.oid === oid && live.contentIdentity?.mappingId === hint.mappingId &&
                        live.contentIdentity.itemId === hint.itemId) matches.push(live);
                }
                return matches.length === 1 && matches[0]?.domId === selectedDom;
            };
            setImageResolution({ key: selectedKey, pending: selectedImage && !!oid && !!branch && !!codeEditor && !!revision && selectionReady });
            if (oid && branch && codeEditor && source.scope.branchId === branchId && revision && selectionReady) {
                void (async () => {
                    const metadata = await codeEditor.getJsxElementMetadata(oid);
                    if (!stillCurrent() || !metadata) return;
                    const details = selectedLiterals(metadata.code, oid);
                    const base = { scopeKey, oid, revision, selectionKey: selectedKey,
                        frameId: selectedFrame, domId: selectedDom, contentIdentity: hint,
                        ...(details ?? { tag: '', attributes: {}, plainText: false }) };
                    if (source.state.profile === 'imported-next-v1') {
                        // Native images have their own owner family. Never interpret an image hint as FAQ text.
                        if (selectedImage) {
                            if (!hint || hint.itemId !== 'single' || details?.tag !== 'img' || !selectedFrame || !selectedDom || !authOwner || !authOwner.isCurrent() ||
                                !await currentLeaf()) throw new Error('Unsupported rendered image');
                            await authOwner.ready;
                            if (!stillCurrent() || !authOwner.isCurrent()) return;
                            const candidate = source.canDesign && !source.isContentMode
                                ? await getConvexHttpClientForOwner(authOwner).action(cloudEditorApi.resolveImageSelection, { ...source.scope,
                                    actorId: actorId as FunctionArgs<typeof cloudEditorApi.resolveImageSelection>['actorId'], expectedRevision: revision, oid, mappingId: hint.mappingId, itemId: 'single' })
                                : capturedImagePin && source.isImageApprovalCurrent(capturedImagePin)
                                    ? { path: capturedImagePin.path, target: capturedImagePin.binding.target, renderMapping: capturedImagePin.binding.renderMapping,
                                        actorId: capturedImagePin.actorId, revision, designRevision: capturedImagePin.designRevision, generation: capturedImagePin.generation,
                                        asset: capturedImagePin.binding.originalAsset, conflictingFamily: null }
                                    : null;
                            if (!candidate || !stillCurrent() || !authOwner.isCurrent() || candidate.actorId !== actorId || candidate.revision !== revision ||
                                candidate.renderMapping.mappingId !== hint.mappingId || candidate.renderMapping.renderer.oid !== oid ||
                                candidate.renderMapping.renderer.path !== metadata.path.replace(/^\/+/, '')) throw new Error('Unsupported rendered image');
                            const owner = await codeEditor.readFile(candidate.path);
                            if (typeof owner !== 'string' || !stillCurrent() || !authOwner.isCurrent() || !await currentLeaf()) return;
                            const value = readContentImageTarget(owner, candidate.target);
                            setImageSelection({ scopeKey, selectionKey: selectedKey, oid, frameId: selectedFrame, domId: selectedDom, instanceId: selected!.instanceId,
                                contentIdentity: { mappingId: hint.mappingId, itemId: 'single' }, path: candidate.path, target: candidate.target, value, renderMapping: candidate.renderMapping,
                                actorId, revision, designRevision: candidate.designRevision, generation: candidate.generation, asset: candidate.asset,
                                pin: capturedImagePin, conflictingFamily: candidate.conflictingFamily });
                            return;
                        }
                        if (hint) {
                            if (!await currentLeaf()) throw new Error('Unsupported rendered item');
                            const candidate = source.canDesign && !source.isContentMode
                                ? await resolveSelection({ ...source.scope, expectedRevision: revision, oid, ...hint })
                                : capturedPin && source.isTextApprovalCurrent(capturedPin)
                                    ? { path: capturedPin.path, target: capturedPin.target, renderMapping: capturedPin.renderMapping,
                                        actorId: capturedPin.actorId, revision, designRevision: capturedPin.designRevision, generation: capturedPin.generation }
                                    : null;
                            if (!candidate || !stillCurrent() || candidate.actorId !== actorId || candidate.revision !== revision ||
                                candidate.target.kind !== 'data-leaf' || !validTextRenderMapping(candidate.renderMapping) ||
                                candidate.renderMapping.mappingId !== hint.mappingId || candidate.target.itemId !== hint.itemId ||
                                candidate.renderMapping.renderer.oid !== oid || candidate.renderMapping.renderer.path !== metadata.path.replace(/^\/+/, ''))
                                throw new Error('Unsupported rendered item');
                            const owner = await codeEditor.readFile(candidate.path);
                            if (typeof owner !== 'string' || !await currentLeaf() || !stillCurrent() ||
                                (capturedPin && source.isContentMode && !source.isTextApprovalCurrent(capturedPin))) return;
                            readContentTextTarget(owner, candidate.target);
                            const question = readContentTextTarget(owner, { ...candidate.target, property: 'question' });
                            setSelection({ ...base, path: candidate.path, contractVersion: 2, textTarget: candidate.target,
                                renderMapping: candidate.renderMapping, questionLabel: question,
                                selectionActorId: candidate.actorId, selectionGeneration: candidate.generation,
                                selectionDesignRevision: candidate.designRevision, plainText: true });
                            return;
                        }
                        const code = await codeEditor.readFile(metadata.path);
                        if (!stillCurrent()) return;
                        const target = typeof code === 'string' ? selectedComponentTextTarget(code, oid) : null;
                        setSelection({ ...base, path: metadata.path,
                            ...(target ? { contractVersion: 2 as const, textTarget: target }
                                : { unsupportedReason: copy.contentUnsupported }) });
                        return;
                    }
                    setSelection({ ...base, path: metadata.path,
                        ...(!details ? { unsupportedReason: copy.contentUnsupported } : {}) });
                })().catch(() => {
                    if (selectedImage) { if (stillCurrent()) setImageSelection(null); return; }
                    if (stillCurrent()) setSelection({ scopeKey, oid, path: '', revision, selectionKey: selectedKey,
                        tag: '', attributes: {}, plainText: false, unsupportedReason: hint ? copy.contentFaqUnsupported : copy.contentUnsupported });
                }).finally(() => { if (current && selectedImage) setImageResolution({ key: selectedKey, pending: false }); });
            }
            return () => {
                current = false;
            };
        }, [engine, oid, branchId, source, revision, attributeWritePending, copy, scopeKey, selectionReady, selectedKey, resolveSelection, actorId, textSnapshot, imageSnapshot, selectedImage, contentMode, imageDraftVersion]);
        const readAsset = useCallback(
            async (url: string): Promise<Blob | null> => {
                if (
                    !source.scope.branchId ||
                    !url.startsWith('/') ||
                    url.startsWith('//') ||
                    /[\\?#%]/.test(url) ||
                    url.split('/').some((part) => part === '.' || part === '..')
                )
                    return null;
                const extensions: Record<string, string> = {
                    png: 'image/png',
                    jpg: 'image/jpeg',
                    jpeg: 'image/jpeg',
                    webp: 'image/webp',
                    avif: 'image/avif',
                    gif: 'image/gif',
                    ico: 'image/x-icon',
                };
                const mime = extensions[url.split('.').pop()?.toLowerCase() ?? ''];
                if (!mime) return null;
                const branch = engine.branches.getBranchDataById(source.scope.branchId);
                const bytes = await branch?.codeEditor.readFile(`public${url}`);
                if (bytes === undefined || bytes === null) return null;
                return new Blob([typeof bytes === 'string' ? bytes : Uint8Array.from(bytes)], {
                    type: mime,
                });
            },
            [engine, source, attributeWritePending],
        );
        const actorSnapshot = source.state.profile === 'imported-next-v1' ? source.state.textContracts : source.state.contracts;
        const activeScope =
            engine.activeSandbox.cloudSource === source &&
            (actorSnapshot === null || actorSnapshot?.actorId === actorId);
        const currentSelection =
            selection?.scopeKey === scopeKey &&
            selection.selectionKey === selectedKey &&
            branchId === source.scope.branchId
                ? selection
                : null;
        const resolved = activeScope
            ? pinnedDraft?.scopeKey === scopeKey
                ? pinnedDraft
                : currentSelection
            : null;
        const onDraftChange = useCallback(
            (draft: CloudContentSelection | null) => {
                setPinnedDraft(draft?.scopeKey === scopeKey ? draft : null);
            },
            [scopeKey],
        );
        const onImageDraftChange = useCallback((draft: ImportedImageSelection | null) => {
            setPinnedImageDraft(draft?.scopeKey === scopeKey ? draft : null);
            if (!draft) setImageDraftVersion(version => version + 1);
        }, [scopeKey]);
        const properties = source.state.profile === 'imported-next-v1'
            ? <ImportedPropertyApproval source={source} actorId={actorId} blocked={!!pinnedDraft || !!pinnedImageDraft} /> : null;
        if (source.state.profile === 'imported-next-v1' && (pinnedImageDraft || (selectedImage && !pinnedDraft))) return <>{properties}<ImportedImageApproval source={source} scopeKey={scopeKey} selectedKey={selectedKey}
            selection={pinnedImageDraft ?? (imageSelection?.selectionKey === selectedKey ? imageSelection : null)}
            actorId={actorId} selectedIdentity={selected?.oid && selected.contentIdentity?.itemId === 'single' ? { oid: selected.oid, mappingId: selected.contentIdentity.mappingId } : null}
            resolutionPending={imageResolution.key !== selectedKey || imageResolution.pending}
            current={imageCurrent} validate={validateImage} readAsset={readAsset} onDraftChange={onImageDraftChange} /></>;
        return (
            <>{properties}<CloudContentApproval
                key={scopeKey}
                source={source}
                scope={source.scope}
                selection={resolved}
                readAsset={readAsset}
                onDraftChange={onDraftChange}
                draftPinned={pinnedDraft !== null}
                onEditText={() => {
                    if (
                        !pinnedDraft &&
                        activeScope &&
                        resolved?.selectionKey === selectedLeafKey(engine.elements.selected[0])
                    )
                        void engine.text.editSelectedElement();
                }}
                onUploadImage={async (file, expectedGeneration, expectedRevision) => {
                    if (!resolved || resolved.scopeKey !== scopeKey || engine.activeSandbox.cloudSource !== source ||
                        source.state.contracts?.actorId !== actorId || source.scope.branchId !== engine.branches.activeBranch.id) return false;
                    return engine.action.uploadApprovedImage({ branchId: source.scope.branchId, oid: resolved.oid,
                        path: resolved.path.replace(/^\/+/, ''), expectedGeneration, expectedRevision }, file);
                }}
                onEditAttribute={async (field, value, expectedGeneration, expectedRevision) => {
                    if (
                        !resolved ||
                        resolved.scopeKey !== scopeKey ||
                        engine.activeSandbox.cloudSource !== source ||
                        source.state.contracts?.actorId !== actorId ||
                        source.scope.branchId !== engine.branches.activeBranch.id
                    )
                        return false;
                    return engine.action.editApprovedAttribute({
                        branchId: source.scope.branchId,
                        oid: resolved.oid,
                        path: resolved.path.replace(/^\/+/, ''),
                        field,
                        value,
                        expectedGeneration,
                        expectedRevision,
                    });
                }}
            /></>
        );
    },
);

export const CloudContentPanel = observer(() => {
    const engine = useEditorEngine();
    const { userId } = useAuth();
    const source = engine.activeSandbox.cloudSource;
    const identity = useRef({ source, userId, version: 0 });
    if (identity.current.source !== source || identity.current.userId !== userId) {
        identity.current = { source, userId, version: identity.current.version + 1 };
    }
    const retained = useRef<{ source: CloudSource; actorId: string; userId: string } | null>(null);
    if (
        !source ||
        !userId ||
        retained.current?.source !== source ||
        retained.current?.userId !== userId
    ) {
        retained.current = null;
    }
    const sourceUsers = useRef(new WeakMap<CloudSource, string>());
    const currentActor = source?.state.profile === 'imported-next-v1'
        ? source.state.textContracts?.actorId ?? source.state.imageContracts?.actorId : source?.state.contracts?.actorId;
    if (source && userId && currentActor && !sourceUsers.current.has(source)) {
        sourceUsers.current.set(source, userId);
    }
    if (source && sourceUsers.current.get(source) !== userId) return null;
    if (source && userId && currentActor)
        retained.current = { source, actorId: currentActor, userId };
    const actorId = retained.current?.actorId;
    if (!source || !actorId) return null;
    const scopeKey = JSON.stringify([
        source.scope.projectId,
        source.scope.branchId,
        actorId,
        userId,
    ]);
    return (
        <ScopedContentPanel
            key={`${scopeKey}:${identity.current.version}`}
            source={source}
            scopeKey={scopeKey}
            actorId={actorId}
        />
    );
});
