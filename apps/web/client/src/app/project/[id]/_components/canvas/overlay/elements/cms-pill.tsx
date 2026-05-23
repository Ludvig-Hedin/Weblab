'use client';

import { useMemo } from 'react';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import { observer } from 'mobx-react-lite';

import { CmsBindingKind, EditorMode } from '@weblab/models';
import { Icons } from '@weblab/ui/icons';

import type { Id } from '@convex/_generated/dataModel';
import { useEditorEngine } from '@/components/store/editor';

/**
 * Small pill rendered above the selected canvas element when it has a CMS
 * binding. Cosmetic only — the bind/edit-binding UX lives in the
 * right-click menu and bind dialog.
 */
export const CmsPill = observer(() => {
    const editorEngine = useEditorEngine();
    const projectId = editorEngine.projectId;
    const selectedRect = editorEngine.overlay.state.clickRects[0] ?? null;
    const oid = editorEngine.elements.selected[0]?.oid ?? null;
    const isPreview = editorEngine.state.editorMode === EditorMode.PREVIEW;

    const bindings = useQuery(
        api.cmsBindings.listForProject,
        projectId ? { projectId: projectId as Id<'projects'> } : 'skip',
    );

    const bindingForSelected = useMemo(() => {
        if (!oid) return null;
        return bindings?.find((b) => b.oid === oid) ?? null;
    }, [bindings, oid]);

    const collections = useQuery(
        api.cmsCollections.list,
        projectId && bindingForSelected ? { projectId: projectId as Id<'projects'> } : 'skip',
    );

    if (isPreview || !selectedRect || !bindingForSelected) return null;

    const payload = bindingForSelected.binding;
    const collectionId = 'collectionId' in payload ? payload.collectionId : null;
    const collection = collectionId ? collections?.find((c) => c._id === collectionId) : null;
    const fieldKey =
        payload.kind === CmsBindingKind.ITEM_FIELD ||
        payload.kind === CmsBindingKind.FIRST_FIELD ||
        payload.kind === CmsBindingKind.CURRENT_FIELD
            ? payload.fieldKey
            : null;

    const collectionLabel = collection?.name ?? 'CMS';
    const label =
        payload.kind === CmsBindingKind.REPEAT
            ? `Repeating · ${collectionLabel}`
            : fieldKey
              ? `${collectionLabel} · ${fieldKey}`
              : collectionLabel;

    const PILL_HEIGHT = 22;
    const MARGIN = 6;
    const containerStyle: React.CSSProperties = {
        position: 'fixed',
        top: Math.max(0, selectedRect.top - PILL_HEIGHT - MARGIN),
        left: selectedRect.left + selectedRect.width - 4,
        transform: 'translateX(-100%)',
        pointerEvents: 'none',
        zIndex: 60,
    };

    return (
        <div style={containerStyle}>
            <div className="bg-foreground-primary text-background text-mini flex items-center gap-1 rounded-full px-2 py-0.5 font-medium shadow-sm">
                <Icons.Cube className="h-3 w-3" />
                <span className="max-w-[200px] truncate" title={label}>
                    {label}
                </span>
            </div>
        </div>
    );
});
