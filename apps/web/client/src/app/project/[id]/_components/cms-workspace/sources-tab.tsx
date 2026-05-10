'use client';

import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { CmsSourceType } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { toast } from '@weblab/ui/sonner';

import { useEditorEngine } from '@/components/store/editor';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { transKeys } from '@/i18n/keys';
import { api } from '@/trpc/react';
import { ConnectSourceDialog } from './connect-source-dialog';
import { EditSourceDialog } from './edit-source-dialog';
import { MapCollectionsDialog } from './map-collections-dialog';

const TYPE_LABEL_KEYS = {
    [CmsSourceType.WEBLAB]: transKeys.cms.sources.weblab,
    [CmsSourceType.PAYLOAD]: transKeys.cms.sources.payload,
    [CmsSourceType.STRAPI]: transKeys.cms.sources.strapi,
    [CmsSourceType.REST]: transKeys.cms.sources.rest,
} as const;

export const SourcesTab = observer(() => {
    const editorEngine = useEditorEngine();
    const projectId = editorEngine.projectId;
    const t = useTranslations();

    const [connectOpen, setConnectOpen] = useState(false);
    const [mappingSourceId, setMappingSourceId] = useState<string | null>(null);
    const [syncingId, setSyncingId] = useState<string | null>(null);

    const sourcesQuery = api.cms.source.list.useQuery(
        { projectId: projectId ?? '' },
        { enabled: !!projectId },
    );
    const utils = api.useUtils();
    const syncMutation = api.cms.source.sync.useMutation();
    const deleteMutation = api.cms.source.delete.useMutation();
    const testExistingMutation = api.cms.source.testExisting.useMutation();
    const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
    const [testingId, setTestingId] = useState<string | null>(null);
    const { confirm, dialog: confirmDialog } = useConfirm();

    if (!projectId) return null;
    const sources = sourcesQuery.data ?? [];

    const handleSync = async (sourceId: string, prune = false) => {
        setSyncingId(sourceId);
        try {
            const result = await syncMutation.mutateAsync({ projectId, sourceId, prune });
            await utils.cms.collection.list.invalidate({ projectId });
            await utils.cms.binding.snapshot.invalidate({ projectId });
            await utils.cms.item.list.invalidate();
            const prunedSuffix = result.pruned > 0 ? ` (${result.pruned} pruned)` : '';
            toast.success(
                `${t(transKeys.cms.sources.refreshDonePrefix)} ${result.written} ${t(transKeys.cms.sources.refreshDoneSuffix)}${prunedSuffix}`,
            );
        } catch (err) {
            toast.error(
                err instanceof Error ? err.message : t(transKeys.cms.sources.refreshFailed),
            );
        } finally {
            setSyncingId(null);
        }
    };

    const handleSyncWithPrune = async (sourceId: string) => {
        const ok = await confirm({
            title: 'Refresh and prune?',
            description:
                'Local items whose remote source no longer returns them will be deleted. Bindings to pruned items will stop resolving.',
            confirmLabel: 'Refresh & prune',
            destructive: true,
        });
        if (!ok) return;
        await handleSync(sourceId, true);
    };

    const handleTest = async (sourceId: string) => {
        setTestingId(sourceId);
        try {
            const result = await testExistingMutation.mutateAsync({ projectId, sourceId });
            if (result.ok) {
                toast.success('Connection works');
            } else {
                toast.error(`Connection failed: ${result.reason}`);
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Connection test failed');
        } finally {
            setTestingId(null);
        }
    };

    const handleDelete = async (sourceId: string) => {
        const ok = await confirm({
            title: t(transKeys.cms.sources.deleteConfirm),
            confirmLabel: 'Delete',
            destructive: true,
        });
        if (!ok) return;
        try {
            await deleteMutation.mutateAsync({ projectId, sourceId });
            // DB cascade removes collections → fields → items. Invalidate every
            // dependent cache so the UI doesn't show ghost rows.
            await Promise.all([
                utils.cms.source.list.invalidate({ projectId }),
                utils.cms.collection.list.invalidate({ projectId }),
                utils.cms.item.list.invalidate(),
                utils.cms.binding.snapshot.invalidate({ projectId }),
            ]);
            if (editorEngine.state.cmsSelectedCollectionId) {
                editorEngine.state.setCmsSelectedCollectionId(null);
            }
            toast.success(t(transKeys.cms.sources.deleted));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t(transKeys.cms.sources.deleteFailed));
        }
    };

    return (
        <div className="flex h-full flex-col">
            <div className="border-border flex items-center justify-between border-b px-4 py-2.5">
                <h2 className="text-foreground-primary text-regularPlus font-medium">
                    {t(transKeys.cms.sources.title)}
                </h2>
                <Button size="sm" onClick={() => setConnectOpen(true)}>
                    <Icons.Plus className="mr-1 h-3.5 w-3.5" />
                    {t(transKeys.cms.sources.connectSource)}
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
                {sources.length === 0 ? (
                    <p className="text-foreground-tertiary text-small">
                        {t(transKeys.cms.sources.empty)}
                    </p>
                ) : (
                    <ul className="space-y-2">
                        {sources.map((s) => (
                            <li
                                key={s.id}
                                className="border-border flex items-center justify-between rounded-md border px-3 py-2.5"
                            >
                                <div className="flex flex-col">
                                    <span className="text-foreground-primary text-small font-medium">
                                        {s.name}
                                    </span>
                                    <span className="text-foreground-tertiary text-mini">
                                        {t(TYPE_LABEL_KEYS[s.type])}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-foreground-positive text-mini capitalize">
                                        {s.status}
                                    </span>
                                    {s.type !== CmsSourceType.WEBLAB ? (
                                        <>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => void handleTest(s.id)}
                                                disabled={testingId === s.id}
                                            >
                                                {testingId === s.id ? 'Testing…' : 'Test'}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => setEditingSourceId(s.id)}
                                            >
                                                <Icons.Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => setMappingSourceId(s.id)}
                                            >
                                                {t(transKeys.cms.sources.mapButton)}
                                            </Button>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        disabled={syncingId === s.id}
                                                    >
                                                        {syncingId === s.id
                                                            ? t(transKeys.cms.sources.refreshing)
                                                            : t(transKeys.cms.sources.refresh)}
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem
                                                        onClick={() => void handleSync(s.id)}
                                                    >
                                                        Refresh (keep removed)
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={() =>
                                                            void handleSyncWithPrune(s.id)
                                                        }
                                                        className="text-red"
                                                    >
                                                        Refresh and prune missing
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="text-red"
                                                onClick={() => void handleDelete(s.id)}
                                                disabled={deleteMutation.isPending}
                                            >
                                                <Icons.Trash className="h-3.5 w-3.5" />
                                            </Button>
                                        </>
                                    ) : null}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <ConnectSourceDialog
                projectId={projectId}
                open={connectOpen}
                onOpenChange={setConnectOpen}
                onSourceCreated={(id) => setMappingSourceId(id)}
            />
            <MapCollectionsDialog
                projectId={projectId}
                sourceId={mappingSourceId}
                onClose={() => setMappingSourceId(null)}
            />
            <EditSourceDialog
                projectId={projectId}
                sourceId={editingSourceId}
                onClose={() => setEditingSourceId(null)}
            />
            {confirmDialog}
        </div>
    );
});
