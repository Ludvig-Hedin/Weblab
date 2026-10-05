import { describe, expect, spyOn, test } from 'bun:test';
import { getFunctionName } from 'convex/server';
import type { Id } from '../_generated/dataModel';
import type { ActionCtx, MutationCtx } from '../_generated/server';
import * as stateFunctions from '../cmsSanityState';
import { update as updateSource } from '../cmsSources';
import { createDraft, deleteDraft, inspectOperation, runWrite, updateDraft } from '../cmsSanityActions';
import { encryptCmsCredentials } from './cmsCredentials';
import { SanityError, SanityPilotAdapter, isPublicAddress, sanityCredentials, type SanityTransport } from './sanityAdapter';
import { remoteDocument } from './sanityPilotContract';

function postFixture() {
    return {
        _id: 'drafts.article-1', _rev: 'rev-one', _type: 'pilotPost' as const,
        title: 'Title', slug: { _type: 'slug', current: 'first-post' },
        excerpt: 'Excerpt', category: 'News', publishedAt: '2026-10-01',
        body: [{ _key: 'block1', _type: 'block', style: 'normal', children: [{ _key: 'span1', _type: 'span', text: 'Hello', marks: ['strong'] }] }],
        customMetadata: { untouched: true },
    };
}

const creds = { projectId: 'test123', dataset: 'production', token: 'server-only-token', profile: 'sanity-pilot-v1' };
const transaction = 'transaction-one';

describe('Sanity provider request safeguards', () => {
    test('connection is fixed and rejects caller hosts and internal DNS addresses', () => {
        expect(() => sanityCredentials({ ...creds, projectId: 'attacker.example/..' })).toThrow();
        expect(() => sanityCredentials({ ...creds, dataset: '../other' })).toThrow();
        for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '::1', '::ffff:127.0.0.1', '::ffff:7f00:1', 'fc00::1', '2001:db8::1', '192.0.2.1']) expect(isPublicAddress(address)).toBe(false);
        expect(isPublicAddress('8.8.8.8')).toBe(true);
        expect(isPublicAddress('2606:4700::1111')).toBe(true);
    });
    test('draft update sends exact revision, owned patch and no published write', async () => {
        const current = remoteDocument(postFixture());
        const transport: SanityTransport = async (url, request) => {
            expect(url.origin).toBe('https://test123.api.sanity.io');
            expect(url.pathname).toBe('/v2025-02-19/data/mutate/production');
            expect(url.searchParams.get('visibility')).toBe('sync');
            expect(JSON.parse(request.body!)).toEqual({ transactionId: transaction, mutations: [{ patch: { id: current._id, ifRevisionID: 'rev-one', set: { title: 'Changed' } } }] });
            return { transactionId: transaction, results: [{ id: current._id, document: { ...current, title: 'Changed', _rev: 'rev-two' } }] };
        };
        expect((await new SanityPilotAdapter(creds, transport).update(current, 'rev-one', { title: 'Changed' }, transaction))._rev).toBe('rev-two');
    });
    test('stale revision refuses before any HTTP and provider conflict is retained', async () => {
        let requests = 0;
        const adapter = new SanityPilotAdapter(creds, async () => { requests++; throw new SanityError('CONFLICT', 'Changed remotely'); });
        await expect(adapter.update(remoteDocument(postFixture()), 'stale', { title: 'Changed' }, transaction)).rejects.toThrow('CONFLICT');
        expect(requests).toBe(0);
        await expect(adapter.update(remoteDocument(postFixture()), 'rev-one', { title: 'Changed' }, transaction)).rejects.toThrow('CONFLICT');
        expect(requests).toBe(1);
    });
    test('published first edit atomically creates guarded draft then applies patch', async () => {
        const current = remoteDocument({ ...postFixture(), _id: 'article-1' });
        let requests = 0;
        const adapter = new SanityPilotAdapter(creds, async (url, request) => {
            requests++;
            if (requests === 1) {
                expect(url.pathname).toBe('/v2025-02-19/data/actions/production');
                expect(JSON.parse(request.body!)).toEqual({ transactionId: transaction, actions: [
                    { actionType: 'sanity.action.document.version.create', publishedId: 'article-1', baseId: 'article-1', versionId: 'drafts.article-1', ifBaseRevisionId: 'rev-one' },
                    { actionType: 'sanity.action.document.edit', publishedId: 'article-1', draftId: 'drafts.article-1', patch: { set: { title: 'Changed' } } },
                ] });
                return { transactionId: transaction };
            }
            return { documents: [{ ...current, _id: 'drafts.article-1', title: 'Changed', _rev: 'rev-two' }] };
        });
        expect((await adapter.update(current, 'rev-one', { title: 'Changed' }, transaction))._id).toBe('drafts.article-1');
        expect(requests).toBe(2);
    });
    test('draft deletion guards current revision in the same transaction as ID deletion', async () => {
        const current = remoteDocument(postFixture());
        let requests = 0;
        const adapter = new SanityPilotAdapter(creds, async (_url, request) => {
            requests++;
            expect(JSON.parse(request.body!)).toEqual({ transactionId: transaction, mutations: [
                { patch: { id: 'drafts.article-1', ifRevisionID: 'rev-one', set: { title: 'Title' } } },
                { delete: { id: 'drafts.article-1' } },
            ] });
            return { transactionId: transaction, results: [{ id: current._id, operation: 'update' }, { id: current._id, operation: 'delete' }] };
        });
        expect(await adapter.remove(current, 'rev-one', transaction)).toBeNull();
        await expect(adapter.remove(remoteDocument({ ...current, _id: 'article-1' }), 'rev-one', transaction)).rejects.toThrow();
        expect(requests).toBe(1);
    });
    test('unexpected saved content or missing transaction confirmation remains unknown', async () => {
        const current = remoteDocument(postFixture());
        const adapter = new SanityPilotAdapter(creds, async () => ({ transactionId: transaction, results: [{ document: { ...current, title: 'Other edit', _rev: 'rev-two' } }] }));
        await expect(adapter.update(current, 'rev-one', { title: 'Changed' }, transaction)).rejects.toThrow('UNKNOWN');
        const malformed = new SanityPilotAdapter(creds, async () => ({ results: [] }));
        await expect(malformed.update(current, 'rev-one', { title: 'Changed' }, transaction)).rejects.toThrow('UNKNOWN');
    });
    test('bounded list refuses oversized datasets rather than silently dropping posts', async () => {
        const adapter = new SanityPilotAdapter(creds, async (url) => {
            expect(url.searchParams.get('perspective')).toBe('raw');
            return { result: Array.from({ length: 101 }, (_, i) => ({ ...postFixture(), _id: `drafts.article-${i}` })) };
        });
        await expect(adapter.list('pilotPost')).rejects.toThrow('at most 100');
    });
});

type FixtureRow = Record<string, unknown>;
function backendFixture(encrypted = 'opaque') {
    const rows = new Map<string, FixtureRow>([
        ['user', { _id: 'user', clerkUserId: 'clerk', _creationTime: 1 }],
        ['workspace', { _id: 'workspace', createdByUserId: 'user' }],
        ['project', { _id: 'project', workspaceId: 'workspace', accessMode: 'restricted' }],
        ['source', { _id: 'source', projectId: 'project', type: 'sanity', credentials: { encrypted }, updatedAt: 1 }],
    ]);
    let allowed = true;
    let inserts = 0;
    const tables = new Map<string, string>();
    const jobs = new Map<string, { state: { kind: string } }>();
    let schedules = 0;
    const db = {
        system: { get: async (id: string) => jobs.get(id) ?? null },
        get: async (id: string) => rows.get(id) ?? null,
        patch: async (id: string, patch: FixtureRow) => { rows.set(id, { ...rows.get(id), ...patch }); },
        replace: async (id: string, row: FixtureRow) => { rows.set(id, { _id: id, ...row }); },
        delete: async (id: string) => { rows.delete(id); tables.delete(id); },
        insert: async (table: string, row: FixtureRow) => { const id = `created-${++inserts}`; tables.set(id, table); rows.set(id, { _id: id, _creationTime: 1, ...row }); return id; },
        query: (table: string) => {
            const constraints: [string, unknown][] = [];
            const index = { eq: (key: string, value: unknown) => { constraints.push([key, value]); return index; } };
            const select = () => {
                if (table === 'users') return [rows.get('user')!];
                if (table === 'workspaceMembers') return [{ role: allowed ? 'owner' : 'viewer' }];
                if (table === 'projectMembers') return [{ role: allowed ? 'manager' : 'viewer' }];
                return [...rows.entries()].filter(([id, row]) => tables.get(id) === table && constraints.every(([key, value]) => row[key] === value)).map(([, row]) => row);
            };
            const query = {
                withIndex: (_name: string, build: (queryIndex: typeof index) => unknown) => { build(index); return query; },
                collect: async () => select(), unique: async () => select()[0] ?? null, take: async (limit: number) => select().slice(0, limit),
            };
            return query;
        },
    };
    const scheduler = { runAfter: async (_delay: number, _reference: unknown, _args: unknown) => { const id = `job-${++schedules}`; jobs.set(id, { state: { kind: 'pending' } }); return id; } };
    const ctx = { db, scheduler, auth: { getUserIdentity: async () => ({ subject: 'clerk', tokenIdentifier: 'issuer|clerk' }) } } as unknown as MutationCtx;
    const invoke = async (reference: unknown, args: unknown) => {
        const name = getFunctionName(reference as Parameters<typeof getFunctionName>[0]).split(':')[1]!;
        const fn = (stateFunctions as unknown as Record<string, { _handler: (ctx: MutationCtx, args: unknown) => Promise<unknown> }>)[name];
        if (!fn) throw new Error(`Unexpected fixture function: ${name}`);
        return fn._handler(ctx, args);
    };
    const actionCtx = { runQuery: invoke, runMutation: invoke } as unknown as ActionCtx;
    const workerCtx = { runQuery: async (reference: unknown, args: unknown) => {
        const name = getFunctionName(reference as Parameters<typeof getFunctionName>[0]).split(':')[1]!;
        const fn = (stateFunctions as unknown as Record<string, { _handler: (ctx: MutationCtx, args: unknown) => Promise<unknown> }>)[name]!;
        return fn._handler({ ...ctx, auth: { getUserIdentity: async () => null } } as unknown as MutationCtx, args);
    }, runMutation: async (reference: unknown, args: unknown) => {
        const name = getFunctionName(reference as Parameters<typeof getFunctionName>[0]).split(':')[1]!;
        const fn = (stateFunctions as unknown as Record<string, { _handler: (ctx: MutationCtx, args: unknown) => Promise<unknown> }>)[name]!;
        return fn._handler({ ...ctx, auth: { getUserIdentity: async () => null } } as unknown as MutationCtx, args);
    } } as unknown as ActionCtx;
    return { ctx, actionCtx, workerCtx, rows, jobs, revoke: () => { allowed = false; }, operations: () => [...rows.entries()].filter(([id]) => tables.get(id) === 'cmsSanityOperations').map(([, row]) => row) };
}

const projectId = 'project' as Id<'projects'>;
const sourceId = 'source' as Id<'cmsSources'>;
const reserveArgs = { projectId, sourceId, operationKey: 'stable-operation-123', kind: 'update' as const, documentId: 'article-1', requestHash: 'a'.repeat(64), expectedRevision: 'rev-one', sourceUpdatedAt: 1, requestJson: JSON.stringify({ documentId: 'drafts.article-1', values: { title: 'Changed' }, sourceEncrypted: 'opaque' }), expectedDocumentJson: JSON.stringify({ ...postFixture(), title: 'Changed' }), beforeDocumentJson: JSON.stringify(postFixture()) };
function handler<C, A, R>(registered: unknown): (ctx: C, args: A) => Promise<R> {
    return (registered as { _handler: (ctx: C, args: A) => Promise<R> })._handler;
}
const reserve = handler<MutationCtx, typeof reserveArgs, { started: boolean; operation: { _id: Id<'cmsSanityOperations'> } }>(stateFunctions.reserveOperation);
type FinishArgs = { projectId: Id<'projects'>; sourceId: Id<'cmsSources'>; operationId: Id<'cmsSanityOperations'>; requestHash: string; state: 'succeeded' | 'unknown' | 'failed'; expectedState: 'pending' | 'unknown'; expectedStage: 'reserved' | 'sending'; mode: 'worker' | 'inspect' };
const finish = handler<MutationCtx, FinishArgs, { applied: boolean; operation: FixtureRow }>(stateFunctions.finishOperation);
const updateHandler = handler<ActionCtx, { projectId: Id<'projects'>; sourceId: Id<'cmsSources'>; operationKey: string; documentId: string; expectedRevision: string; changesJson: string }, { state: string }>(updateDraft);
const createHandler = handler<ActionCtx, { projectId: Id<'projects'>; sourceId: Id<'cmsSources'>; operationKey: string; valuesJson: string }, { state: string }>(createDraft);
const deleteHandler = handler<ActionCtx, { projectId: Id<'projects'>; sourceId: Id<'cmsSources'>; operationKey: string; documentId: string; expectedRevision: string }, { state: string }>(deleteDraft);
const updateSourceHandler = handler<MutationCtx, { projectId: Id<'projects'>; sourceId: Id<'cmsSources'>; name?: string; credentialsEncrypted?: string }, FixtureRow>(updateSource);
const setReadiness = handler<MutationCtx, { projectId: Id<'projects'>; sourceId: Id<'cmsSources'>; documentId: string; revision: string; sourceUpdatedAt: number; intent: 'include' | 'exclude' }, null>(stateFunctions.setReadiness);
const loadWorker = handler<MutationCtx, { operationId: Id<'cmsSanityOperations'> }, unknown>(stateFunctions.loadOperation);
const worker = handler<ActionCtx, { operationId: Id<'cmsSanityOperations'> }, null>(runWrite);
const inspect = handler<ActionCtx, { projectId: Id<'projects'>; sourceId: Id<'cmsSources'>; operationKey: string }, { state: string; matchesExpected: boolean }>(inspectOperation);
const beginSend = handler<MutationCtx, { operationId: Id<'cmsSanityOperations'> }, null>(stateFunctions.beginSend);
const removable = handler<MutationCtx, { projectId: Id<'projects'>; sourceId: Id<'cmsSources'> }, null>(stateFunctions.assertSourceRemovable);
const cleanup = handler<MutationCtx, { projectId: Id<'projects'>; sourceId: Id<'cmsSources'> }, null>(stateFunctions.finalizeSourceRemoval);
function finishArgs(id: Id<'cmsSanityOperations'>, state: FinishArgs['state'], stage: FinishArgs['expectedStage'] = 'sending'): FinishArgs {
    return { projectId, sourceId, operationId: id, requestHash: reserveArgs.requestHash, state, expectedState: 'pending', expectedStage: stage, mode: 'worker' };
}
function job(fixture: ReturnType<typeof backendFixture>, kind: string) {
    const operation = fixture.operations()[0]!;
    fixture.jobs.set(String(operation.scheduledFunctionId), { state: { kind } });
}
async function withProvider(run: (fixture: ReturnType<typeof backendFixture>, getMock: ReturnType<typeof spyOn<SanityPilotAdapter, 'get'>>, updateMock: ReturnType<typeof spyOn<SanityPilotAdapter, 'update'>>) => Promise<void>) {
    const previousKey = process.env.CMS_SOURCE_ENCRYPTION_KEY;
    process.env.CMS_SOURCE_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    const getMock = spyOn(SanityPilotAdapter.prototype, 'get');
    const updateMock = spyOn(SanityPilotAdapter.prototype, 'update');
    try {
        getMock.mockResolvedValue(remoteDocument(postFixture()));
        updateMock.mockResolvedValue(remoteDocument({ ...postFixture(), title: 'Changed', _rev: 'rev-two' }));
        await run(backendFixture(encryptCmsCredentials(creds)), getMock, updateMock);
    } finally {
        getMock.mockRestore(); updateMock.mockRestore();
        if (previousKey === undefined) delete process.env.CMS_SOURCE_ENCRYPTION_KEY;
        else process.env.CMS_SOURCE_ENCRYPTION_KEY = previousKey;
    }
}
const updateArgs = { projectId, sourceId, operationKey: 'action-operation-123', documentId: 'drafts.article-1', expectedRevision: 'rev-one', changesJson: '{"title":"Changed"}' };

describe('registered scheduled Sanity state and action boundaries', () => {
    test('reserves and schedules once, rejects changed identity and blocks unresolved writes', async () => {
        const fixture = backendFixture();
        const first = await reserve(fixture.ctx, reserveArgs);
        expect(first.started).toBe(true);
        expect((await reserve(fixture.ctx, reserveArgs)).started).toBe(false);
        expect(fixture.jobs.size).toBe(1);
        expect(fixture.operations()[0]!.ownerUserId).toBe('user');
        await expect(reserve(fixture.ctx, { ...reserveArgs, requestHash: 'b'.repeat(64) })).rejects.toThrow('CONFLICT');
        await expect(reserve(fixture.ctx, { ...reserveArgs, operationKey: 'another-operation-123' })).rejects.toThrow('UNKNOWN');
        job(fixture, 'inProgress');
        await beginSend(fixture.ctx, { operationId: first.operation._id });
        await finish(fixture.ctx, finishArgs(first.operation._id, 'unknown'));
        await expect(reserve(fixture.ctx, { ...reserveArgs, operationKey: 'another-operation-123' })).rejects.toThrow('UNKNOWN');
    });
    test('completion compares both captured state and stage and refuses source rotation or revocation', async () => {
        const fixture = backendFixture();
        const first = await reserve(fixture.ctx, reserveArgs);
        expect((await finish(fixture.ctx, finishArgs(first.operation._id, 'unknown'))).applied).toBe(false);
        fixture.rows.set('source', { ...fixture.rows.get('source'), updatedAt: 2 });
        await expect(finish(fixture.ctx, finishArgs(first.operation._id, 'succeeded'))).rejects.toThrow('CONFLICT');
        fixture.rows.set('source', { ...fixture.rows.get('source'), updatedAt: 1 });
        fixture.revoke();
        await expect(finish(fixture.ctx, finishArgs(first.operation._id, 'succeeded'))).rejects.toThrow('FORBIDDEN');
        expect(fixture.operations()[0]!.state).toBe('pending');
    });
    test('public save returns pending without POST, scheduled worker uses stored owner without auth', async () => {
        await withProvider(async (fixture, _get, update) => {
            expect((await updateHandler(fixture.actionCtx, updateArgs)).state).toBe('pending');
            expect(update).not.toHaveBeenCalled();
            const operation = fixture.operations()[0]!;
            expect(operation.ownerUserId).toBe('user');
            expect(JSON.parse(String(operation.beforeDocumentJson)).title).toBe('Title');
            job(fixture, 'inProgress');
            update.mockImplementation(async () => {
                expect(fixture.operations()[0]!.stage).toBe('sending');
                return remoteDocument({ ...postFixture(), title: 'Changed', _rev: 'rev-two' });
            });
            await worker(fixture.workerCtx, { operationId: operation._id as Id<'cmsSanityOperations'> });
            expect(fixture.operations()[0]!.state).toBe('succeeded');
            expect(update).toHaveBeenCalledTimes(1);
        });
    });
    test('revocation after provider write preserves unresolved state rather than claiming save', async () => {
        await withProvider(async (fixture, _get, update) => {
            await updateHandler(fixture.actionCtx, updateArgs);
            job(fixture, 'inProgress');
            update.mockImplementation(async () => { fixture.revoke(); return remoteDocument({ ...postFixture(), title: 'Changed', _rev: 'rev-two' }); });
            await expect(worker(fixture.workerCtx, { operationId: fixture.operations()[0]!._id as Id<'cmsSanityOperations'> })).rejects.toThrow('FORBIDDEN');
            expect(fixture.operations()[0]!.state).toBe('pending');
            expect(fixture.operations()[0]!.resultDocumentJson).toBeUndefined();
        });
    });
    test('provider conflict is durable and no repeated worker can resend', async () => {
        await withProvider(async (fixture, _get, update) => {
            await updateHandler(fixture.actionCtx, updateArgs);
            job(fixture, 'inProgress');
            update.mockRejectedValue(new SanityError('CONFLICT', 'Another editor saved.'));
            const operationId = fixture.operations()[0]!._id as Id<'cmsSanityOperations'>;
            await expect(worker(fixture.workerCtx, { operationId })).rejects.toThrow('CONFLICT');
            expect(fixture.operations()[0]!.state).toBe('conflict');
            await expect(worker(fixture.workerCtx, { operationId })).rejects.toThrow('CONFLICT');
            expect(update).toHaveBeenCalledTimes(1);
        });
    });
    test('crashed reserved worker can be released only after scheduler confirms failure', async () => {
        await withProvider(async (fixture, get, update) => {
            await updateHandler(fixture.actionCtx, updateArgs);
            get.mockClear();
            job(fixture, 'failed');
            expect((await inspect(fixture.actionCtx, { projectId, sourceId, operationKey: updateArgs.operationKey })).state).toBe('failed');
            expect(get).not.toHaveBeenCalled();
            expect(update).not.toHaveBeenCalled();
            await reserve(fixture.ctx, { ...reserveArgs, operationKey: 'new-operation-after-123', requestJson: JSON.stringify({ documentId: 'drafts.article-1', values: { title: 'Changed' }, sourceEncrypted: (fixture.rows.get('source')!.credentials as { encrypted: string }).encrypted }) });
        });
    });
    test('failed sending worker needs exact content proof; mismatches stay blocked', async () => {
        await withProvider(async (fixture, get, update) => {
            await updateHandler(fixture.actionCtx, updateArgs);
            job(fixture, 'inProgress');
            await beginSend(fixture.ctx, { operationId: fixture.operations()[0]!._id as Id<'cmsSanityOperations'> });
            job(fixture, 'failed');
            expect((await inspect(fixture.actionCtx, { projectId, sourceId, operationKey: updateArgs.operationKey })).state).toBe('pending');
            await expect(reserve(fixture.ctx, { ...reserveArgs, operationKey: 'new-operation-after-123', requestJson: String(fixture.operations()[0]!.requestJson) })).rejects.toThrow('UNKNOWN');
            get.mockResolvedValue(remoteDocument({ ...postFixture(), title: 'Changed', _rev: 'confirmed-revision' }));
            expect((await inspect(fixture.actionCtx, { projectId, sourceId, operationKey: updateArgs.operationKey })).state).toBe('succeeded');
            expect(fixture.operations()[0]!.resultRevision).toBe('confirmed-revision');
            expect(update).not.toHaveBeenCalled();
        });
    });
    test('canceled, running, pending and missing jobs never unlock or retry', async () => {
        for (const kind of ['canceled', 'inProgress', 'pending', 'missing']) {
            await withProvider(async (fixture, get, update) => {
                await updateHandler(fixture.actionCtx, updateArgs);
                job(fixture, 'inProgress');
                await beginSend(fixture.ctx, { operationId: fixture.operations()[0]!._id as Id<'cmsSanityOperations'> });
                if (kind === 'missing') fixture.jobs.clear(); else job(fixture, kind);
                get.mockClear();
                expect((await inspect(fixture.actionCtx, { projectId, sourceId, operationKey: updateArgs.operationKey })).state).toBe('pending');
                await expect(reserve(fixture.ctx, { ...reserveArgs, operationKey: 'new-operation-after-123', requestJson: String(fixture.operations()[0]!.requestJson) })).rejects.toThrow('UNKNOWN');
                await expect(worker(fixture.workerCtx, { operationId: fixture.operations()[0]!._id as Id<'cmsSanityOperations'> })).rejects.toThrow();
                expect(get).not.toHaveBeenCalled();
                expect(update).not.toHaveBeenCalled();
            });
        }
    });
    test('stale inspector cannot overwrite a worker completion', async () => {
        const fixture = backendFixture();
        const first = await reserve(fixture.ctx, reserveArgs);
        job(fixture, 'inProgress');
        await beginSend(fixture.ctx, { operationId: first.operation._id });
        await finish(fixture.ctx, finishArgs(first.operation._id, 'unknown'));
        job(fixture, 'failed');
        expect((await finish(fixture.ctx, { ...finishArgs(first.operation._id, 'succeeded'), mode: 'inspect' })).applied).toBe(false);
        expect(fixture.operations()[0]!.state).toBe('unknown');
    });
    test('source cleanup refuses unresolved writes and deletes only reserved terminal rows', async () => {
        const fixture = backendFixture();
        const first = await reserve(fixture.ctx, reserveArgs);
        await expect(removable(fixture.ctx, { projectId, sourceId })).rejects.toThrow('UNKNOWN');
        fixture.rows.set('source', { ...fixture.rows.get('source'), status: 'deleting' });
        await expect(cleanup(fixture.ctx, { projectId, sourceId })).rejects.toThrow('UNKNOWN');
        fixture.rows.set(String(first.operation._id), { ...fixture.rows.get(String(first.operation._id)), state: 'failed' });
        fixture.revoke();
        await cleanup({ ...fixture.ctx, auth: { getUserIdentity: async () => null } } as unknown as MutationCtx, { projectId, sourceId });
        expect(fixture.rows.has('source')).toBe(false);
        expect(fixture.operations()).toHaveLength(0);
    });
    test('new posts use one operation-owned draft ID and schedule without an early write', async () => {
        await withProvider(async (fixture, get) => {
            const create = spyOn(SanityPilotAdapter.prototype, 'create');
            const operationKey = 'new-post-operation-123';
            const { title, slug, excerpt, category, publishedAt, body } = postFixture();
            try {
                get.mockResolvedValue(null);
                create.mockResolvedValue(remoteDocument({ ...postFixture(), _id: `drafts.weblab-${operationKey}`, _rev: 'created-revision' }));
                expect((await createHandler(fixture.actionCtx, { projectId, sourceId, operationKey, valuesJson: JSON.stringify({ title, slug: { current: slug.current }, excerpt, category, publishedAt, body }) })).state).toBe('pending');
                expect(create).not.toHaveBeenCalled();
                job(fixture, 'inProgress');
                await worker(fixture.workerCtx, { operationId: fixture.operations()[0]!._id as Id<'cmsSanityOperations'> });
                expect(create.mock.calls[0]![0]).toBe(`weblab-${operationKey}`);
                expect(fixture.operations()[0]!.state).toBe('succeeded');
            } finally { create.mockRestore(); }
        });
    });
    test('unknown deletion never adopts missing content as proof or permits a retry', async () => {
        await withProvider(async (fixture, get) => {
            const remove = spyOn(SanityPilotAdapter.prototype, 'remove');
            try {
                remove.mockRejectedValue(new SanityError('UNKNOWN', 'Transaction confirmation was lost.'));
                expect((await deleteHandler(fixture.actionCtx, { projectId, sourceId, operationKey: updateArgs.operationKey, documentId: 'drafts.article-1', expectedRevision: 'rev-one' })).state).toBe('pending');
                expect(remove).not.toHaveBeenCalled();
                job(fixture, 'inProgress');
                await expect(worker(fixture.workerCtx, { operationId: fixture.operations()[0]!._id as Id<'cmsSanityOperations'> })).rejects.toThrow('UNKNOWN');
                get.mockResolvedValue(null);
                job(fixture, 'failed');
                const result = await inspect(fixture.actionCtx, { projectId, sourceId, operationKey: updateArgs.operationKey });
                expect(result.state).toBe('unknown');
                expect(result.matchesExpected).toBe(false);
                await expect(removable(fixture.ctx, { projectId, sourceId })).rejects.toThrow('UNKNOWN');
                expect(remove).toHaveBeenCalledTimes(1);
            } finally { remove.mockRestore(); }
        });
    });
    test('confirmed draft deletion completes with a null document', async () => {
        await withProvider(async (fixture) => {
            const remove = spyOn(SanityPilotAdapter.prototype, 'remove');
            try {
                remove.mockResolvedValue(null);
                await deleteHandler(fixture.actionCtx, { projectId, sourceId, operationKey: updateArgs.operationKey, documentId: 'drafts.article-1', expectedRevision: 'rev-one' });
                job(fixture, 'inProgress');
                await worker(fixture.workerCtx, { operationId: fixture.operations()[0]!._id as Id<'cmsSanityOperations'> });
                expect(fixture.operations()[0]!.state).toBe('succeeded');
                expect(fixture.operations()[0]!.resultDocumentJson).toBeUndefined();
            } finally { remove.mockRestore(); }
        });
    });
    test('credential changes with unchanged timestamp fail before worker credentials are returned', async () => {
        const fixture = backendFixture();
        const first = await reserve(fixture.ctx, reserveArgs);
        job(fixture, 'inProgress');
        fixture.rows.set('source', { ...fixture.rows.get('source'), credentials: { encrypted: 'rotated' }, updatedAt: 1 });
        await expect(loadWorker(fixture.ctx, { operationId: first.operation._id })).rejects.toThrow('CONFLICT');
        await expect(finish(fixture.ctx, finishArgs(first.operation._id, 'unknown'))).rejects.toThrow('CONFLICT');
        expect(fixture.operations()[0]!.state).toBe('pending');
    });
    test('actual source update blocks unresolved saves then advances same-clock source pin', async () => {
        const fixture = backendFixture();
        await setReadiness(fixture.ctx, { projectId, sourceId, documentId: 'article-1', revision: 'rev-one', sourceUpdatedAt: 1, intent: 'include' });
        const first = await reserve(fixture.ctx, reserveArgs);
        await expect(updateSourceHandler(fixture.ctx, { projectId, sourceId, name: 'Changed' })).rejects.toThrow('UNKNOWN');
        await expect(updateSourceHandler(fixture.ctx, { projectId, sourceId, credentialsEncrypted: 'rotated' })).rejects.toThrow('UNKNOWN');
        job(fixture, 'inProgress');
        await beginSend(fixture.ctx, { operationId: first.operation._id });
        await finish(fixture.ctx, finishArgs(first.operation._id, 'unknown'));
        await expect(updateSourceHandler(fixture.ctx, { projectId, sourceId, name: 'Changed' })).rejects.toThrow('UNKNOWN');
        await expect(updateSourceHandler(fixture.ctx, { projectId, sourceId, credentialsEncrypted: 'rotated' })).rejects.toThrow('UNKNOWN');
        // Simulate a later terminal reconciliation; the source mutation remains
        // responsible for its own serializable unresolved-write guard.
        fixture.rows.set(String(first.operation._id), { ...fixture.rows.get(String(first.operation._id)), state: 'failed' });
        const clock = spyOn(Date, 'now').mockReturnValue(1);
        try {
            const updated = await updateSourceHandler(fixture.ctx, { projectId, sourceId, name: 'Changed' });
            expect(updated.updatedAt).toBe(2);
            await expect(setReadiness(fixture.ctx, { projectId, sourceId, documentId: 'article-1', revision: 'rev-one', sourceUpdatedAt: 1, intent: 'include' })).rejects.toThrow('CONFLICT');
        } finally { clock.mockRestore(); }
    });
    test('oversized JSON refuses before intent or schedule', async () => {
        const fixture = backendFixture();
        await expect(reserve(fixture.ctx, { ...reserveArgs, requestJson: JSON.stringify({ value: 'x'.repeat(256 * 1024) }) })).rejects.toThrow('too large');
        expect(fixture.operations()).toHaveLength(0);
        expect(fixture.jobs.size).toBe(0);
    });
});
