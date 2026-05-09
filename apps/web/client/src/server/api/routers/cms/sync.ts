import { and, eq, isNotNull, notInArray } from 'drizzle-orm';

import type { DrizzleDb } from '@weblab/db';
import { cmsCollections, cmsItems, cmsSources } from '@weblab/db';
import { CmsItemStatus, CmsSourceType } from '@weblab/models';

import { decryptCmsCredentials, isEncryptedBlob } from '@/server/utils/cms-credentials';
import { getAdapter } from './adapters/dispatch';

/**
 * Per-collection counts emitted by `runSourceSync`, surfaced to the user
 * in the wizard / sources tab "Refresh" button.
 */
export interface SyncResult {
    sourceId: string;
    /** Total number of items written across all collections. */
    written: number;
    /** Total number of items pruned (removed locally because they no longer
     *  appear in the remote response). Zero unless `prune` was true. */
    pruned: number;
    perCollection: Array<{
        collectionId: string;
        collectionName: string;
        written: number;
        pruned: number;
        skipped: number;
        error?: string;
    }>;
}

export interface SyncOptions {
    /** When true, locally-stored items whose `remoteId` is no longer in the
     *  adapter response are deleted. Default false (safe). Bindings to
     *  pruned items become orphaned — the editor surfaces a placeholder. */
    prune?: boolean;
}

/**
 * Pull items from an external CMS source and shadow them into `cms_item`.
 *
 * Strategy: for each Weblab collection backed by `sourceId`, ask the
 * adapter for items keyed by `remote_id`. Existing rows with the same
 * `(collectionId, remoteId)` are UPDATED in place; new items are
 * INSERTED. We don't delete items removed remotely — that risks losing
 * user-edited content during a transient adapter failure. A separate
 * "prune" action can ship later.
 *
 * Native Weblab collections (no `cms_source` of an external type) are
 * skipped silently.
 */
export async function runSourceSync(
    db: DrizzleDb,
    projectId: string,
    sourceId: string,
    options: SyncOptions = {},
): Promise<SyncResult> {
    const source = await db.query.cmsSources.findFirst({
        where: and(eq(cmsSources.id, sourceId), eq(cmsSources.projectId, projectId)),
    });
    if (!source) throw new Error('Source not found');
    if (source.type === CmsSourceType.WEBLAB) {
        return { sourceId, written: 0, pruned: 0, perCollection: [] };
    }
    const adapter = getAdapter(source.type);
    if (!adapter) return { sourceId, written: 0, pruned: 0, perCollection: [] };
    if (!isEncryptedBlob(source.credentials)) {
        throw new Error('Source has no usable credentials');
    }
    const creds = decryptCmsCredentials(source.credentials.encrypted);

    const collections = await db.query.cmsCollections.findMany({
        where: and(eq(cmsCollections.projectId, projectId), eq(cmsCollections.sourceId, sourceId)),
    });

    const result: SyncResult = { sourceId, written: 0, pruned: 0, perCollection: [] };
    for (const collection of collections) {
        const remoteRef = readRemoteRefImpl(collection);
        if (!remoteRef) {
            result.perCollection.push({
                collectionId: collection.id,
                collectionName: collection.name,
                written: 0,
                pruned: 0,
                skipped: 0,
                error: 'Collection has no remote reference (set during mapping)',
            });
            continue;
        }
        try {
            const items = await adapter.fetchItems(creds, remoteRef);
            let written = 0;
            for (const item of items) {
                const existing = await db.query.cmsItems.findFirst({
                    where: and(
                        eq(cmsItems.collectionId, collection.id),
                        eq(cmsItems.remoteId, item.id),
                    ),
                });
                if (existing) {
                    await db
                        .update(cmsItems)
                        .set({
                            slug: item.slug ?? existing.slug,
                            values: item.values,
                            updatedAt: new Date(),
                        })
                        .where(eq(cmsItems.id, existing.id));
                } else {
                    await db.insert(cmsItems).values({
                        collectionId: collection.id,
                        remoteId: item.id,
                        slug: item.slug,
                        // External items are treated as published — they
                        // came from an authoritative system.
                        status: CmsItemStatus.PUBLISHED,
                        publishedAt: new Date(),
                        values: item.values,
                    });
                }
                written += 1;
            }

            // Optional prune: drop any local items whose remoteId is no
            // longer in the adapter response. Only deletes rows with a
            // non-null remoteId so native items in the same collection
            // (legacy mixed mode) are untouched.
            let pruned = 0;
            if (options.prune) {
                const remoteIds = items.map((it) => it.id);
                // When the adapter returns 0 items, every remote-sourced
                // row in this collection is "missing" → drop them all.
                // Skipping the notInArray clause achieves that.
                const where =
                    remoteIds.length > 0
                        ? and(
                              eq(cmsItems.collectionId, collection.id),
                              isNotNull(cmsItems.remoteId),
                              notInArray(cmsItems.remoteId, remoteIds),
                          )
                        : and(
                              eq(cmsItems.collectionId, collection.id),
                              isNotNull(cmsItems.remoteId),
                          );
                const deleted = await db
                    .delete(cmsItems)
                    .where(where)
                    .returning({ id: cmsItems.id });
                pruned = deleted.length;
            }
            result.written += written;
            result.pruned += pruned;
            result.perCollection.push({
                collectionId: collection.id,
                collectionName: collection.name,
                written,
                pruned,
                skipped: 0,
            });
        } catch (err) {
            result.perCollection.push({
                collectionId: collection.id,
                collectionName: collection.name,
                written: 0,
                pruned: 0,
                skipped: 0,
                error: err instanceof Error ? err.message : 'Unknown error',
            });
        }
    }
    return result;
}

/**
 * Each Weblab collection backed by an external source stores its remote
 * reference in `cms_collection.description`'s reserved JSON tail, but for
 * v3 we keep it simple: encode the remote ref as a `remote:` prefix on
 * the description, and strip it from display in the UI.
 *
 * Why not a dedicated column? Adding `remote_ref` to `cms_collection` is
 * fine but multiplies the v3 migration footprint. The prefix-on-description
 * approach is reversible and contained; v3.x can promote it to a real column.
 */
const REMOTE_REF_PREFIX = 'remote:';

export function readRemoteRef(description: string | null): string | null {
    return readRemoteRefImpl({ description });
}

function readRemoteRefImpl(collection: { description: string | null }): string | null {
    if (!collection.description) return null;
    const lines = collection.description.split('\n');
    for (const line of lines) {
        if (line.startsWith(REMOTE_REF_PREFIX)) {
            return line.slice(REMOTE_REF_PREFIX.length).trim();
        }
    }
    return null;
}

/** Encode a remote reference into a description string. Preserves any
 *  existing user description on the lines below. */
export function encodeRemoteRef(remoteRef: string, userDescription?: string): string {
    const head = `${REMOTE_REF_PREFIX}${remoteRef}`;
    return userDescription ? `${head}\n${userDescription}` : head;
}

/** Read back a user-facing description, hiding the remote-ref line. */
export function stripRemoteRef(description: string | null): string {
    if (!description) return '';
    return description
        .split('\n')
        .filter((line) => !line.startsWith(REMOTE_REF_PREFIX))
        .join('\n');
}
