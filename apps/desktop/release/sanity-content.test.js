'use strict';

const { describe, test, expect } = require('bun:test');
const { SanityContentCoordinator, MAX_RESPONSE } = require('./sanity-content');
const { REQUEST_ACTIVE } = require('./authorize');
const { stable } = require('./sanity-site/contract');
const { PROFILE } = require('./sanity-site/profile');
const { materializeRuntime } = require('./sanity-site/runtime');

const H = (value) => value.repeat(64);
const SCOPE = { userId: 'owner', projectId: 'project', branchId: 'branch', rootPath: '/private/customer-copy' };
const PIN = { draftId: 'draft', expectedRevision: 2, providerRevision: 'provider-revision', archived: false };
function exported() {
    return { version: 1, userId: SCOPE.userId, connection: { id: 'connection', projectId: SCOPE.projectId, branchId: SCOPE.branchId,
        sanityProjectId: 'l45nowfu', dataset: 'production', profile: 'sanity-blog-v1', revision: 3 },
    drafts: [{ id: 'draft', documentId: 'post', originalJson: '{"original":true}', documentJson: '{"edited":true}',
        providerRevision: PIN.providerRevision, revision: 2, archived: false, updatedAt: 1 }] };
}
function fixture() {
    const data = new Map();
    const calls = { exports: 0, refresh: 0, captures: 0, installs: 0, resumes: 0, stops: [], reads: [], writes: [], discarded: [] };
    const state = { active: true, native: null, failInstall: false, exportValue: exported(), afterCapture: null,
        insideInstall: null, afterExport: null, stopResult: { success: true }, response: null };
    const input = { projectId: SCOPE.projectId, branchId: SCOPE.branchId, jwt: 'aaa.bbb.ccc', connectionId: 'connection', connectionRevision: 3,
        selections: [{ ...PIN }], [REQUEST_ACTIVE]: () => state.active };
    const statusInput = () => ({ projectId: input.projectId, branchId: input.branchId, jwt: input.jwt, [REQUEST_ACTIVE]: input[REQUEST_ACTIVE] });
    const artifact = { scope: { ...SCOPE }, manifestHash: H('a'), captureId: H('b'), contentHash: H('c'), draftHash: H('d'),
        sourceHash: H('e'), predecessor: null };
    const nativePins = () => ({ ...artifact, scope: { ...SCOPE } });
    const nativeMetadata = (status = 'complete') => ({ status, scope: { ...SCOPE }, manifestHash: artifact.manifestHash,
        captureId: artifact.captureId, contentHash: artifact.contentHash, draftHash: artifact.draftHash });
    const context = { binding: { userId: SCOPE.userId, projectId: SCOPE.projectId, branchId: SCOPE.branchId, root: SCOPE.rootPath },
        directory: '/private/release-store/project', refreshAccess: async () => { calls.refresh++; } };
    const store = {
        read: async (_directory, name, maxBytes = 1024 * 1024) => {
            calls.reads.push({ name, maxBytes });
            const bytes = data.get(name);
            if (bytes && bytes.length > maxBytes) throw new Error('Release storage file is unsafe.');
            return bytes ? Buffer.from(bytes) : null;
        },
        write: async (_directory, name, bytes, expected) => {
            const actual = data.get(name) ?? null;
            if (expected === null ? actual !== null : !actual?.equals(expected)) throw new Error('CAS conflict');
            data.set(name, Buffer.from(bytes)); calls.writes.push(name);
        },
    };
    const local = {
        stopDevServer: async (root) => { calls.stops.push(root); return state.stopResult; },
        inspectRetainedSanitySiteInstall: async () => state.native,
        readVerifiedSanitySiteSource: async () => ({ sourceFiles: [{ path: 'app/page.tsx', bytes: Buffer.from('source') }], predecessor: structuredClone(artifact.predecessor) }),
        installRetainedSanitySite: async (_root, _handle, _base, guard) => {
            calls.installs++;
            await state.insideInstall?.();
            await guard.assertCurrent(nativePins());
            guard.assertActive();
            state.native = nativeMetadata('pending');
            if (state.failInstall) throw new Error('Interrupted install');
            state.native = nativeMetadata();
        },
        resumeRetainedSanitySiteInstall: async (_root, _base, guard) => {
            calls.resumes++;
            await guard.assertCurrent(nativePins()); guard.assertActive();
            state.native = { ...nativeMetadata(), ...(guard.requiresPreparation ? { needsPreparation: true } : {}) };
        },
    };
    const engine = { PROFILE: { projectId: 'l45nowfu', dataset: 'production', apiVersion: '2025-02-19' },
        captureSite: async (request) => { calls.captures++; expect(request.scope).toEqual(SCOPE); await state.afterCapture?.(); return 'native-handle'; },
        getRetainedSiteArtifact: () => artifact, discardRetainedSiteArtifact: (handle) => calls.discarded.push(handle) };
    const fetchImpl = async (url, options) => {
        calls.exports++;
        expect(String(url)).toBe('https://beta.example.test/api/native/publishing/content');
        expect(options.method).toBe('POST'); expect(options.redirect).toBe('error'); expect(options.credentials).toBe('omit');
        expect(options.headers.Authorization).toBe(`Bearer ${input.jwt}`);
        const request = JSON.parse(options.body);
        expect(Object.keys(request).sort()).toEqual(['branchId', 'connectionId', 'connectionRevision', 'projectId', 'selections']);
        const value = structuredClone(state.exportValue);
        if (request.selections.length === 0) value.drafts = [];
        await state.afterExport?.(calls.exports);
        return state.response ?? new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
    };
    const restart = () => new SanityContentCoordinator({ appUrl: 'https://beta.example.test', store, local, engine, fetchImpl, now: () => 100 });
    return { coordinator: restart(), restart, context, input, statusInput, calls, state, data, artifact, nativeMetadata };
}

describe('native Sanity content coordinator', () => {
    test('captures only authorized draft pins, rechecks under installation, and exposes narrow status', async () => {
        const f = fixture();
        const result = await f.coordinator.prepare(f.input, f.context);
        expect(result.status).toBe('complete');
        expect(result.captureId).toMatch(/^[a-f0-9-]{36}$/);
        expect(result.selectedCount).toBe(1); expect(result.quoteFormUnavailable).toBe(true);
        expect(Object.keys(result).sort()).toEqual(['captureId', 'connectionId', 'connectionRevision', 'contentHash', 'draftHash', 'manifestHash', 'quoteFormUnavailable', 'selectedCount', 'selections', 'status']);
        expect(f.calls.exports).toBe(3); expect(f.calls.refresh).toBe(3);
        expect(f.calls.stops).toEqual([SCOPE.rootPath]); expect(f.calls.discarded).toEqual(['native-handle']);
        const stored = [...f.data.values()].map((bytes) => bytes.toString()).join('');
        expect(stored).not.toContain(f.input.jwt); expect(stored).not.toContain('originalJson'); expect(stored).not.toContain('documentJson');
    });

    test('does not accept renderer content bytes, duplicate selections or foreign authorization', async () => {
        const f = fixture();
        await expect(f.coordinator.prepare({ ...f.input, documentJson: '{}' }, f.context)).rejects.toThrow('unexpected content input');
        await expect(f.coordinator.prepare({ ...f.input, selections: [PIN, PIN] }, f.context)).rejects.toThrow('invalid selected');
        f.context.binding.userId = 'another-owner';
        await expect(f.coordinator.prepare(f.input, f.context)).rejects.toThrow('different actor');
        expect(f.calls.captures).toBe(0); expect(f.calls.writes).toEqual([]);
    });

    test('rejects changed full export after capture before saving any receipt', async () => {
        const f = fixture();
        f.state.afterCapture = () => { f.state.exportValue.drafts[0].documentJson = '{"changed":true}'; };
        await expect(f.coordinator.prepare(f.input, f.context)).rejects.toThrow('selected content changed');
        expect(f.calls.writes).toEqual([]); expect(f.calls.installs).toBe(0);
        expect(f.calls.discarded).toEqual(['native-handle']);
    });

    test('revoked access inside installer lease prevents mutation and leaves an exact prepared receipt', async () => {
        const f = fixture();
        f.state.insideInstall = () => { f.state.exportValue.connection.revision = 4; };
        await expect(f.coordinator.prepare(f.input, f.context)).rejects.toThrow('connection changed');
        expect(f.state.native).toBeNull();
        const status = await f.coordinator.status(f.statusInput(), f.context);
        expect(status.status).toBe('prepared');
        f.state.insideInstall = null; f.state.exportValue.connection.revision = 3;
        const priorReceipt = Buffer.from(f.data.get(`sanity-content-${f.artifact.manifestHash}.json`));
        const resumed = await f.coordinator.prepare(f.input, f.context);
        expect(resumed.captureId).toBe(status.captureId);
        expect(f.data.get(`sanity-content-${f.artifact.manifestHash}.json`).equals(priorReceipt)).toBe(true);
        expect(resumed.status).toBe('complete');
    });

    test('an explicit new preparation replaces stale prepared pins without overwriting immutable history', async () => {
        const f = fixture(); f.state.insideInstall = () => { throw new Error('Before pending'); };
        await expect(f.coordinator.prepare(f.input, f.context)).rejects.toThrow('Before pending');
        const oldHash = f.artifact.manifestHash;
        const oldReceipt = Buffer.from(f.data.get(`sanity-content-${oldHash}.json`));
        f.state.insideInstall = null;
        await expect(f.coordinator.resume(f.input, f.context)).rejects.toThrow('Prepare website content again');
        f.artifact.manifestHash = H('f');
        expect((await f.coordinator.prepare({ ...f.input, selections: [] }, f.context)).status).toBe('complete');
        expect(f.data.get(`sanity-content-${oldHash}.json`).equals(oldReceipt)).toBe(true);
        expect((await f.coordinator.status(f.statusInput(), f.context)).selectedCount).toBe(0);
        expect(f.calls.installs).toBe(2);
    });

    test('retains interrupted install, refuses replacement and resumes only identical pins after restart', async () => {
        const f = fixture(); f.state.failInstall = true;
        await expect(f.coordinator.prepare(f.input, f.context)).rejects.toThrow('Interrupted install');
        const before = [...f.data.entries()].map(([name, bytes]) => [name, bytes.toString()]);
        expect((await f.coordinator.status(f.statusInput(), f.context)).status).toBe('pending');
        await expect(f.coordinator.prepare(f.input, f.context)).rejects.toThrow('resume the pending');
        await expect(f.coordinator.resume({ ...f.input, connectionRevision: 4 }, f.context)).rejects.toThrow('exact retained');
        expect([...f.data.entries()].map(([name, bytes]) => [name, bytes.toString()])).toEqual(before);
        // The engine's opaque handle has already been discarded. Recovery uses only the native journal.
        expect(f.calls.discarded).toEqual(['native-handle']);
        f.coordinator = f.restart();
        expect((await f.coordinator.resume(f.input, f.context)).status).toBe('complete');
        expect(f.calls.resumes).toBe(1);
    });

    test('status never fetches content or stops preview and exposes only verified recapture admission', async () => {
        const f = fixture(); expect(await f.coordinator.status(f.statusInput(), f.context)).toEqual({ status: 'absent' });
        await f.coordinator.prepare(f.input, f.context);
        f.state.native = { ...f.nativeMetadata(), needsPreparation: true };
        const exports = f.calls.exports; const stops = f.calls.stops.length;
        expect((await f.coordinator.status(f.statusInput(), f.context)).status).toBe('needsPreparation');
        await expect(f.coordinator.resume(f.input, f.context)).rejects.toThrow('new content preparation');
        expect(f.calls.exports).toBe(exports); expect(f.calls.stops.length).toBe(stops);
    });

    test('stopping an owned preview must succeed before capture and never restarts it', async () => {
        const f = fixture(); f.state.stopResult = { error: 'Did not stop' };
        await expect(f.coordinator.prepare(f.input, f.context)).rejects.toThrow('preview must stop');
        expect(f.calls.captures).toBe(0); expect(f.calls.writes).toEqual([]); expect(f.calls.stops).toEqual([SCOPE.rootPath]);
    });

    test('foreign native scope or changed native evidence is refused before recovery', async () => {
        const f = fixture(); await f.coordinator.prepare(f.input, f.context);
        f.state.native = { ...f.nativeMetadata('pending'), contentHash: H('f') };
        await expect(f.coordinator.resume(f.input, f.context)).rejects.toThrow('native content pins changed');
        f.state.native = { ...f.nativeMetadata('pending'), scope: { ...SCOPE, rootPath: '/private/other-copy' } };
        await expect(f.coordinator.status(f.statusInput(), f.context)).rejects.toThrow('another actor');
        expect(f.calls.resumes).toBe(0);
    });

    test('invalid or oversized export responses fail before capture', async () => {
        for (const response of [new Response('{}', { headers: { 'content-type': 'text/html' } }),
            new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': String(MAX_RESPONSE + 1) } }),
            new Response(new Uint8Array([0xff]), { headers: { 'content-type': 'application/json' } })]) {
            const f = fixture(); f.state.response = response;
            await expect(f.coordinator.prepare(f.input, f.context)).rejects.toThrow('Website content:');
            expect(f.calls.captures).toBe(0); expect(f.calls.writes).toEqual([]);
        }
    });

    test('refuses cross-origin response identity and streamed overflow without a declared length', async () => {
        const foreign = new Response('{}', { headers: { 'content-type': 'application/json' } });
        Object.defineProperty(foreign, 'url', { value: 'https://another.example.test/api/native/publishing/content' });
        const overflow = new Response(new ReadableStream({ start(controller) {
            controller.enqueue(new Uint8Array(MAX_RESPONSE)); controller.enqueue(new Uint8Array(1)); controller.close();
        } }), { headers: { 'content-type': 'application/json' } });
        for (const response of [foreign, overflow]) {
            const f = fixture(); f.state.response = response;
            await expect(f.coordinator.prepare(f.input, f.context)).rejects.toThrow('Website content:');
            expect(f.calls.captures).toBe(0); expect(f.calls.writes).toEqual([]);
        }
    });

    test('does not trust server exports with another connection, revision, archive state or draft identity', async () => {
        const mutations = [(value) => { value.connection.sanityProjectId = 'other-project'; },
            (value) => { value.connection.profile = 'other-profile'; },
            (value) => { value.drafts[0].providerRevision = null; },
            (value) => { value.drafts[0].archived = true; },
            (value) => { value.drafts[0].id = 'another-draft'; }];
        for (const change of mutations) {
            const f = fixture(); change(f.state.exportValue);
            await expect(f.coordinator.prepare(f.input, f.context)).rejects.toThrow('Website content:');
            expect(f.calls.captures).toBe(0); expect(f.calls.writes).toEqual([]);
        }
    });

    test('renderer cancellation terminates a stalled export without saving content', async () => {
        const f = fixture();
        f.state.response = new Response(new ReadableStream({ pull: () => new Promise(() => {}) }), { headers: { 'content-type': 'application/json' } });
        const timer = setTimeout(() => { f.state.active = false; }, 20);
        try { await expect(f.coordinator.prepare(f.input, f.context)).rejects.toThrow('publishing window changed'); }
        finally { clearTimeout(timer); }
        expect(f.calls.captures).toBe(0); expect(f.calls.writes).toEqual([]);
    });

    test('receipt validation rejects unknown persisted fields and malformed predecessor paths', async () => {
        const f = fixture(); await f.coordinator.prepare(f.input, f.context);
        const receipt = JSON.parse(f.data.get(`sanity-content-${f.artifact.manifestHash}.json`).toString());
        expect(() => f.coordinator.validateReceipt({ ...receipt, jwt: 'secret' }, SCOPE)).toThrow('unexpected content input');
        const malformed = structuredClone(receipt);
        malformed.nativePins.predecessor = { manifestHash: H('f'), targets: [{ path: '../escape', sha256: H('a') }] };
        expect(() => f.coordinator.validateReceipt(malformed, SCOPE)).toThrow('predecessor target');
        expect(stable(receipt)).not.toContain('documentJson');
    });

    test('explicit retained recovery finishes exact bytes after draft drift and requires fresh preparation', async () => {
        const f = fixture(); f.state.failInstall = true;
        await expect(f.coordinator.prepare(f.input, f.context)).rejects.toThrow('Interrupted install');
        f.state.exportValue.drafts[0].revision = 3;
        f.state.exportValue.drafts[0].documentJson = '{"newer":true}';
        await expect(f.coordinator.resume(f.input, f.context)).rejects.toThrow('selected content changed');
        expect(f.calls.resumes).toBe(0);
        f.coordinator = f.restart();
        const recovered = await f.coordinator.resume({ ...f.input, recovery: true }, f.context);
        expect(recovered.status).toBe('needsPreparation');
        expect((await f.coordinator.status(f.statusInput(), f.context)).status).toBe('needsPreparation');
        await expect(f.coordinator.resume(f.input, f.context)).rejects.toThrow('new content preparation');
        f.state.failInstall = false; f.artifact.manifestHash = H('f');
        const current = { ...f.input, selections: [{ ...PIN, expectedRevision: 3 }] };
        expect((await f.coordinator.prepare(current, f.context)).status).toBe('complete');
        expect((await f.coordinator.status(f.statusInput(), f.context)).status).toBe('complete');
    });

    test('retained recovery still refuses changed connections and cannot recover an uninstalled receipt', async () => {
        const f = fixture(); f.state.failInstall = true;
        await expect(f.coordinator.prepare(f.input, f.context)).rejects.toThrow('Interrupted install');
        f.state.exportValue.connection.revision = 4;
        await expect(f.coordinator.resume({ ...f.input, recovery: true }, f.context)).rejects.toThrow('connection changed');
        expect(f.calls.resumes).toBe(0);
        f.state.native = null;
        await expect(f.coordinator.resume({ ...f.input, recovery: true }, f.context)).rejects.toThrow('Prepare website content again');
    });

    test('retains and repeatedly reads a full 1024-target predecessor through restart and resume', async () => {
        const f = fixture();
        const targets = materializeRuntime({}, H('0'), PROFILE.sourcePins).map((file) => ({ path: file.path, sha256: H('a') }));
        for (let index = targets.length; index < 1024; index++) {
            targets.push({ path: `public/weblab-frozen-sanity/${index.toString(16).padStart(64, '0')}.webp`, sha256: H('b') });
        }
        expect(targets.every((target) => target.path.length <= 128)).toBe(true);
        f.artifact.predecessor = { manifestHash: H('f'), targets };
        f.state.native = { ...f.nativeMetadata(), manifestHash: H('f') };
        f.state.failInstall = true;
        await expect(f.coordinator.prepare(f.input, f.context)).rejects.toThrow('Interrupted install');
        const receiptBytes = f.data.get(`sanity-content-${f.artifact.manifestHash}.json`);
        expect(receiptBytes.length).toBeGreaterThan(32 * 1024);
        expect(receiptBytes.length).toBeLessThan(512 * 1024);
        f.coordinator = f.restart();
        for (let index = 0; index < 3; index++) {
            expect((await f.coordinator.status(f.statusInput(), f.context)).status).toBe('pending');
        }
        expect((await f.coordinator.resume(f.input, f.context)).status).toBe('complete');
        expect((await f.coordinator.resume(f.input, f.context)).status).toBe('complete');
        expect((await f.coordinator.status(f.statusInput(), f.context)).status).toBe('complete');
        const reads = f.calls.reads.filter((read) => read.name === `sanity-content-${f.artifact.manifestHash}.json`);
        expect(reads.length).toBeGreaterThan(5);
        expect(reads.every((read) => read.maxBytes === 512 * 1024)).toBe(true);
        expect(f.calls.reads.filter((read) => read.name === 'sanity-content-active.json').every((read) => read.maxBytes === 1024)).toBe(true);
    });
});
