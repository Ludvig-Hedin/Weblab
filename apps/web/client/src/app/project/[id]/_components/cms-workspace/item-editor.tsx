'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { makeFunctionReference } from 'convex/server';
import { api } from '@convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import type { Doc, Id } from '@convex/_generated/dataModel';
import { Button } from '@weblab/ui/button';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@weblab/ui/sheet';
import { toast } from '@weblab/ui/sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useProjectCapabilities } from '@/hooks/use-project-capabilities';
import { transKeys } from '@/i18n/keys';
import { draftKey, emptyItemState, receiveItem } from './item-editor-state';
import { ItemField } from './item-fields';

interface Props {
    projectId: string;
    collection: Doc<'cmsCollections'>;
    fields: Doc<'cmsFields'>[];
    itemId: string | null;
    onClose: () => void;
}

export const ItemEditor = ({ projectId, collection, fields, itemId, onClose }: Props) => {
    const t = useTranslations();
    const archiveT = useTranslations('cms.archive');
    const { confirm, dialog } = useConfirm();
    const identity = `${projectId}:${collection._id}:${itemId ?? 'new'}`;
    const [state, setState] = useState(() => emptyItemState(identity));
    const [open, setOpen] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const savingRef = useRef(false);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const item = useQuery(api.cmsItems.get, itemId ? { projectId: projectId as Id<'projects'>, itemId: itemId as Id<'cmsItems'> } : 'skip');
    const source = useQuery(api.cmsSources.get, { projectId: projectId as Id<'projects'>, sourceId: collection.sourceId });
    const capabilities = useProjectCapabilities(projectId);
    const create = useMutation(api.cmsItems.create);
    const update = useMutation(api.cmsItems.update);
    const restore = useMutation(makeFunctionReference<'mutation', { projectId: Id<'projects'>; itemId: Id<'cmsItems'>; expectedRevision: number; values?: Record<string, unknown> }, { success: true }>('cmsItems:restore'));
    const archived = item?.archivedAt !== undefined;
    const dirty = draftKey(state.draft) !== state.baseline;
    const dirtyRef = useRef(dirty);
    dirtyRef.current = dirty;
    const external = (source !== undefined && source?.type !== 'weblab') || item?.remoteId !== undefined;
    const unavailable = state.identity !== identity || (itemId !== null && state.revision === null) || state.missing || source === undefined;
    const disabled = unavailable || external || state.conflict || isSaving || !capabilities.canEdit;

    useEffect(() => {
        if (savingRef.current) return;
        setState((previous) => {
            const base = previous.identity === identity ? previous : emptyItemState(identity);
            return itemId && item !== undefined ? receiveItem(base, item) : base;
        });
    }, [identity, itemId, item]);

    useEffect(() => {
        const handler = (event: BeforeUnloadEvent) => {
            if (!dirtyRef.current && !savingRef.current) return;
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', handler);
        return () => {
            window.removeEventListener('beforeunload', handler);
            if (closeTimer.current) clearTimeout(closeTimer.current);
        };
    }, []);

    const close = useCallback(async (force = false) => {
        if (savingRef.current && !force) return;
        if (!force && dirty && !await confirm({
            title: t(transKeys.cms.readiness.discardTitle),
            description: t(transKeys.cms.readiness.discardBody),
            confirmLabel: t(transKeys.cms.readiness.discard),
            cancelLabel: t(transKeys.cms.readiness.keepEditing), destructive: true,
        })) return;
        setOpen(false);
        closeTimer.current = setTimeout(onClose, 180);
    }, [confirm, dirty, onClose, t]);

    const reload = async () => {
        if (!item || savingRef.current) return;
        if (dirty && !await confirm({ title: t(transKeys.cms.readiness.reloadTitle), description: t(transKeys.cms.readiness.reloadBody), confirmLabel: t(transKeys.cms.readiness.reload), cancelLabel: t(transKeys.cms.readiness.keepEditing) })) return;
        setState((previous) => receiveItem(previous, item, true));
    };

    const save = async (ready: boolean) => {
        if (savingRef.current || disabled || (ready && (!capabilities.canPublish || archived))) return;
        savingRef.current = true;
        setIsSaving(true);
        const captured = state;
        try {
            const args = { projectId: projectId as Id<'projects'>, slug: captured.draft.slug.trim() || null, values: captured.draft.values, status: ready ? 'published' as const : 'draft' as const };
            if (archived && itemId && captured.revision !== null) {
                const baseline = JSON.parse(captured.baseline) as { values: Record<string, unknown> };
                const repairs = Object.fromEntries(fields
                    .filter((field) => draftKey(captured.draft.values[field.key]) !== draftKey(baseline.values[field.key]))
                    .map((field) => [field.key, captured.draft.values[field.key] ?? null]));
                await restore({ projectId: projectId as Id<'projects'>, itemId: itemId as Id<'cmsItems'>, expectedRevision: captured.revision, ...(Object.keys(repairs).length ? { values: repairs } : {}) });
            } else if (itemId && captured.revision !== null) {
                await update({ ...args, itemId: itemId as Id<'cmsItems'>, expectedRevision: captured.revision });
            } else {
                await create({ ...args, collectionId: collection._id });
            }
            toast.success(archived ? archiveT('restored') : t(ready ? transKeys.cms.readiness.readySaved : transKeys.cms.readiness.draftSaved));
            await close(true);
        } catch (error) {
            if (error instanceof Error && (error.message.includes('CONFLICT: This item changed.') || error.message.includes('CONFLICT: Content revision is unavailable.'))) setState((previous) => ({ ...previous, conflict: true }));
            toast.error(error instanceof Error ? error.message : t(transKeys.cms.itemEditor.failed));
        } finally {
            savingRef.current = false;
            setIsSaving(false);
        }
    };

    return <><Sheet open={open} onOpenChange={(next) => { if (!next) void close(); }}>
        <SheetContent side="right" className="flex w-[480px] flex-col gap-0 p-0 sm:max-w-md"
            onEscapeKeyDown={(event) => { event.preventDefault(); void close(); }}
            onInteractOutside={(event) => { event.preventDefault(); void close(); }}>
            <SheetHeader className="border-border border-b px-5 py-4">
                <SheetTitle>{itemId ? t(transKeys.cms.itemEditor.headerEdit) : t(transKeys.cms.itemEditor.headerNew, { name: collection.name })}</SheetTitle>
                <SheetDescription>{collection.name}</SheetDescription>
            </SheetHeader>
            {archived ? <p className="text-foreground-secondary text-mini border-border border-b px-5 py-3">{archiveT('editorNotice')}</p> : null}
            {external ? <p className="text-foreground-secondary text-mini border-border border-b px-5 py-3">{t(transKeys.cms.readiness.externalReadOnly)}</p> : null}
            {state.missing ? <p className="text-red text-mini px-5 py-3" role="alert">{t(transKeys.cms.readiness.itemRemoved)}</p> : state.conflict ? <div className="border-border border-b px-5 py-3" role="alert">
                <p className="text-foreground-secondary text-mini">{t(transKeys.cms.readiness.conflict)}</p>
                <Button size="sm" variant="ghost" onClick={() => void reload()} disabled={isSaving || !item}>{t(transKeys.cms.readiness.reload)}</Button>
            </div> : null}
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                <div className="space-y-1.5"><Label htmlFor="cms-item-slug">{t(transKeys.cms.itemEditor.slug)}</Label>
                    <Input id="cms-item-slug" disabled={disabled || archived} value={state.draft.slug} onChange={(event) => setState((previous) => ({ ...previous, draft: { ...previous.draft, slug: event.target.value } }))} />
                </div>
                {fields.map((field) => <div key={field._id} className="space-y-1.5">
                    <Label htmlFor={`field-${field._id}`}>{field.name}{field.required ? ' *' : ''}</Label>
                    <ItemField projectId={projectId as Id<'projects'>} field={field} value={state.draft.values[field.key]} disabled={disabled}
                        onChange={(value) => setState((previous) => ({ ...previous, draft: { ...previous.draft, values: { ...previous.draft.values, [field.key]: value } } }))} />
                    {field.helpText ? <p className="text-foreground-tertiary text-mini">{field.helpText}</p> : null}
                </div>)}
            </div>
            <SheetFooter className="border-border flex-row justify-between border-t px-5 py-3">
                <Button variant="ghost" onClick={() => void close()} disabled={isSaving}>{t(transKeys.cms.itemEditor.cancel)}</Button>
                <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => void save(false)} disabled={disabled}>{archived ? archiveT('restoreDraft') : t(transKeys.cms.itemEditor.saveDraft)}</Button>
                    {!archived && <Button onClick={() => void save(true)} disabled={disabled || !capabilities.canPublish}>{t(transKeys.cms.readiness.readyForReview)}</Button>}
                </div>
            </SheetFooter>
        </SheetContent>
    </Sheet>{dialog}</>;
};
