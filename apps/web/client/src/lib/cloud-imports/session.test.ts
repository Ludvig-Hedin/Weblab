import { describe, expect, it } from 'bun:test';
import { ConvexError } from 'convex/values';
import type { Id } from '@convex/_generated/dataModel';
import type { ImportStatus } from './api';
import { reviewImportFolder } from './manifest';
import { CloudImportSession, importRecoveryKey, readImportRecovery, type ImportAdapters, type ImportOwner, type ImportSessionState } from './session';

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function file(path: string, value = '') { const f = new File([value], path.split('/').at(-1)!); Object.defineProperty(f, 'webkitRelativePath', { value: path }); return f; }
const owner: ImportOwner = { backend: 'https://fixture.convex.cloud', actorId: 'users:one' as Id<'users'>, workspaceId: 'workspaces:one' as Id<'workspaces'>, userId: 'clerk-one', sessionId: 'session-one' };
class Storage {
    data = new Map<string, string>(); refuse = false;
    getItem(key: string) { return this.data.get(key) ?? null; }
    setItem(key: string, value: string) { if (this.refuse) throw new Error('quota'); this.data.set(key, value); }
    removeItem(key: string) { this.data.delete(key); }
}
async function fixture() {
    const review = await reviewImportFolder([file('site/package.json', '{"dependencies":{"next":"16"}}'), file('site/src/app/layout.tsx', 'layout source'),
        file('site/src/app/page.tsx', 'page source'), file('site/public/video.mp4', 'media bytes')], new AbortController().signal);
    const storage = new Storage(), events: string[] = [], uploads: number[] = [], operations: string[] = [];
    let row: ImportStatus | null = null, current = true, enabled = true, state: ImportSessionState | null = null;
    const io: ImportAdapters = {
        storage, current: () => current, enabled: () => enabled, changed: value => { state = value; }, completed: () => { events.push('navigate'); }, wait: async () => {},
        begin: async args => {
            events.push('begin'); operations.push(args.operationKey);
            expect(args.actorId).toBe(owner.actorId);
            row = { attemptId: 'cloudEditorImports:one' as Id<'cloudEditorImports'>, manifestHash: review.manifest!.manifestHash,
                name: args.name, bytes: review.manifest!.bytes, expiresAt: Date.now() + 100_000, state: 'open', projectId: null, branchId: null,
                files: args.files.map(({ path, kind, bytes, hash }, index) => ({ index, path, kind, bytes, hash, state: kind === 'text' ? 'received' : 'pending', valid: kind === 'text', canUpload: kind === 'binary' })) };
            return { attemptId: row.attemptId, manifestHash: row.manifestHash };
        },
        findAttempt: async () => { events.push('find'); return row; },
        status: async () => { events.push('status'); if (!row) throw new Error('missing'); return row; },
        upload: async args => { events.push('upload'); uploads.push(args.index); const f = row!.files[args.index]!; f.state = 'received'; f.valid = true; f.canUpload = false; },
        finalize: async () => { events.push('finalize'); row!.state = 'finalized'; row!.projectId = 'projects:one' as Id<'projects'>; row!.branchId = 'branches:one' as Id<'branches'>; return { projectId: row!.projectId, branchId: row!.branchId }; },
        cancel: async () => { events.push('cancel'); if (row!.state !== 'finalized') row!.state = 'expired'; return row!; },
    };
    const session = new CloudImportSession(owner, io);
    await session.initialize();
    return { session, io, review, storage, events, uploads, operations, state: () => state!, row: () => row!, setCurrent: (value: boolean) => { current = value; }, setEnabled: (value: boolean) => { enabled = value; },
        start: async () => { session.attach(review, 'Site'); await session.start('Site'); } };
}

describe('captured cloud import session', () => {
    it('admits one immutable attempt, uploads full manifest index and stores metadata only', async () => {
        const f = await fixture(), gate = deferred<void>(), original = f.io.begin;
        f.io.begin = async args => { await gate.promise; return original(args); };
        f.session.attach(f.review, 'Site'); const first = f.session.start('Site'); const second = f.session.start('Other'); gate.resolve(); await Promise.all([first, second]);
        expect(f.events.filter(event => event === 'begin')).toHaveLength(1);
        expect(f.uploads).toEqual([1]); expect(f.events.filter(event => event === 'finalize')).toHaveLength(1);
        const raw = f.storage.getItem(importRecoveryKey(owner))!;
        expect(raw).not.toContain('layout source'); expect(raw).not.toContain('media bytes'); expect(raw).not.toContain('session-one');
        expect((await readImportRecovery(raw)).projectId).toBe('projects:one' as Id<'projects'>);
    });
    it('reconciles a lost begin reply with the same operation and a lost upload reply with its receipt', async () => {
        const f = await fixture(), begin = f.io.begin, upload = f.io.upload;
        f.io.begin = async args => { await begin(args); throw new Error('lost begin'); };
        f.io.upload = async args => { await upload(args); throw new Error('lost upload'); };
        await f.start();
        expect(f.operations).toHaveLength(1); expect(f.events).toContain('find'); expect(f.uploads).toEqual([1]); expect(f.state().phase).toBe('complete');
    });
    it('never sends another upload for sending/unknown, even on repeated resume and progress checks', async () => {
        const f = await fixture();
        f.io.upload = async args => { f.uploads.push(args.index); const row = f.row().files[args.index]!; row.state = 'unknown'; row.canUpload = false; throw new Error('lost'); };
        await f.start(); await f.session.check(); await f.session.resume();
        expect(f.uploads).toEqual([1]); expect(f.events).not.toContain('finalize'); expect(f.state().phase).toBe('uncertain');
    });
    it('persists cancellation while begin is unresolved and cancels its eventual attempt before upload', async () => {
        const f = await fixture(), gate = deferred<void>(), begin = f.io.begin;
        f.io.begin = async args => { await gate.promise; return begin(args); };
        f.session.attach(f.review, 'Site'); const running = f.session.start('Site'); await f.session.cancel(); gate.resolve(); await running;
        expect(f.events).toContain('cancel'); expect(f.uploads).toEqual([]); expect(f.events).not.toContain('finalize'); expect(f.state().phase).toBe('canceled');
    });
    it('lets a finalized receipt win a simultaneous cancel without deleting the project', async () => {
        const f = await fixture(), gate = deferred<void>(), entered = deferred<void>(), finalize = f.io.finalize;
        f.io.finalize = async args => { entered.resolve(); await gate.promise; return finalize(args); };
        const running = f.start(); await entered.promise; await f.session.cancel(); gate.resolve(); await running;
        expect(f.state().phase).toBe('complete'); expect(f.events).not.toContain('cancel'); expect(f.events).toContain('navigate');
    });
    it('detaches at an account or unmount boundary and later recovers without uploading on load', async () => {
        const f = await fixture(), gate = deferred<void>(), begin = f.io.begin;
        f.io.begin = async args => { await gate.promise; return begin(args); };
        const running = f.start(); f.setCurrent(false); f.session.dispose(); gate.resolve(); await running;
        expect(f.uploads).toEqual([]); expect(f.events).not.toContain('finalize'); expect(f.events).not.toContain('navigate');
        f.setCurrent(true); const recovered = new CloudImportSession({ ...owner, sessionId: 'session-two' }, f.io); await recovered.initialize();
        expect(f.uploads).toEqual([]); expect(f.state().phase).toBe('needs-folder');
        const changed = { ...f.review, manifest: { ...f.review.manifest!, manifestHash: 'f'.repeat(64) } };
        expect(() => recovered.attach(changed, 'Site')).toThrow('CLOUD_IMPORT_RETRY_CHANGED');
        recovered.attach(f.review, 'Site'); await recovered.resume(); expect(f.state().phase).toBe('complete');
    });
    it('can finalize acknowledged files after reload without the folder and show recovery when creation is disabled', async () => {
        const f = await fixture(); f.io.finalize = async () => { throw new Error('lost finalize before commit'); }; await f.start();
        const recovered = new CloudImportSession(owner, f.io); await recovered.initialize();
        f.io.finalize = async () => ({ projectId: 'projects:recovered' as Id<'projects'>, branchId: 'branches:recovered' as Id<'branches'> });
        await recovered.resume(); expect(f.uploads).toEqual([1]); expect(f.state().phase).toBe('complete');
        f.row().state = 'finalized'; f.row().projectId = 'projects:recovered' as Id<'projects'>; f.row().branchId = 'branches:recovered' as Id<'branches'>;
        f.setEnabled(false); await new CloudImportSession(owner, f.io).initialize(); expect(f.state().phase).toBe('complete');
    });
    it('blocks persistence failure and refuses mismatched receipts or invalid received assets', async () => {
        const f = await fixture(); f.storage.refuse = true; await f.start(); expect(f.events).toEqual([]);
        const mismatch = await fixture(), begin = mismatch.io.begin;
        mismatch.io.begin = async args => { const r = await begin(args); mismatch.row().files[0]!.hash = 'f'.repeat(64); return r; };
        await mismatch.start(); expect(mismatch.uploads).toEqual([]); expect(mismatch.state().error).toBe('CLOUD_IMPORT_RETRY_CHANGED');
        const invalid = await fixture(); invalid.io.upload = async args => { invalid.row().files[args.index]!.state = 'received'; invalid.row().files[args.index]!.valid = false; };
        await invalid.start(); expect(invalid.events).not.toContain('finalize'); expect(invalid.state().error).toBe('CLOUD_IMPORT_ASSET_CHANGED');
    });
    it('retains the original key on a quota refusal and validates recovery metadata against its digest', async () => {
        const f = await fixture(); f.io.begin = async () => { throw new Error('CLOUD_PROJECT_LIMIT'); }; await f.start();
        const raw = f.storage.getItem(importRecoveryKey(owner))!, r = await readImportRecovery(raw);
        await f.session.resume(); expect((await readImportRecovery(f.storage.getItem(importRecoveryKey(owner))!)).operationKey).toBe(r.operationKey);
        await expect(readImportRecovery(JSON.stringify({ ...r, files: [{ ...r.files[0], text: 'source' }, ...r.files.slice(1)] }))).rejects.toThrow('RECOVERY_INVALID');
        await expect(readImportRecovery(JSON.stringify({ ...r, manifestHash: 'a'.repeat(64) }))).rejects.toThrow('RECOVERY_INVALID');
    });
    it('allows cancellation of a definite first refusal, but never infers that from a later refusal or null lookup', async () => {
        const definite = await fixture(); definite.io.begin = async () => { throw new ConvexError('CLOUD_PROJECT_LIMIT'); };
        await definite.start(); await definite.session.cancel(); expect(definite.state().phase).toBe('canceled');
        definite.session.resetCanceled(); expect(definite.storage.data.size).toBe(0);
        const uncertain = await fixture(); uncertain.io.begin = async () => { throw new Error('lost response'); };
        await uncertain.start(); uncertain.io.begin = async () => { throw new ConvexError('CLOUD_PROJECT_LIMIT'); };
        await uncertain.session.resume(); await uncertain.session.cancel(); expect(uncertain.state().phase).toBe('uncertain');
        uncertain.session.resetCanceled(); expect(uncertain.storage.data.size).toBe(1);
    });
    it('does not overwrite malformed local recovery with a new folder or request', async () => {
        const f = await fixture(); f.storage.data.set(importRecoveryKey(owner), '{broken');
        const recovered = new CloudImportSession(owner, f.io); await recovered.initialize();
        expect(() => recovered.attach(f.review, 'Site')).toThrow('CLOUD_IMPORT_RECOVERY_INVALID');
        await recovered.start('Site'); expect(f.events).toEqual([]);
        expect(f.storage.getItem(importRecoveryKey(owner))).toBe('{broken');
    });
});
