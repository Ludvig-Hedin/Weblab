'use client';

import { useEffect, useMemo } from 'react';
import { observer } from 'mobx-react-lite';

import type { CmsBindingPayload } from '@weblab/models';

import { useEditorEngine } from '@/components/store/editor';
import { api } from '@/trpc/react';

interface CmsItemSnapshot {
    id: string;
    collectionId: string;
    values: Record<string, unknown>;
}

interface CmsDataPayload {
    bindings: Record<string, CmsBindingPayload>;
    items: Record<string, CmsItemSnapshot>;
    itemsByCollection: Record<string, string[]>;
    /** v4: editor-picked "current item" for PAGE_ITEM_FIELD bindings.
     *  null when no item is selected. */
    currentItem?: CmsItemSnapshot | null;
}

/**
 * Subscribes to the project's CMS snapshot (bindings + items for every
 * referenced collection) and pushes it to every live frame view via
 * Penpal whenever it changes.
 *
 * Mounted at the project main level so it's live for the whole session.
 * Cheap when there are no bindings — single query that returns an empty
 * payload and a no-op effect.
 */
export const CmsDataPusher = observer(() => {
    const editorEngine = useEditorEngine();
    const projectId = editorEngine.projectId;

    const snapshotQuery = api.cms.binding.snapshot.useQuery(
        { projectId: projectId ?? '' },
        {
            enabled: !!projectId,
            // Refetch periodically in case bindings change in another tab
            // or via a collaborator. The pusher itself also invalidates the
            // query when it owns the change.
            refetchInterval: 30_000,
            staleTime: 5_000,
        },
    );
    // Used to validate that `cmsCurrentItemId` belongs to a collection that
    // actually has a registered detail page — prevents an item picked for
    // one collection from leaking into PAGE_ITEM_FIELD bindings on a
    // different collection's page (BUG #2 from review).
    const pagesQuery = api.cms.collectionPage.list.useQuery(
        { projectId: projectId ?? '' },
        { enabled: !!projectId, staleTime: 30_000 },
    );

    const currentItemId = editorEngine.state.cmsCurrentItemId;

    /**
     * Project-wide payload (everything but `currentItem`). Per-frame
     * currentItem is computed at push time so each frame can show the item
     * matching its URL.
     */
    const basePayload = useMemo(() => {
        const data = snapshotQuery.data;
        if (!data) return null;
        const bindings: Record<string, CmsBindingPayload> = {};
        for (const b of data.bindings) {
            bindings[b.oid] = b.binding;
        }
        const items: Record<string, CmsItemSnapshot> = {};
        const itemsByCollection: Record<string, string[]> = {};
        for (const it of data.items) {
            items[it.id] = {
                id: it.id,
                collectionId: it.collectionId,
                values: it.values ?? {},
            };
            const list = itemsByCollection[it.collectionId] ?? [];
            list.push(it.id);
            itemsByCollection[it.collectionId] = list;
        }
        return { bindings, items, itemsByCollection };
    }, [snapshotQuery.data]);

    const pages = pagesQuery.data ?? [];
    const validCollectionIds = useMemo(() => new Set(pages.map((p) => p.collectionId)), [pages]);

    /**
     * Build a per-frame payload by:
     *   1. Editor pick (`cmsCurrentItemId`) — wins when the item belongs to a
     *      page-registered collection.
     *   2. URL match — parse the iframe's pathname against each page
     *      registration's pagePath template, extract the dynamic segment, and
     *      look up the item by `matchFieldKey`.
     *   3. Otherwise, no currentItem.
     */
    const buildFramePayload = (frameUrl: string | undefined): CmsDataPayload | null => {
        if (!basePayload) return null;
        const editorPick = currentItemId ? (basePayload.items[currentItemId] ?? null) : null;
        const editorPickValid =
            editorPick && validCollectionIds.has(editorPick.collectionId) ? editorPick : null;
        if (editorPickValid) {
            return { ...basePayload, currentItem: editorPickValid };
        }
        // No editor pick → try URL match. Skip silently when the iframe URL
        // is missing or unparseable.
        if (!frameUrl) return { ...basePayload, currentItem: null };
        let pathname: string;
        try {
            pathname = new URL(frameUrl).pathname;
        } catch {
            return { ...basePayload, currentItem: null };
        }
        for (const page of pages) {
            const segValue = matchSegment(page.pagePath, pathname);
            if (!segValue) continue;
            const itemIds = basePayload.itemsByCollection[page.collectionId] ?? [];
            for (const id of itemIds) {
                const item = basePayload.items[id];
                if (!item) continue;
                if (String(item.values[page.matchFieldKey]) === segValue) {
                    return { ...basePayload, currentItem: item };
                }
            }
        }
        return { ...basePayload, currentItem: null };
    };

    const pushAll = () => {
        if (!basePayload) return;
        for (const data of editorEngine.frames.getAll()) {
            const view = data.view;
            if (!view) continue;
            // Before the penpal handshake completes, `view` exposes only the
            // sync iframe methods — `setCmsData` is wired via `remoteMethods`
            // and is missing during the ~10–15s sandbox cold-boot window.
            // Skip silently; the 2s interval re-pushes once penpal connects.
            if (typeof view.setCmsData !== 'function') continue;
            const payload = buildFramePayload(view.src);
            if (!payload) continue;
            // The handshake can also tear down between the `typeof` check and
            // the actual call when the preview iframe reloads — penpal then
            // throws a "destroyed connection" error that used to spam the
            // console. Swallow it; the 2s retry interval re-pushes once the
            // new handshake completes. Unexpected errors still surface.
            try {
                void Promise.resolve(view.setCmsData(payload)).catch((err: unknown) => {
                    const message = err instanceof Error ? err.message : String(err);
                    if (/destroyed connection|connection is destroyed/i.test(message)) {
                        return;
                    }
                    console.warn('[cms-workspace] setCmsData failed:', err);
                });
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                if (!/destroyed connection|connection is destroyed/i.test(message)) {
                    console.warn('[cms-workspace] setCmsData threw:', err);
                }
            }
        }
    };

    useEffect(() => {
        pushAll();
        // Deliberately wide deps — pushing on snapshot/page/pick change covers
        // the user-visible cases. `pushAll` reads the latest frame list at
        // call time so newly-attached frames don't need a separate effect.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [basePayload, validCollectionIds, currentItemId, pages]);

    useEffect(() => {
        if (!basePayload) return;
        const id = setInterval(pushAll, 2_000);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [basePayload, validCollectionIds, currentItemId, pages]);

    return null;
});

/**
 * Match an iframe pathname (`/blog/my-post`) against a page-path template
 * (`/blog/[slug]`). Returns the dynamic segment value, or null when the
 * static parts don't match. Only handles a single dynamic segment — the
 * common case for collection detail pages.
 */
function matchSegment(template: string, pathname: string): string | null {
    const tParts = template.split('/').filter(Boolean);
    const pParts = pathname.split('/').filter(Boolean);
    if (tParts.length !== pParts.length) return null;
    let dynamic: string | null = null;
    for (let i = 0; i < tParts.length; i++) {
        const t = tParts[i]!;
        const p = pParts[i]!;
        if (t.startsWith('[') && t.endsWith(']')) {
            if (dynamic !== null) return null; // multiple dynamic segments unsupported
            dynamic = decodeURIComponent(p);
        } else if (t !== p) {
            return null;
        }
    }
    return dynamic;
}
