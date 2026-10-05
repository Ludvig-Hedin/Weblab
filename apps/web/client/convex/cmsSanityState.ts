import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internalMutation, internalQuery } from './_generated/server';
import { makeFunctionReference } from 'convex/server';
import { requireCap } from './lib/permissions';
import { can, type Capability } from './lib/auth';
import { documentId, parseBoundedJson, revision } from './lib/sanityPilotContract';

const scope = { projectId: v.id('projects'), sourceId: v.id('cmsSources') };
const capability = v.union(v.literal('project.view'), v.literal('project.update'), v.literal('project.publish'));

function assertCredentialPin(currentSource: Doc<'cmsSources'>, request: Record<string, unknown>): void {
    const credentials: unknown = currentSource.credentials;
    const encrypted = credentials && typeof credentials === 'object' && !Array.isArray(credentials) ? (credentials as Record<string, unknown>).encrypted : undefined;
    if (typeof request.sourceEncrypted !== 'string' || encrypted !== request.sourceEncrypted) throw new Error('CONFLICT: Source credentials changed during this write.');
}

async function source(ctx: QueryCtx | MutationCtx, projectId: Id<'projects'>, sourceId: Id<'cmsSources'>, cap: 'project.view' | 'project.update' | 'project.publish') {
    await requireCap(ctx, cap, { projectId });
    const row = await ctx.db.get(sourceId);
    if (!row || row.projectId !== projectId || row.type !== 'sanity') throw new Error('NOT_FOUND: Sanity source');
    if (row.status === 'deleting') throw new Error('CONFLICT: Sanity source removal is in progress.');
    return row;
}

export const assertProjectUpdate = internalQuery({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        await requireCap(ctx, 'project.update', { projectId });
        return null;
    },
});

// Scheduled actions have no auth propagation. The owner comes only from the
// authenticated reservation, never an action argument supplied by a renderer.
async function requireOwnerCap(ctx: QueryCtx | MutationCtx, operation: Doc<'cmsSanityOperations'>, cap: Capability) {
    const user = await ctx.db.get(operation.ownerUserId);
    const project = await ctx.db.get(operation.projectId);
    const workspace = project ? await ctx.db.get(project.workspaceId) : null;
    if (!user || !project || !workspace) throw new Error('FORBIDDEN: The operation owner no longer has access.');
    const workspaceMember = await ctx.db.query('workspaceMembers').withIndex('by_workspace_user', (q) => q.eq('workspaceId', workspace._id).eq('userId', user._id)).unique();
    const projectMember = await ctx.db.query('projectMembers').withIndex('by_project_user', (q) => q.eq('projectId', project._id).eq('userId', user._id)).unique();
    if (!can(cap, {
        workspace: { id: workspace._id, createdByUserId: workspace.createdByUserId },
        workspaceRole: workspaceMember?.role ?? null,
        project: { id: project._id, workspaceId: project.workspaceId, accessMode: project.accessMode },
        projectRole: projectMember?.role ?? null,
    })) throw new Error(`FORBIDDEN: ${cap}`);
    const currentSource = await ctx.db.get(operation.sourceId);
    if (!currentSource || currentSource.projectId !== operation.projectId || currentSource.type !== 'sanity' || currentSource.status === 'deleting') throw new Error('NOT_FOUND: Sanity source');
    assertCredentialPin(currentSource, parseBoundedJson(operation.requestJson));
    if (currentSource.updatedAt !== operation.sourceUpdatedAt) throw new Error('CONFLICT: Source settings changed during this write.');
    return currentSource;
}

export const loadOperation = internalQuery({
    args: { operationId: v.id('cmsSanityOperations') },
    handler: async (ctx, { operationId }) => {
        const operation = await ctx.db.get(operationId);
        if (!operation) throw new Error('NOT_FOUND: operation');
        const currentSource = await requireOwnerCap(ctx, operation, 'project.update');
        if (operation.state !== 'pending' || !operation.scheduledFunctionId) throw new Error('CONFLICT: The operation is not active.');
        const job = await ctx.db.system.get(operation.scheduledFunctionId);
        if (!job || job.state.kind !== 'inProgress') throw new Error('UNKNOWN: The scheduled write cannot continue.');
        return { operation, source: currentSource };
    },
});

// Plaintext is decrypted only in the Node action. This getter is never public.
export const loadSource = internalQuery({
    args: { ...scope, capability },
    handler: async (ctx, args) => source(ctx, args.projectId, args.sourceId, args.capability),
});

export const createSource = internalMutation({
    args: { projectId: v.id('projects'), name: v.string(), encrypted: v.string() },
    handler: async (ctx, args) => {
        await requireCap(ctx, 'project.update', { projectId: args.projectId });
        const name = args.name.trim();
        if (!name || name.length > 80 || args.encrypted.length > 12_000) throw new Error('BAD_REQUEST: Invalid source.');
        const sourceId = await ctx.db.insert('cmsSources', {
            projectId: args.projectId, name, type: 'sanity', credentials: { encrypted: args.encrypted }, status: 'connected', updatedAt: Date.now(),
        });
        return sourceId;
    },
});

export const reserveOperation = internalMutation({
    args: {
        ...scope, operationKey: v.string(), kind: v.union(v.literal('create'), v.literal('update'), v.literal('delete')),
        documentId: v.string(), requestHash: v.string(), expectedRevision: v.optional(v.string()),
        sourceUpdatedAt: v.number(), requestJson: v.string(), expectedDocumentJson: v.optional(v.string()), beforeDocumentJson: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<{ started: boolean; operation: Doc<'cmsSanityOperations'> }> => {
        const currentSource = await source(ctx, args.projectId, args.sourceId, 'project.update');
        const access = await requireCap(ctx, 'project.update', { projectId: args.projectId });
        if (currentSource.updatedAt !== args.sourceUpdatedAt) throw new Error('CONFLICT: Source settings changed. Reload.');
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error('UNAUTHORIZED');
        if (!/^[a-zA-Z0-9_-]{16,80}$/.test(args.operationKey) || !/^[a-f0-9]{64}$/.test(args.requestHash)) throw new Error('BAD_REQUEST: Invalid operation identity.');
        documentId(args.documentId);
        if (args.expectedRevision !== undefined) revision(args.expectedRevision);
        assertCredentialPin(currentSource, parseBoundedJson(args.requestJson));
        if (args.expectedDocumentJson !== undefined) parseBoundedJson(args.expectedDocumentJson);
        if (args.beforeDocumentJson !== undefined) parseBoundedJson(args.beforeDocumentJson);
        const existing = await ctx.db.query('cmsSanityOperations')
            .withIndex('by_source_operation_key', (q) => q.eq('sourceId', args.sourceId).eq('operationKey', args.operationKey)).unique();
        if (existing) {
            if (existing.projectId !== args.projectId || existing.ownerTokenIdentifier !== identity.tokenIdentifier || existing.requestHash !== args.requestHash || existing.documentId !== args.documentId || existing.kind !== args.kind) {
                throw new Error('CONFLICT: This operation identity belongs to a different request.');
            }
            return { started: false, operation: existing };
        }
        for (const state of ['pending', 'unknown'] as const) {
            const unresolved = await ctx.db.query('cmsSanityOperations')
                .withIndex('by_source_document_id_state', (q) => q.eq('sourceId', args.sourceId).eq('documentId', args.documentId).eq('state', state)).take(1);
            if (unresolved.length) throw new Error('UNKNOWN: A previous Sanity write must be reconciled before another write.');
        }
        const { expectedDocumentJson, beforeDocumentJson, expectedRevision, ...required } = args;
        const record = {
            ...required, ownerTokenIdentifier: identity.tokenIdentifier, ownerUserId: access.user._id, state: 'pending', stage: 'reserved',
            ...(expectedDocumentJson !== undefined ? { expectedDocumentJson } : {}),
            ...(beforeDocumentJson !== undefined ? { beforeDocumentJson } : {}),
            ...(expectedRevision !== undefined ? { expectedRevision } : {}),
            createdAt: Date.now(), updatedAt: Date.now(),
        } as const;
        assertRecordBound(record);
        const id = await ctx.db.insert('cmsSanityOperations', record);
        const scheduledFunctionId = await ctx.scheduler.runAfter(0, makeFunctionReference<'action', { operationId: Id<'cmsSanityOperations'> }, null>('cmsSanityActions:runWrite'), { operationId: id });
        await ctx.db.patch(id, { scheduledFunctionId });
        return { started: true, operation: (await ctx.db.get(id))! };
    },
});

export const beginSend = internalMutation({
    args: { operationId: v.id('cmsSanityOperations') },
    handler: async (ctx, { operationId }) => {
        const operation = await ctx.db.get(operationId);
        if (!operation || operation.state !== 'pending' || operation.stage !== 'reserved') throw new Error('CONFLICT: The write cannot start again.');
        await requireOwnerCap(ctx, operation, 'project.update');
        if (!operation.scheduledFunctionId) throw new Error('UNKNOWN: Scheduled write identity is missing.');
        const job = await ctx.db.system.get(operation.scheduledFunctionId);
        if (!job || job.state.kind !== 'inProgress') throw new Error('UNKNOWN: The scheduled write is not confirmed running.');
        await ctx.db.patch(operation._id, { stage: 'sending', updatedAt: Date.now() });
        return null;
    },
});

export const finishOperation = internalMutation({
    args: {
        ...scope, operationId: v.id('cmsSanityOperations'), requestHash: v.string(),
        state: v.union(v.literal('succeeded'), v.literal('failed'), v.literal('conflict'), v.literal('unknown')),
        expectedState: v.union(v.literal('pending'), v.literal('unknown')),
        expectedStage: v.union(v.literal('reserved'), v.literal('sending')),
        mode: v.union(v.literal('worker'), v.literal('inspect')),
        resultDocumentJson: v.optional(v.string()), resultRevision: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const operation = await ctx.db.get(args.operationId);
        if (!operation || operation.sourceId !== args.sourceId || operation.projectId !== args.projectId || operation.requestHash !== args.requestHash) throw new Error('NOT_FOUND: operation');
        // Recheck current owner authority after every provider request. Recovery
        // instead uses the current authenticated project member's authority.
        const currentSource = args.mode === 'worker' ? await requireOwnerCap(ctx, operation, 'project.update') : await source(ctx, args.projectId, args.sourceId, 'project.update');
        assertCredentialPin(currentSource, parseBoundedJson(operation.requestJson));
        if (currentSource.updatedAt !== operation.sourceUpdatedAt) throw new Error('CONFLICT: Source settings changed during this write. Reconcile before continuing.');
        if (operation.state !== args.expectedState || operation.stage !== args.expectedStage) return { applied: false, operation };
        if (args.mode === 'inspect' && operation.state === 'pending') {
            const job = operation.scheduledFunctionId ? await ctx.db.system.get(operation.scheduledFunctionId) : null;
            if (!job || (job.state.kind !== 'failed' && job.state.kind !== 'success')) throw new Error('UNKNOWN: The original write may still be running.');
            if (operation.stage === 'reserved') {
                if (job.state.kind !== 'failed' || args.state !== 'failed') throw new Error('UNKNOWN: The unsent write needs explicit recovery.');
            } else if (args.state !== 'succeeded') {
                throw new Error('UNKNOWN: Provider success must be positively confirmed before releasing this write.');
            }
        }
        if (args.resultDocumentJson !== undefined) parseBoundedJson(args.resultDocumentJson);
        if (args.resultRevision !== undefined) revision(args.resultRevision);
        const patch = {
            state: args.state, updatedAt: Date.now(),
            ...(args.resultDocumentJson !== undefined ? { resultDocumentJson: args.resultDocumentJson } : {}),
            ...(args.resultRevision !== undefined ? { resultRevision: args.resultRevision } : {}),
        };
        assertRecordBound({ ...operation, ...patch });
        await ctx.db.patch(operation._id, patch);
        if (args.state === 'succeeded') {
            // A previous ready intent must not silently follow the new remote version.
            const ready = await ctx.db.query('cmsSanityReadiness')
                .withIndex('by_source_document_id', (q) => q.eq('sourceId', args.sourceId).eq('documentId', operation.documentId)).unique();
            if (ready) await ctx.db.delete(ready._id);
        }
        return { applied: true, operation: (await ctx.db.get(operation._id))! };
    },
});

export async function assertSanitySourceRemovable(ctx: QueryCtx | MutationCtx, projectId: Id<'projects'>, sourceId: Id<'cmsSources'>): Promise<void> {
    const currentSource = await ctx.db.get(sourceId);
    if (!currentSource || currentSource.projectId !== projectId) throw new Error('NOT_FOUND: source');
    for (const state of ['pending', 'unknown'] as const) {
        const active = await ctx.db.query('cmsSanityOperations').withIndex('by_source_state', (q) => q.eq('sourceId', sourceId).eq('state', state)).take(1);
        if (active.length) throw new Error('UNKNOWN: Reconcile unfinished Sanity writes before removing this source.');
    }
}

export const assertSourceRemovable = internalQuery({
    args: scope,
    handler: async (ctx, args) => { await requireCap(ctx, 'project.update', { projectId: args.projectId }); await assertSanitySourceRemovable(ctx, args.projectId, args.sourceId); return null; },
});

export const beginSourceCleanup = internalMutation({
    args: scope,
    handler: async (ctx, args) => {
        await requireCap(ctx, 'project.update', { projectId: args.projectId });
        await assertSanitySourceRemovable(ctx, args.projectId, args.sourceId);
        const row = await ctx.db.get(args.sourceId);
        if (row?.type !== 'sanity') throw new Error('BAD_REQUEST: Not a Sanity source.');
        await ctx.db.patch(args.sourceId, { status: 'deleting', updatedAt: Date.now() });
        return null;
    },
});

export const cleanupTerminalBatch = internalMutation({
    args: scope,
    handler: async (ctx, args) => {
        await requireCap(ctx, 'project.update', { projectId: args.projectId });
        await assertSanitySourceRemovable(ctx, args.projectId, args.sourceId);
        const row = await ctx.db.get(args.sourceId);
        if (row?.type !== 'sanity' || row.status !== 'deleting') throw new Error('CONFLICT: Source removal has not been reserved.');
        const operations = await ctx.db.query('cmsSanityOperations').withIndex('by_source', (q) => q.eq('sourceId', args.sourceId)).take(5);
        const readiness = await ctx.db.query('cmsSanityReadiness').withIndex('by_source', (q) => q.eq('sourceId', args.sourceId)).take(100);
        for (const operation of operations) {
            if (operation.state === 'pending' || operation.state === 'unknown') throw new Error('UNKNOWN: Unfinished write cannot be deleted.');
            await ctx.db.delete(operation._id);
        }
        for (const ready of readiness) await ctx.db.delete(ready._id);
        return { removed: operations.length + readiness.length, more: operations.length === 5 || readiness.length === 100 };
    },
});

function assertRecordBound(record: unknown): void {
    if (new TextEncoder().encode(JSON.stringify(record)).byteLength > 900 * 1024) throw new Error('BAD_REQUEST: The combined saved operation is too large.');
}

export const inspectContext = internalQuery({
    args: { ...scope, operationKey: v.string() },
    handler: async (ctx, args): Promise<{ operation: Doc<'cmsSanityOperations'>; source: Doc<'cmsSources'>; jobState: string | null }> => {
        const currentSource = await source(ctx, args.projectId, args.sourceId, 'project.update');
        const operation = await ctx.db.query('cmsSanityOperations').withIndex('by_source_operation_key', (q) => q.eq('sourceId', args.sourceId).eq('operationKey', args.operationKey)).unique();
        if (!operation) throw new Error('NOT_FOUND: operation');
        assertCredentialPin(currentSource, parseBoundedJson(operation.requestJson));
        if (currentSource.updatedAt !== operation.sourceUpdatedAt) throw new Error('CONFLICT: Source settings changed before recovery.');
        const job = operation.scheduledFunctionId ? await ctx.db.system.get(operation.scheduledFunctionId) : null;
        return { operation, source: currentSource, jobState: job?.state.kind ?? null };
    },
});

// Garbage collection is internal and credential-free. The authenticated parent
// mutation must reserve the deletion tombstone before scheduling this endpoint.
export const finalizeSourceRemoval = internalMutation({
    args: scope,
    handler: async (ctx, args): Promise<null> => {
        const row = await ctx.db.get(args.sourceId);
        if (!row) return null;
        if (row.projectId !== args.projectId || row.type !== 'sanity' || row.status !== 'deleting') throw new Error('CONFLICT: Source removal is not reserved.');
        for (const state of ['pending', 'unknown'] as const) {
            if ((await ctx.db.query('cmsSanityOperations').withIndex('by_source_state', (q) => q.eq('sourceId', args.sourceId).eq('state', state)).take(1)).length) throw new Error('UNKNOWN: Unfinished writes prevent source removal.');
        }
        const operations = await ctx.db.query('cmsSanityOperations').withIndex('by_source', (q) => q.eq('sourceId', args.sourceId)).take(5);
        const readiness = await ctx.db.query('cmsSanityReadiness').withIndex('by_source', (q) => q.eq('sourceId', args.sourceId)).take(100);
        for (const operation of operations) await ctx.db.delete(operation._id);
        for (const ready of readiness) await ctx.db.delete(ready._id);
        const remainingOperations = await ctx.db.query('cmsSanityOperations').withIndex('by_source', (q) => q.eq('sourceId', args.sourceId)).take(1);
        const remainingReadiness = await ctx.db.query('cmsSanityReadiness').withIndex('by_source', (q) => q.eq('sourceId', args.sourceId)).take(1);
        if (remainingOperations.length || remainingReadiness.length) await ctx.scheduler.runAfter(0, makeFunctionReference<'mutation', { projectId: Id<'projects'>; sourceId: Id<'cmsSources'> }, null>('cmsSanityState:finalizeSourceRemoval'), args);
        else await ctx.db.delete(args.sourceId);
        return null;
    },
});

export const getOperation = internalQuery({
    args: { ...scope, operationKey: v.string() },
    handler: async (ctx, args) => {
        await source(ctx, args.projectId, args.sourceId, 'project.update');
        const operation = await ctx.db.query('cmsSanityOperations')
            .withIndex('by_source_operation_key', (q) => q.eq('sourceId', args.sourceId).eq('operationKey', args.operationKey)).unique();
        return operation;
    },
});

export const setReadiness = internalMutation({
    args: { ...scope, documentId: v.string(), revision: v.string(), sourceUpdatedAt: v.number(), intent: v.union(v.literal('include'), v.literal('exclude')) },
    handler: async (ctx, args) => {
        const currentSource = await source(ctx, args.projectId, args.sourceId, 'project.publish');
        if (currentSource.updatedAt !== args.sourceUpdatedAt) throw new Error('CONFLICT: Source settings changed.');
        documentId(args.documentId);
        revision(args.revision);
        for (const state of ['pending', 'unknown'] as const) {
            const unresolved = await ctx.db.query('cmsSanityOperations')
                .withIndex('by_source_document_id_state', (q) => q.eq('sourceId', args.sourceId).eq('documentId', args.documentId).eq('state', state)).take(1);
            if (unresolved.length) throw new Error('UNKNOWN: Reconcile the previous write before review.');
        }
        const existing = await ctx.db.query('cmsSanityReadiness')
            .withIndex('by_source_document_id', (q) => q.eq('sourceId', args.sourceId).eq('documentId', args.documentId)).unique();
        const value = { ...args, updatedAt: Date.now() };
        if (existing) await ctx.db.replace(existing._id, value);
        else await ctx.db.insert('cmsSanityReadiness', value);
        return null;
    },
});

export const listReadiness = internalQuery({
    args: scope,
    handler: async (ctx, args) => {
        await source(ctx, args.projectId, args.sourceId, 'project.publish');
        const rows = await ctx.db.query('cmsSanityReadiness').withIndex('by_source', (q) => q.eq('sourceId', args.sourceId)).take(101);
        if (rows.length > 100) throw new Error('BAD_REQUEST: Too many ready Sanity documents.');
        return rows;
    },
});
