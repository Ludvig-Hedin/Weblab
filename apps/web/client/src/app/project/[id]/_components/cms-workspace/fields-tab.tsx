'use client';

import * as React from 'react';
import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { CmsFieldType, CmsTabValue } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@weblab/ui/dialog';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { ScrollArea } from '@weblab/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import { toast } from '@weblab/ui/sonner';
import { Switch } from '@weblab/ui/switch';

import { useEditorEngine } from '@/components/store/editor';
import { transKeys } from '@/i18n/keys';
import { api } from '@/trpc/react';

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

export const FieldsTab = observer(() => {
    const editorEngine = useEditorEngine();
    const projectId = editorEngine.projectId;
    const collectionId = editorEngine.state.cmsSelectedCollectionId;
    const t = useTranslations();

    const [addOpen, setAddOpen] = useState(false);
    const [editingFieldId, setEditingFieldId] = useState<string | null>(null);

    const utils = api.useUtils();
    const reorderMutation = api.cms.field.reorder.useMutation();
    const deleteMutation = api.cms.field.delete.useMutation();

    const moveField = async (fieldId: string, direction: -1 | 1) => {
        if (!collectionId) return;
        const current = (await utils.cms.field.listByCollection.fetch({
            projectId: projectId ?? '',
            collectionId,
        })) as { id: string }[];
        const idx = current.findIndex((f) => f.id === fieldId);
        const nextIdx = idx + direction;
        if (idx === -1 || nextIdx < 0 || nextIdx >= current.length) return;
        const ordered = current.map((f) => f.id);
        ordered.splice(idx, 1);
        ordered.splice(nextIdx, 0, fieldId);
        try {
            await reorderMutation.mutateAsync({
                projectId: projectId ?? '',
                collectionId,
                orderedFieldIds: ordered,
            });
            await utils.cms.field.listByCollection.invalidate({
                projectId: projectId ?? '',
                collectionId,
            });
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to reorder fields');
        }
    };

    const removeField = async (fieldId: string, name: string) => {
        if (!projectId || !collectionId) return;
        if (
            !confirm(
                `Remove the "${name}" field? Items keep their stored value, but it will no longer appear in the editor.`,
            )
        ) {
            return;
        }
        try {
            await deleteMutation.mutateAsync({ projectId, fieldId });
            await utils.cms.field.listByCollection.invalidate({ projectId, collectionId });
            await utils.cms.collection.list.invalidate({ projectId });
            toast.success('Field removed');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to remove field');
        }
    };

    const collectionsQuery = api.cms.collection.list.useQuery(
        { projectId: projectId ?? '' },
        { enabled: !!projectId },
    );
    const fieldsQuery = api.cms.field.listByCollection.useQuery(
        { projectId: projectId ?? '', collectionId: collectionId ?? '' },
        { enabled: !!projectId && !!collectionId },
    );

    if (!projectId) return null;
    if (!collectionId) {
        return (
            <div className="text-foreground-tertiary text-small flex h-full items-center justify-center">
                {t(transKeys.cms.fields.needCollection)}
            </div>
        );
    }

    const collection = collectionsQuery.data?.find((c) => c.id === collectionId);
    const fields = fieldsQuery.data ?? [];

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
                </div>
                <Button size="sm" onClick={() => setAddOpen(true)}>
                    <Icons.Plus className="mr-1 h-3.5 w-3.5" />
                    {t(transKeys.cms.fields.addField)}
                </Button>
            </div>

            {fields.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                    <Icons.ListBullet className="text-foreground-tertiary h-6 w-6" />
                    <h3 className="text-foreground-primary text-regularPlus">
                        {t(transKeys.cms.fields.emptyTitle)}
                    </h3>
                    <p className="text-foreground-secondary text-small max-w-sm">
                        {t(transKeys.cms.fields.emptyBody)}
                    </p>
                    <Button size="sm" onClick={() => setAddOpen(true)}>
                        <Icons.Plus className="mr-1 h-3.5 w-3.5" />
                        {t(transKeys.cms.fields.addField)}
                    </Button>
                </div>
            ) : (
                <ScrollArea className="flex-1">
                    <ul className="px-4 py-3">
                        {fields.map((f, idx) => (
                            <li
                                key={f.id}
                                className="border-border group flex items-center justify-between border-b py-2.5 last:border-b-0"
                            >
                                <div className="flex flex-col">
                                    <span className="text-foreground-primary text-small font-medium">
                                        {f.name}
                                        {f.required ? (
                                            <span className="text-foreground-tertiary text-mini ml-1.5 font-normal">
                                                · {t(transKeys.cms.fields.requiredSuffix)}
                                            </span>
                                        ) : null}
                                    </span>
                                    <span className="text-foreground-tertiary text-mini">
                                        {t(FIELD_TYPE_LABEL_KEYS[f.type])}
                                        {' · '}
                                        <code className="font-mono">{f.key}</code>
                                    </span>
                                </div>
                                <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7"
                                        disabled={idx === 0 || reorderMutation.isPending}
                                        onClick={() => void moveField(f.id, -1)}
                                        aria-label="Move up"
                                    >
                                        <Icons.ArrowUp className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7"
                                        disabled={
                                            idx === fields.length - 1 || reorderMutation.isPending
                                        }
                                        onClick={() => void moveField(f.id, 1)}
                                        aria-label="Move down"
                                    >
                                        <Icons.ArrowDown className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7"
                                        onClick={() => setEditingFieldId(f.id)}
                                        aria-label="Edit field"
                                    >
                                        <Icons.Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="text-red h-7 w-7"
                                        disabled={deleteMutation.isPending}
                                        onClick={() => void removeField(f.id, f.name)}
                                        aria-label="Delete field"
                                    >
                                        <Icons.Trash className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </ScrollArea>
            )}

            <AddFieldDialog
                open={addOpen}
                onOpenChange={setAddOpen}
                projectId={projectId}
                collectionId={collectionId}
            />
            <EditFieldDialog
                projectId={projectId}
                collectionId={collectionId}
                field={fields.find((f) => f.id === editingFieldId) ?? null}
                onClose={() => setEditingFieldId(null)}
            />
        </div>
    );
});

function AddFieldDialog({
    open,
    onOpenChange,
    projectId,
    collectionId,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    projectId: string;
    collectionId: string;
}) {
    const [name, setName] = useState('');
    const [key, setKey] = useState('');
    const [type, setType] = useState<CmsFieldType>(CmsFieldType.TEXT);
    const [required, setRequired] = useState(false);
    const [helpText, setHelpText] = useState('');
    const t = useTranslations();

    const utils = api.useUtils();
    const createMutation = api.cms.field.create.useMutation();

    const handleCreate = async () => {
        const finalKey = key.trim() || slugifyKey(name);
        if (!name.trim() || !finalKey) {
            toast.error(t(transKeys.cms.fields.addDialog.nameRequired));
            return;
        }
        try {
            await createMutation.mutateAsync({
                projectId,
                collectionId,
                name: name.trim(),
                key: finalKey,
                type,
                required,
                helpText: helpText.trim() || undefined,
                config: {},
            });
            await utils.cms.field.listByCollection.invalidate({
                projectId,
                collectionId,
            });
            await utils.cms.collection.get.invalidate({ projectId, collectionId });
            toast.success(t(transKeys.cms.fields.addDialog.success));
            setName('');
            setKey('');
            setType(CmsFieldType.TEXT);
            setRequired(false);
            setHelpText('');
            onOpenChange(false);
        } catch (err) {
            toast.error(
                err instanceof Error ? err.message : t(transKeys.cms.fields.addDialog.failed),
            );
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t(transKeys.cms.fields.addDialog.title)}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="field-name">{t(transKeys.cms.fields.addDialog.name)}</Label>
                        <Input
                            id="field-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={t(transKeys.cms.fields.addDialog.namePlaceholder)}
                            autoFocus
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="field-key">{t(transKeys.cms.fields.addDialog.key)}</Label>
                        <Input
                            id="field-key"
                            value={key}
                            onChange={(e) => setKey(e.target.value)}
                            placeholder={slugifyKey(name) || 'title'}
                        />
                        <p className="text-foreground-tertiary text-mini">
                            {t(transKeys.cms.fields.addDialog.keyHelp, {
                                example: 'Blog.title',
                            })}
                        </p>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="field-type">{t(transKeys.cms.fields.addDialog.type)}</Label>
                        <Select value={type} onValueChange={(v) => setType(v as CmsFieldType)}>
                            <SelectTrigger id="field-type">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(FIELD_TYPE_LABEL_KEYS).map(([value, labelKey]) => (
                                    <SelectItem key={value} value={value}>
                                        {t(labelKey)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="field-help">{t(transKeys.cms.fields.addDialog.help)}</Label>
                        <Input
                            id="field-help"
                            value={helpText}
                            onChange={(e) => setHelpText(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                        <Switch
                            id="field-required"
                            checked={required}
                            onCheckedChange={setRequired}
                        />
                        <Label htmlFor="field-required" className="text-small cursor-pointer">
                            {t(transKeys.cms.fields.addDialog.required)}
                        </Label>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        {t(transKeys.cms.fields.addDialog.cancel)}
                    </Button>
                    <Button onClick={handleCreate} disabled={createMutation.isPending}>
                        {t(transKeys.cms.fields.addDialog.add)}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function slugifyKey(input: string): string {
    return input
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

interface EditableField {
    id: string;
    name: string;
    key: string;
    type: CmsFieldType;
    required: boolean;
    helpText: string | null;
}

function EditFieldDialog({
    projectId,
    collectionId,
    field,
    onClose,
}: {
    projectId: string;
    collectionId: string;
    field: EditableField | null;
    onClose: () => void;
}) {
    const open = !!field;
    const [name, setName] = useState('');
    const [required, setRequired] = useState(false);
    const [helpText, setHelpText] = useState('');

    const utils = api.useUtils();
    const updateMutation = api.cms.field.update.useMutation();

    // Pre-fill on open. Note: `key` and `type` aren't editable — changing
    // either would invalidate every existing item's stored value.
    React.useEffect(() => {
        if (!field) return;
        setName(field.name);
        setRequired(field.required);
        setHelpText(field.helpText ?? '');
    }, [field?.id, field?.name, field?.required, field?.helpText, field]);

    const handleSave = async () => {
        if (!field) return;
        if (!name.trim()) {
            toast.error('Field name is required');
            return;
        }
        try {
            await updateMutation.mutateAsync({
                projectId,
                fieldId: field.id,
                name: name.trim(),
                required,
                helpText: helpText.trim() || undefined,
            });
            await utils.cms.field.listByCollection.invalidate({ projectId, collectionId });
            toast.success('Field updated');
            onClose();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to update field');
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Edit field</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="edit-field-name">Name</Label>
                        <Input
                            id="edit-field-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <div className="text-foreground-tertiary text-mini">
                        Key: <code className="font-mono">{field?.key}</code> · Type:{' '}
                        {field?.type ?? ''}
                        <p className="mt-1">
                            Key and type are immutable to keep existing item values valid.
                        </p>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="edit-field-help">Help text (optional)</Label>
                        <Input
                            id="edit-field-help"
                            value={helpText}
                            onChange={(e) => setHelpText(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                        <Switch
                            id="edit-field-required"
                            checked={required}
                            onCheckedChange={setRequired}
                        />
                        <Label htmlFor="edit-field-required" className="text-small cursor-pointer">
                            Required
                        </Label>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={updateMutation.isPending}>
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
