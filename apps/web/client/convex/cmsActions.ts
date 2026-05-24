'use node';

import { v } from 'convex/values';

import { CmsSourceType } from '@weblab/models';

import type { Doc, Id } from './_generated/dataModel';
import type { RemoteItem } from './lib/cmsAdapters';
import { api, internal } from './_generated/api';
import { action } from './_generated/server';
import { getAdapter } from './lib/cmsAdapters';
import {
    decryptCmsCredentials,
    encryptCmsCredentials,
    isEncryptedBlob,
} from './lib/cmsCredentials';
import { readRemoteRef } from './lib/cmsRemoteRef';

// Actions for CMS work that needs Node — encryption, adapter HTTP fetch.
// Mirrors the sync + adapter-driven endpoints in
// src/server/api/routers/cms/{source,sync}.ts.

const externalSourceTypes = v.union(v.literal('payload'), v.literal('strapi'), v.literal('rest'));

const credentialsArg = v.record(v.string(), v.any());

const SYNC_UPSERT_BATCH = 50;

// ─── Connection health checks ────────────────────────────────────────────────

/**
 * Health-check credentials WITHOUT persisting them. Used by the connect
 * wizard's "Test connection" button.
 */
export const sourceTestConnection = action({
    args: {
        projectId: v.id('projects'),
        type: externalSourceTypes,
        credentials: credentialsArg,
    },
    handler: async (
        ctx,
        { projectId, type, credentials },
    ): Promise<{ ok: true } | { ok: false; reason: string }> => {
        // Gate on project access — this action drives server-side outbound
        // HTTP with caller-supplied credentials; without a check any user
        // could probe endpoints against any projectId (SSRF-limited).
        await ctx.runQuery(internal.cmsActionsInternal._assertProjectUpdate, { projectId });
        const adapter = getAdapter(type as CmsSourceType);
        if (!adapter) {
            return { ok: false, reason: 'Unsupported source type' };
        }
        return adapter.testConnection(credentials);
    },
});

/**
 * Re-test an already-saved source using its stored credentials. Used by
 * the "Test connection" button on each row in the sources tab.
 */
export const sourceTestExisting = action({
    args: {
        projectId: v.id('projects'),
        sourceId: v.id('cmsSources'),
    },
    handler: async (
        ctx,
        { projectId, sourceId },
    ): Promise<{ ok: true } | { ok: false; reason: string }> => {
        const source = await ctx.runQuery(api.cmsSources.getWithCredentials, {
            projectId,
            sourceId,
        });
        if (!source) {
            return { ok: false, reason: 'Source not found' };
        }
        const adapter = getAdapter(source.type as CmsSourceType);
        if (!adapter) {
            return { ok: false, reason: 'Unsupported source type' };
        }
        if (!isEncryptedBlob(source.credentials)) {
            return { ok: false, reason: 'Source has no usable credentials' };
        }
        const creds = decryptCmsCredentials(source.credentials.encrypted);
        return adapter.testConnection(creds);
    },
});

// ─── Source creation / mapping helpers ───────────────────────────────────────

/**
 * Encrypt-then-persist convenience for the connect wizard. Wraps the
 * V8-side cmsSources.create so callers don't have to know about the
 * encryption boundary.
 */
export const sourceCreate = action({
    args: {
        projectId: v.id('projects'),
        type: externalSourceTypes,
        name: v.string(),
        credentials: credentialsArg,
    },
    handler: async (
        ctx,
        { projectId, type, name, credentials },
    ): Promise<Omit<Doc<'cmsSources'>, 'credentials'>> => {
        const encrypted = encryptCmsCredentials(credentials);
        return ctx.runMutation(api.cmsSources.create, {
            projectId,
            type,
            name,
            credentialsEncrypted: encrypted,
        });
    },
});

/**
 * Encrypt-then-patch counterpart to `sourceCreate`. Used by the
 * "rotate credentials" button.
 */
export const sourceUpdate = action({
    args: {
        projectId: v.id('projects'),
        sourceId: v.id('cmsSources'),
        name: v.optional(v.string()),
        credentials: v.optional(credentialsArg),
    },
    handler: async (
        ctx,
        { projectId, sourceId, name, credentials },
    ): Promise<Omit<Doc<'cmsSources'>, 'credentials'>> => {
        const encrypted =
            credentials !== undefined ? encryptCmsCredentials(credentials) : undefined;
        return ctx.runMutation(api.cmsSources.update, {
            projectId,
            sourceId,
            name,
            credentialsEncrypted: encrypted,
        });
    },
});

// ─── Remote-collection discovery ─────────────────────────────────────────────

interface RemoteCollectionOut {
    id: string;
    name: string;
    fields: { key: string; name: string; type: string }[];
}

/**
 * Fetch the remote content types via the adapter so the user can map
 * them onto Weblab collections in the wizard.
 */
export const sourceListRemoteCollections = action({
    args: {
        projectId: v.id('projects'),
        sourceId: v.id('cmsSources'),
    },
    handler: async (ctx, { projectId, sourceId }): Promise<RemoteCollectionOut[]> => {
        const source = await ctx.runQuery(api.cmsSources.getWithCredentials, {
            projectId,
            sourceId,
        });
        if (!source) throw new Error('NOT_FOUND: source');
        const adapter = getAdapter(source.type as CmsSourceType);
        if (!adapter) return [];
        if (!isEncryptedBlob(source.credentials)) return [];
        const creds = decryptCmsCredentials(source.credentials.encrypted);
        return adapter.listRemoteCollections(creds);
    },
});

// ─── Wizard mapping → create collections + initial sync ──────────────────────

/**
 * Wizard step 6 — apply mappings from remote content types to Weblab
 * collections. For each mapping: create a new collection (with inferred
 * fields and the remote ref encoded in description), or attach the
 * remote ref to an existing collection. After the batch, runs a sync.
 */
export const sourceMapCollections = action({
    args: {
        projectId: v.id('projects'),
        sourceId: v.id('cmsSources'),
        mappings: v.array(
            v.union(
                v.object({
                    mode: v.literal('create'),
                    remoteRef: v.string(),
                    name: v.string(),
                    slug: v.string(),
                    fields: v.array(
                        v.object({
                            key: v.string(),
                            name: v.string(),
                            type: v.string(),
                        }),
                    ),
                }),
                v.object({
                    mode: v.literal('attach'),
                    remoteRef: v.string(),
                    collectionId: v.id('cmsCollections'),
                }),
            ),
        ),
    },
    handler: async (ctx, { projectId, sourceId, mappings }) => {
        const source = await ctx.runQuery(api.cmsSources.getWithCredentials, {
            projectId,
            sourceId,
        });
        if (!source) throw new Error('NOT_FOUND: source');

        for (const mapping of mappings) {
            if (mapping.mode === 'create') {
                await ctx.runMutation(internal.cmsActionsInternal._wizardCreateCollection, {
                    projectId,
                    sourceId,
                    remoteRef: mapping.remoteRef,
                    name: mapping.name,
                    slug: mapping.slug,
                    fields: mapping.fields,
                });
            } else {
                await ctx.runMutation(internal.cmsActionsInternal._wizardAttachCollection, {
                    projectId,
                    sourceId,
                    collectionId: mapping.collectionId,
                    remoteRef: mapping.remoteRef,
                });
            }
        }

        // Initial sync so items show up immediately. Best-effort —
        // adapter errors don't roll back the mapping.
        try {
            await ctx.runAction(api.cmsActions.sourceSync, {
                projectId,
                sourceId,
                prune: false,
            });
        } catch (err) {
            console.error('[cms.sourceMapCollections] initial sync failed', err);
        }
        return { success: true } as const;
    },
});

// ─── Sync engine ─────────────────────────────────────────────────────────────

export interface SyncResult {
    sourceId: string;
    written: number;
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

/**
 * Pull items from an external CMS source and shadow them into cmsItems.
 *
 * For each Weblab collection backed by `sourceId`, ask the adapter for
 * items keyed by `remote_id`. Existing rows with the same
 * (collectionId, remoteId) are updated in place; new items are inserted.
 * Native Weblab collections are skipped.
 */
export const sourceSync = action({
    args: {
        projectId: v.id('projects'),
        sourceId: v.id('cmsSources'),
        prune: v.optional(v.boolean()),
    },
    handler: async (ctx, { projectId, sourceId, prune }): Promise<SyncResult> => {
        const source = await ctx.runQuery(api.cmsSources.getWithCredentials, {
            projectId,
            sourceId,
        });
        if (!source) throw new Error('NOT_FOUND: source');
        const result: SyncResult = {
            sourceId: source._id,
            written: 0,
            pruned: 0,
            perCollection: [],
        };
        if (source.type === 'weblab') {
            return result;
        }
        const adapter = getAdapter(source.type as CmsSourceType);
        if (!adapter) return result;
        if (!isEncryptedBlob(source.credentials)) {
            throw new Error('Source has no usable credentials');
        }
        const creds = decryptCmsCredentials(source.credentials.encrypted);

        const collections = await ctx.runQuery(
            internal.cmsActionsInternal._listCollectionsForSource,
            {
                projectId,
                sourceId,
            },
        );

        for (const collection of collections) {
            const remoteRef = readRemoteRef(collection.description ?? null);
            if (!remoteRef) {
                result.perCollection.push({
                    collectionId: collection._id,
                    collectionName: collection.name,
                    written: 0,
                    pruned: 0,
                    skipped: 0,
                    error: 'Collection has no remote reference (set during mapping)',
                });
                continue;
            }
            try {
                const items: RemoteItem[] = await adapter.fetchItems(creds, remoteRef);
                let written = 0;
                for (let i = 0; i < items.length; i += SYNC_UPSERT_BATCH) {
                    const slice = items.slice(i, i + SYNC_UPSERT_BATCH);
                    const res = await ctx.runMutation(internal.cmsItems._upsertBatch, {
                        items: slice.map((item) => ({
                            collectionId: collection._id as Id<'cmsCollections'>,
                            remoteId: item.id,
                            slug: item.slug,
                            values: item.values,
                        })),
                    });
                    written += res.written;
                }

                let pruned = 0;
                if (prune) {
                    const pruneRes = await ctx.runMutation(internal.cmsItems._pruneBatch, {
                        collectionId: collection._id as Id<'cmsCollections'>,
                        keepRemoteIds: items.map((it) => it.id),
                    });
                    pruned = pruneRes.pruned;
                }
                result.written += written;
                result.pruned += pruned;
                result.perCollection.push({
                    collectionId: collection._id,
                    collectionName: collection.name,
                    written,
                    pruned,
                    skipped: 0,
                });
            } catch (err) {
                result.perCollection.push({
                    collectionId: collection._id,
                    collectionName: collection.name,
                    written: 0,
                    pruned: 0,
                    skipped: 0,
                    error: err instanceof Error ? err.message : 'Unknown error',
                });
            }
        }
        return result;
    },
});

// Internal mutations/queries used by these actions live in
// cmsActionsInternal.ts (V8 runtime — internalMutation / internalQuery
// cannot live in a "use node" file). They're called via
// `internal.cmsActionsInternal.*`.
