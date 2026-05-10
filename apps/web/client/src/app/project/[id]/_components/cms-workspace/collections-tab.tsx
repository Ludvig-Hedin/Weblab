'use client';

import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { CmsTabValue } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { ScrollArea } from '@weblab/ui/scroll-area';
import { toast } from '@weblab/ui/sonner';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { transKeys } from '@/i18n/keys';
import { api } from '@/trpc/react';
import { ItemsTable } from './items-table';

export const CollectionsTab = observer(() => {
    const editorEngine = useEditorEngine();
    const projectId = editorEngine.projectId;
    const t = useTranslations();

    const collectionsQuery = api.cms.collection.list.useQuery(
        { projectId: projectId ?? '' },
        { enabled: !!projectId },
    );

    const collections = collectionsQuery.data ?? [];
    const selectedId = editorEngine.state.cmsSelectedCollectionId;
    const selected = collections.find((c) => c.id === selectedId) ?? null;

    if (!projectId) return null;

    return (
        <div className="flex h-full flex-row">
            <aside className="border-border flex w-64 flex-col border-r">
                <div className="border-border flex items-center justify-between border-b px-3 py-2">
                    <span className="text-foreground-secondary text-mini font-medium tracking-wide uppercase">
                        {t(transKeys.cms.collections.sidebarTitle)}
                    </span>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => editorEngine.state.setCmsCreateCollectionOpen(true)}
                        aria-label={t(transKeys.cms.collections.addCollection)}
                    >
                        <Icons.Plus className="h-3.5 w-3.5" />
                    </Button>
                </div>

                {collectionsQuery.isLoading ? (
                    <div className="text-foreground-tertiary text-small p-3">
                        {t(transKeys.cms.collections.loading)}
                    </div>
                ) : collections.length === 0 ? (
                    <CollectionsEmpty
                        onCreate={() => editorEngine.state.setCmsCreateCollectionOpen(true)}
                    />
                ) : (
                    <ScrollArea className="flex-1">
                        <ul className="px-1 py-1">
                            {collections.map((c) => (
                                <CollectionRow
                                    key={c.id}
                                    collection={c}
                                    selected={selectedId === c.id}
                                    projectId={projectId}
                                />
                            ))}
                        </ul>
                    </ScrollArea>
                )}
            </aside>

            <section className="flex-1 overflow-hidden">
                {selected ? (
                    <ItemsTable
                        projectId={projectId}
                        collection={selected}
                        onEditFields={() => editorEngine.state.setCmsTab(CmsTabValue.FIELDS)}
                    />
                ) : (
                    <CollectionsHint />
                )}
            </section>
        </div>
    );
});

function CollectionsEmpty({ onCreate }: { onCreate: () => void }) {
    const t = useTranslations();
    return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
            <Icons.File className="text-foreground-tertiary h-6 w-6" />
            <p className="text-foreground-secondary text-small max-w-[14rem]">
                {t(transKeys.cms.collections.emptySidebar)}
            </p>
            <Button size="sm" variant="default" onClick={onCreate}>
                <Icons.Plus className="mr-1 h-3.5 w-3.5" />
                {t(transKeys.cms.collections.newCollection)}
            </Button>
        </div>
    );
}

function CollectionsHint() {
    const t = useTranslations();
    return (
        <div className="text-foreground-tertiary text-small flex h-full items-center justify-center">
            {t(transKeys.cms.collections.hint)}
        </div>
    );
}

interface CollectionRowProps {
    projectId: string;
    selected: boolean;
    collection: { id: string; name: string; itemCount: number };
}

const CollectionRow = observer(({ projectId, selected, collection }: CollectionRowProps) => {
    const editorEngine = useEditorEngine();
    const utils = api.useUtils();
    const deleteMutation = api.cms.collection.delete.useMutation();
    const { confirm, dialog: confirmDialog } = useConfirm();

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const itemNote =
            collection.itemCount > 0
                ? ` ${collection.itemCount} item(s) and any bindings will also be removed.`
                : '';
        const ok = await confirm({
            title: `Delete "${collection.name}"?`,
            description: `This cannot be undone.${itemNote}`,
            confirmLabel: 'Delete',
            destructive: true,
        });
        if (!ok) return;
        try {
            await deleteMutation.mutateAsync({ projectId, collectionId: collection.id });
            await utils.cms.collection.list.invalidate({ projectId });
            await utils.cms.binding.snapshot.invalidate({ projectId });
            if (selected) editorEngine.state.setCmsSelectedCollectionId(null);
            toast.success('Collection deleted');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to delete collection');
        }
    };

    return (
        <li className="group/row relative">
            {confirmDialog}
            <button
                type="button"
                onClick={() => editorEngine.state.setCmsSelectedCollectionId(collection.id)}
                className={cn(
                    'group text-small flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left',
                    selected
                        ? 'bg-background-tertiary text-foreground-primary'
                        : 'text-foreground-secondary hover:bg-background-tertiary/60',
                )}
            >
                <Icons.File className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="flex-1 truncate">{collection.name}</span>
                <span
                    className={cn(
                        'text-mini text-foreground-tertiary tabular-nums',
                        selected && 'text-foreground-secondary',
                        'group-hover/row:opacity-0',
                    )}
                >
                    {collection.itemCount}
                </span>
            </button>
            <button
                type="button"
                onClick={(e) => void handleDelete(e)}
                aria-label="Delete collection"
                className="text-red absolute top-1/2 right-2 -translate-y-1/2 opacity-0 transition-opacity group-hover/row:opacity-60 hover:opacity-100"
            >
                <Icons.Trash className="h-3.5 w-3.5" />
            </button>
        </li>
    );
});
