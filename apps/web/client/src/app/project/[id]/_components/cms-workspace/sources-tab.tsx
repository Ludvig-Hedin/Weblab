'use client';

import { useState } from 'react';
import { api } from '@convex/_generated/api';
import { useAction, useConvex, useMutation, useQuery } from 'convex/react';
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
import { cn } from '@weblab/ui/utils';

import type { Id } from '@convex/_generated/dataModel';
import { useEditorEngine } from '@/components/store/editor';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { transKeys } from '@/i18n/keys';
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
    // TODO(bug-hunt): syncingId/testingId track a single id — clicking Sync
    // on row A then row B before A completes causes A's finally to clear
    // the in-flight state for B, so B's "Refreshing…" pill flips back to
    // "Refresh" while the request is still pending. User can double-fire
    // sync on B. Switch to `Set<string>` (add/delete per source id) to
    // preserve per-row state across concurrent in-flight calls. Same
    // pattern applies to `testingId` below.
    const [syncingId, setSyncingId] = useState<string | null>(null);

    const sourcesData = useQuery(
        api.cmsSources.list,
        projectId ? { projectId: projectId as Id<'projects'> } : 'skip',
    );
    // Convex live queries auto-revalidate — no useUtils equivalent needed.
    const convex = useConvex();
    const syncAction = useAction(api.cmsActions.sourceSync);
    const deleteMutation = useMutation(api.cmsSources.remove);
    const testExistingAction = useAction(api.cmsActions.sourceTestExisting);
    const [isDeleting, setIsDeleting] = useState(false);
    const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
    const [testingId, setTestingId] = useState<string | null>(null);
    const { confirm, dialog: confirmDialog } = useConfirm();

    if (!projectId) return null;
    const sources = sourcesData ?? [];

    const handleSync = async (sourceId: string, prune = false) => {
        setSyncingId(sourceId);
        try {
            const result = await syncAction({
                projectId: projectId as Id<'projects'>,
                sourceId: sourceId as Id<'cmsSources'>,
                prune,
            });
            // Convex live queries auto-revalidate — no manual invalidate needed.
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
            const result = await testExistingAction({
                projectId: projectId as Id<'projects'>,
                sourceId: sourceId as Id<'cmsSources'>,
            });
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

    const handleDelete = async (source: (typeof sources)[number]) => {
        // Fetch the blast radius on demand so the confirm dialog can show
        // concrete numbers. A failure here falls back to a softer copy —
        // we'd rather show *something* meaningful than block the user.
        let impact: { collectionCount: number; itemCount: number } = {
            collectionCount: 0,
            itemCount: 0,
        };
        let impactKnown = true;
        try {
            impact = await convex.query(api.cmsSources.getDeleteImpact, {
                projectId: projectId as Id<'projects'>,
                sourceId: source._id as Id<'cmsSources'>,
            });
        } catch {
            impactKnown = false;
        }
        const { collectionCount, itemCount } = impact;
        const description = !impactKnown
            ? t(transKeys.cms.sources.deleteConfirm)
            : collectionCount === 0
              ? `No collections currently use this source. ${itemCount} ${
                    itemCount === 1 ? 'item remains' : 'items remain'
                } locally (already saved). This cannot be undone.`
              : `${collectionCount} ${
                    collectionCount === 1 ? 'collection' : 'collections'
                } will lose their sync link. ${itemCount} ${
                    itemCount === 1 ? 'item remains' : 'items remain'
                } locally (already saved). This cannot be undone.`;

        const ok = await confirm({
            title: `Delete “${source.name}”?`,
            description,
            confirmLabel: 'Delete source',
            destructive: true,
        });
        if (!ok) return;
        setIsDeleting(true);
        try {
            await deleteMutation({
                projectId: projectId as Id<'projects'>,
                sourceId: source._id as Id<'cmsSources'>,
            });
            // Convex live queries auto-revalidate — DB cascade triggers source/
            // collection/item/binding query reruns automatically.
            if (editorEngine.state.cmsSelectedCollectionId) {
                editorEngine.state.setCmsSelectedCollectionId(null);
            }
            toast.success(t(transKeys.cms.sources.deleted));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t(transKeys.cms.sources.deleteFailed));
        } finally {
            setIsDeleting(false);
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
                                key={s._id}
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
                                    <span
                                        className={cn(
                                            'text-mini capitalize',
                                            s.status === 'connected'
                                                ? 'text-foreground-positive'
                                                : 'text-red',
                                        )}
                                    >
                                        {s.status}
                                    </span>
                                    {s.type !== CmsSourceType.WEBLAB ? (
                                        <>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => void handleTest(s._id)}
                                                disabled={testingId === s._id}
                                            >
                                                {testingId === s._id ? 'Testing…' : 'Test'}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => setEditingSourceId(s._id)}
                                            >
                                                <Icons.Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => setMappingSourceId(s._id)}
                                            >
                                                {t(transKeys.cms.sources.mapButton)}
                                            </Button>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        disabled={syncingId === s._id}
                                                    >
                                                        {syncingId === s._id
                                                            ? t(transKeys.cms.sources.refreshing)
                                                            : t(transKeys.cms.sources.refresh)}
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem
                                                        onClick={() => void handleSync(s._id)}
                                                    >
                                                        Refresh (keep removed)
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={() =>
                                                            void handleSyncWithPrune(s._id)
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
                                                onClick={() => void handleDelete(s)}
                                                disabled={isDeleting || syncingId === s._id}
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
