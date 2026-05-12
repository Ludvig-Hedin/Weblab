'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { CmsBindingKind } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@weblab/ui/dialog';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { RadioGroup, RadioGroupItem } from '@weblab/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import { toast } from '@weblab/ui/sonner';

import { useEditorEngine } from '@/components/store/editor';
import { transKeys } from '@/i18n/keys';
import { api } from '@/trpc/react';

type ItemBindKind =
    | CmsBindingKind.ITEM_FIELD
    | CmsBindingKind.FIRST_FIELD
    | CmsBindingKind.PAGE_ITEM_FIELD;

/**
 * Detected role of the canvas element being bound.
 *
 * - `item`: ordinary element. Single value bind (ITEM_FIELD or FIRST_FIELD).
 * - `list`: the element itself is `<div data-weblab-list>`. Configure REPEAT.
 * - `list-descendant`: the element is inside a list. Configure CURRENT_FIELD,
 *   inheriting the collection from the parent list's REPEAT binding.
 */
type DialogMode = 'item' | 'list' | 'list-descendant' | 'unknown';

const SORT_DIR_OPTIONS = [
    { value: 'asc', label: 'Ascending' },
    { value: 'desc', label: 'Descending' },
] as const;

// Radix Select disallows empty-string values; use a sentinel for the
// "no sort" option and translate it back to '' before persisting.
const SORT_NONE = '__none__';

export const BindDialog = observer(() => {
    const editorEngine = useEditorEngine();
    const projectId = editorEngine.projectId;
    const open = editorEngine.state.cmsBindDialogOpen;
    const oid = editorEngine.state.cmsBindTargetOid;
    const t = useTranslations();

    // Detected role + parent list (when list-descendant).
    const [mode, setMode] = useState<DialogMode>('unknown');
    const [parentListOid, setParentListOid] = useState<string | null>(null);

    // Item-mode state (matches v1 behavior).
    const [itemCollectionId, setItemCollectionId] = useState<string>('');
    const [itemFieldKey, setItemFieldKey] = useState<string>('');
    const [itemBindKind, setItemBindKind] = useState<ItemBindKind>(CmsBindingKind.ITEM_FIELD);
    const [itemId, setItemId] = useState<string>('');

    // List-mode state (REPEAT).
    const [repeatCollectionId, setRepeatCollectionId] = useState<string>('');
    const [repeatSortFieldKey, setRepeatSortFieldKey] = useState<string>('');
    const [repeatSortDirection, setRepeatSortDirection] = useState<'asc' | 'desc'>('asc');
    const [repeatLimit, setRepeatLimit] = useState<string>('');

    // List-descendant state (CURRENT_FIELD).
    const [currentFieldKey, setCurrentFieldKey] = useState<string>('');

    const utils = api.useUtils();

    const collectionsQuery = api.cms.collection.list.useQuery(
        { projectId: projectId ?? '' },
        { enabled: !!projectId && open },
    );
    const bindingsQuery = api.cms.binding.listForProject.useQuery(
        { projectId: projectId ?? '' },
        { enabled: !!projectId && open },
    );
    // v4: query collection-page registrations so we can offer PAGE_ITEM_FIELD.
    const pagesQuery = api.cms.collectionPage.list.useQuery(
        { projectId: projectId ?? '' },
        { enabled: !!projectId && open },
    );

    // Item-mode supporting queries — gated to avoid hitting the API when in
    // list / list-descendant mode.
    const activeItemCollectionId = mode === 'item' ? itemCollectionId : '';
    const itemFieldsQuery = api.cms.field.listByCollection.useQuery(
        { projectId: projectId ?? '', collectionId: activeItemCollectionId },
        { enabled: !!projectId && !!activeItemCollectionId && open },
    );
    const itemsQuery = api.cms.item.list.useQuery(
        { projectId: projectId ?? '', collectionId: activeItemCollectionId },
        { enabled: !!projectId && !!activeItemCollectionId && open },
    );

    // List mode: pull fields for the selected collection (used for sort picker).
    const repeatFieldsQuery = api.cms.field.listByCollection.useQuery(
        { projectId: projectId ?? '', collectionId: repeatCollectionId },
        { enabled: !!projectId && !!repeatCollectionId && open && mode === 'list' },
    );

    // List-descendant: parent's binding gives us the inherited collection.
    const parentBinding = useMemo(() => {
        if (mode !== 'list-descendant' || !parentListOid) return null;
        return bindingsQuery.data?.find((b) => b.oid === parentListOid) ?? null;
    }, [bindingsQuery.data, mode, parentListOid]);
    const inheritedCollectionId =
        parentBinding && parentBinding.binding.kind === CmsBindingKind.REPEAT
            ? parentBinding.binding.collectionId
            : '';
    const descendantFieldsQuery = api.cms.field.listByCollection.useQuery(
        { projectId: projectId ?? '', collectionId: inheritedCollectionId },
        {
            enabled: !!projectId && !!inheritedCollectionId && open && mode === 'list-descendant',
        },
    );

    const upsertMutation = api.cms.binding.upsert.useMutation();
    const removeMutation = api.cms.binding.remove.useMutation();

    const existingBinding = useMemo(() => {
        if (!oid) return null;
        return bindingsQuery.data?.find((b) => b.oid === oid) ?? null;
    }, [bindingsQuery.data, oid]);

    // Detect the element's role on dialog open. Async because the iframe
    // call is over Penpal.
    useEffect(() => {
        // Reset to 'unknown' on close/no-target so a previously-detected
        // mode (list/list-descendant/item) cannot leak into the next open
        // before async detection completes — otherwise Save could persist
        // the wrong binding shape against a fresh element.
        if (!open || !oid) {
            setMode('unknown');
            setParentListOid(null);
            return;
        }
        setMode('unknown');
        const selected = editorEngine.elements.selected[0];
        if (!selected) {
            setMode('item');
            setParentListOid(null);
            return;
        }
        const view = editorEngine.frames.get(selected.frameId)?.view;
        if (!view) {
            setMode('item');
            setParentListOid(null);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const action = await view.getActionElement(selected.domId);
                if (cancelled) return;
                const isList = !!action?.attributes && 'data-weblab-list' in action.attributes;
                if (isList) {
                    setMode('list');
                    setParentListOid(null);
                    return;
                }
                const ancestor = await view.findListAncestorOid(selected.domId);
                if (cancelled) return;
                if (ancestor) {
                    setMode('list-descendant');
                    setParentListOid(ancestor);
                } else {
                    setMode('item');
                    setParentListOid(null);
                }
            } catch {
                if (!cancelled) {
                    setMode('item');
                    setParentListOid(null);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, oid, editorEngine.elements.selected, editorEngine.frames]);

    // Pre-fill from existing binding when opening on an already-bound oid.
    // Mode is set by the DOM detection above; this only fills form fields.
    // Lock after first fill so a background refetch (window focus,
    // mutation invalidation) doesn't overwrite the user's in-progress edits.
    const preFillRef = useRef(false);
    useEffect(() => {
        if (!open) {
            preFillRef.current = false;
            return;
        }
        if (preFillRef.current) return;
        // Wait for both queries to finish their first load so PAGE_ITEM_FIELD
        // bindings can resolve their collection from pagesQuery.data.
        if (bindingsQuery.isLoading || pagesQuery.isLoading) return;
        preFillRef.current = true;
        if (!existingBinding) {
            setItemCollectionId('');
            setItemFieldKey('');
            setItemBindKind(CmsBindingKind.ITEM_FIELD);
            setItemId('');
            setRepeatCollectionId('');
            setRepeatSortFieldKey('');
            setRepeatSortDirection('asc');
            setRepeatLimit('');
            setCurrentFieldKey('');
            return;
        }
        const b = existingBinding.binding;
        if (b.kind === CmsBindingKind.ITEM_FIELD) {
            setItemBindKind(CmsBindingKind.ITEM_FIELD);
            setItemCollectionId(b.collectionId);
            setItemId(b.itemId);
            setItemFieldKey(b.fieldKey);
        } else if (b.kind === CmsBindingKind.FIRST_FIELD) {
            setItemBindKind(CmsBindingKind.FIRST_FIELD);
            setItemCollectionId(b.collectionId);
            setItemFieldKey(b.fieldKey);
            setItemId('');
        } else if (b.kind === CmsBindingKind.PAGE_ITEM_FIELD) {
            setItemBindKind(CmsBindingKind.PAGE_ITEM_FIELD);
            // No collection on the binding — populate from the first
            // registration so the field picker has data.
            const firstReg = pagesQuery.data?.[0];
            setItemCollectionId(firstReg?.collectionId ?? '');
            setItemFieldKey(b.fieldKey);
            setItemId('');
        } else if (b.kind === CmsBindingKind.REPEAT) {
            setRepeatCollectionId(b.collectionId);
            setRepeatSortFieldKey(b.sort?.fieldKey ?? '');
            setRepeatSortDirection(b.sort?.direction ?? 'asc');
            setRepeatLimit(b.limit !== undefined ? String(b.limit) : '');
        } else if (b.kind === CmsBindingKind.CURRENT_FIELD) {
            setCurrentFieldKey(b.fieldKey);
        }
    }, [open, existingBinding, pagesQuery.data, bindingsQuery.isLoading, pagesQuery.isLoading]);

    // When the user picks a collection without a registered detail page,
    // the PAGE_ITEM_FIELD radio gets disabled but the kind state can stay on
    // it. Reset to ITEM_FIELD so handleSave doesn't persist an unreachable
    // binding for the new collection.
    useEffect(() => {
        if (itemBindKind !== CmsBindingKind.PAGE_ITEM_FIELD) return;
        if (!itemCollectionId) return;
        const mappedIds = (pagesQuery.data ?? []).map((p) => p.collectionId);
        if (!mappedIds.includes(itemCollectionId)) {
            setItemBindKind(CmsBindingKind.ITEM_FIELD);
        }
    }, [itemBindKind, itemCollectionId, pagesQuery.data]);

    const close = () => editorEngine.state.closeCmsBindDialog();

    const handleSave = async () => {
        if (!projectId || !oid) return;
        try {
            if (mode === 'list') {
                if (!repeatCollectionId) {
                    toast.error(t(transKeys.cms.bind.repeat.pickCollection));
                    return;
                }
                const trimmedLimit = repeatLimit.trim();
                const limit = trimmedLimit === '' ? undefined : Number(trimmedLimit);
                if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
                    toast.error(t(transKeys.cms.bind.repeat.invalidLimit));
                    return;
                }
                await upsertMutation.mutateAsync({
                    projectId,
                    oid,
                    binding: {
                        kind: CmsBindingKind.REPEAT,
                        collectionId: repeatCollectionId,
                        sort: repeatSortFieldKey
                            ? { fieldKey: repeatSortFieldKey, direction: repeatSortDirection }
                            : undefined,
                        limit,
                    },
                });
            } else if (mode === 'list-descendant') {
                if (!parentBinding || parentBinding.binding.kind !== CmsBindingKind.REPEAT) {
                    toast.error(t(transKeys.cms.bind.current.parentNotConfigured));
                    return;
                }
                if (!currentFieldKey) {
                    toast.error(t(transKeys.cms.bind.current.pickField));
                    return;
                }
                await upsertMutation.mutateAsync({
                    projectId,
                    oid,
                    binding: {
                        kind: CmsBindingKind.CURRENT_FIELD,
                        fieldKey: currentFieldKey,
                    },
                });
            } else {
                if (!itemFieldKey) {
                    toast.error(t(transKeys.cms.bind.pickAll));
                    return;
                }
                if (itemBindKind !== CmsBindingKind.PAGE_ITEM_FIELD && !itemCollectionId) {
                    toast.error(t(transKeys.cms.bind.pickAll));
                    return;
                }
                if (itemBindKind === CmsBindingKind.ITEM_FIELD && !itemId) {
                    toast.error(t(transKeys.cms.bind.pickItem));
                    return;
                }
                await upsertMutation.mutateAsync({
                    projectId,
                    oid,
                    binding:
                        itemBindKind === CmsBindingKind.ITEM_FIELD
                            ? {
                                  kind: CmsBindingKind.ITEM_FIELD,
                                  collectionId: itemCollectionId,
                                  itemId,
                                  fieldKey: itemFieldKey,
                              }
                            : itemBindKind === CmsBindingKind.FIRST_FIELD
                              ? {
                                    kind: CmsBindingKind.FIRST_FIELD,
                                    collectionId: itemCollectionId,
                                    fieldKey: itemFieldKey,
                                }
                              : {
                                    kind: CmsBindingKind.PAGE_ITEM_FIELD,
                                    fieldKey: itemFieldKey,
                                },
                });
            }
            await utils.cms.binding.listForProject.invalidate({ projectId });
            await utils.cms.binding.snapshot.invalidate({ projectId });
            toast.success(t(transKeys.cms.bind.successSaved));
            close();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t(transKeys.cms.bind.failed));
        }
    };

    const handleRemove = async () => {
        if (!projectId || !oid) return;
        try {
            await removeMutation.mutateAsync({ projectId, oid });
            await utils.cms.binding.listForProject.invalidate({ projectId });
            await utils.cms.binding.snapshot.invalidate({ projectId });
            toast.success(t(transKeys.cms.bind.successRemoved));
            close();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t(transKeys.cms.bind.removeFailed));
        }
    };

    const collections = collectionsQuery.data ?? [];
    const itemFields = itemFieldsQuery.data ?? [];
    const items = itemsQuery.data ?? [];
    const repeatFields = repeatFieldsQuery.data ?? [];
    const descendantFields = descendantFieldsQuery.data ?? [];

    return (
        <Dialog open={open} onOpenChange={(o) => (!o ? close() : null)}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        {mode === 'list'
                            ? t(transKeys.cms.bind.repeat.title)
                            : mode === 'list-descendant'
                              ? t(transKeys.cms.bind.current.title)
                              : t(transKeys.cms.bind.title)}
                    </DialogTitle>
                    <DialogDescription>
                        {mode === 'list'
                            ? t(transKeys.cms.bind.repeat.description)
                            : mode === 'list-descendant'
                              ? t(transKeys.cms.bind.current.description)
                              : t(transKeys.cms.bind.description)}
                    </DialogDescription>
                </DialogHeader>

                {mode === 'unknown' ? (
                    // Don't flash an item form before async detection finishes —
                    // otherwise a list-descendant element briefly shows the
                    // wrong UI (BUG #6 from review).
                    <div className="text-foreground-tertiary text-mini py-6 text-center">
                        Loading…
                    </div>
                ) : mode === 'list' ? (
                    <RepeatForm
                        collections={collections}
                        fields={repeatFields}
                        collectionId={repeatCollectionId}
                        setCollectionId={(v) => {
                            setRepeatCollectionId(v);
                            setRepeatSortFieldKey('');
                        }}
                        sortFieldKey={repeatSortFieldKey}
                        setSortFieldKey={setRepeatSortFieldKey}
                        sortDirection={repeatSortDirection}
                        setSortDirection={setRepeatSortDirection}
                        limit={repeatLimit}
                        setLimit={setRepeatLimit}
                        t={t}
                    />
                ) : mode === 'list-descendant' ? (
                    <CurrentFieldForm
                        parentConfigured={
                            !!parentBinding && parentBinding.binding.kind === CmsBindingKind.REPEAT
                        }
                        inheritedCollection={collections.find(
                            (c) => c.id === inheritedCollectionId,
                        )}
                        fields={descendantFields}
                        fieldKey={currentFieldKey}
                        setFieldKey={setCurrentFieldKey}
                        t={t}
                    />
                ) : (
                    <ItemForm
                        collections={collections}
                        fields={itemFields}
                        items={items}
                        collectionId={itemCollectionId}
                        setCollectionId={(v) => {
                            setItemCollectionId(v);
                            setItemFieldKey('');
                            setItemId('');
                        }}
                        fieldKey={itemFieldKey}
                        setFieldKey={setItemFieldKey}
                        kind={itemBindKind}
                        setKind={setItemBindKind}
                        itemId={itemId}
                        setItemId={setItemId}
                        pageMappedCollectionIds={(pagesQuery.data ?? []).map((p) => p.collectionId)}
                        t={t}
                    />
                )}

                <DialogFooter className="flex-row justify-between sm:justify-between">
                    <div>
                        {existingBinding ? (
                            <Button
                                variant="ghost"
                                onClick={handleRemove}
                                disabled={removeMutation.isPending}
                                className="text-red"
                            >
                                {t(transKeys.cms.bind.remove)}
                            </Button>
                        ) : null}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={close}>
                            {t(transKeys.cms.bind.cancel)}
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={upsertMutation.isPending || mode === 'unknown'}
                        >
                            {existingBinding
                                ? t(transKeys.cms.bind.update)
                                : t(transKeys.cms.bind.bind)}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
});

// ---------------------------------------------------------------------------
// Sub-forms. Split out for readability — each owns its own JSX section but
// shares state with the parent dialog.
// ---------------------------------------------------------------------------

type T = ReturnType<typeof useTranslations>;

interface ItemFormProps {
    collections: { id: string; name: string }[];
    fields: { id: string; key: string; name: string; type: string }[];
    items: { id: string; slug: string | null; values: Record<string, unknown> }[];
    collectionId: string;
    setCollectionId: (v: string) => void;
    fieldKey: string;
    setFieldKey: (v: string) => void;
    kind: ItemBindKind;
    setKind: (k: ItemBindKind) => void;
    itemId: string;
    setItemId: (v: string) => void;
    /** Collection ids that have a registered collection-page mapping. Used
     *  to gate the PAGE_ITEM_FIELD option. */
    pageMappedCollectionIds: string[];
    t: T;
}

function ItemForm({
    collections,
    fields,
    items,
    collectionId,
    setCollectionId,
    fieldKey,
    setFieldKey,
    kind,
    setKind,
    itemId,
    setItemId,
    pageMappedCollectionIds,
    t,
}: ItemFormProps) {
    const pageOptionEnabled = !!collectionId && pageMappedCollectionIds.includes(collectionId);
    return (
        <div className="space-y-3 py-2">
            <div className="space-y-1.5">
                <Label htmlFor="bind-collection">{t(transKeys.cms.bind.collection)}</Label>
                <Select value={collectionId} onValueChange={setCollectionId}>
                    <SelectTrigger id="bind-collection">
                        <SelectValue
                            placeholder={
                                collections.length === 0
                                    ? t(transKeys.cms.bind.collectionEmpty)
                                    : t(transKeys.cms.bind.collectionPick)
                            }
                        />
                    </SelectTrigger>
                    <SelectContent>
                        {collections.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                                {c.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="bind-field">{t(transKeys.cms.bind.field)}</Label>
                <Select
                    value={fieldKey}
                    onValueChange={setFieldKey}
                    disabled={!collectionId || fields.length === 0}
                >
                    <SelectTrigger id="bind-field">
                        <SelectValue
                            placeholder={
                                !collectionId
                                    ? t(transKeys.cms.bind.fieldPickFirst)
                                    : fields.length === 0
                                      ? t(transKeys.cms.bind.fieldEmpty)
                                      : t(transKeys.cms.bind.fieldPick)
                            }
                        />
                    </SelectTrigger>
                    <SelectContent>
                        {fields.map((f) => (
                            <SelectItem key={f.id} value={f.key}>
                                {f.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-1.5">
                <Label>{t(transKeys.cms.bind.sourceLabel)}</Label>
                <RadioGroup
                    value={kind}
                    onValueChange={(v) => setKind(v as ItemBindKind)}
                    className="flex flex-col gap-1.5"
                >
                    <label className="text-small flex cursor-pointer items-center gap-2">
                        <RadioGroupItem value={CmsBindingKind.ITEM_FIELD} />
                        {t(transKeys.cms.bind.sourceItem)}
                    </label>
                    <label className="text-small flex cursor-pointer items-center gap-2">
                        <RadioGroupItem value={CmsBindingKind.FIRST_FIELD} />
                        {t(transKeys.cms.bind.sourceFirst)}
                    </label>
                    <label
                        className={
                            pageOptionEnabled
                                ? 'text-small flex cursor-pointer items-center gap-2'
                                : 'text-foreground-tertiary text-small flex cursor-not-allowed items-center gap-2'
                        }
                        title={
                            pageOptionEnabled ? undefined : t(transKeys.cms.bind.sourcePageDisabled)
                        }
                    >
                        <RadioGroupItem
                            value={CmsBindingKind.PAGE_ITEM_FIELD}
                            disabled={!pageOptionEnabled}
                        />
                        {t(transKeys.cms.bind.sourcePage)}
                    </label>
                </RadioGroup>
            </div>

            {kind === CmsBindingKind.ITEM_FIELD ? (
                <div className="space-y-1.5">
                    <Label htmlFor="bind-item">{t(transKeys.cms.bind.item)}</Label>
                    <Select
                        value={itemId}
                        onValueChange={setItemId}
                        disabled={!collectionId || items.length === 0}
                    >
                        <SelectTrigger id="bind-item">
                            <SelectValue
                                placeholder={
                                    items.length === 0
                                        ? t(transKeys.cms.bind.itemEmpty)
                                        : t(transKeys.cms.bind.itemPick)
                                }
                            />
                        </SelectTrigger>
                        <SelectContent>
                            {items.map((it) => {
                                const titleField = fields.find(
                                    (f) => f.type === 'text' || f.type === 'slug',
                                );
                                const titleValue = titleField ? it.values[titleField.key] : null;
                                const label =
                                    (typeof titleValue === 'string' && titleValue) ||
                                    it.slug ||
                                    it.id.slice(0, 8);
                                return (
                                    <SelectItem key={it.id} value={it.id}>
                                        {label}
                                    </SelectItem>
                                );
                            })}
                        </SelectContent>
                    </Select>
                </div>
            ) : null}
        </div>
    );
}

interface RepeatFormProps {
    collections: { id: string; name: string }[];
    fields: { id: string; key: string; name: string }[];
    collectionId: string;
    setCollectionId: (v: string) => void;
    sortFieldKey: string;
    setSortFieldKey: (v: string) => void;
    sortDirection: 'asc' | 'desc';
    setSortDirection: (v: 'asc' | 'desc') => void;
    limit: string;
    setLimit: (v: string) => void;
    t: T;
}

function RepeatForm({
    collections,
    fields,
    collectionId,
    setCollectionId,
    sortFieldKey,
    setSortFieldKey,
    sortDirection,
    setSortDirection,
    limit,
    setLimit,
    t,
}: RepeatFormProps) {
    return (
        <div className="space-y-3 py-2">
            <div className="space-y-1.5">
                <Label htmlFor="repeat-collection">{t(transKeys.cms.bind.repeat.collection)}</Label>
                <Select value={collectionId} onValueChange={setCollectionId}>
                    <SelectTrigger id="repeat-collection">
                        <SelectValue
                            placeholder={
                                collections.length === 0
                                    ? t(transKeys.cms.bind.collectionEmpty)
                                    : t(transKeys.cms.bind.collectionPick)
                            }
                        />
                    </SelectTrigger>
                    <SelectContent>
                        {collections.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                                {c.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="repeat-sort-field">{t(transKeys.cms.bind.repeat.sortField)}</Label>
                <Select
                    value={sortFieldKey === '' ? SORT_NONE : sortFieldKey}
                    onValueChange={(v) => setSortFieldKey(v === SORT_NONE ? '' : v)}
                    disabled={!collectionId || fields.length === 0}
                >
                    <SelectTrigger id="repeat-sort-field">
                        <SelectValue placeholder={t(transKeys.cms.bind.repeat.sortNone)} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={SORT_NONE}>
                            {t(transKeys.cms.bind.repeat.sortNone)}
                        </SelectItem>
                        {fields.map((f) => (
                            <SelectItem key={f.id} value={f.key}>
                                {f.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {sortFieldKey ? (
                <div className="space-y-1.5">
                    <Label htmlFor="repeat-sort-dir">
                        {t(transKeys.cms.bind.repeat.sortDirection)}
                    </Label>
                    <Select
                        value={sortDirection}
                        onValueChange={(v) => setSortDirection(v as 'asc' | 'desc')}
                    >
                        <SelectTrigger id="repeat-sort-dir">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {SORT_DIR_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                    {o.value === 'asc'
                                        ? t(transKeys.cms.bind.repeat.sortAsc)
                                        : t(transKeys.cms.bind.repeat.sortDesc)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            ) : null}

            <div className="space-y-1.5">
                <Label htmlFor="repeat-limit">{t(transKeys.cms.bind.repeat.limit)}</Label>
                <Input
                    id="repeat-limit"
                    type="number"
                    min={1}
                    placeholder={t(transKeys.cms.bind.repeat.limitPlaceholder)}
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                />
                <p className="text-foreground-tertiary text-mini">
                    {t(transKeys.cms.bind.repeat.limitHelp)}
                </p>
            </div>
        </div>
    );
}

interface CurrentFieldFormProps {
    parentConfigured: boolean;
    inheritedCollection: { id: string; name: string } | undefined;
    fields: { id: string; key: string; name: string }[];
    fieldKey: string;
    setFieldKey: (v: string) => void;
    t: T;
}

function CurrentFieldForm({
    parentConfigured,
    inheritedCollection,
    fields,
    fieldKey,
    setFieldKey,
    t,
}: CurrentFieldFormProps) {
    if (!parentConfigured) {
        return (
            <div className="text-foreground-secondary text-small py-4">
                {t(transKeys.cms.bind.current.parentNotConfigured)}
            </div>
        );
    }
    return (
        <div className="space-y-3 py-2">
            <div className="text-foreground-tertiary text-mini">
                {inheritedCollection
                    ? `${t(transKeys.cms.bind.current.inheritedCollectionPrefix)} ${inheritedCollection.name}`
                    : t(transKeys.cms.bind.current.inheritedUnknown)}
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="current-field">{t(transKeys.cms.bind.field)}</Label>
                <Select value={fieldKey} onValueChange={setFieldKey} disabled={fields.length === 0}>
                    <SelectTrigger id="current-field">
                        <SelectValue
                            placeholder={
                                fields.length === 0
                                    ? t(transKeys.cms.bind.fieldEmpty)
                                    : t(transKeys.cms.bind.fieldPick)
                            }
                        />
                    </SelectTrigger>
                    <SelectContent>
                        {fields.map((f) => (
                            <SelectItem key={f.id} value={f.key}>
                                {f.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}
