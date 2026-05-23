'use client';

import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { CmsFieldType, CmsTabValue } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { ScrollArea } from '@weblab/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import { toast } from '@weblab/ui/sonner';
import { Switch } from '@weblab/ui/switch';
import { cn } from '@weblab/ui/utils';

import type { Id } from '@convex/_generated/dataModel';
import { useEditorEngine } from '@/components/store/editor';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { transKeys } from '@/i18n/keys';

const FIELD_TYPE_LABEL_KEYS = {
    [CmsFieldType.TEXT]: transKeys.cms.fields.types.text,
    [CmsFieldType.RICH_TEXT]: transKeys.cms.fields.types.rich_text,
    [CmsFieldType.NUMBER]: transKeys.cms.fields.types.number,
    [CmsFieldType.BOOLEAN]: transKeys.cms.fields.types.boolean,
    [CmsFieldType.DATE]: transKeys.cms.fields.types.date,
    [CmsFieldType.IMAGE]: transKeys.cms.fields.types.image,
    [CmsFieldType.SLUG]: transKeys.cms.fields.types.slug,
    [CmsFieldType.OPTION]: transKeys.cms.fields.types.option,
    [CmsFieldType.REFERENCE]: transKeys.cms.fields.types.reference,
} as const;

const FIELD_TYPE_ICONS: Record<CmsFieldType, keyof typeof Icons> = {
    [CmsFieldType.TEXT]: 'Text',
    [CmsFieldType.RICH_TEXT]: 'Pilcrow',
    [CmsFieldType.NUMBER]: 'Tokens',
    [CmsFieldType.BOOLEAN]: 'CheckCircled',
    [CmsFieldType.DATE]: 'CounterClockwiseClock',
    [CmsFieldType.IMAGE]: 'Image',
    [CmsFieldType.SLUG]: 'Link',
    [CmsFieldType.OPTION]: 'DropdownMenu',
    [CmsFieldType.REFERENCE]: 'ExternalLink',
};

function FieldTypeIcon({ type, className }: { type: CmsFieldType; className?: string }) {
    const iconKey = FIELD_TYPE_ICONS[type];
    const Icon = Icons[iconKey] as React.ComponentType<{ className?: string }> | undefined;
    if (!Icon) return null;
    return <Icon className={className ?? 'h-4 w-4'} />;
}

type EditingState = { kind: 'edit'; id: string } | { kind: 'create' } | null;

export const FieldsTab = observer(() => {
    const editorEngine = useEditorEngine();
    const projectId = editorEngine.projectId;
    const collectionId = editorEngine.state.cmsSelectedCollectionId;
    const t = useTranslations();

    const [editing, setEditing] = useState<EditingState>(null);
    const draftAnchorRef = useRef<HTMLLIElement | null>(null);

    // Convex live queries auto-revalidate — no useUtils equivalent needed.
    const reorderMutation = useMutation(api.cmsFields.reorder);
    const deleteMutation = useMutation(api.cmsFields.remove);
    const { confirm, dialog: confirmDialog } = useConfirm();

    const collectionsData = useQuery(
        api.cmsCollections.list,
        projectId ? { projectId: projectId as Id<'projects'> } : 'skip',
    );
    const fieldsData = useQuery(
        api.cmsFields.listByCollection,
        projectId && collectionId
            ? {
                  projectId: projectId as Id<'projects'>,
                  collectionId: collectionId as Id<'cmsCollections'>,
              }
            : 'skip',
    );

    // Close any open editor when the user switches collections.
    useEffect(() => {
        setEditing(null);
    }, [collectionId]);

    // Scroll the draft row into view when it appears.
    useEffect(() => {
        if (editing?.kind === 'create') {
            draftAnchorRef.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
            });
        }
    }, [editing]);

    const moveField = async (fieldId: string, direction: -1 | 1) => {
        if (!collectionId) return;
        // Use the displayed list (cached query data), not a fresh fetch —
        // a server-side concurrent reorder would cause the splice to operate
        // on a different order than what the user just clicked.
        const current = fieldsData ?? [];
        const idx = current.findIndex((f) => f._id === fieldId);
        const nextIdx = idx + direction;
        if (idx === -1 || nextIdx < 0 || nextIdx >= current.length) return;
        const ordered = current.map((f) => f._id);
        ordered.splice(idx, 1);
        ordered.splice(nextIdx, 0, fieldId as Id<'cmsFields'>);
        try {
            await reorderMutation({
                projectId: projectId as Id<'projects'>,
                collectionId: collectionId as Id<'cmsCollections'>,
                orderedFieldIds: ordered,
            });
            // Convex live queries auto-revalidate — no manual invalidate needed.
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to reorder fields');
        }
    };

    const removeField = async (fieldId: string, name: string) => {
        if (!projectId || !collectionId) return;
        const ok = await confirm({
            title: `Remove the "${name}" field?`,
            description:
                'Items keep their stored value, but it will no longer appear in the editor.',
            confirmLabel: 'Remove',
            destructive: true,
        });
        if (!ok) return;
        try {
            await deleteMutation({
                projectId: projectId as Id<'projects'>,
                fieldId: fieldId as Id<'cmsFields'>,
            });
            // Convex live queries auto-revalidate — no manual invalidate needed.
            if (editing?.kind === 'edit' && editing.id === fieldId) setEditing(null);
            toast.success('Field removed');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to remove field');
        }
    };

    if (!projectId) return null;
    if (!collectionId) {
        return (
            <div className="text-foreground-tertiary text-small flex h-full items-center justify-center">
                {t(transKeys.cms.fields.needCollection)}
            </div>
        );
    }

    const collection = collectionsData?.find((c) => c._id === collectionId);
    const fields = fieldsData ?? [];
    const startCreate = () => setEditing({ kind: 'create' });
    const isCreating = editing?.kind === 'create';

    return (
        <div className="flex h-full flex-col">
            <div className="border-border flex items-center justify-between border-b px-4 py-2.5">
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => editorEngine.state.setCmsTab(CmsTabValue.COLLECTIONS)}
                    >
                        <Icons.ArrowLeft className="mr-1 h-3.5 w-3.5" />
                        {t(transKeys.cms.fields.back)}
                    </Button>
                    <h2 className="text-foreground-primary text-regularPlus font-medium">
                        {t(transKeys.cms.fields.title, { name: collection?.name ?? '' })}
                    </h2>
                    {fields.length > 0 ? (
                        <span className="text-foreground-tertiary text-mini tabular-nums">
                            · {fields.length}
                        </span>
                    ) : null}
                </div>
                <Button size="sm" onClick={startCreate} disabled={isCreating}>
                    <Icons.Plus className="mr-1 h-3.5 w-3.5" />
                    {t(transKeys.cms.fields.addField)}
                </Button>
            </div>

            {fields.length === 0 && !isCreating ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                    <Icons.ListBullet className="text-foreground-tertiary h-6 w-6" />
                    <h3 className="text-foreground-primary text-regularPlus">
                        {t(transKeys.cms.fields.emptyTitle)}
                    </h3>
                    <p className="text-foreground-secondary text-small max-w-sm">
                        {t(transKeys.cms.fields.emptyBody)}
                    </p>
                    <Button size="sm" onClick={startCreate}>
                        <Icons.Plus className="mr-1 h-3.5 w-3.5" />
                        {t(transKeys.cms.fields.addField)}
                    </Button>
                </div>
            ) : (
                <ScrollArea className="flex-1">
                    <ul>
                        {fields.map((f, idx) => (
                            <FieldRow
                                key={f._id}
                                field={
                                    {
                                        ...f,
                                        id: f._id,
                                        helpText: f.helpText ?? null,
                                    } as never
                                }
                                index={idx}
                                total={fields.length}
                                expanded={editing?.kind === 'edit' && editing.id === f._id}
                                onToggle={() =>
                                    setEditing((prev) =>
                                        prev?.kind === 'edit' && prev.id === f._id
                                            ? null
                                            : { kind: 'edit', id: f._id },
                                    )
                                }
                                onClose={() => setEditing(null)}
                                onMove={(id, dir) => void moveField(id, dir)}
                                onRemove={(id, name) => void removeField(id, name)}
                                reorderPending={false}
                                deletePending={false}
                                projectId={projectId}
                                collectionId={collectionId}
                                t={t}
                            />
                        ))}
                        {isCreating ? (
                            <li
                                ref={draftAnchorRef}
                                className="border-border bg-background-secondary/30 border-b last:border-b-0"
                            >
                                <InlineFieldEditor
                                    mode="create"
                                    projectId={projectId}
                                    collectionId={collectionId}
                                    onClose={() => setEditing(null)}
                                />
                            </li>
                        ) : null}
                    </ul>
                </ScrollArea>
            )}

            {confirmDialog}
        </div>
    );
});

interface FieldRowProps {
    field: {
        id: string;
        name: string;
        key: string;
        type: CmsFieldType;
        required: boolean;
        helpText: string | null;
    };
    index: number;
    total: number;
    expanded: boolean;
    onToggle: () => void;
    onClose: () => void;
    onMove: (fieldId: string, direction: -1 | 1) => void;
    onRemove: (fieldId: string, name: string) => void;
    reorderPending: boolean;
    deletePending: boolean;
    projectId: string;
    collectionId: string;
    t: ReturnType<typeof useTranslations>;
}

function FieldRow({
    field,
    index,
    total,
    expanded,
    onToggle,
    onClose,
    onMove,
    onRemove,
    reorderPending,
    deletePending,
    projectId,
    collectionId,
    t,
}: FieldRowProps) {
    return (
        <li className="border-border border-b last:border-b-0">
            <div className="group relative">
                <button
                    type="button"
                    onClick={onToggle}
                    className={cn(
                        'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                        expanded ? 'bg-background-secondary/40' : 'hover:bg-background-tertiary/30',
                    )}
                    aria-expanded={expanded}
                >
                    <FieldTypeIcon
                        type={field.type}
                        className="text-foreground-tertiary h-4 w-4 shrink-0"
                    />
                    <div className="flex min-w-0 flex-1 flex-col pr-32">
                        <span className="text-foreground-primary text-small flex items-center gap-1.5 truncate font-medium">
                            {field.name}
                            {field.required ? (
                                <span className="text-foreground-tertiary text-mini font-normal">
                                    · {t(transKeys.cms.fields.requiredSuffix)}
                                </span>
                            ) : null}
                        </span>
                        <span className="text-foreground-tertiary text-mini truncate">
                            {t(FIELD_TYPE_LABEL_KEYS[field.type])}
                            {' · '}
                            <code className="font-mono">{field.key}</code>
                        </span>
                    </div>
                    <Icons.ChevronDown
                        className={cn(
                            'text-foreground-tertiary h-3.5 w-3.5 shrink-0 transition-transform',
                            expanded && 'rotate-180',
                        )}
                    />
                </button>
                <div
                    className={cn(
                        'absolute top-1/2 right-10 flex -translate-y-1/2 items-center gap-0.5 transition-opacity',
                        expanded ? 'opacity-0' : 'opacity-0 group-hover:opacity-100',
                    )}
                >
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        disabled={index === 0 || reorderPending}
                        onClick={(e) => {
                            e.stopPropagation();
                            void onMove(field.id, -1);
                        }}
                        aria-label="Move up"
                    >
                        <Icons.ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        disabled={index === total - 1 || reorderPending}
                        onClick={(e) => {
                            e.stopPropagation();
                            void onMove(field.id, 1);
                        }}
                        aria-label="Move down"
                    >
                        <Icons.ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        size="icon"
                        variant="ghost"
                        className="text-red h-7 w-7"
                        disabled={deletePending}
                        onClick={(e) => {
                            e.stopPropagation();
                            void onRemove(field.id, field.name);
                        }}
                        aria-label="Delete field"
                    >
                        <Icons.Trash className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>
            {expanded ? (
                <div className="border-border bg-background-secondary/30 border-t">
                    <InlineFieldEditor
                        mode="edit"
                        projectId={projectId}
                        collectionId={collectionId}
                        field={field}
                        onClose={onClose}
                    />
                </div>
            ) : null}
        </li>
    );
}

interface InlineFieldEditorProps {
    mode: 'create' | 'edit';
    projectId: string;
    collectionId: string;
    field?: {
        id: string;
        name: string;
        key: string;
        type: CmsFieldType;
        required: boolean;
        helpText: string | null;
    };
    onClose: () => void;
}

function InlineFieldEditor({
    mode,
    projectId,
    collectionId,
    field,
    onClose,
}: InlineFieldEditorProps) {
    const t = useTranslations();
    const [name, setName] = useState(field?.name ?? '');
    const [key, setKey] = useState(field?.key ?? '');
    const [type, setType] = useState<CmsFieldType>(field?.type ?? CmsFieldType.TEXT);
    const [required, setRequired] = useState(field?.required ?? false);
    const [helpText, setHelpText] = useState(field?.helpText ?? '');

    // Convex live queries auto-revalidate — no useUtils equivalent needed.
    const createMutation = useMutation(api.cmsFields.create);
    const updateMutation = useMutation(api.cmsFields.update);
    const [isPending, setIsPending] = useState(false);

    const handleSave = async () => {
        if (!name.trim()) {
            toast.error(t(transKeys.cms.fields.addDialog.nameRequired));
            return;
        }
        setIsPending(true);
        try {
            if (mode === 'create') {
                const rawKey = key.trim();
                // Manual keys must follow the same charset as auto-generated
                // ones — otherwise downstream template expressions and ORM
                // lookups that assume [a-z0-9_] choke on the raw string.
                if (rawKey && !/^[a-z0-9_]+$/.test(rawKey)) {
                    toast.error('Key may only contain a–z, 0–9, or _');
                    return;
                }
                const finalKey = rawKey || slugifyKey(name);
                if (!finalKey) {
                    // The name passed the trim() guard but slugifyKey
                    // produced empty (only stripped chars: punctuation, CJK,
                    // accented). Surface the actual problem rather than
                    // re-using the misleading "name required" toast.
                    toast.error('Field name must contain at least one a–z or 0–9 character');
                    return;
                }
                await createMutation({
                    projectId: projectId as Id<'projects'>,
                    collectionId: collectionId as Id<'cmsCollections'>,
                    name: name.trim(),
                    key: finalKey,
                    type,
                    required,
                    helpText: helpText.trim() || undefined,
                    config: {},
                });
                // Convex live queries auto-revalidate — no manual invalidate needed.
                toast.success(t(transKeys.cms.fields.addDialog.success));
            } else {
                if (!field) {
                    // Defensive: edit mode requires a field. Surface instead
                    // of silently no-op'ing the Save click.
                    toast.error('Missing field data');
                    return;
                }
                await updateMutation({
                    projectId: projectId as Id<'projects'>,
                    fieldId: field.id as Id<'cmsFields'>,
                    name: name.trim(),
                    required,
                    helpText: helpText.trim() || undefined,
                });
                // Convex live queries auto-revalidate — no manual invalidate needed.
                toast.success('Field updated');
            }
            onClose();
        } catch (err) {
            toast.error(
                err instanceof Error ? err.message : t(transKeys.cms.fields.addDialog.failed),
            );
        } finally {
            setIsPending(false);
        }
    };

    const fieldId = mode === 'create' ? 'draft' : (field?.id ?? 'edit');
    const isEdit = mode === 'edit';

    return (
        <div className="space-y-3 px-4 py-3">
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <Label
                        htmlFor={`field-${fieldId}-name`}
                        className="text-foreground-secondary text-mini"
                    >
                        {t(transKeys.cms.fields.addDialog.name)}
                    </Label>
                    <Input
                        id={`field-${fieldId}-name`}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t(transKeys.cms.fields.addDialog.namePlaceholder)}
                    />
                </div>
                <div className="space-y-1.5">
                    <Label
                        htmlFor={`field-${fieldId}-key`}
                        className="text-foreground-secondary text-mini"
                    >
                        {t(transKeys.cms.fields.addDialog.key)}
                    </Label>
                    {isEdit ? (
                        <div className="border-border bg-background flex h-8 items-center rounded-md border px-2.5">
                            <code className="text-foreground-tertiary text-mini font-mono">
                                {field?.key}
                            </code>
                        </div>
                    ) : (
                        <Input
                            id={`field-${fieldId}-key`}
                            value={key}
                            onChange={(e) => setKey(e.target.value)}
                            placeholder={slugifyKey(name) || 'title'}
                        />
                    )}
                </div>
            </div>

            <div className="space-y-1.5">
                <Label
                    htmlFor={`field-${fieldId}-type`}
                    className="text-foreground-secondary text-mini"
                >
                    {t(transKeys.cms.fields.addDialog.type)}
                </Label>
                {isEdit ? (
                    <div className="border-border bg-background flex h-8 items-center gap-2 rounded-md border px-2.5">
                        <FieldTypeIcon
                            type={type}
                            className="text-foreground-tertiary h-3.5 w-3.5"
                        />
                        <span className="text-foreground-tertiary text-mini">
                            {t(FIELD_TYPE_LABEL_KEYS[type])}
                        </span>
                    </div>
                ) : (
                    <Select value={type} onValueChange={(v) => setType(v as CmsFieldType)}>
                        <SelectTrigger id={`field-${fieldId}-type`}>
                            <SelectValue>
                                <span className="inline-flex items-center gap-2">
                                    <FieldTypeIcon
                                        type={type}
                                        className="text-foreground-tertiary h-3.5 w-3.5"
                                    />
                                    {t(FIELD_TYPE_LABEL_KEYS[type])}
                                </span>
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            {Object.entries(FIELD_TYPE_LABEL_KEYS).map(([value, labelKey]) => (
                                <SelectItem key={value} value={value}>
                                    <span className="inline-flex items-center gap-2">
                                        <FieldTypeIcon
                                            type={value as CmsFieldType}
                                            className="text-foreground-tertiary h-3.5 w-3.5"
                                        />
                                        {t(labelKey)}
                                    </span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </div>

            <div className="space-y-1.5">
                <Label
                    htmlFor={`field-${fieldId}-help`}
                    className="text-foreground-secondary text-mini"
                >
                    {t(transKeys.cms.fields.addDialog.help)}
                </Label>
                <Input
                    id={`field-${fieldId}-help`}
                    value={helpText}
                    onChange={(e) => setHelpText(e.target.value)}
                />
            </div>

            <div className="flex items-center gap-2 pt-0.5">
                <Switch
                    id={`field-${fieldId}-required`}
                    checked={required}
                    onCheckedChange={setRequired}
                />
                <Label htmlFor={`field-${fieldId}-required`} className="text-small cursor-pointer">
                    {t(transKeys.cms.fields.addDialog.required)}
                </Label>
            </div>

            {isEdit ? (
                <p className="text-foreground-tertiary text-mini">
                    Key and type are immutable to keep existing item values valid.
                </p>
            ) : null}

            <div className="border-border flex items-center justify-end gap-2 border-t pt-3">
                <Button variant="ghost" size="sm" onClick={onClose} disabled={isPending}>
                    {t(transKeys.cms.fields.addDialog.cancel)}
                </Button>
                <Button size="sm" onClick={() => void handleSave()} disabled={isPending}>
                    {mode === 'create' ? t(transKeys.cms.fields.addDialog.add) : 'Save'}
                </Button>
            </div>
        </div>
    );
}

function slugifyKey(input: string): string {
    // Many template/ORM systems require identifiers to start with a letter
    // or underscore — prefix when the auto-generated key would lead with a
    // digit so server-side validation doesn't reject the user's submission.
    return input
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/^(\d)/, '_$1');
}
