'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';

import type { CmsCollection, CmsField } from '@weblab/db';
import { CmsFieldType, CmsItemStatus } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from '@weblab/ui/sheet';
import { toast } from '@weblab/ui/sonner';
import { Switch } from '@weblab/ui/switch';
import { Textarea } from '@weblab/ui/textarea';

import type { Id } from '@convex/_generated/dataModel';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { transKeys } from '@/i18n/keys';

interface Props {
    projectId: string;
    collection: CmsCollection;
    fields: CmsField[];
    /** When null, the editor is in "create" mode. */
    itemId: string | null;
    onClose: () => void;
}

interface FormSnapshot {
    slug: string;
    status: CmsItemStatus;
    values: Record<string, unknown>;
}

/**
 * Stable string representation of the editable form state. Used to detect
 * unsaved edits — keys at every level are sorted so insert order doesn't
 * flag the form as dirty on a no-op edit (e.g. setValues spread on an
 * unchanged record).
 */
function stableStringify(input: unknown): string {
    return JSON.stringify(input, (_key, value) => {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            const obj = value as Record<string, unknown>;
            return Object.keys(obj)
                .sort()
                .reduce<Record<string, unknown>>((acc, k) => {
                    acc[k] = obj[k];
                    return acc;
                }, {});
        }
        return value;
    });
}

function snapshotKey(snap: FormSnapshot): string {
    return stableStringify({
        slug: snap.slug,
        status: snap.status,
        values: snap.values,
    });
}

/**
 * Right-side sheet for creating/editing a single item. v1 supports the
 * common field types (text, rich_text, number, boolean, date, slug);
 * image / option / reference get full UI in a later slice and currently
 * fall back to a JSON-string textarea with inline validation.
 */
export const ItemEditor = ({ projectId, collection, fields, itemId, onClose }: Props) => {
    const [open, setOpen] = useState(true);
    const [values, setValues] = useState<Record<string, unknown>>({});
    const [slug, setSlug] = useState('');
    const [status, setStatus] = useState<CmsItemStatus>(CmsItemStatus.DRAFT);
    /** Field keys whose raw JSON textarea contents currently fail to parse. */
    const [invalidJsonFields, setInvalidJsonFields] = useState<Set<string>>(new Set());
    const t = useTranslations();
    const { confirm, dialog: confirmDialog } = useConfirm();

    // Convex live queries auto-revalidate — no useUtils equivalent needed.
    const item = useQuery(
        api.cmsItems.get,
        itemId
            ? {
                  projectId: projectId as Id<'projects'>,
                  itemId: itemId as Id<'cmsItems'>,
              }
            : 'skip',
    );
    const createMutation = useMutation(api.cmsItems.create);
    const updateMutation = useMutation(api.cmsItems.update);
    const [isSaving, setIsSaving] = useState(false);

    /**
     * Snapshot the form right after we seed it from the server (or from
     * blank defaults in create mode). `isDirty` compares the current form
     * against this baseline.
     */
    const initialSnapshotRef = useRef<string>(
        snapshotKey({ slug: '', status: CmsItemStatus.DRAFT, values: {} }),
    );

    useEffect(() => {
        if (!itemId) {
            // Create mode: seed defaults.
            const seed: FormSnapshot = {
                slug: '',
                status: CmsItemStatus.DRAFT,
                values: {},
            };
            setValues(seed.values);
            setSlug(seed.slug);
            setStatus(seed.status);
            initialSnapshotRef.current = snapshotKey(seed);
            return;
        }
        if (item) {
            const seed: FormSnapshot = {
                slug: item.slug ?? '',
                status: item.status as CmsItemStatus,
                values: (item.values ?? {}) as Record<string, unknown>,
            };
            setValues(seed.values);
            setSlug(seed.slug);
            setStatus(seed.status);
            initialSnapshotRef.current = snapshotKey(seed);
        }
    }, [itemId, item]);

    const currentSnapshotKey = useMemo(
        () => snapshotKey({ slug, status, values }),
        [slug, status, values],
    );
    const isDirty = currentSnapshotKey !== initialSnapshotRef.current;
    /** Stable ref so the beforeunload handler always sees the latest dirty flag. */
    const isDirtyRef = useRef(isDirty);
    useEffect(() => {
        isDirtyRef.current = isDirty;
    }, [isDirty]);

    // Warn on tab close / hard navigation while there are unsaved changes.
    // beforeunload covers reload, close-tab, address-bar nav — Next.js
    // soft navigation is handled separately via the Sheet's close guard.
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (!isDirtyRef.current) return;
            e.preventDefault();
            // Required for legacy browsers to surface the prompt.
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, []);

    const closeNow = useCallback(() => {
        setOpen(false);
        // Defer the parent close to let the sheet animate out.
        setTimeout(onClose, 180);
    }, [onClose]);

    /**
     * Guarded close: if there are unsaved edits, ask before discarding.
     * `force=true` skips the prompt (used by handleSave after a successful
     * round-trip, when there is nothing to lose).
     */
    const handleClose = useCallback(
        async (force = false) => {
            if (!force && isDirty) {
                const ok = await confirm({
                    title: 'Discard unsaved changes?',
                    description:
                        'Your edits to this item have not been saved. Close anyway and lose your changes?',
                    confirmLabel: 'Discard changes',
                    cancelLabel: 'Keep editing',
                    destructive: true,
                });
                if (!ok) return;
            }
            closeNow();
        },
        [closeNow, confirm, isDirty],
    );

    const handleSave = async (publish: boolean) => {
        setIsSaving(true);
        try {
            const finalStatus = publish ? CmsItemStatus.PUBLISHED : status;
            if (itemId) {
                await updateMutation({
                    projectId: projectId as Id<'projects'>,
                    itemId: itemId as Id<'cmsItems'>,
                    slug: slug.trim() || undefined,
                    values,
                    status: finalStatus,
                });
            } else {
                await createMutation({
                    projectId: projectId as Id<'projects'>,
                    collectionId: collection.id as Id<'cmsCollections'>,
                    slug: slug.trim() || undefined,
                    values,
                    status: finalStatus,
                });
            }
            // Convex live queries auto-revalidate — no manual invalidate needed.
            toast.success(
                itemId
                    ? t(transKeys.cms.itemEditor.successUpdated)
                    : t(transKeys.cms.itemEditor.successCreated),
            );
            // Save succeeded — close without the unsaved-changes prompt.
            void handleClose(true);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t(transKeys.cms.itemEditor.failed));
        } finally {
            setIsSaving(false);
        }
    };

    const headerTitle = itemId
        ? t(transKeys.cms.itemEditor.headerEdit)
        : t(transKeys.cms.itemEditor.headerNew, { name: collection.name });

    // External-source items are read-only at our layer — the next sync
    // will overwrite any local edit. Detect via `remoteId`. We still let
    // the user view the values; we just disable save and surface a warning
    // (BUG #18 from review).
    const isExternalItem = !!item?.remoteId;

    const setInvalidFor = useCallback((key: string, invalid: boolean) => {
        setInvalidJsonFields((prev) => {
            const has = prev.has(key);
            if (invalid === has) return prev;
            const next = new Set(prev);
            if (invalid) next.add(key);
            else next.delete(key);
            return next;
        });
    }, []);

    const hasInvalidJson = invalidJsonFields.size > 0;

    return (
        <>
            <Sheet
                open={open}
                onOpenChange={(o) => {
                    if (!o) void handleClose();
                }}
            >
                <SheetContent
                    side="right"
                    className="flex w-[480px] flex-col gap-0 p-0 sm:max-w-md"
                    /*
                     * Radix's Dialog primitive closes the sheet on Esc and
                     * outside-click before our `onOpenChange` ever fires.
                     * Calling preventDefault here keeps the sheet open so
                     * the confirm dialog can decide. (handleClose still
                     * runs and prompts if dirty; if clean, it closes.)
                     */
                    onEscapeKeyDown={(e) => {
                        e.preventDefault();
                        void handleClose();
                    }}
                    onInteractOutside={(e) => {
                        e.preventDefault();
                        void handleClose();
                    }}
                >
                    <SheetHeader className="border-border border-b px-5 py-4">
                        <SheetTitle>{headerTitle}</SheetTitle>
                        <SheetDescription className="text-foreground-tertiary">
                            {collection.name}
                        </SheetDescription>
                    </SheetHeader>

                    {isExternalItem ? (
                        <div className="border-border bg-background-secondary/40 text-foreground-secondary text-mini border-b px-5 py-2">
                            This item is synced from an external source. Edits will be overwritten
                            on the next sync.
                        </div>
                    ) : null}

                    <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                        <FieldRow label={t(transKeys.cms.itemEditor.slug)} htmlFor="slug">
                            <Input
                                id="slug"
                                value={slug}
                                onChange={(e) => setSlug(e.target.value)}
                                placeholder={t(transKeys.cms.itemEditor.slugAuto)}
                            />
                        </FieldRow>

                        {fields.map((f) => (
                            <FieldRow
                                key={f.id}
                                label={`${f.name}${f.required ? ' *' : ''}`}
                                htmlFor={`field-${f.id}`}
                                help={f.helpText as string | undefined}
                            >
                                <FieldInput
                                    field={f}
                                    value={values[f.key]}
                                    onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))}
                                    onValidityChange={(invalid) => setInvalidFor(f.key, invalid)}
                                />
                            </FieldRow>
                        ))}
                    </div>

                    <SheetFooter className="border-border flex-row justify-between border-t px-5 py-3">
                        <Button
                            variant="ghost"
                            onClick={() => void handleClose()}
                            disabled={isSaving}
                        >
                            {t(transKeys.cms.itemEditor.cancel)}
                        </Button>
                        <div className="flex gap-2">
                            <Button
                                variant="secondary"
                                onClick={() => handleSave(false)}
                                disabled={isSaving || isExternalItem || hasInvalidJson}
                                title={
                                    hasInvalidJson
                                        ? 'Fix invalid JSON in one or more fields before saving'
                                        : undefined
                                }
                            >
                                {t(transKeys.cms.itemEditor.saveDraft)}
                            </Button>
                            <Button
                                onClick={() => handleSave(true)}
                                disabled={isSaving || isExternalItem || hasInvalidJson}
                                title={
                                    hasInvalidJson
                                        ? 'Fix invalid JSON in one or more fields before publishing'
                                        : undefined
                                }
                            >
                                {t(transKeys.cms.itemEditor.publish)}
                            </Button>
                        </div>
                    </SheetFooter>
                </SheetContent>
            </Sheet>
            {confirmDialog}
        </>
    );
};

function FieldRow({
    label,
    htmlFor,
    help,
    children,
}: {
    label: string;
    htmlFor: string;
    help?: string | null;
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <Label htmlFor={htmlFor} className="text-foreground-secondary text-mini font-medium">
                {label}
            </Label>
            {children}
            {help ? <p className="text-foreground-tertiary text-mini">{help}</p> : null}
        </div>
    );
}

function FieldInput({
    field,
    value,
    onChange,
    onValidityChange,
}: {
    field: CmsField;
    value: unknown;
    onChange: (next: unknown) => void;
    /** Called when validity flips for fields with inline validation (JSON). */
    onValidityChange?: (invalid: boolean) => void;
}) {
    const id = `field-${field.id}`;
    switch (field.type) {
        case CmsFieldType.TEXT:
        case CmsFieldType.SLUG:
            return (
                <Input
                    id={id}
                    value={typeof value === 'string' ? value : ''}
                    onChange={(e) => onChange(e.target.value)}
                />
            );
        case CmsFieldType.RICH_TEXT:
            return (
                <Textarea
                    id={id}
                    rows={5}
                    value={typeof value === 'string' ? value : ''}
                    onChange={(e) => onChange(e.target.value)}
                />
            );
        case CmsFieldType.NUMBER:
            return (
                <Input
                    id={id}
                    type="number"
                    value={typeof value === 'number' ? value : ''}
                    onChange={(e) => {
                        const v = e.target.value;
                        onChange(v === '' ? undefined : Number(v));
                    }}
                />
            );
        case CmsFieldType.BOOLEAN:
            return <Switch id={id} checked={value === true} onCheckedChange={(v) => onChange(v)} />;
        case CmsFieldType.DATE:
            return (
                <Input
                    id={id}
                    type="date"
                    value={typeof value === 'string' ? value.slice(0, 10) : ''}
                    onChange={(e) => onChange(e.target.value)}
                />
            );
        default:
            // image / option / reference get full UI in a later slice. For
            // now we expose a JSON textarea with live validation so that
            // users can't silently submit garbage. The advanced-mode badge
            // explains the temporary state to non-technical users.
            return (
                <JsonFieldInput
                    id={id}
                    fieldType={field.type}
                    value={value}
                    onChange={onChange}
                    onValidityChange={onValidityChange}
                />
            );
    }
}

/**
 * JSON-textarea fallback for IMAGE / OPTION / REFERENCE fields until they
 * get dedicated UI. Keeps the raw text in local state so an invalid edit
 * doesn't silently get dropped — we only push parsed values up to the
 * parent when the JSON is valid, and surface a clear inline error when
 * it isn't. The parent disables Save while any of these are invalid.
 */
function JsonFieldInput({
    id,
    fieldType,
    value,
    onChange,
    onValidityChange,
}: {
    id: string;
    fieldType: CmsField['type'];
    value: unknown;
    onChange: (next: unknown) => void;
    onValidityChange?: (invalid: boolean) => void;
}) {
    const serialize = (v: unknown) => (v === undefined ? '' : JSON.stringify(v, null, 2));

    const [raw, setRaw] = useState<string>(() => serialize(value));
    const [error, setError] = useState<string | null>(null);

    // Stable ref to the parent callback so the sync effect only re-runs
    // when `value` actually changes — not when the parent re-renders and
    // hands us a new function identity.
    const onValidityChangeRef = useRef(onValidityChange);
    useEffect(() => {
        onValidityChangeRef.current = onValidityChange;
    }, [onValidityChange]);

    /**
     * Keep the textarea in sync if the parent's `value` changes via a
     * different code path (initial load from server, programmatic reset).
     * We only re-serialize when the underlying value isn't already
     * represented by what's on screen — otherwise a user typing
     * mid-string would have their caret reset every keystroke.
     */
    const lastExternalValueRef = useRef<unknown>(value);
    useEffect(() => {
        if (lastExternalValueRef.current === value) return;
        lastExternalValueRef.current = value;
        const nextRaw = serialize(value);
        setRaw(nextRaw);
        setError(null);
        onValidityChangeRef.current?.(false);
    }, [value]);

    const placeholder = useMemo(() => {
        if (fieldType === CmsFieldType.IMAGE) return '{"url": "https://...", "alt": ""}';
        if (fieldType === CmsFieldType.OPTION) return '"value"';
        if (fieldType === CmsFieldType.REFERENCE) return '{"id": "..."}';
        return 'JSON';
    }, [fieldType]);

    const validate = useCallback(
        (text: string) => {
            if (text.trim() === '') {
                setError(null);
                onValidityChange?.(false);
                onChange(undefined);
                lastExternalValueRef.current = undefined;
                return;
            }
            try {
                const parsed = JSON.parse(text);
                setError(null);
                onValidityChange?.(false);
                onChange(parsed);
                lastExternalValueRef.current = parsed;
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Invalid JSON');
                onValidityChange?.(true);
            }
        },
        [onChange, onValidityChange],
    );

    return (
        <div className="flex flex-col gap-1.5">
            <div className="border-border bg-background-secondary/40 text-foreground-tertiary text-mini flex items-start gap-2 rounded-md border px-2.5 py-2">
                <span className="border-border text-foreground-secondary rounded border px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase">
                    Advanced — JSON only
                </span>
                <span className="flex-1 leading-snug">
                    We&apos;re building a richer editor for this field type. For now, paste raw
                    JSON.
                </span>
            </div>
            <Textarea
                id={id}
                rows={4}
                placeholder={placeholder}
                value={raw}
                onChange={(e) => {
                    const text = e.target.value;
                    setRaw(text);
                    // Soft-clear the error while typing — re-validate on blur
                    // so the user isn't yelled at mid-keystroke.
                    if (error) {
                        setError(null);
                        onValidityChange?.(false);
                    }
                    // Live-commit to the parent as the user types so a Save
                    // click (which blurs this field) can't race the deferred
                    // onBlur commit and persist a STALE value — the last edit
                    // to IMAGE/OPTION/REFERENCE (JSON) fields was being dropped
                    // on save. Mirrors the blur-validate success path (commit +
                    // sync `lastExternalValueRef` so the value-sync effect
                    // doesn't reset the caret). Parse errors are intentionally
                    // NOT surfaced here — blur owns validation messaging.
                    if (text.trim() === '') {
                        onChange(undefined);
                        lastExternalValueRef.current = undefined;
                    } else {
                        try {
                            const parsed: unknown = JSON.parse(text);
                            onChange(parsed);
                            lastExternalValueRef.current = parsed;
                        } catch {
                            // Invalid mid-typing — keep the last committed value.
                        }
                    }
                }}
                onBlur={(e) => validate(e.target.value)}
                aria-invalid={error ? true : undefined}
                className={error ? 'border-red focus-visible:ring-red/20' : undefined}
            />
            {error ? (
                <p className="text-red text-mini" role="alert">
                    Invalid JSON — {error}
                </p>
            ) : null}
        </div>
    );
}
