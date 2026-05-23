'use client';

import type { FunctionReturnType } from 'convex/server';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useAction, useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@weblab/ui/dialog';
import { ScrollArea } from '@weblab/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import { toast } from '@weblab/ui/sonner';

import type { Id } from '@convex/_generated/dataModel';
import { transKeys } from '@/i18n/keys';

interface Props {
    projectId: string;
    /** Source id returned by the connect dialog. When null the dialog is closed. */
    sourceId: string | null;
    onClose: () => void;
}

const MODE_NEW = '__new__';
const MODE_SKIP = '__skip__';

interface RowState {
    /** Either MODE_NEW, MODE_SKIP, or a Weblab collection id. */
    target: string;
}

/**
 * Step 2 of the connect wizard. Shows the remote collections discovered
 * by the adapter and lets the user pick how each one maps to a Weblab
 * collection.
 */
export const MapCollectionsDialog = ({ projectId, sourceId, onClose }: Props) => {
    const t = useTranslations();
    const open = !!sourceId;
    const [rows, setRows] = useState<Record<string, RowState>>({});

    // listRemoteCollections is a Convex action, not a query — fetch on open via
    // useEffect since actions can't be subscribed to like queries.
    const listRemoteCollections = useAction(api.cmsActions.sourceListRemoteCollections);
    const collectionsData = useQuery(
        api.cmsCollections.list,
        sourceId ? { projectId: projectId as Id<'projects'> } : 'skip',
    );
    const mapCollectionsAction = useAction(api.cmsActions.sourceMapCollections);
    const [isMapping, setIsMapping] = useState(false);

    type RemoteCollection = FunctionReturnType<
        typeof api.cmsActions.sourceListRemoteCollections
    >[number];
    const [remoteData, setRemoteData] = useState<RemoteCollection[] | null>(null);
    const [isLoadingRemote, setIsLoadingRemote] = useState(false);

    useEffect(() => {
        if (!open || !sourceId) {
            setRemoteData(null);
            return;
        }
        let cancelled = false;
        setIsLoadingRemote(true);
        listRemoteCollections({
            projectId: projectId as Id<'projects'>,
            sourceId: sourceId as Id<'cmsSources'>,
        })
            .then((data) => {
                if (!cancelled) setRemoteData(data);
            })
            .catch((err: Error) => {
                if (!cancelled) toast.error(err.message);
            })
            .finally(() => {
                if (!cancelled) setIsLoadingRemote(false);
            });
        return () => {
            cancelled = true;
        };
    }, [open, sourceId, projectId, listRemoteCollections]);

    const remote = useMemo(() => remoteData ?? [], [remoteData]);
    const existing = collectionsData ?? [];

    // Default every row to "create new" on first load.
    useEffect(() => {
        if (!open) return;
        const next: Record<string, RowState> = {};
        for (const r of remote) {
            next[r.id] = rows[r.id] ?? { target: MODE_NEW };
        }
        setRows(next);
        // We intentionally don't depend on `rows` to avoid wiping user
        // selections when the remote list re-fetches.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, remote]);

    const handleConfirm = async () => {
        if (!sourceId) return;
        type Mapping = Parameters<typeof mapCollectionsAction>[0]['mappings'][number];
        const mappings: Mapping[] = [];
        for (const r of remote) {
            const row = rows[r.id];
            if (!row || row.target === MODE_SKIP) continue;
            if (row.target === MODE_NEW) {
                mappings.push({
                    mode: 'create',
                    remoteRef: r.id,
                    name: r.name,
                    slug: slugify(r.name),
                    fields: r.fields,
                });
            } else {
                mappings.push({
                    mode: 'attach',
                    remoteRef: r.id,
                    collectionId: row.target as Id<'cmsCollections'>,
                });
            }
        }
        if (mappings.length === 0) {
            toast.error(t(transKeys.cms.sources.map.nothingToMap));
            return;
        }
        setIsMapping(true);
        try {
            await mapCollectionsAction({
                projectId: projectId as Id<'projects'>,
                sourceId: sourceId as Id<'cmsSources'>,
                mappings,
            });
            // Convex live queries auto-revalidate — no manual invalidate needed.
            toast.success(t(transKeys.cms.sources.map.success));
            onClose();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t(transKeys.cms.sources.map.failed));
        } finally {
            setIsMapping(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{t(transKeys.cms.sources.map.title)}</DialogTitle>
                    <DialogDescription>
                        {t(transKeys.cms.sources.map.description)}
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="max-h-[420px]">
                    {isLoadingRemote ? (
                        <p className="text-foreground-tertiary text-small p-4">
                            {t(transKeys.cms.sources.map.loading)}
                        </p>
                    ) : remote.length === 0 ? (
                        <p className="text-foreground-tertiary text-small p-4">
                            {t(transKeys.cms.sources.map.empty)}
                        </p>
                    ) : (
                        <ul className="divide-border divide-y">
                            {remote.map((r) => (
                                <li
                                    key={r.id}
                                    className="flex items-center justify-between gap-3 py-3"
                                >
                                    <div className="flex flex-col">
                                        <span className="text-foreground-primary text-small font-medium">
                                            {r.name}
                                        </span>
                                        <span className="text-foreground-tertiary text-mini">
                                            {r.fields.length}{' '}
                                            {t(transKeys.cms.sources.map.inferredFields)}
                                        </span>
                                    </div>
                                    <Select
                                        value={rows[r.id]?.target ?? MODE_NEW}
                                        onValueChange={(value) =>
                                            setRows((prev) => ({
                                                ...prev,
                                                [r.id]: { target: value },
                                            }))
                                        }
                                    >
                                        <SelectTrigger className="w-[260px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={MODE_NEW}>
                                                {t(transKeys.cms.sources.map.createNew, {
                                                    name: r.name,
                                                })}
                                            </SelectItem>
                                            <SelectItem value={MODE_SKIP}>
                                                {t(transKeys.cms.sources.map.skip)}
                                            </SelectItem>
                                            {existing.map((c) => (
                                                <SelectItem key={c._id} value={c._id}>
                                                    {c.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </li>
                            ))}
                        </ul>
                    )}
                </ScrollArea>

                <DialogFooter>
                    <Button variant="ghost" onClick={onClose}>
                        {t(transKeys.cms.sources.map.cancel)}
                    </Button>
                    <Button onClick={handleConfirm} disabled={isMapping}>
                        {t(transKeys.cms.sources.map.confirm)}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

function slugify(name: string): string {
    return (
        name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 64) || 'collection'
    );
}
