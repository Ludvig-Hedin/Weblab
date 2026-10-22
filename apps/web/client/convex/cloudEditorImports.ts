import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internalMutation, mutation, query } from './_generated/server';
import { requireCloudAccess } from './cloudEditorAccess';
import { importFile } from './cloudEditorImportsSchema';
import { assertOperationId, cloudError, MAX_CLOUD_TEXT_BYTES } from './lib/cloudEditor';
import { isImportedCloudProfile, importSourcePath, validateCloudImportManifest, MAX_IMPORT_BYTES, MAX_IMPORT_ASSET_BYTES, MAX_IMPORT_INLINE_BYTES } from './lib/cloudImportManifest';
import { insertCloudProjectGraph } from './lib/cloudProjectGraph';
import { requireCap } from './lib/permissions';
import { storageSha256Matches } from './lib/storageHash';

type Context = QueryCtx | MutationCtx;
type Attempt = Doc<'cloudEditorImports'>;
const DAY = 86_400_000;
const LEASE = 120_000;
const MAX_FILES = 400;
const collectRef = makeFunctionReference<'mutation', { attemptId: Id<'cloudEditorImports'> }, null>('cloudEditorImports:_collect');
const attemptArgs = { attemptId: v.id('cloudEditorImports') };
const claimArgs = { ...attemptArgs, fileIndex: v.number(), secret: v.string() };
const receiptArgs = { ...claimArgs, nonce: v.string() };

function enabled(): void {
    if (process.env.WEBLAB_CLOUD_IMPORTS_ENABLED !== 'true') cloudError('CLOUD_IMPORT_DISABLED');
}
function server(secret: string): void {
    const expected = process.env.WEBLAB_CLOUD_IMPORT_SECRET ?? '';
    if (!/^[a-f0-9]{64}$/.test(expected) || expected.length !== 64 || secret.length !== 64 || !/^[a-f0-9]{64}$/.test(secret))
        cloudError('CLOUD_IMPORT_SERVER_REQUIRED');
    let difference = 0;
    for (let index = 0; index < 64; index++) difference |= expected.charCodeAt(index) ^ secret.charCodeAt(index);
    if (difference) cloudError('CLOUD_IMPORT_SERVER_REQUIRED');
}
async function attempt(ctx: Context, id: Id<'cloudEditorImports'>): Promise<Attempt> {
    const row = await ctx.db.get(id);
    if (!row) return cloudError('CLOUD_IMPORT_NOT_FOUND');
    return row;
}
async function owned(ctx: Context, id: Id<'cloudEditorImports'>, recovery = false): Promise<Attempt> {
    if (!recovery) enabled();
    const row = await attempt(ctx, id);
    const { user } = await requireCap(ctx, 'project.create', { workspaceId: row.workspaceId });
    if (user._id !== row.actorId) return cloudError('CLOUD_IMPORT_NOT_FOUND');
    return row;
}
function open(row: Attempt): void {
    if (row.state !== 'open' || row.expiresAt <= Date.now()) cloudError('CLOUD_IMPORT_EXPIRED');
}
async function projectQuota(ctx: Context, workspaceId: Id<'workspaces'>): Promise<void> {
    const rows = await ctx.db.query('cloudEditorStates').withIndex('by_workspaceId', q => q.eq('workspaceId', workspaceId)).take(3);
    if (rows.length >= 3) cloudError('CLOUD_PROJECT_LIMIT');
}
async function uploadRow(ctx: Context, row: Attempt, index: number) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= row.files.length) return cloudError('CLOUD_IMPORT_FILE_REQUIRED');
    const manifest = row.files[index];
    const file = await ctx.db.query('cloudEditorImportFiles').withIndex('by_attemptId_index', q => q.eq('attemptId', row._id).eq('index', index)).unique();
    if (!manifest || manifest.kind !== 'binary' || !file || file.path !== manifest.path || file.hash !== manifest.hash || file.bytes !== manifest.bytes)
        return cloudError('CLOUD_IMPORT_FILE_REQUIRED');
    return file;
}
function nonceMatches(file: Doc<'cloudEditorImportFiles'>, nonce: string): void {
    if (!file.nonce || file.nonce !== nonce) cloudError('CLOUD_IMPORT_CLAIM_CHANGED');
}
async function referenced(ctx: Context, storageId: Id<'_storage'>): Promise<boolean> {
    const [source, release] = await Promise.all([
        ctx.db.query('cloudEditorFiles').withIndex('by_storageId', q => q.eq('storageId', storageId)).first(),
        ctx.db.query('cloudReleaseAssets').withIndex('by_storageId', q => q.eq('storageId', storageId)).first(),
    ]);
    return !!source || !!release;
}

export const begin = mutation({
    args: { workspaceId: v.id('workspaces'), actorId: v.id('users'), operationKey: v.string(), name: v.string(), files: v.array(importFile) },
    handler: async (ctx, args) => {
        enabled();
        const { user } = await requireCap(ctx, 'project.create', { workspaceId: args.workspaceId });
        if (user._id !== args.actorId) cloudError('CLOUD_ACTOR_CHANGED');
        assertOperationId(args.operationKey);
        const name = args.name.trim();
        if (!name || name.length > 80) return cloudError('CLOUD_INVALID_NAME');
        const manifest = await validateCloudImportManifest(args.files);
        const prior = await ctx.db.query('cloudEditorImports').withIndex('by_actorId_operationKey', q => q.eq('actorId', user._id).eq('operationKey', args.operationKey)).unique();
        if (prior) {
            if (prior.workspaceId !== args.workspaceId || prior.name !== name || prior.manifestHash !== manifest.manifestHash)
                return cloudError('CLOUD_IMPORT_RETRY_CHANGED');
            return { attemptId: prior._id, manifestHash: prior.manifestHash };
        }
        await projectQuota(ctx, args.workspaceId);
        const now = Date.now();
        const [workspaceRecent, actorRecent] = await Promise.all([
            ctx.db.query('cloudEditorImports').withIndex('by_workspaceId_createdAt', q => q.eq('workspaceId', args.workspaceId).gte('createdAt', now - DAY)).take(3),
            ctx.db.query('cloudEditorImports').withIndex('by_actorId_createdAt', q => q.eq('actorId', user._id).gte('createdAt', now - DAY)).take(4),
        ]);
        if (workspaceRecent.length >= 2 || actorRecent.length >= 3) return cloudError('CLOUD_IMPORT_LIMIT');
        if (workspaceRecent.some(row => row.state === 'open' && row.expiresAt > now)) return cloudError('CLOUD_IMPORT_BUSY');
        const attemptId = await ctx.db.insert('cloudEditorImports', { actorId: user._id, workspaceId: args.workspaceId,
            operationKey: args.operationKey, name, files: manifest.files, bytes: manifest.bytes, manifestHash: manifest.manifestHash,
            createdAt: now, expiresAt: now + DAY, state: 'open' });
        for (const [index, file] of manifest.files.entries()) {
            if (file.kind === 'binary') await ctx.db.insert('cloudEditorImportFiles', {
                attemptId, index, path: file.path, hash: file.hash, bytes: file.bytes, state: 'pending' });
        }
        await ctx.scheduler.runAfter(DAY, collectRef, { attemptId });
        return { attemptId, manifestHash: manifest.manifestHash };
    },
});

async function safeStatus(ctx: Context, row: Attempt) {
        const files = await ctx.db.query('cloudEditorImportFiles').withIndex('by_attemptId', q => q.eq('attemptId', row._id)).take(MAX_FILES + 1);
        if (files.length > MAX_FILES) return cloudError('CLOUD_IMPORT_FILE_LIMIT');
        const now = Date.now();
        return { attemptId: row._id, manifestHash: row.manifestHash, name: row.name, bytes: row.bytes, expiresAt: row.expiresAt,
            state: row.state === 'open' && row.expiresAt <= Date.now() ? 'expired' as const : row.state,
            projectId: row.projectId ?? null, branchId: row.branchId ?? null,
            files: row.files.map((file, index) => {
                const receipt = files.find(value => value.index === index);
                return { index, path: file.path, kind: file.kind, bytes: file.bytes, hash: file.hash,
                    state: file.kind === 'text' ? 'received' as const : receipt?.state ?? 'pending' as const,
                    valid: file.kind === 'text' || receipt?.valid === true,
                    canUpload: process.env.WEBLAB_CLOUD_IMPORTS_ENABLED === 'true' && row.state === 'open' && row.expiresAt > now
                        && file.kind === 'binary' && !!receipt && !receipt.storageId
                        && (receipt.state === 'pending' || (receipt.state === 'receiving' && typeof receipt.leaseUntil === 'number'
                            && Number.isFinite(receipt.leaseUntil) && receipt.leaseUntil <= now)) };
            }) };
}
export const access = query({
    args: { workspaceId: v.id('workspaces') },
    handler: async (ctx, args) => {
        const { user } = await requireCap(ctx, 'project.create', args);
        return { actorId: user._id, enabled: process.env.WEBLAB_CLOUD_IMPORTS_ENABLED === 'true',
            limits: { files: MAX_FILES, bytes: MAX_IMPORT_BYTES, assetBytes: MAX_IMPORT_ASSET_BYTES,
                textBytes: MAX_CLOUD_TEXT_BYTES, inlineBytes: MAX_IMPORT_INLINE_BYTES } };
    },
});
export const status = query({
    args: attemptArgs,
    handler: async (ctx, { attemptId }) => safeStatus(ctx, await owned(ctx, attemptId, true)),
});
export const findAttempt = query({
    args: { workspaceId: v.id('workspaces'), operationKey: v.string() },
    handler: async (ctx, args) => {
        const { user } = await requireCap(ctx, 'project.create', { workspaceId: args.workspaceId });
        assertOperationId(args.operationKey);
        const row = await ctx.db.query('cloudEditorImports').withIndex('by_actorId_operationKey', q => q.eq('actorId', user._id)
            .eq('operationKey', args.operationKey)).unique();
        if (!row) return null;
        if (row.workspaceId !== args.workspaceId) return cloudError('CLOUD_IMPORT_NOT_FOUND');
        return safeStatus(ctx, row);
    },
});
export const cancel = mutation({
    args: { ...attemptArgs, manifestHash: v.string() },
    handler: async (ctx, args) => {
        const row = await owned(ctx, args.attemptId, true);
        if (row.manifestHash !== args.manifestHash) return cloudError('CLOUD_IMPORT_RETRY_CHANGED');
        if (row.state !== 'finalized') {
            await ctx.db.patch(row._id, { state: 'expired', expiresAt: Math.min(row.expiresAt, Date.now()) });
            await ctx.scheduler.runAfter(0, collectRef, { attemptId: row._id });
        }
        return safeStatus(ctx, { ...row, ...(row.state === 'finalized' ? {} : { state: 'expired' as const, expiresAt: Math.min(row.expiresAt, Date.now()) }) });
    },
});

/** Only the authenticated app server receives upload URLs, never the browser status API. */
export const claimUpload = mutation({
    args: { ...claimArgs, expectedHash: v.string() },
    handler: async (ctx, args) => {
        server(args.secret);
        const row = await owned(ctx, args.attemptId); open(row);
        const file = await uploadRow(ctx, row, args.fileIndex);
        // Receiving has never acquired send authority. A fresh nonce makes a
        // late markSending from the expired holder fail atomically.
        const expiredReceiving = file.state === 'receiving' && typeof file.leaseUntil === 'number' &&
            Number.isFinite(file.leaseUntil) && file.leaseUntil <= Date.now();
        if (file.hash !== args.expectedHash || (file.state !== 'pending' && !expiredReceiving) || file.storageId)
            return cloudError('CLOUD_IMPORT_CLAIM_CHANGED');
        let active = 0;
        for (const state of ['receiving', 'sending', 'unknown'] as const) {
            active += (await ctx.db.query('cloudEditorImportFiles').withIndex('by_state_leaseUntil', q => q.eq('state', state).gt('leaseUntil', Date.now())).take(2)).length;
        }
        if (active >= 2) return cloudError('CLOUD_IMPORT_UPLOAD_BUSY');
        const nonce = crypto.randomUUID();
        await ctx.db.patch(file._id, { state: 'receiving', nonce, claimedAt: Date.now(), leaseUntil: Date.now() + LEASE, valid: false });
        const url = await ctx.storage.generateUploadUrl();
        return { nonce, url, bytes: file.bytes, hash: file.hash };
    },
});

export const markSending = mutation({
    args: receiptArgs,
    handler: async (ctx, args) => {
        server(args.secret);
        const row = await owned(ctx, args.attemptId); open(row);
        const file = await uploadRow(ctx, row, args.fileIndex); nonceMatches(file, args.nonce);
        if (file.state !== 'receiving' || (file.leaseUntil ?? 0) <= Date.now() || file.storageId) return false;
        await ctx.db.patch(file._id, { state: 'sending' });
        return true;
    },
});

/** A trusted server may retain its own late receipt even after the actor loses access. */
export const recordOwned = mutation({
    args: { ...receiptArgs, storageId: v.id('_storage'), actualBytes: v.number(), actualHash: v.string() },
    handler: async (ctx, args) => {
        server(args.secret);
        const row = await attempt(ctx, args.attemptId);
        const file = await uploadRow(ctx, row, args.fileIndex); nonceMatches(file, args.nonce);
        if (file.storageId) {
            if (file.storageId !== args.storageId) return cloudError('CLOUD_IMPORT_RECEIPT_CHANGED');
            return { valid: file.valid === true && row.state !== 'expired' && (row.state === 'finalized' || row.expiresAt > Date.now()) };
        }
        if (!['sending', 'unknown'].includes(file.state)) return cloudError('CLOUD_IMPORT_CLAIM_CHANGED');
        const others = await ctx.db.query('cloudEditorImportFiles').withIndex('by_storageId', q => q.eq('storageId', args.storageId)).take(1);
        if (others.length || await referenced(ctx, args.storageId)) return cloudError('CLOUD_IMPORT_FOREIGN_STORAGE');
        const metadata = await ctx.db.system.get(args.storageId);
        if (!metadata || metadata._creationTime < (file.claimedAt ?? Infinity)) return cloudError('CLOUD_IMPORT_FOREIGN_STORAGE');
        const valid = row.state === 'open' && row.expiresAt > Date.now() &&
            metadata.size === file.bytes && storageSha256Matches(metadata.sha256, file.hash) && args.actualBytes === file.bytes && args.actualHash === file.hash;
        await ctx.db.patch(file._id, { storageId: args.storageId, state: 'received', valid });
        if (row.expiresAt <= Date.now() || row.state === 'expired') await ctx.scheduler.runAfter(0, collectRef, { attemptId: row._id });
        return { valid };
    },
});

export const failUpload = mutation({
    args: { ...receiptArgs, outcome: v.union(v.literal('not-sent'), v.literal('unknown')) },
    handler: async (ctx, args) => {
        server(args.secret);
        const row = await attempt(ctx, args.attemptId);
        const file = await uploadRow(ctx, row, args.fileIndex); nonceMatches(file, args.nonce);
        if (file.storageId || file.state === 'received') return null;
        if (args.outcome === 'not-sent') {
            if (file.state !== 'receiving') return cloudError('CLOUD_IMPORT_SEND_UNCERTAIN');
            await ctx.db.patch(file._id, { state: 'pending', nonce: undefined, leaseUntil: undefined, claimedAt: undefined, valid: false });
        } else {
            if (!['receiving', 'sending', 'unknown'].includes(file.state)) return cloudError('CLOUD_IMPORT_CLAIM_CHANGED');
            await ctx.db.patch(file._id, { state: 'unknown', valid: false });
        }
        return null;
    },
});

export const finalize = mutation({
    args: { ...attemptArgs, manifestHash: v.string() },
    handler: async (ctx, args) => {
        const row = await owned(ctx, args.attemptId);
        if (row.manifestHash !== args.manifestHash) return cloudError('CLOUD_IMPORT_RETRY_CHANGED');
        if (row.state === 'finalized') {
            if (!row.projectId || !row.branchId) return cloudError('CLOUD_IMPORT_NOT_FOUND');
            await requireCap(ctx, 'project.view', { projectId: row.projectId, workspaceId: row.workspaceId });
            return { projectId: row.projectId, branchId: row.branchId };
        }
        open(row);
        await projectQuota(ctx, row.workspaceId);
        const receipts = await ctx.db.query('cloudEditorImportFiles').withIndex('by_attemptId', q => q.eq('attemptId', row._id)).take(MAX_FILES + 1);
        if (receipts.length !== row.files.filter(file => file.kind === 'binary').length) return cloudError('CLOUD_IMPORT_INCOMPLETE');
        const files: Array<{ path: string; kind: 'file'; text?: string; storageId?: Id<'_storage'>; hash: string; bytes: number }> = [];
        for (const [index, file] of row.files.entries()) {
            if (file.kind === 'text') { files.push({ path: file.path, kind: 'file', text: file.text, hash: file.hash, bytes: file.bytes }); continue; }
            const receipt = receipts.find(value => value.index === index);
            if (!receipt || receipt.state !== 'received' || receipt.valid !== true || !receipt.storageId || receipt.collectedAt !== undefined ||
                receipt.path !== file.path || receipt.hash !== file.hash || receipt.bytes !== file.bytes) return cloudError('CLOUD_IMPORT_INCOMPLETE');
            const metadata = await ctx.db.system.get(receipt.storageId);
            if (!metadata || metadata.size !== file.bytes || !storageSha256Matches(metadata.sha256, file.hash)) return cloudError('CLOUD_IMPORT_ASSET_CHANGED');
            files.push({ path: file.path, kind: 'file', storageId: receipt.storageId, hash: file.hash, bytes: file.bytes });
        }
        const result = await insertCloudProjectGraph(ctx, { workspaceId: row.workspaceId, userId: row.actorId, name: row.name,
            creationId: `import_${row._id}`, files, profile: 'imported-source-v1' });
        await ctx.db.patch(row._id, { state: 'finalized', ...result });
        return result;
    },
});

/** Ownership receipt rows remain after collection, including unresolved unidentified uploads. */
export const _collect = internalMutation({
    args: attemptArgs,
    handler: async (ctx, { attemptId }) => {
        const row = await ctx.db.get(attemptId);
        if (!row || row.state === 'finalized' || row.expiresAt > Date.now()) return null;
        await ctx.db.patch(row._id, { state: 'expired' });
        const files = await ctx.db.query('cloudEditorImportFiles').withIndex('by_attemptId', q => q.eq('attemptId', attemptId)).take(MAX_FILES + 1);
        if (files.length > MAX_FILES) return cloudError('CLOUD_IMPORT_FILE_LIMIT');
        for (const file of files) {
            if (!file.storageId || file.collectedAt !== undefined || await referenced(ctx, file.storageId)) continue;
            const otherReferences = await ctx.db.query('cloudEditorImportFiles').withIndex('by_storageId', q => q.eq('storageId', file.storageId)).take(2);
            // This also protects finalized pristine manifests after their project is deleted.
            if (otherReferences.some(other => other._id !== file._id)) continue;
            if (await ctx.db.system.get(file.storageId)) await ctx.storage.delete(file.storageId);
            await ctx.db.patch(file._id, { valid: false, collectedAt: Date.now() });
        }
        return null;
    },
});

export const _asset = query({
    args: { projectId: v.id('projects'), branchId: v.id('branches'), path: v.string(), expectedHash: v.string(), secret: v.string() },
    handler: async (ctx, args) => {
        server(args.secret); enabled(); importSourcePath(args.path);
        const access = await requireCloudAccess(ctx, args);
        if (!isImportedCloudProfile(access.state.profile) || !access.canReadSource) return cloudError('CLOUD_ROLE_REQUIRED');
        const file = await ctx.db.query('cloudEditorFiles').withIndex('by_branchId_path', q => q.eq('branchId', args.branchId).eq('path', args.path)).unique();
        if (!file || file.projectId !== args.projectId || file.kind !== 'file' || !file.storageId || file.hash !== args.expectedHash)
            return cloudError('CLOUD_IMPORT_ASSET_CHANGED');
        const metadata = await ctx.db.system.get(file.storageId);
        if (!metadata || metadata.size !== file.bytes || !storageSha256Matches(metadata.sha256, file.hash)) return cloudError('CLOUD_IMPORT_ASSET_CHANGED');
        const url = await ctx.storage.getUrl(file.storageId);
        if (!url) return cloudError('CLOUD_IMPORT_ASSET_CHANGED');
        return { url, bytes: file.bytes, hash: file.hash };
    },
});
