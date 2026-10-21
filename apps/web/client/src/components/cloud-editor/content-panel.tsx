'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { observer } from 'mobx-react-lite';

import { EditorAttributes } from '@weblab/constants';
import { parse, t } from '@weblab/parser';

import type { CloudContentSelection } from './content-approval';
import type { CloudSource } from '@/components/store/editor/sandbox/cloud-source';
import { useEditorEngine } from '@/components/store/editor';
import { useCloudEditorCopy } from '@/lib/cloud-editor/copy';
import { CloudContentApproval } from './content-approval';

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
        const [selection, setSelection] = useState<CloudContentSelection | null>(null);
        const [pinnedDraft, setPinnedDraft] = useState<CloudContentSelection | null>(null);
        const oid = selected?.oid;
        const branchId = selected?.branchId;
        const revision = source?.state.savedRevision;
        const attributeWritePending = source.state.attributeWritePending;
        useEffect(() => {
            let current = true;
            setSelection((previous) =>
                previous?.scopeKey === scopeKey && previous.oid === oid ? previous : null,
            );
            const branch = branchId ? engine.branches.getBranchDataById(branchId) : null;
            if (oid && branch && source?.scope.branchId === branchId && revision) {
                void branch.codeEditor
                    .getJsxElementMetadata(oid)
                    .then((metadata) => {
                        if (!current || !metadata) return;
                        const details = selectedLiterals(metadata.code, oid);
                        setSelection({
                            scopeKey,
                            oid,
                            path: metadata.path,
                            revision,
                            ...(details ?? {
                                tag: '',
                                attributes: {},
                                plainText: false,
                                unsupportedReason: copy.contentUnsupported,
                            }),
                        });
                    })
                    .catch(() => {
                        if (current) setSelection(null);
                    });
            }
            return () => {
                current = false;
            };
        }, [engine, oid, branchId, source, revision, attributeWritePending, copy, scopeKey]);
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
        const activeScope =
            engine.activeSandbox.cloudSource === source &&
            (source.state.contracts === null || source.state.contracts?.actorId === actorId);
        const currentSelection =
            selection?.scopeKey === scopeKey &&
            selection.oid === oid &&
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
        return (
            <CloudContentApproval
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
                        resolved?.oid === engine.elements.selected[0]?.oid
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
            />
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
    const currentActor = source?.state.contracts?.actorId;
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
