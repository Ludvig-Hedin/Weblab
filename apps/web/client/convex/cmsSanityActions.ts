'use node';

import { createHash } from 'node:crypto';
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { ActionCtx } from './_generated/server';
import { makeFunctionReference } from 'convex/server';
import { action, internalAction } from './_generated/server';
import { decryptCmsCredentials, encryptCmsCredentials, isEncryptedBlob } from './lib/cmsCredentials';
import { SanityError, SanityPilotAdapter, comparable, documentContent } from './lib/sanityAdapter';
import {
    SANITY_PILOT_PROFILE, documentId, draftChanges, newPost, parseBoundedJson,
    revision, validatePilotDocument, type SanityDocument,
} from './lib/sanityPilotContract';

const scope = { projectId: v.id('projects'), sourceId: v.id('cmsSources') };
type Scope = { projectId: Id<'projects'>; sourceId: Id<'cmsSources'> };
type SavedDocument = { id: string; revision: string; type: 'pilotHome' | 'pilotPost'; documentJson: string };
type WriteResult = { state: Doc<'cmsSanityOperations'>['state']; document: SavedDocument | null; operationKey: string };
type Operation = Doc<'cmsSanityOperations'>;
type SourceCapability = 'project.view' | 'project.update' | 'project.publish';
type Reservation = Scope & {
    operationKey: string; kind: 'create' | 'update' | 'delete'; documentId: string; requestHash: string;
    sourceUpdatedAt: number; requestJson: string; expectedRevision?: string; expectedDocumentJson?: string; beforeDocumentJson?: string;
};
type Completion = Scope & {
    operationId: Id<'cmsSanityOperations'>; requestHash: string; state: 'succeeded' | 'failed' | 'conflict' | 'unknown';
    expectedState: 'pending' | 'unknown'; expectedStage: 'reserved' | 'sending'; mode: 'worker' | 'inspect';
    resultDocumentJson?: string; resultRevision?: string;
};
// Precise normal Convex references keep new modules callable without editing the
// generated API file while project access blocks maintainer code generation.
const sanityState = {
    assertProjectUpdate: makeFunctionReference<'query', { projectId: Id<'projects'> }, null>('cmsSanityState:assertProjectUpdate'),
    createSource: makeFunctionReference<'mutation', { projectId: Id<'projects'>; name: string; encrypted: string }, Id<'cmsSources'>>('cmsSanityState:createSource'),
    loadSource: makeFunctionReference<'query', Scope & { capability: SourceCapability }, Doc<'cmsSources'>>('cmsSanityState:loadSource'),
    loadOperation: makeFunctionReference<'query', { operationId: Id<'cmsSanityOperations'> }, { operation: Operation; source: Doc<'cmsSources'> }>('cmsSanityState:loadOperation'),
    getOperation: makeFunctionReference<'query', Scope & { operationKey: string }, Operation | null>('cmsSanityState:getOperation'),
    inspectContext: makeFunctionReference<'query', Scope & { operationKey: string }, { operation: Operation; source: Doc<'cmsSources'>; jobState: string | null }>('cmsSanityState:inspectContext'),
    reserveOperation: makeFunctionReference<'mutation', Reservation, { started: boolean; operation: Operation }>('cmsSanityState:reserveOperation'),
    beginSend: makeFunctionReference<'mutation', { operationId: Id<'cmsSanityOperations'> }, null>('cmsSanityState:beginSend'),
    finishOperation: makeFunctionReference<'mutation', Completion, { applied: boolean; operation: Operation }>('cmsSanityState:finishOperation'),
    setReadiness: makeFunctionReference<'mutation', Scope & { documentId: string; revision: string; sourceUpdatedAt: number; intent: 'include' | 'exclude' }, null>('cmsSanityState:setReadiness'),
};

function output(doc: SanityDocument): SavedDocument {
    return { id: doc._id, revision: doc._rev, type: doc._type, documentJson: JSON.stringify(doc) };
}
function digest(value: unknown): string { return createHash('sha256').update(comparable(value)).digest('hex'); }

async function load(ctx: ActionCtx, args: Scope, capability: 'project.view' | 'project.update' | 'project.publish') {
    const source: Doc<'cmsSources'> = await ctx.runQuery(sanityState.loadSource, { ...args, capability });
    if (!isEncryptedBlob(source.credentials)) throw new Error('BAD_REQUEST: Sanity source credentials are unavailable.');
    let credentials: Record<string, unknown>;
    try { credentials = decryptCmsCredentials(source.credentials.encrypted); }
    catch { throw new Error('BAD_REQUEST: Sanity source credentials could not be opened.'); }
    return { source, adapter: new SanityPilotAdapter(credentials, undefined, () => recheck(ctx, args, source, capability)) };
}
async function recheck(ctx: ActionCtx, args: Scope, capturedSource: Doc<'cmsSources'>, capability: 'project.view' | 'project.update' | 'project.publish') {
    const source: Doc<'cmsSources'> = await ctx.runQuery(sanityState.loadSource, { ...args, capability });
    if (source.updatedAt !== capturedSource.updatedAt || !isEncryptedBlob(source.credentials) || !isEncryptedBlob(capturedSource.credentials) || source.credentials.encrypted !== capturedSource.credentials.encrypted) throw new Error('CONFLICT: Source settings changed during this request. Reload.');
}

export const connect = action({
    args: { projectId: v.id('projects'), name: v.string(), sanityProjectId: v.string(), dataset: v.string(), token: v.string() },
    handler: async (ctx, args): Promise<Id<'cmsSources'>> => {
        await ctx.runQuery(sanityState.assertProjectUpdate, { projectId: args.projectId });
        const credentials = { projectId: args.sanityProjectId, dataset: args.dataset, token: args.token, profile: SANITY_PILOT_PROFILE };
        const adapter = new SanityPilotAdapter(credentials, undefined, async () => {
            await ctx.runQuery(sanityState.assertProjectUpdate, { projectId: args.projectId });
        });
        await adapter.list('pilotHome');
        // Mutation rechecks capability after connection proof, before credentials persist.
        return ctx.runMutation(sanityState.createSource, { projectId: args.projectId, name: args.name, encrypted: encryptCmsCredentials(credentials) });
    },
});

export const list = action({
    args: { ...scope, type: v.union(v.literal('pilotHome'), v.literal('pilotPost')) },
    handler: async (ctx, args): Promise<SavedDocument[]> => {
        const scoped = { projectId: args.projectId, sourceId: args.sourceId };
        const { source, adapter } = await load(ctx, scoped, 'project.view');
        const docs = await adapter.list(args.type);
        await recheck(ctx, scoped, source, 'project.view');
        return docs.map(output);
    },
});

export const get = action({
    args: { ...scope, documentId: v.string() },
    handler: async (ctx, args): Promise<SavedDocument | null> => {
        const scoped = { projectId: args.projectId, sourceId: args.sourceId };
        const { source, adapter } = await load(ctx, scoped, 'project.view');
        const doc = await adapter.get(args.documentId);
        await recheck(ctx, scoped, source, 'project.view');
        return doc ? output(doc) : null;
    },
});

type Write = Scope & { operationKey: string; documentId: string; expectedRevision?: string; valuesJson?: string; kind: 'create' | 'update' | 'delete' };
async function write(ctx: ActionCtx, args: Write): Promise<WriteResult> {
    const scoped = { projectId: args.projectId, sourceId: args.sourceId };
    const { source, adapter } = await load(ctx, scoped, 'project.update');
    const id = args.documentId.startsWith('drafts.') ? args.documentId.slice(7) : args.documentId;
    documentId(id);
    const values = args.valuesJson !== undefined ? parseBoundedJson(args.valuesJson) : null;
    const requestHash = digest({ kind: args.kind, documentId: args.documentId, expectedRevision: args.expectedRevision ?? null, values });
    const existing: Doc<'cmsSanityOperations'> | null = await ctx.runQuery(sanityState.getOperation, { ...scoped, operationKey: args.operationKey });
    if (existing) {
        if (existing.sourceUpdatedAt !== source.updatedAt) throw new Error('CONFLICT: This operation belongs to older source settings.');
        if (existing.requestHash !== requestHash) throw new Error('CONFLICT: Operation identity belongs to different changes.');
        if (existing.state === 'succeeded') {
            const raw = existing.resultDocumentJson !== undefined ? parseBoundedJson(existing.resultDocumentJson) : null;
            return { state: 'succeeded', document: raw ? output(raw as SanityDocument) : null, operationKey: args.operationKey };
        }
        return operationResult(existing);
    }
    let before: SanityDocument | null = null;
    let expected: Record<string, unknown> | null = null;
    if (args.kind === 'create') {
        // New identities are tied to one stable operation, never caller-selected existing IDs.
        if (id !== `weblab-${args.operationKey}`) throw new Error('BAD_REQUEST: New post identity must match the operation.');
        if (!values) throw new Error('BAD_REQUEST: Post values are missing.');
        expected = newPost(id, values);
        if (await adapter.get(id)) throw new Error('CONFLICT: This post identity already exists.');
    } else {
        if (!args.expectedRevision) throw new Error('BAD_REQUEST: Remote revision is required.');
        revision(args.expectedRevision);
        before = await adapter.get(args.documentId);
        if (!before || before._rev !== args.expectedRevision) throw new Error('CONFLICT: Sanity changed this document. Reload before saving.');
        if (args.kind === 'update') {
            if (!values) throw new Error('BAD_REQUEST: Changes are missing.');
            expected = { ...draftChanges(before, values).expected, _id: `drafts.${id}` };
        } else if (!before._id.startsWith('drafts.') || before._type !== 'pilotPost') {
            throw new Error('BAD_REQUEST: Only post drafts can be deleted.');
        }
    }
    const reserved: { started: boolean; operation: Doc<'cmsSanityOperations'> } = await ctx.runMutation(sanityState.reserveOperation, {
        ...scoped, operationKey: args.operationKey, kind: args.kind, documentId: id, requestHash,
        sourceUpdatedAt: source.updatedAt, requestJson: JSON.stringify({ documentId: args.documentId, values, sourceEncrypted: isEncryptedBlob(source.credentials) ? source.credentials.encrypted : null }),
        ...(args.expectedRevision !== undefined ? { expectedRevision: args.expectedRevision } : {}),
        ...(expected ? { expectedDocumentJson: JSON.stringify(expected) } : {}),
        ...(before ? { beforeDocumentJson: JSON.stringify(before) } : {}),
    });
    return operationResult(reserved.operation);
}

function operationResult(operation: Operation): WriteResult {
    const raw = operation.resultDocumentJson !== undefined ? parseBoundedJson(operation.resultDocumentJson) : null;
    return { state: operation.state, document: raw ? output(raw as SanityDocument) : null, operationKey: operation.operationKey };
}

// Only the scheduler can invoke this action. Authorization is derived from the
// user captured by the authenticated reservation and rechecked on each request.
export const runWrite = internalAction({
    args: { operationId: v.id('cmsSanityOperations') },
    handler: async (ctx, { operationId }): Promise<null> => {
        const loaded: { operation: Operation; source: Doc<'cmsSources'> } = await ctx.runQuery(sanityState.loadOperation, { operationId });
        const operation = loaded.operation;
        if (operation.stage !== 'reserved') throw new Error('UNKNOWN: This write cannot be sent again.');
        if (!isEncryptedBlob(loaded.source.credentials)) throw new Error('BAD_REQUEST: Source credentials are unavailable.');
        const credentials = decryptCmsCredentials(loaded.source.credentials.encrypted);
        const assertAccess = async () => { await ctx.runQuery(sanityState.loadOperation, { operationId }); };
        const adapter = new SanityPilotAdapter(credentials, undefined, assertAccess);
        const request = parseBoundedJson(operation.requestJson);
        if (typeof request.documentId !== 'string') throw new Error('BAD_REQUEST: Saved write identity is invalid.');
        const values = request.values === null ? null : parseBoundedJson(JSON.stringify(request.values));
        const before = operation.beforeDocumentJson ? parseBoundedJson(operation.beforeDocumentJson) as SanityDocument : null;
        const finish = {
            projectId: operation.projectId, sourceId: operation.sourceId, operationId, requestHash: operation.requestHash,
            expectedState: 'pending' as const, mode: 'worker' as const,
        };
        let stage: Operation['stage'] = 'reserved';
        try {
            // A worker may fail here without having sent a mutation. Recovery can
            // release only this reserved stage once the scheduler confirms failure.
            const current = await adapter.get(request.documentId);
            if (operation.kind === 'create') {
                if (current || await adapter.get(`drafts.${operation.documentId}`)) throw new SanityError('CONFLICT', 'This draft identity already exists.');
            } else if (!before || !current || current._rev !== operation.expectedRevision || comparable(current) !== comparable(before)) {
                throw new SanityError('CONFLICT', 'Sanity changed this document before the scheduled save.');
            }
            await ctx.runMutation(sanityState.beginSend, { operationId });
            stage = 'sending';
            const transactionId = digest({ sourceId: operation.sourceId, operationKey: operation.operationKey });
            let saved: SanityDocument | null;
            if (operation.kind === 'create') saved = await adapter.create(operation.documentId, values!, transactionId);
            else if (operation.kind === 'update') saved = await adapter.update(before!, operation.expectedRevision!, values!, transactionId);
            else saved = await adapter.remove(before!, operation.expectedRevision!, transactionId);
            await ctx.runMutation(sanityState.finishOperation, {
                ...finish, expectedStage: stage, state: 'succeeded',
                ...(saved ? { resultDocumentJson: JSON.stringify(saved), resultRevision: saved._rev } : {}),
            });
        } catch (error) {
            const state = stage === 'reserved' ? 'failed' : error instanceof SanityError && error.code === 'CONFLICT' ? 'conflict' :
                error instanceof SanityError && ['BAD_REQUEST', 'FORBIDDEN', 'REMOTE_FAILED'].includes(error.code) ? 'failed' : 'unknown';
            // If rights or settings changed, this mutation refuses too. The
            // reservation survives for a currently authorized inspector to reconcile.
            await ctx.runMutation(sanityState.finishOperation, { ...finish, expectedStage: stage, state });
            throw new Error(`${state.toUpperCase()}: The scheduled Sanity write did not complete.`);
        }
        return null;
    },
});

export const createDraft = action({
    args: { ...scope, operationKey: v.string(), valuesJson: v.string() },
    handler: async (ctx, args): Promise<WriteResult> => write(ctx, { ...args, documentId: `weblab-${args.operationKey}`, kind: 'create' }),
});
export const updateDraft = action({
    args: { ...scope, operationKey: v.string(), documentId: v.string(), expectedRevision: v.string(), changesJson: v.string() },
    handler: async (ctx, args): Promise<WriteResult> => write(ctx, { ...args, valuesJson: args.changesJson, kind: 'update' }),
});
export const deleteDraft = action({
    args: { ...scope, operationKey: v.string(), documentId: v.string(), expectedRevision: v.string() },
    handler: async (ctx, args): Promise<WriteResult> => write(ctx, { ...args, kind: 'delete' }),
});

export const inspectOperation = action({
    args: { ...scope, operationKey: v.string() },
    handler: async (ctx, args): Promise<{ state: Operation['state']; document: SavedDocument | null; matchesExpected: boolean }> => {
        const scoped = { projectId: args.projectId, sourceId: args.sourceId };
        const inspected: { operation: Operation; source: Doc<'cmsSources'>; jobState: string | null } = await ctx.runQuery(sanityState.inspectContext, args);
        const source = inspected.source;
        if (!isEncryptedBlob(source.credentials)) throw new Error('BAD_REQUEST: Source credentials are unavailable.');
        const adapter = new SanityPilotAdapter(decryptCmsCredentials(source.credentials.encrypted), undefined, () => recheck(ctx, scoped, source, 'project.update'));
        let operation = inspected.operation;
        if (operation.sourceUpdatedAt !== source.updatedAt) throw new Error('CONFLICT: Source configuration changed. Review the old source before recovery.');
        const finish = {
            ...scoped, operationId: operation._id, requestHash: operation.requestHash,
            expectedState: operation.state as 'pending' | 'unknown', expectedStage: operation.stage, mode: 'inspect' as const,
        };
        if (operation.state === 'pending' && operation.stage === 'reserved' && inspected.jobState === 'failed') {
            const result: { operation: Operation } = await ctx.runMutation(sanityState.finishOperation, { ...finish, state: 'failed' });
            return { state: result.operation.state, document: null, matchesExpected: false };
        }
        // Cancellation does not stop an already running action. Missing scheduler
        // records (including expired retention) provide no proof it stopped either.
        if (operation.state === 'pending' && (operation.stage === 'reserved' || !['failed', 'success'].includes(inspected.jobState ?? ''))) {
            return { state: operation.state, document: null, matchesExpected: false };
        }
        if (operation.state !== 'pending' && operation.state !== 'unknown') {
            return { ...operationResult(operation), matchesExpected: operation.state === 'succeeded' };
        }
        const current = await adapter.get(`drafts.${operation.documentId}`);
        // Absence alone cannot attribute a deletion to this transaction. Unknown
        // deletes remain blocked until transaction proof can be supplied safely.
        const matchesExpected = operation.kind !== 'delete' && current !== null && operation.expectedDocumentJson !== undefined &&
            comparable(documentContent(current)) === comparable(documentContent(parseBoundedJson(operation.expectedDocumentJson)));
        await recheck(ctx, scoped, source, 'project.update');
        if (matchesExpected) {
            const result: { operation: Operation } = await ctx.runMutation(sanityState.finishOperation, {
                ...finish, state: 'succeeded', resultDocumentJson: JSON.stringify(current), resultRevision: current!._rev,
            });
            operation = result.operation;
        }
        return { state: operation.state, document: current ? output(current) : null, matchesExpected };
    },
});

export const readyForReview = action({
    args: { ...scope, documentId: v.string(), expectedRevision: v.string(), intent: v.union(v.literal('include'), v.literal('exclude')) },
    handler: async (ctx, args): Promise<null> => {
        const scoped = { projectId: args.projectId, sourceId: args.sourceId };
        const { source, adapter } = await load(ctx, scoped, 'project.publish');
        const current = await adapter.get(args.documentId);
        if (!current || current._rev !== revision(args.expectedRevision)) throw new Error('CONFLICT: Sanity changed this document. Reload before review.');
        if (args.intent === 'include') validatePilotDocument(current);
        const id = current._id.startsWith('drafts.') ? current._id.slice(7) : current._id;
        if (args.intent === 'exclude' && current._type === 'pilotHome') throw new Error('BAD_REQUEST: The homepage cannot be removed.');
        await ctx.runMutation(sanityState.setReadiness, { ...scoped, documentId: id, revision: current._rev, sourceUpdatedAt: source.updatedAt, intent: args.intent });
        return null;
    },
});
