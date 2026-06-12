'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
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

import type { Id } from '@convex/_generated/dataModel';
import { useEditorEngine } from '@/components/store/editor';
import { transKeys } from '@/i18n/keys';

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

    // Convex live queries auto-revalidate — no manual invalidation needed.

    const collections = useQuery(
        api.cmsCollections.list,
        projectId && open ? { projectId: projectId as Id<'projects'> } : 'skip',
    );
    const bindings = useQuery(
        api.cmsBindings.listForProject,
        projectId && open ? { projectId: projectId as Id<'projects'> } : 'skip',
    );
    // v4: query collection-page registrations so we can offer PAGE_ITEM_FIELD.
    const pages = useQuery(
        api.cmsCollectionPages.list,
        projectId && open ? { projectId: projectId as Id<'projects'> } : 'skip',
    );

    // Item-mode supporting queries — gated to avoid hitting the API when in
    // list / list-descendant mode.
    const activeItemCollectionId = mode === 'item' ? itemCollectionId : '';
    const itemFieldsList = useQuery(
        api.cmsFields.listByCollection,
        projectId && activeItemCollectionId && open
            ? {
                  projectId: projectId as Id<'projects'>,
                  collectionId: activeItemCollectionId as Id<'cmsCollections'>,
              }
            : 'skip',
    );
    const itemsList = useQuery(
        api.cmsItems.list,
        projectId && activeItemCollectionId && open
            ? {
                  projectId: projectId as Id<'projects'>,
                  collectionId: activeItemCollectionId as Id<'cmsCollections'>,
              }
            : 'skip',
    );

    // List mode: pull fields for the selected collection (used for sort picker).
    const repeatFieldsList = useQuery(
        api.cmsFields.listByCollection,
        projectId && repeatCollectionId && open && mode === 'list'
            ? {
                  projectId: projectId as Id<'projects'>,
                  collectionId: repeatCollectionId as Id<'cmsCollections'>,
              }
            : 'skip',
    );

    // List-descendant: parent's binding gives us the inherited collection.
    const parentBinding = useMemo(() => {
        if (mode !== 'list-descendant' || !parentListOid) return null;
        return bindings?.find((b) => b.oid === parentListOid) ?? null;
    }, [bindings, mode, parentListOid]);
    const inheritedCollectionId =
        parentBinding && parentBinding.binding.kind === CmsBindingKind.REPEAT
            ? parentBinding.binding.collectionId
            : '';
    const descendantFieldsList = useQuery(
        api.cmsFields.listByCollection,
        projectId && inheritedCollectionId && open && mode === 'list-descendant'
            ? {
                  projectId: projectId as Id<'projects'>,
                  collectionId: inheritedCollectionId as Id<'cmsCollections'>,
              }
            : 'skip',
    );

    const upsertMutation = useMutation(api.cmsBindings.upsert);
    const removeMutation = useMutation(api.cmsBindings.remove);
    const [isUpserting, setIsUpserting] = useState(false);
    const [isRemoving, setIsRemoving] = useState(false);

    const existingBinding = useMemo(() => {
        if (!oid) return null;
        return bindings?.find((b) => b.oid === oid) ?? null;
    }, [bindings, oid]);

    // TODO(bug-hunt): mode detection reads `editorEngine.elements.selected[0]`
    // and re-runs whenever the canvas selection changes (dep on
    // `selected[0]?.domId`). If the user opens the bind dialog on
    // element A then clicks element B in the canvas, the dialog's
    // `mode` reflects B's role while `oid` (used by handleSave) still
    // targets A. Saving in that state can persist a REPEAT/CURRENT_FIELD
    // binding onto an element that isn't actually a list/list-descendant.
    // Fix options: close the dialog when selected element changes away
    // from the target oid, OR thread oid through the detection (resolve
    // element by oid instead of using `selected[0]`).
    // TODO(bug-hunt): pre-fill at REPEAT / FIRST_FIELD branch (~line 277)
    // only reads sort + limit. Existing `filters` and `filterMode` on
    // the binding are NOT loaded into local state — handleSave then
    // constructs the new binding without them and the upsert mutation
    // overwrites the whole payload, silently dropping any previously-
    // saved filters. No other UI currently writes filters but the
    // server `vBindingPayload` allows them; defensive merge or full
    // round-trip preservation would prevent future data loss.
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
    }, [
        open,
        oid,
        editorEngine.elements.selected[0]?.domId,
        // The Map identity never changes when entries mutate, so depend on
        // the specific frame view we'll read — going from null to loaded
        // re-triggers detection.
        editorEngine.frames.get(editorEngine.elements.selected[0]?.frameId ?? '')?.view,
    ]);

    // Pre-fill from existing binding when opening on an already-bound oid.
    // Mode is set by the DOM detection above; this only fills form fields.
    // Lock after first fill so a background refetch (window focus,
    // mutation invalidation) doesn't overwrite the user's in-progress edits.
    // Re-arm the lock when oid changes mid-open (the dialog can be retargeted
    // at a different element without closing first).
    const preFillRef = useRef(false);
    const lastOidRef = useRef<string | null>(null);
    useEffect(() => {
        if (!open) {
            preFillRef.current = false;
            lastOidRef.current = null;
            return;
        }
        if (lastOidRef.current !== oid) {
            preFillRef.current = false;
            lastOidRef.current = oid;
        }
        if (preFillRef.current) return;
        // Wait for queries to actually have data — Convex returns `undefined`
        // while loading. Using a cached "isLoading" would treat stale cache as
        // ready and skip a fresh fetch on reopen against a different oid.
        if (bindings === undefined || pages === undefined) return;
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
            const firstReg = pages?.[0];
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
    }, [open, oid, existingBinding, pages, bindings]);

    // When the user picks a collection without a registered detail page,
    // the PAGE_ITEM_FIELD radio gets disabled but the kind state can stay on
    // it. Reset to ITEM_FIELD so handleSave doesn't persist an unreachable
    // binding for the new collection.
    useEffect(() => {
        if (itemBindKind !== CmsBindingKind.PAGE_ITEM_FIELD) return;
        if (!itemCollectionId) return;
        const mappedIds = (pages ?? []).map((p) => p.collectionId as string);
        if (!mappedIds.includes(itemCollectionId)) {
            setItemBindKind(CmsBindingKind.ITEM_FIELD);
        }
    }, [itemBindKind, itemCollectionId, pages]);

    const close = () => editorEngine.state.closeCmsBindDialog();

    const handleSave = async () => {
        if (!projectId || !oid) return;
        // DOM detection still in flight — Save button is also disabled in
        // this state, but guard programmatic/keyboard paths too.
        if (mode === 'unknown') return;
        setIsUpserting(true);
        try {
            if (mode === 'list') {
                if (!repeatCollectionId) {
                    toast.error(t(transKeys.cms.bind.repeat.pickCollection));
                    return;
                }
                const trimmedLimit = repeatLimit.trim();
                const limit = trimmedLimit === '' ? undefined : Number(trimmedLimit);
                // 2_147_483_647 = PostgreSQL INT max; anything beyond that
                // would overflow the column. Number.isInteger accepts
                // scientific notation like 1e10, so cap explicitly.
                if (
                    limit !== undefined &&
                    (!Number.isInteger(limit) || limit < 1 || limit > 2_147_483_647)
                ) {
                    toast.error(t(transKeys.cms.bind.repeat.invalidLimit));
                    return;
                }
                await upsertMutation({
                    projectId: projectId as Id<'projects'>,
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
                await upsertMutation({
                    projectId: projectId as Id<'projects'>,
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
                await upsertMutation({
                    projectId: projectId as Id<'projects'>,
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
            // Convex live queries auto-revalidate — no manual invalidation needed.
            toast.success(t(transKeys.cms.bind.successSaved));
            close();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t(transKeys.cms.bind.failed));
        } finally {
            setIsUpserting(false);
        }
    };

    const handleRemove = async () => {
        if (!projectId || !oid) return;
        setIsRemoving(true);
        try {
            await removeMutation({ projectId: projectId as Id<'projects'>, oid });
            // Convex live queries auto-revalidate — no manual invalidation needed.
            toast.success(t(transKeys.cms.bind.successRemoved));
            close();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t(transKeys.cms.bind.removeFailed));
        } finally {
            setIsRemoving(false);
        }
    };

    // Map Convex docs (`_id`) to the `id`-shaped contracts the sub-forms read —
    // passing raw docs through made every `<SelectItem value={c.id}>` undefined,
    // so new bindings could never be configured.
    const collectionList = (collections ?? []).map((c) => ({ id: c._id, name: c.name }));
    const mapField = (f: { _id: string; key: string; name: string; type: string }) => ({
        id: f._id,
        key: f.key,
        name: f.name,
        type: f.type,
    });
    const itemFields = (itemFieldsList ?? []).map(mapField);
    const items = (itemsList ?? []).map((it) => ({
        id: it._id,
        slug: it.slug ?? null,
        values: it.values,
    }));
    const repeatFields = (repeatFieldsList ?? []).map(mapField);
    const descendantFields = (descendantFieldsList ?? []).map(mapField);

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
                        collections={collectionList}
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
                        inheritedCollection={collectionList.find(
                            (c) => c.id === inheritedCollectionId,
                        )}
                        fields={descendantFields}
                        fieldKey={currentFieldKey}
                        setFieldKey={setCurrentFieldKey}
                        t={t}
                    />
                ) : (
                    <ItemForm
                        collections={collectionList}
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
                        pageMappedCollectionIds={(pages ?? []).map((p) => p.collectionId as string)}
                        t={t}
                    />
                )}

                <DialogFooter className="flex-row justify-between sm:justify-between">
                    <div>
                        {existingBinding ? (
                            <Button
                                variant="ghost"
                                onClick={handleRemove}
                                disabled={isRemoving}
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
                        <Button onClick={handleSave} disabled={isUpserting || mode === 'unknown'}>
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
