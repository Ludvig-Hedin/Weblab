'use client';

import { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import type { CmsCollection } from '@weblab/db';
import { Button } from '@weblab/ui/button';
import { Checkbox } from '@weblab/ui/checkbox';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { ScrollArea } from '@weblab/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import { toast } from '@weblab/ui/sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@weblab/ui/table';

import { useEditorEngine } from '@/components/store/editor';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { transKeys } from '@/i18n/keys';
import { api } from '@/trpc/react';
import { ItemEditor } from './item-editor';
import { RoutingDialog } from './routing-dialog';

interface Props {
    projectId: string;
    collection: CmsCollection;
    onEditFields: () => void;
}

/**
 * Lists items in a collection. v1 keeps the table minimal: title (or first
 * text-ish field), slug, status, updated. Per-row actions and bulk select
 * arrive in a later slice.
 */
export const ItemsTable = observer(({ projectId, collection, onEditFields }: Props) => {
    const editorEngine = useEditorEngine();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [routingOpen, setRoutingOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const { confirm, dialog: confirmDialog } = useConfirm();
    const t = useTranslations();

    // Reset selection + search when the user switches collections — otherwise
    // the bulk-delete bar would carry stale ids from the previous collection
    // and operate on a phantom set.
    useEffect(() => {
        setSelectedIds(new Set());
        setSearch('');
    }, [collection.id]);

    const utils = api.useUtils();
    const deleteMutation = api.cms.item.delete.useMutation();

    const itemsQuery = api.cms.item.list.useQuery({
        projectId,
        collectionId: collection.id,
    });
    const fieldsQuery = api.cms.field.listByCollection.useQuery({
        projectId,
        collectionId: collection.id,
    });
    const pagesQuery = api.cms.collectionPage.list.useQuery({ projectId });
    const collectionPage = pagesQuery.data?.find((p) => p.collectionId === collection.id) ?? null;

    const items = itemsQuery.data ?? [];
    const fields = fieldsQuery.data ?? [];
    // Pick the first text-shaped field as the "title" column. Falls back to
    // the slug, then the item id.
    const titleField =
        fields.find((f) => f.type === 'text') ?? fields.find((f) => f.type === 'slug') ?? fields[0];

    // Search across the title field + slug + every other text-shaped value.
    // Cheap client-side filter — works at the v1 scale (≤ a few hundred items
    // per collection). Server-side search lands when scale demands it.
    const filteredItems = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return items;
        return items.filter((item) => {
            if (item.slug?.toLowerCase().includes(q)) return true;
            for (const field of fields) {
                const v = item.values[field.key];
                if (typeof v === 'string' && v.toLowerCase().includes(q)) return true;
            }
            return false;
        });
    }, [items, fields, search]);

    const allSelected =
        filteredItems.length > 0 && filteredItems.every((it) => selectedIds.has(it.id));
    const someSelected = selectedIds.size > 0 && !allSelected;
    const toggleSelectAll = () => {
        if (allSelected) {
            const next = new Set(selectedIds);
            for (const it of filteredItems) next.delete(it.id);
            setSelectedIds(next);
        } else {
            const next = new Set(selectedIds);
            for (const it of filteredItems) next.add(it.id);
            setSelectedIds(next);
        }
    };
    const toggleSelectOne = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const handleDelete = async (id: string) => {
        const ok = await confirm({
            title: 'Delete this item?',
            description: 'This cannot be undone.',
            confirmLabel: 'Delete',
            destructive: true,
        });
        if (!ok) return;
        try {
            await deleteMutation.mutateAsync({ projectId, itemId: id });
            await utils.cms.item.list.invalidate({ projectId, collectionId: collection.id });
            await utils.cms.collection.list.invalidate({ projectId });
            await utils.cms.binding.snapshot.invalidate({ projectId });
            setSelectedIds((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
            toast.success('Item deleted');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to delete item');
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        const ok = await confirm({
            title: `Delete ${selectedIds.size} item${selectedIds.size === 1 ? '' : 's'}?`,
            description: 'This cannot be undone.',
            confirmLabel: 'Delete',
            destructive: true,
        });
        if (!ok) return;
        const failures: string[] = [];
        for (const id of Array.from(selectedIds)) {
            try {
                await deleteMutation.mutateAsync({ projectId, itemId: id });
            } catch (err) {
                failures.push(err instanceof Error ? err.message : 'Unknown error');
            }
        }
        await utils.cms.item.list.invalidate({ projectId, collectionId: collection.id });
        await utils.cms.collection.list.invalidate({ projectId });
        await utils.cms.binding.snapshot.invalidate({ projectId });
        if (failures.length === 0) {
            toast.success(`${selectedIds.size} item(s) deleted`);
        } else {
            toast.error(`${failures.length} item(s) failed to delete`);
        }
        setSelectedIds(new Set());
    };

    return (
        <div className="flex h-full flex-col">
            <div className="border-border flex items-center justify-between border-b px-4 py-2.5">
                <div className="flex items-center gap-2">
                    <h2 className="text-foreground-primary text-regularPlus font-medium">
                        {collection.name}
                    </h2>
                    <span className="text-foreground-tertiary text-mini">
                        {t(transKeys.cms.items.count, { count: items.length })}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {collectionPage ? (
                        <Select
                            value={editorEngine.state.cmsCurrentItemId ?? ''}
                            onValueChange={(v) => editorEngine.state.setCmsCurrentItemId(v || null)}
                        >
                            <SelectTrigger className="text-mini h-8 w-[200px]">
                                <SelectValue
                                    placeholder={t(transKeys.cms.routing.previewItemPlaceholder)}
                                />
                            </SelectTrigger>
                            <SelectContent>
                                {items.map((item) => {
                                    const titleValue = titleField
                                        ? item.values[titleField.key]
                                        : null;
                                    const label =
                                        (typeof titleValue === 'string' && titleValue) ||
                                        item.slug ||
                                        item.id.slice(0, 8);
                                    return (
                                        <SelectItem key={item.id} value={item.id}>
                                            {label}
                                        </SelectItem>
                                    );
                                })}
                            </SelectContent>
                        </Select>
                    ) : null}
                    <Button variant="ghost" size="sm" onClick={() => setRoutingOpen(true)}>
                        <Icons.File className="mr-1 h-3.5 w-3.5" />
                        {t(transKeys.cms.routing.openButton)}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={onEditFields}>
                        <Icons.Pencil className="mr-1 h-3.5 w-3.5" />
                        {t(transKeys.cms.items.editFields)}
                    </Button>
                    <Button
                        size="sm"
                        onClick={() => setCreating(true)}
                        disabled={fields.length === 0}
                        title={
                            fields.length === 0 ? t(transKeys.cms.items.addFieldsFirst) : undefined
                        }
                    >
                        <Icons.Plus className="mr-1 h-3.5 w-3.5" />
                        {t(transKeys.cms.items.newItem)}
                    </Button>
                </div>
            </div>

            {fields.length === 0 ? (
                <ItemsEmpty
                    title={t(transKeys.cms.items.noFieldsTitle)}
                    body={t(transKeys.cms.items.noFieldsBody)}
                    cta={{ label: t(transKeys.cms.items.addFields), onClick: onEditFields }}
                />
            ) : items.length === 0 ? (
                <ItemsEmpty
                    title={t(transKeys.cms.items.noItemsTitle)}
                    body={t(transKeys.cms.items.noItemsBody)}
                    cta={{
                        label: t(transKeys.cms.items.newItem),
                        onClick: () => setCreating(true),
                    }}
                />
            ) : (
                <>
                    <div className="border-border flex items-center gap-2 border-b px-4 py-2">
                        <div className="relative max-w-sm flex-1">
                            <Icons.MagnifyingGlass className="text-foreground-tertiary absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2" />
                            <Input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search items…"
                                className="text-mini h-8 pl-7"
                            />
                        </div>
                        {selectedIds.size > 0 ? (
                            <Button
                                size="sm"
                                variant="ghost"
                                className="text-red"
                                onClick={() => void handleBulkDelete()}
                                disabled={deleteMutation.isPending}
                            >
                                <Icons.Trash className="mr-1 h-3.5 w-3.5" />
                                Delete {selectedIds.size}
                            </Button>
                        ) : null}
                    </div>
                    <ScrollArea className="flex-1">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-8">
                                        <Checkbox
                                            checked={
                                                allSelected
                                                    ? true
                                                    : someSelected
                                                      ? 'indeterminate'
                                                      : false
                                            }
                                            onCheckedChange={() => toggleSelectAll()}
                                            aria-label="Select all"
                                        />
                                    </TableHead>
                                    <TableHead>
                                        {titleField?.name ?? t(transKeys.cms.items.columnTitle)}
                                    </TableHead>
                                    <TableHead>{t(transKeys.cms.items.columnSlug)}</TableHead>
                                    <TableHead>{t(transKeys.cms.items.columnStatus)}</TableHead>
                                    <TableHead>{t(transKeys.cms.items.columnUpdated)}</TableHead>
                                    <TableHead className="w-8" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredItems.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={6}
                                            className="text-foreground-tertiary text-mini py-6 text-center"
                                        >
                                            No items match “{search}”.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredItems.map((item) => {
                                        const titleValue = titleField
                                            ? item.values[titleField.key]
                                            : null;
                                        const checked = selectedIds.has(item.id);
                                        return (
                                            <TableRow
                                                key={item.id}
                                                onClick={() => setEditingId(item.id)}
                                                className="group cursor-pointer"
                                            >
                                                <TableCell
                                                    className="w-8"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <Checkbox
                                                        checked={checked}
                                                        onCheckedChange={() =>
                                                            toggleSelectOne(item.id)
                                                        }
                                                        aria-label="Select row"
                                                    />
                                                </TableCell>
                                                <TableCell className="font-medium">
                                                    {(typeof titleValue === 'string' &&
                                                        titleValue) ||
                                                        t(transKeys.cms.items.untitled)}
                                                </TableCell>
                                                <TableCell className="text-foreground-tertiary">
                                                    {item.slug ?? '—'}
                                                </TableCell>
                                                <TableCell>
                                                    <span className="text-mini capitalize">
                                                        {item.status}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-foreground-tertiary text-mini">
                                                    {new Date(item.updatedAt).toLocaleString()}
                                                </TableCell>
                                                <TableCell
                                                    className="w-8"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className="text-red h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                                                        onClick={() => void handleDelete(item.id)}
                                                        disabled={deleteMutation.isPending}
                                                        aria-label="Delete item"
                                                    >
                                                        <Icons.Trash className="h-3.5 w-3.5" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </>
            )}

            {(editingId !== null || creating) && (
                <ItemEditor
                    projectId={projectId}
                    collection={collection}
                    fields={fields}
                    itemId={editingId}
                    onClose={() => {
                        setEditingId(null);
                        setCreating(false);
                    }}
                />
            )}

            <RoutingDialog
                projectId={projectId}
                collection={collection}
                open={routingOpen}
                onOpenChange={setRoutingOpen}
            />
            {confirmDialog}
        </div>
    );
});

function ItemsEmpty({
    title,
    body,
    cta,
}: {
    title: string;
    body: string;
    cta: { label: string; onClick: () => void };
}) {
    return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <Icons.ListBullet className="text-foreground-tertiary h-6 w-6" />
            <h3 className="text-foreground-primary text-regularPlus">{title}</h3>
            <p className="text-foreground-secondary text-small max-w-sm">{body}</p>
            <Button size="sm" onClick={cta.onClick}>
                <Icons.Plus className="mr-1 h-3.5 w-3.5" />
                {cta.label}
            </Button>
        </div>
    );
}
