'use node';

import { createHash } from 'node:crypto';
import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';

import type { FunctionArgs, FunctionReturnType, ApiFromModules } from 'convex/server';
import type * as Backend from './cloudEditor';
import type * as Uploads from './cloudEditorUploads';
import type { Id } from './_generated/dataModel';
import { action } from './_generated/server';
import { assertCloudRevision, assertOperationId, cloudChange, cloudError, cloudScope, validateCloudChanges } from './lib/cloudEditor';
import { createCloudEditorFiles } from './lib/cloudEditorTemplate';

type UploadApi = ApiFromModules<{ cloudEditorUploads: typeof Uploads }>['cloudEditorUploads'];
const beginUploadRef = makeFunctionReference<'mutation', FunctionArgs<UploadApi['_begin']>, FunctionReturnType<UploadApi['_begin']>>('cloudEditorUploads:_begin');
const abortUploadRef = makeFunctionReference<'mutation', FunctionArgs<UploadApi['_recordAbortedUpload']>, FunctionReturnType<UploadApi['_recordAbortedUpload']>>('cloudEditorUploads:_recordAbortedUpload');
const attachUploadRef = makeFunctionReference<'mutation', FunctionArgs<UploadApi['_attach']>, FunctionReturnType<UploadApi['_attach']>>('cloudEditorUploads:_attach');

type BackendApi = ApiFromModules<{ cloudEditor: typeof Backend }>['cloudEditor'];

const createdRef = makeFunctionReference<'query', FunctionArgs<BackendApi['_created']>, FunctionReturnType<BackendApi['_created']>>('cloudEditor:_created');
const prepareRef = makeFunctionReference<'query', FunctionArgs<BackendApi['prepare']>, FunctionReturnType<BackendApi['prepare']>>('cloudEditor:prepare');
const createRef = makeFunctionReference<'mutation', FunctionArgs<BackendApi['_create']>, FunctionReturnType<BackendApi['_create']>>('cloudEditor:_create');
const operationRef = makeFunctionReference<'query', FunctionArgs<BackendApi['_operation']>, FunctionReturnType<BackendApi['_operation']>>('cloudEditor:_operation');
const commitRef = makeFunctionReference<'mutation', FunctionArgs<BackendApi['_commit']>, FunctionReturnType<BackendApi['_commit']>>('cloudEditor:_commit');

function hash(content: string | ArrayBuffer): string {
    return createHash('sha256').update(typeof content === 'string' ? content : Buffer.from(content)).digest('hex');
}

/** New projects use reviewed runtime bundles from this deployment, never a caller-supplied URL. */
async function runtimeFiles(): Promise<Array<{ path: string; content: string }>> {
    const origin = process.env.WEBLAB_EDITOR_ORIGIN;
    if (!origin || new URL(origin).protocol !== 'https:') return cloudError('CLOUD_RUNTIME_NOT_CONFIGURED');
    return Promise.all(['weblab-preload-script.js', 'weblab-ix-runtime.js'].map(async name => {
        const response = await fetch(new URL(`/${name}?cloudRuntime=20261002-inline-newlines`, origin), { signal: AbortSignal.timeout(15_000), redirect: 'error' });
        if (!response.ok) return cloudError('CLOUD_RUNTIME_BUNDLE_UNAVAILABLE');
        const content = await response.text();
        if (content.length < 100 || content.length > 750_000 || /^\s*</.test(content)) return cloudError('CLOUD_RUNTIME_BUNDLE_UNAVAILABLE');
        return { path: `public/${name}`, content };
    }));
}

export const create = action({
    args: { workspaceId: v.id('workspaces'), name: v.string(), creationId: v.string(), sourcePilotId: v.optional(v.id('projects')) },
    handler: async (ctx, args): Promise<{ projectId: Id<'projects'>; branchId: Id<'branches'> }> => {
        assertOperationId(args.creationId);
        const prior = await ctx.runQuery(createdRef, { workspaceId: args.workspaceId, creationId: args.creationId });
        if (prior) return prior;
        const legacy = await ctx.runQuery(prepareRef, { workspaceId: args.workspaceId, sourcePilotId: args.sourcePilotId });
        const files = [...createCloudEditorFiles(args.name, legacy?.content), ...await runtimeFiles()];
        validateCloudChanges(files);
        return ctx.runMutation(createRef, { ...args, sourcePilotRevision: legacy?.revision, files: files.map(file => ({ path: file.path, kind: 'file' as const,
            text: file.content, bytes: Buffer.byteLength(file.content), hash: hash(file.content) })) });
    },
});

export const commit = action({
    args: { ...cloudScope, actorId: v.id('users'), expectedRevision: v.number(), operationId: v.string(), changes: v.array(cloudChange) },
    handler: async (ctx, args): Promise<{ revision: number; currentRevision: number }> => {
        assertCloudRevision(args.expectedRevision); assertOperationId(args.operationId); validateCloudChanges(args.changes);
        const fingerprint = hash(JSON.stringify({ revision: args.expectedRevision, changes: args.changes.map(c => ({
            path: c.path, directory: c.directory === true, type: typeof c.content === 'string' ? 'text' : c.content === null ? 'null' : 'binary',
            hash: c.content === null ? '' : hash(c.content),
        })) }));
        const scope = { projectId: args.projectId, branchId: args.branchId, actorId: args.actorId, expectedRevision: args.expectedRevision, operationId: args.operationId, fingerprint };
        const prior = await ctx.runQuery(operationRef, scope);
        if (prior) return { revision: prior.revision, currentRevision: prior.currentRevision };
        const attemptId = args.changes.some(change => change.content instanceof ArrayBuffer)
            ? await ctx.runMutation(beginUploadRef, { projectId: args.projectId, branchId: args.branchId, operationId: args.operationId, fingerprint }) : undefined;
        const uploaded: Id<'_storage'>[] = [];
        const changes: FunctionArgs<BackendApi['_commit']>['changes'] = [];
        for (const change of args.changes) {
            if (change.content === null) {
                changes.push({ path: change.path, kind: change.directory ? 'directory' : 'delete', bytes: 0, hash: '' });
            } else if (typeof change.content === 'string') {
                changes.push({ path: change.path, kind: 'file', text: change.content, hash: hash(change.content), bytes: Buffer.byteLength(change.content) });
            } else {
                const storageId = await ctx.storage.store(new Blob([change.content], { type: 'application/octet-stream' }));
                uploaded.push(storageId);
                const uploadScope = { projectId: args.projectId, branchId: args.branchId, attemptId: attemptId!, storageId };
                try { await ctx.runMutation(attachUploadRef, uploadScope); }
                catch (error) {
                    try { await ctx.runMutation(abortUploadRef, uploadScope); } catch { /* Bounded store-to-registration crash window; never guess ownership. */ }
                    throw error;
                }
                changes.push({ path: change.path, kind: 'file', storageId, hash: hash(change.content), bytes: change.content.byteLength });
            }
        }
        const result = await ctx.runMutation(commitRef, { ...scope, attemptId, changes });
        // A simultaneous retry may have won with identical bytes in other blobs.
        // Only delete uploads proven not to belong to the committed operation.
        for (const id of uploaded) if (!result.storageIds.includes(id)) {
            try { await ctx.storage.delete(id); } catch { /* A cleanup failure cannot turn an acknowledged save into a failed save. */ }
        }
        return { revision: result.revision, currentRevision: result.currentRevision };
    },
});

const assetRef = makeFunctionReference<'query', FunctionArgs<BackendApi['_asset']>, FunctionReturnType<BackendApi['_asset']>>('cloudEditor:_asset');
export const readAsset = action({
    args: { ...cloudScope, path: v.string(), expectedHash: v.string() },
    handler: async (ctx, args): Promise<ArrayBuffer> => {
        const file = await ctx.runQuery(assetRef, args);
        const blob = await ctx.storage.get(file.storageId);
        if (!blob || blob.size !== file.bytes) return cloudError('CLOUD_ASSET_UNAVAILABLE');
        const bytes = await blob.arrayBuffer();
        if (hash(bytes) !== file.hash) return cloudError('CLOUD_ASSET_UNAVAILABLE');
        return bytes;
    },
});
