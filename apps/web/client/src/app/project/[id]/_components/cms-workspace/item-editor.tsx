'use client';

import { useEffect, useState } from 'react';
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

import { transKeys } from '@/i18n/keys';
import { api } from '@/trpc/react';

interface Props {
    projectId: string;
    collection: CmsCollection;
    fields: CmsField[];
    /** When null, the editor is in "create" mode. */
    itemId: string | null;
    onClose: () => void;
}

/**
 * Right-side sheet for creating/editing a single item. v1 supports the
 * common field types (text, rich_text, number, boolean, date, slug);
 * image / option / reference get full UI in a later slice and currently
 * fall back to a JSON-string textarea.
 */
export const ItemEditor = ({ projectId, collection, fields, itemId, onClose }: Props) => {
    const [open, setOpen] = useState(true);
    const [values, setValues] = useState<Record<string, unknown>>({});
    const [slug, setSlug] = useState('');
    const [status, setStatus] = useState<CmsItemStatus>(CmsItemStatus.DRAFT);
    const t = useTranslations();

    const utils = api.useUtils();
    const itemQuery = api.cms.item.get.useQuery(
        { projectId, itemId: itemId ?? '' },
        { enabled: !!itemId },
    );
    const createMutation = api.cms.item.create.useMutation();
    const updateMutation = api.cms.item.update.useMutation();

    useEffect(() => {
        const item = itemQuery.data;
        if (!itemId) {
            // Create mode: seed defaults.
            setValues({});
            setSlug('');
            setStatus(CmsItemStatus.DRAFT);
            return;
        }
        if (item) {
            setValues(item.values ?? {});
            setSlug(item.slug ?? '');
            setStatus(item.status);
        }
    }, [itemId, itemQuery.data]);

    const handleSave = async (publish: boolean) => {
        try {
            const finalStatus = publish ? CmsItemStatus.PUBLISHED : status;
            if (itemId) {
                await updateMutation.mutateAsync({
                    projectId,
                    itemId,
                    slug: slug.trim() || undefined,
                    values,
                    status: finalStatus,
                });
            } else {
                await createMutation.mutateAsync({
                    projectId,
                    collectionId: collection.id,
                    slug: slug.trim() || undefined,
                    values,
                    status: finalStatus,
                });
            }
            await utils.cms.item.list.invalidate({
                projectId,
                collectionId: collection.id,
            });
            await utils.cms.collection.list.invalidate({ projectId });
            toast.success(
                itemId
                    ? t(transKeys.cms.itemEditor.successUpdated)
                    : t(transKeys.cms.itemEditor.successCreated),
            );
            handleClose();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t(transKeys.cms.itemEditor.failed));
        }
    };

    const handleClose = () => {
        setOpen(false);
        // Defer the parent close to let the sheet animate out.
        setTimeout(onClose, 180);
    };

    const isSaving = createMutation.isPending || updateMutation.isPending;
    const headerTitle = itemId
        ? t(transKeys.cms.itemEditor.headerEdit)
        : t(transKeys.cms.itemEditor.headerNew, { name: collection.name });

    // External-source items are read-only at our layer — the next sync
    // will overwrite any local edit. Detect via `remoteId`. We still let
    // the user view the values; we just disable save and surface a warning
    // (BUG #18 from review).
    const isExternalItem = !!itemQuery.data?.remoteId;

    return (
        <Sheet open={open} onOpenChange={(o) => (!o ? handleClose() : null)}>
            <SheetContent side="right" className="flex w-[480px] flex-col gap-0 p-0 sm:max-w-md">
                <SheetHeader className="border-border border-b px-5 py-4">
                    <SheetTitle>{headerTitle}</SheetTitle>
                    <SheetDescription className="text-foreground-tertiary">
                        {collection.name}
                    </SheetDescription>
                </SheetHeader>

                {isExternalItem ? (
                    <div className="border-border bg-background-secondary/40 text-foreground-secondary text-mini border-b px-5 py-2">
                        This item is synced from an external source. Edits will be overwritten on
                        the next sync.
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
                            help={f.helpText}
                        >
                            <FieldInput
                                field={f}
                                value={values[f.key]}
                                onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))}
                            />
                        </FieldRow>
                    ))}
                </div>

                <SheetFooter className="border-border flex-row justify-between border-t px-5 py-3">
                    <Button variant="ghost" onClick={handleClose} disabled={isSaving}>
                        {t(transKeys.cms.itemEditor.cancel)}
                    </Button>
                    <div className="flex gap-2">
                        <Button
                            variant="secondary"
                            onClick={() => handleSave(false)}
                            disabled={isSaving || isExternalItem}
                        >
                            {t(transKeys.cms.itemEditor.saveDraft)}
                        </Button>
                        <Button
                            onClick={() => handleSave(true)}
                            disabled={isSaving || isExternalItem}
                        >
                            {t(transKeys.cms.itemEditor.publish)}
                        </Button>
                    </div>
                </SheetFooter>
            </SheetContent>
        </Sheet>
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
}: {
    field: CmsField;
    value: unknown;
    onChange: (next: unknown) => void;
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
            // now expose a JSON textarea so we can round-trip data.
            return (
                <Textarea
                    id={id}
                    rows={3}
                    placeholder="JSON"
                    value={value === undefined ? '' : JSON.stringify(value)}
                    onChange={(e) => {
                        try {
                            onChange(
                                e.target.value === '' ? undefined : JSON.parse(e.target.value),
                            );
                        } catch {
                            // keep raw text in component-local state? for v1 we
                            // accept that invalid JSON simply doesn't persist.
                        }
                    }}
                />
            );
    }
}
