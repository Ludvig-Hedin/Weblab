import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { createHash } from 'node:crypto';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { _asset as editorAsset, snapshot } from '../cloudEditor';
import { _asset, _collect, access, begin, cancel, claimUpload, failUpload, finalize, findAttempt, markSending, recordOwned, status } from '../cloudEditorImports';
import { getFileUrl } from '../storage';

const DAY = 86_400_000;
const secret = 'a'.repeat(64);
const workspaceId = 'workspaces:one' as Id<'workspaces'>;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const source = 'export default function Page() { return <main>Saved source</main>; }';
const manifest = [
    { path: 'src/app/page.tsx', kind: 'text' as const, text: source, bytes: Buffer.byteLength(source), hash: hash(source) },
    { path: 'public/movie.mp4', kind: 'binary' as const, bytes: 6, hash: hash('binary') },
];
const request = { workspaceId, actorId: 'users:builder' as Id<'users'>, operationKey: 'import_operation_123456', name: 'Imported source', files: manifest };
type Row = { _id: string; _creationTime: number } & Record<string, unknown>;
let now = 1_800_000_000_000;
let clock: ReturnType<typeof spyOn>;
const previousGate = process.env.WEBLAB_CLOUD_IMPORTS_ENABLED;
const previousSecret = process.env.WEBLAB_CLOUD_IMPORT_SECRET;
beforeEach(() => {
    now = 1_800_000_000_000;
    clock = spyOn(Date, 'now').mockImplementation(() => now);
    process.env.WEBLAB_CLOUD_IMPORTS_ENABLED = 'true';
    process.env.WEBLAB_CLOUD_IMPORT_SECRET = secret;
});
afterEach(() => {
    clock.mockRestore();
    if (previousGate === undefined) delete process.env.WEBLAB_CLOUD_IMPORTS_ENABLED;
    else process.env.WEBLAB_CLOUD_IMPORTS_ENABLED = previousGate;
    if (previousSecret === undefined) delete process.env.WEBLAB_CLOUD_IMPORT_SECRET;
    else process.env.WEBLAB_CLOUD_IMPORT_SECRET = previousSecret;
});

// Real registered handlers and permission checks, synthetic persistence/storage/scheduler.
// Sequential interleavings do not simulate Convex rollback, serialization or real upload IO.
function fixture() {
    const tables = new Map<string, Map<string, Row>>();
    let subject: string | null = 'builder';
    let sequence = 0;
    let generatedUrls = 0;
    const deleted: string[] = [];
    const scheduled: Array<{ delay: number; args: unknown }> = [];
    const table = (name: string) => {
        let values = tables.get(name);
        if (!values) { values = new Map(); tables.set(name, values); }
        return values;
    };
    const put = (name: string, id: string, value: Record<string, unknown>) => {
        table(name).set(id, { _id: id, _creationTime: now, ...value });
    };
    const get = (id: string): Row | null => table(id.split(':')[0]!).get(id) ?? null;
    for (const name of ['builder', 'other', 'viewer']) {
        put('users', `users:${name}`, { clerkUserId: name });
        put('workspaceMembers', `workspaceMembers:${name}`, { workspaceId, userId: `users:${name}`, role: name === 'viewer' ? 'viewer' : 'member' });
    }
    put('workspaces', workspaceId, { createdByUserId: 'users:owner' });
    const ctx = {
        auth: { getUserIdentity: async () => subject ? { subject, issuer: 'issuer', tokenIdentifier: `issuer|${subject}` } : null },
        db: {
            get: async (id: string) => structuredClone(get(id)),
            insert: async (name: string, value: Record<string, unknown>) => {
                const id = `${name}:${++sequence}`; put(name, id, value); return id;
            },
            patch: async (id: string, patch: Record<string, unknown>) => { Object.assign(get(id)!, patch); },
            delete: async (id: string) => { table(id.split(':')[0]!).delete(id); },
            system: { get: async (id: string) => structuredClone(get(id)) },
            query: (name: string) => {
                const conditions: Array<(row: Row) => boolean> = [];
                const index = {
                    eq: (key: string, value: unknown) => { conditions.push(row => row[key] === value); return index; },
                    gte: (key: string, value: number) => { conditions.push(row => Number(row[key]) >= value); return index; },
                    gt: (key: string, value: number) => { conditions.push(row => Number(row[key]) > value); return index; },
                };
                const rows = () => [...table(name).values()].filter(row => conditions.every(test => test(row))).map(row => structuredClone(row));
                const query = {
                    withIndex: (_name: string, build: (q: typeof index) => unknown) => { build(index); return query; },
                    collect: async () => rows(), take: async (count: number) => rows().slice(0, count),
                    first: async () => rows()[0] ?? null,
                    unique: async () => { const values = rows(); if (values.length > 1) throw new Error('Nonunique fixture row'); return values[0] ?? null; },
                };
                return query;
            },
        },
        scheduler: { runAfter: async (delay: number, _ref: unknown, args: unknown) => { scheduled.push({ delay, args }); return `scheduled:${scheduled.length}`; } },
        storage: {
            generateUploadUrl: async () => { generatedUrls++; return 'https://storage.example/upload'; },
            delete: async (id: string) => { deleted.push(id); table('_storage').delete(id); },
            getUrl: async (id: string) => get(id) ? 'https://storage.example/asset' : null,
        },
    } as unknown as MutationCtx;
    return { ctx, table, get, put, deleted, scheduled, generatedUrls: () => generatedUrls,
        signIn: (value: string | null) => { subject = value; },
        blob: (id = '_storage:one', size = 6, sha256 = hash('binary')) => {
            put('_storage', id, { size, sha256 }); return id as Id<'_storage'>;
        } };
}
type Fixture = ReturnType<typeof fixture>;
async function ready(f: Fixture, args = request) {
    const started = await begin._handler(f.ctx, args);
    const state = await status._handler(f.ctx, { attemptId: started.attemptId });
    const fileIndex = state.files.find(file => file.kind === 'binary')!.index;
    const claim = await claimUpload._handler(f.ctx, { attemptId: started.attemptId, fileIndex, expectedHash: hash('binary'), secret });
    const receipt = { attemptId: started.attemptId, fileIndex, nonce: claim.nonce, secret };
    expect(await markSending._handler(f.ctx, receipt)).toBe(true);
    return { ...started, receipt };
}
async function receive(f: Fixture, receipt: Awaited<ReturnType<typeof ready>>['receipt'], storageId = f.blob()) {
    return recordOwned._handler(f.ctx, { ...receipt, storageId, actualBytes: 6, actualHash: hash('binary') });
}

describe('staged import identity and quotas', () => {
    it('pins begin to the captured actor and only finds the authenticated actor attempt', async () => {
        const f = fixture();
        expect((await access._handler(f.ctx, { workspaceId })).actorId).toBe(request.actorId);
        const started = await begin._handler(f.ctx, request);
        expect((await findAttempt._handler(f.ctx, request))?.attemptId).toBe(started.attemptId);
        f.signIn('other');
        expect(await findAttempt._handler(f.ctx, request)).toBeNull();
        await expect(begin._handler(f.ctx, request)).rejects.toThrow('CLOUD_ACTOR_CHANGED');
        await expect(cancel._handler(f.ctx, started)).rejects.toThrow('CLOUD_IMPORT_NOT_FOUND');
    });

    it('keeps recovery and cancellation available when imports are disabled or quota is full', async () => {
        const f = fixture(); const started = await begin._handler(f.ctx, request);
        for (let index = 0; index < 3; index++) f.put('cloudEditorStates', `cloudEditorStates:${index}`, { workspaceId });
        process.env.WEBLAB_CLOUD_IMPORTS_ENABLED = 'false';
        expect((await access._handler(f.ctx, { workspaceId })).enabled).toBe(false);
        expect((await findAttempt._handler(f.ctx, request))?.attemptId).toBe(started.attemptId);
        expect((await status._handler(f.ctx, started)).files.every(file => !file.canUpload)).toBe(true);
        expect((await cancel._handler(f.ctx, started)).state).toBe('expired');
        expect((await cancel._handler(f.ctx, started)).state).toBe('expired');
        process.env.WEBLAB_CLOUD_IMPORTS_ENABLED = 'true';
        await expect(finalize._handler(f.ctx, started)).rejects.toThrow('CLOUD_IMPORT_EXPIRED');
    });

    it('cancel retains sending identity for late receipt collection and never deletes a finalized project', async () => {
        const f = fixture(); const started = await ready(f);
        const result = await cancel._handler(f.ctx, started);
        expect(result.state).toBe('expired');
        const receipt = [...f.table('cloudEditorImportFiles').values()][0]!;
        expect(receipt.nonce).toBe(started.receipt.nonce);
        expect(receipt.state).toBe('sending');
        expect(await receive(f, started.receipt)).toEqual({ valid: false });
        await _collect._handler(f.ctx, started);
        expect(f.deleted).toEqual(['_storage:one']);
        const g = fixture(); const completed = await ready(g); await receive(g, completed.receipt);
        const project = await finalize._handler(g.ctx, completed);
        const cancelled = await cancel._handler(g.ctx, completed);
        expect(cancelled.state).toBe('finalized'); expect(cancelled.projectId).toBe(project.projectId);
        expect(g.deleted).toEqual([]);
    });
    it('retains exact operation identity and full reserved bytes without exposing storage authority', async () => {
        const f = fixture();
        const started = await begin._handler(f.ctx, request);
        expect(await begin._handler(f.ctx, request)).toEqual(started);
        expect(f.table('cloudEditorImports').size).toBe(1);
        const state = await status._handler(f.ctx, { attemptId: started.attemptId });
        expect(state.bytes).toBe(manifest.reduce((sum, file) => sum + file.bytes, 0));
        expect(JSON.stringify(state)).not.toMatch(/storageId|nonce|https:|"text":|secret/);
        await expect(begin._handler(f.ctx, { ...request, name: 'Changed' })).rejects.toThrow('CLOUD_IMPORT_RETRY_CHANGED');
        now += DAY;
        await _collect._handler(f.ctx, { attemptId: started.attemptId });
        expect(await begin._handler(f.ctx, request)).toEqual(started);
        expect(f.get(started.attemptId)?.state).toBe('expired');
    });
    it('requires both owner identity and current workspace authority', async () => {
        const f = fixture();
        const started = await begin._handler(f.ctx, request);
        f.signIn('other');
        await expect(status._handler(f.ctx, { attemptId: started.attemptId })).rejects.toThrow('CLOUD_IMPORT_NOT_FOUND');
        f.signIn('viewer');
        await expect(begin._handler(f.ctx, request)).rejects.toThrow('FORBIDDEN');
        f.signIn('builder'); f.table('workspaceMembers').delete('workspaceMembers:builder');
        await expect(finalize._handler(f.ctx, started)).rejects.toThrow('FORBIDDEN');
    });
    it('enforces workspace active and daily attempt limits while retaining receipts', async () => {
        const f = fixture();
        const first = await begin._handler(f.ctx, request);
        await expect(begin._handler(f.ctx, { ...request, operationKey: 'second_operation_1234' })).rejects.toThrow('CLOUD_IMPORT_BUSY');
        f.get(first.attemptId)!.state = 'expired';
        await begin._handler(f.ctx, { ...request, operationKey: 'second_operation_1234' });
        await expect(begin._handler(f.ctx, { ...request, operationKey: 'third_operation_12345' })).rejects.toThrow('CLOUD_IMPORT_LIMIT');
        expect(f.table('cloudEditorImports').size).toBe(2);
    });
    it('enforces actor and project quotas before reserving another import', async () => {
        const f = fixture();
        for (let index = 0; index < 3; index++) f.put('cloudEditorImports', `cloudEditorImports:prior${index}`, {
            actorId: 'users:builder', workspaceId: 'workspaces:elsewhere', createdAt: now, state: 'finalized' });
        await expect(begin._handler(f.ctx, request)).rejects.toThrow('CLOUD_IMPORT_LIMIT');
        f.table('cloudEditorImports').clear();
        for (let index = 0; index < 3; index++) f.put('cloudEditorStates', `cloudEditorStates:${index}`, { workspaceId });
        await expect(begin._handler(f.ctx, request)).rejects.toThrow('CLOUD_PROJECT_LIMIT');
        expect(f.table('cloudEditorImports').size).toBe(0);
    });
});

describe('trusted upload claim and receipt lifecycle', () => {
    it('refuses secret-only or JWT-only claim access and duplicate sending authority', async () => {
        const f = fixture();
        const started = await begin._handler(f.ctx, request);
        const fileIndex = (await status._handler(f.ctx, { attemptId: started.attemptId })).files.find(file => file.kind === 'binary')!.index;
        const args = { attemptId: started.attemptId, fileIndex, expectedHash: hash('binary'), secret };
        await expect(claimUpload._handler(f.ctx, { ...args, secret: 'b'.repeat(64) })).rejects.toThrow('CLOUD_IMPORT_SERVER_REQUIRED');
        f.signIn(null);
        await expect(claimUpload._handler(f.ctx, args)).rejects.toThrow('UNAUTHORIZED');
        f.signIn('builder');
        const claim = await claimUpload._handler(f.ctx, args);
        await expect(claimUpload._handler(f.ctx, args)).rejects.toThrow('CLOUD_IMPORT_CLAIM_CHANGED');
        const receipt = { attemptId: started.attemptId, fileIndex, nonce: claim.nonce, secret };
        expect(await markSending._handler(f.ctx, receipt)).toBe(true);
        expect(await markSending._handler(f.ctx, receipt)).toBe(false);
        expect(f.generatedUrls()).toBe(1);
    });
    it('caps global live claims and keeps unknown claims reserved until lease expiry', async () => {
        const f = fixture();
        f.put('cloudEditorImportFiles', 'cloudEditorImportFiles:other1', { state: 'sending', leaseUntil: now + 120_000 });
        f.put('cloudEditorImportFiles', 'cloudEditorImportFiles:other2', { state: 'unknown', leaseUntil: now + 120_000 });
        const started = await begin._handler(f.ctx, request);
        const state = await status._handler(f.ctx, { attemptId: started.attemptId });
        const args = { attemptId: started.attemptId, fileIndex: state.files.find(file => file.kind === 'binary')!.index, expectedHash: hash('binary'), secret };
        await expect(claimUpload._handler(f.ctx, args)).rejects.toThrow('CLOUD_IMPORT_UPLOAD_BUSY');
        now += 120_001;
        await claimUpload._handler(f.ctx, args);
        expect(f.generatedUrls()).toBe(1);
    });
    it('records late owned bytes without JWT after access is revoked, without granting finalization', async () => {
        const f = fixture();
        const active = await ready(f);
        f.table('workspaceMembers').delete('workspaceMembers:builder'); f.signIn(null);
        expect(await receive(f, active.receipt)).toEqual({ valid: true });
        await expect(finalize._handler(f.ctx, active)).rejects.toThrow('UNAUTHORIZED');
        expect(f.table('projects').size).toBe(0);
    });
    it('rechecks current rights and the live claim lease immediately before sending', async () => {
        const f = fixture(); const started = await begin._handler(f.ctx, request);
        const fileIndex = (await status._handler(f.ctx, { attemptId: started.attemptId })).files.find(file => file.kind === 'binary')!.index;
        const claim = await claimUpload._handler(f.ctx, { attemptId: started.attemptId, fileIndex, expectedHash: hash('binary'), secret });
        const receipt = { attemptId: started.attemptId, fileIndex, nonce: claim.nonce, secret };
        f.table('workspaceMembers').delete('workspaceMembers:builder');
        await expect(markSending._handler(f.ctx, receipt)).rejects.toThrow('FORBIDDEN');
        f.put('workspaceMembers', 'workspaceMembers:builder', { workspaceId, userId: 'users:builder', role: 'member' });
        now += 120_001;
        expect(await markSending._handler(f.ctx, receipt)).toBe(false);
        expect([...f.table('cloudEditorImportFiles').values()][0]?.state).toBe('receiving');
    });
    it('allows only a positively unsent receiving claim to return to pending', async () => {
        const f = fixture();
        const started = await begin._handler(f.ctx, request);
        const fileIndex = (await status._handler(f.ctx, { attemptId: started.attemptId })).files.find(file => file.kind === 'binary')!.index;
        const args = { attemptId: started.attemptId, fileIndex, expectedHash: hash('binary'), secret };
        const claim = await claimUpload._handler(f.ctx, args);
        await failUpload._handler(f.ctx, { ...args, nonce: claim.nonce, outcome: 'not-sent' });
        const second = await claimUpload._handler(f.ctx, args);
        expect(second.nonce).not.toBe(claim.nonce);
        const receipt = { attemptId: started.attemptId, fileIndex, nonce: second.nonce, secret };
        await expect(markSending._handler(f.ctx, { ...receipt, nonce: claim.nonce })).rejects.toThrow('CLOUD_IMPORT_CLAIM_CHANGED');
        await markSending._handler(f.ctx, receipt);
        await expect(failUpload._handler(f.ctx, { ...receipt, outcome: 'not-sent' })).rejects.toThrow('CLOUD_IMPORT_SEND_UNCERTAIN');
        await failUpload._handler(f.ctx, { ...receipt, outcome: 'unknown' });
        await expect(claimUpload._handler(f.ctx, args)).rejects.toThrow('CLOUD_IMPORT_CLAIM_CHANGED');
        expect(await receive(f, receipt)).toEqual({ valid: true });
    });
    it('reclaims only expired receiving claims and rejects every old-nonce transition', async () => {
        const f = fixture(); const started = await begin._handler(f.ctx, request);
        const fileIndex = (await status._handler(f.ctx, { attemptId: started.attemptId })).files.find(file => file.kind === 'binary')!.index;
        const args = { attemptId: started.attemptId, fileIndex, expectedHash: hash('binary'), secret };
        const original = await claimUpload._handler(f.ctx, args);
        const oldReceipt = { attemptId: started.attemptId, fileIndex, nonce: original.nonce, secret };
        await expect(claimUpload._handler(f.ctx, args)).rejects.toThrow('CLOUD_IMPORT_CLAIM_CHANGED');
        now += 120_000;
        const replacement = await claimUpload._handler(f.ctx, args);
        expect(replacement.nonce).not.toBe(original.nonce);
        await expect(markSending._handler(f.ctx, oldReceipt)).rejects.toThrow('CLOUD_IMPORT_CLAIM_CHANGED');
        await expect(failUpload._handler(f.ctx, { ...oldReceipt, outcome: 'not-sent' })).rejects.toThrow('CLOUD_IMPORT_CLAIM_CHANGED');
        await expect(receive(f, oldReceipt)).rejects.toThrow('CLOUD_IMPORT_CLAIM_CHANGED');
        const receipt = { ...oldReceipt, nonce: replacement.nonce };
        expect(await markSending._handler(f.ctx, receipt)).toBe(true);
        now += 120_000;
        await expect(claimUpload._handler(f.ctx, args)).rejects.toThrow('CLOUD_IMPORT_CLAIM_CHANGED');
        await failUpload._handler(f.ctx, { ...receipt, outcome: 'unknown' });
        await expect(claimUpload._handler(f.ctx, args)).rejects.toThrow('CLOUD_IMPORT_CLAIM_CHANGED');
        expect(await receive(f, receipt)).toEqual({ valid: true });
        expect(f.generatedUrls()).toBe(2);
    });
    it('retains mismatched owned storage for cleanup but refuses another ID and foreign storage', async () => {
        const f = fixture(); const active = await ready(f);
        const id = f.blob('_storage:mismatch', 7);
        expect(await receive(f, active.receipt, id)).toEqual({ valid: false });
        await expect(receive(f, active.receipt, f.blob('_storage:second'))).rejects.toThrow('CLOUD_IMPORT_RECEIPT_CHANGED');
        await expect(finalize._handler(f.ctx, active)).rejects.toThrow('CLOUD_IMPORT_INCOMPLETE');
        now += DAY; await _collect._handler(f.ctx, { attemptId: active.attemptId });
        expect(f.deleted).toEqual([id]);
        expect(f.get('_storage:second')).not.toBeNull();
        const other = fixture(); const second = await ready(other);
        const foreign = other.blob('_storage:foreign');
        other.put('cloudEditorFiles', 'cloudEditorFiles:foreign', { storageId: foreign });
        await expect(receive(other, second.receipt, foreign)).rejects.toThrow('CLOUD_IMPORT_FOREIGN_STORAGE');
        now += DAY; await _collect._handler(other.ctx, { attemptId: second.attemptId });
        expect(other.deleted).toEqual([]);
    });
    it('retains unknown upload identity after expiry and collects only a later owned receipt', async () => {
        const f = fixture(); const active = await ready(f);
        await failUpload._handler(f.ctx, { ...active.receipt, outcome: 'unknown' });
        now += DAY; await _collect._handler(f.ctx, { attemptId: active.attemptId });
        expect(f.deleted).toEqual([]);
        expect([...f.table('cloudEditorImportFiles').values()][0]?.state).toBe('unknown');
        expect(await receive(f, active.receipt)).toEqual({ valid: false });
        await _collect._handler(f.ctx, { attemptId: active.attemptId });
        expect(f.deleted).toEqual(['_storage:one']);
        await expect(finalize._handler(f.ctx, active)).rejects.toThrow('CLOUD_IMPORT_EXPIRED');
    });
});

describe('import finalization and retention ordering', () => {
    it('retains and serves uploads with current Base64 storage checksums', async () => {
        const f = fixture(); const active = await ready(f);
        const storageId = f.blob('_storage:one', 6, createHash('sha256').update('binary').digest('base64'));
        expect(await receive(f, active.receipt, storageId)).toEqual({ valid: true });
        const scope = await finalize._handler(f.ctx, active);
        const args = { ...scope, path: 'public/movie.mp4', expectedHash: hash('binary'), secret };
        expect(await _asset._handler(f.ctx, args)).toEqual({ url: 'https://storage.example/asset', bytes: 6, hash: hash('binary') });
        f.get('_storage:one')!.sha256 = createHash('sha256').update('changed').digest('base64');
        await expect(_asset._handler(f.ctx, args)).rejects.toThrow('CLOUD_IMPORT_ASSET_CHANGED');
    });
    it('creates the existing source-only project graph once and retains the pristine baseline', async () => {
        const f = fixture(); const active = await ready(f); await receive(f, active.receipt);
        const result = await finalize._handler(f.ctx, active);
        expect(await finalize._handler(f.ctx, active)).toEqual(result);
        expect(f.table('projects').size).toBe(1);
        expect([...f.table('cloudEditorStates').values()][0]?.profile).toBe('imported-source-v1');
        expect(f.table('frames').size).toBe(2);
        now += DAY; f.table('cloudEditorFiles').clear();
        await _collect._handler(f.ctx, { attemptId: active.attemptId });
        expect(f.deleted).toEqual([]);
        expect(f.get(active.attemptId)?.state).toBe('finalized');
    });
    it('rechecks metadata and project quota before any graph write', async () => {
        const f = fixture(); const active = await ready(f); await receive(f, active.receipt);
        f.get('_storage:one')!.sha256 = '0'.repeat(64);
        await expect(finalize._handler(f.ctx, active)).rejects.toThrow('CLOUD_IMPORT_ASSET_CHANGED');
        expect(f.table('projects').size).toBe(0);
        f.get('_storage:one')!.sha256 = hash('binary');
        for (let index = 0; index < 3; index++) f.put('cloudEditorStates', `cloudEditorStates:${index}`, { workspaceId });
        await expect(finalize._handler(f.ctx, active)).rejects.toThrow('CLOUD_PROJECT_LIMIT');
        expect(f.table('projects').size).toBe(0);
    });
    it('rejects finalize after cleanup and keeps referenced blobs even on expired imports', async () => {
        const f = fixture(); const active = await ready(f); await receive(f, active.receipt);
        f.put('cloudReleaseAssets', 'cloudReleaseAssets:retained', { storageId: '_storage:one' });
        now += DAY; await _collect._handler(f.ctx, { attemptId: active.attemptId });
        expect(f.deleted).toEqual([]);
        await expect(finalize._handler(f.ctx, active)).rejects.toThrow('CLOUD_IMPORT_EXPIRED');
        expect(f.table('projects').size).toBe(0);
    });
    it('serves exact saved assets only to current scoped builders through the server', async () => {
        const f = fixture(); const active = await ready(f); await receive(f, active.receipt);
        const scope = await finalize._handler(f.ctx, active);
        const args = { ...scope, path: 'public/movie.mp4', expectedHash: hash('binary'), secret };
        expect(await _asset._handler(f.ctx, args)).toEqual({ url: 'https://storage.example/asset', bytes: 6, hash: hash('binary') });
        await expect(_asset._handler(f.ctx, { ...args, expectedHash: '0'.repeat(64) })).rejects.toThrow('CLOUD_IMPORT_ASSET_CHANGED');
        await expect(_asset._handler(f.ctx, { ...args, secret: 'b'.repeat(64) })).rejects.toThrow('CLOUD_IMPORT_SERVER_REQUIRED');
        f.signIn('other');
        await expect(_asset._handler(f.ctx, args)).rejects.toThrow();
        f.signIn('builder');
        f.put('cloudEditorGrants', 'cloudEditorGrants:restricted', { projectId: scope.projectId, userId: 'users:builder', role: 'content' });
        await expect(_asset._handler(f.ctx, args)).rejects.toThrow('CLOUD_ROLE_REQUIRED');
    });
    it('keeps imported snapshots builder-scoped and refuses legacy media transport even for builders', async () => {
        const f = fixture(); const active = await ready(f); await receive(f, active.receipt);
        const scope = await finalize._handler(f.ctx, active);
        const args = { ...scope, path: 'public/movie.mp4', expectedHash: hash('binary') };
        const saved = await snapshot._handler(f.ctx, scope);
        expect(saved.profile).toBe('imported-source-v1');
        expect(saved.files.find(file => file.path === 'src/app/page.tsx')?.text).toBe(source);
        expect(saved.files.find(file => file.path === args.path)).toMatchObject({
            storageId: null, bytes: 6, hash: hash('binary'),
        });
        expect(saved.files.every(file => file.storageId === null)).toBe(true);
        await expect(editorAsset._handler(f.ctx, args)).rejects.toThrow('CLOUD_CONTENT_PROFILE_UNSUPPORTED');

        f.put('projectMembers', 'projectMembers:other', { projectId: scope.projectId, userId: 'users:other', role: 'editor' });
        f.put('cloudEditorGrants', 'cloudEditorGrants:other', { projectId: scope.projectId, userId: 'users:other', role: 'designer' });
        f.signIn('other');
        expect((await snapshot._handler(f.ctx, scope)).files).toEqual(saved.files);
        await expect(editorAsset._handler(f.ctx, args)).rejects.toThrow('CLOUD_CONTENT_PROFILE_UNSUPPORTED');

        f.get('cloudEditorGrants:other')!.role = 'content';
        await expect(snapshot._handler(f.ctx, scope)).rejects.toThrow('CLOUD_ROLE_REQUIRED');
        await expect(editorAsset._handler(f.ctx, args)).rejects.toThrow('CLOUD_ROLE_REQUIRED');

        f.get('cloudEditorGrants:other')!.role = 'designer';
        f.get('projectMembers:other')!.role = 'viewer';
        await expect(snapshot._handler(f.ctx, scope)).rejects.toThrow('CLOUD_ROLE_REQUIRED');
        await expect(editorAsset._handler(f.ctx, args)).rejects.toThrow('CLOUD_ROLE_REQUIRED');

        f.get('projectMembers:other')!.role = 'editor';
        f.table('cloudEditorGrants').delete('cloudEditorGrants:other');
        await expect(snapshot._handler(f.ctx, scope)).rejects.toThrow('CLOUD_ROLE_REQUIRED');
        await expect(editorAsset._handler(f.ctx, args)).rejects.toThrow('CLOUD_ROLE_REQUIRED');

        f.put('cloudEditorGrants', 'cloudEditorGrants:other', { projectId: scope.projectId, userId: 'users:other', role: 'designer' });
        f.table('projectMembers').delete('projectMembers:other');
        await expect(snapshot._handler(f.ctx, scope)).rejects.toThrow('FORBIDDEN: project.view');
        await expect(editorAsset._handler(f.ctx, args)).rejects.toThrow('FORBIDDEN: project.view');
    });
    it('registers raw storage URL resolution as internal only', () => {
        expect(Reflect.get(getFileUrl, 'isInternal')).toBe(true);
        expect(Reflect.get(getFileUrl, 'isPublic')).toBeUndefined();
    });
});
