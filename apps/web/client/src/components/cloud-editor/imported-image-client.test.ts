import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { ImportedImageClient, readImportedImageDraft, type ImageInspectionTarget } from './imported-image-client';
import type { CloudImagePrepareTarget } from '@/components/store/editor/sandbox/cloud-source';

const normalized = Buffer.from('normalized-image'), hash = createHash('sha256').update(normalized).digest('hex');
const asset = { path: 'public/media/about/hero.webp', hash: 'b'.repeat(64), bytes: 100 };
const target = { projectId: 'project', branchId: 'branch', actorId: 'actor', expectedRevision: 4, operationId: 'image-operation-001',
    pin: { version: 2, path: 'src/content/about.ts', generation: 1, designRevision: 3, fingerprint: 'a'.repeat(64), binding: {
        bindingId: 'about', target: { kind: 'object-image', exportName: 'aboutHero', srcProperty: 'imageSrc', altProperty: 'imageAlt' },
        fields: ['src', 'alt'], allowImageUploads: true, originalAsset: asset, aspectRatio: { width: 16, height: 9 }, allowedAssets: [asset],
        renderMapping: { version: 1, kind: 'object-prop-image', mappingId: 'about', callsite: { path: 'src/About.tsx', exportName: 'About', oid: 'about' },
            renderer: { path: 'src/PageHero.tsx', exportName: 'PageHero', oid: 'image' } },
    } },
} as CloudImagePrepareTarget;
const inspect: ImageInspectionTarget = { projectId: target.projectId, branchId: target.branchId, actorId: target.actorId,
    expectedRevision: target.expectedRevision, path: asset.path, expectedHash: asset.hash };
const inspection = { path: asset.path, hash: asset.hash, bytes: asset.bytes, width: 160, height: 90, proof: 'f'.repeat(64) };
const prepared = { attemptId: 'attempt', assetPath: `public/weblab-upload-${hash}.webp`, hash, width: 160, height: 90, bytes: normalized.toString('base64') };
const file = () => new File(['input'], 'photo.webp', { type: 'image/webp' });
function fixture(options: Partial<ConstructorParameters<typeof ImportedImageClient>[0]> = {}) {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const controller = new AbortController(); let tokens = 0;
    const client = new ImportedImageClient({ session: { getToken: async () => { tokens++; return 'captured-session-token'; } }, current: () => true, signal: controller.signal,
        fetch: async (url, init) => { calls.push({ url, init }); return Response.json(url.endsWith('/inspect') ? inspection : prepared); }, ...options });
    return { client, calls, controller, tokens: () => tokens };
}

describe('captured imported image HTTP client', () => {
    it('uses the captured default Clerk bearer and private v2 transport for both requests', async () => {
        const f = fixture();
        expect(await f.client.inspect(inspect, 100)).toEqual(inspection);
        const uploaded = await f.client.prepare(target, file(), () => true);
        expect(String(uploaded.attemptId)).toBe('attempt'); expect(uploaded.assetPath).toBe(prepared.assetPath);
        expect(uploaded.hash).toBe(hash); expect(uploaded.bytes).toEqual(new Uint8Array(normalized));
        expect(f.tokens()).toBe(2);
        for (const call of f.calls) {
            const headers = new Headers(call.init.headers);
            expect(headers.get('authorization')).toBe('Bearer captured-session-token'); expect(headers.get('x-weblab-image-protocol')).toBe('2');
            expect(call.init.credentials).toBe('omit'); expect(call.init.redirect).toBe('error'); expect(call.init.cache).toBe('no-store'); expect(call.init.signal).toBe(f.controller.signal);
        }
        expect(f.calls[0]!.url).toBe('/api/cloud-editor/images/inspect'); expect(JSON.parse(f.calls[0]!.init.body as string)).toEqual(inspect);
        expect(new Headers(f.calls[0]!.init.headers).get('content-type')).toBe('application/json');
        expect(JSON.parse(new Headers(f.calls[1]!.init.headers).get('x-weblab-image-target')!)).toEqual(target);
        expect(new Headers(f.calls[1]!.init.headers).get('content-type')).toBe('application/octet-stream');
    });
    it('does not dispatch after account or selection changes while the initiating token resolves', async () => {
        for (const upload of [false, true]) {
            let current = true, finish!: (token: string) => void;
            const f = fixture({ current: () => current, session: { getToken: () => new Promise(resolve => { finish = resolve; }) } });
            const pending = upload ? f.client.prepare(target, file(), () => true) : f.client.inspect(inspect, 100);
            current = false; finish('old-token');
            await expect(pending).rejects.toThrow('CLOUD_IMAGE_SELECTION_CHANGED'); expect(f.calls).toEqual([]);
        }
    });
    it('refuses absent sessions, cancelled work and expired source leases before dispatch', async () => {
        const missing = fixture({ session: { getToken: async () => null } });
        await expect(missing.client.inspect(inspect, 100)).rejects.toThrow('CLOUD_IMAGE_SESSION_CHANGED'); expect(missing.calls).toEqual([]);
        const cancelled = fixture(); cancelled.controller.abort();
        await expect(cancelled.client.inspect(inspect, 100)).rejects.toThrow('CLOUD_IMAGE_SELECTION_CHANGED'); expect(cancelled.tokens()).toBe(0);
        const stale = fixture(); await expect(stale.client.prepare(target, file(), () => false)).rejects.toThrow('CLOUD_IMAGE_SELECTION_CHANGED'); expect(stale.tokens()).toBe(0);
    });
    it('checks scope, bytes, dimensions and proof shape before returning inspection facts', async () => {
        for (const result of [{ ...inspection, path: 'public/other.webp' }, { ...inspection, hash }, { ...inspection, bytes: 101 },
            { ...inspection, width: 0 }, { ...inspection, proof: `${'a'.repeat(64)}\n` }, { ...inspection, url: 'https://storage.example/private' }]) {
            const f = fixture({ fetch: async () => Response.json(result) });
            await expect(f.client.inspect(inspect, 100)).rejects.toThrow('CLOUD_IMAGE_RESPONSE_INVALID');
        }
    });
    it('validates normalized hash, bounded bytes, ratio and immutable output path before handing off a write', async () => {
        for (const result of [{ ...prepared, assetPath: 'public/arbitrary.webp' }, { ...prepared, bytes: Buffer.from('wrong').toString('base64') },
            { ...prepared, width: 159 }, { ...prepared, attemptId: 'attempt\n' }, { ...prepared, storageId: 'untrusted' },
            { ...prepared, bytes: prepared.bytes + '\n' }]) {
            const f = fixture({ fetch: async () => Response.json(result) });
            await expect(f.client.prepare(target, file(), () => true)).rejects.toThrow('CLOUD_IMAGE_RESPONSE_INVALID');
        }
    });
    it('rejects oversized response streams and input images before any durable write', async () => {
        const tooLarge = fixture({ fetch: async () => new Response('x'.repeat(2049)) });
        await expect(tooLarge.client.inspect(inspect, 100)).rejects.toThrow('CLOUD_IMAGE_RESPONSE_INVALID');
        const invalid = fixture();
        await expect(invalid.client.prepare(target, new File([new Uint8Array(4_000_001)], 'photo.webp', { type: 'image/webp' }), () => true)).rejects.toThrow('CLOUD_IMAGE_INPUT_INVALID');
        expect(invalid.calls).toEqual([]);
    });
    it('rechecks selection after fetch and cancels the unread response', async () => {
        let current = true, cancelled = false;
        const f = fixture({ current: () => current, fetch: async () => {
            current = false;
            return new Response(new ReadableStream({ cancel() { cancelled = true; } }));
        } });
        await expect(f.client.inspect(inspect, 100)).rejects.toThrow('CLOUD_IMAGE_SELECTION_CHANGED'); expect(cancelled).toBe(true);
    });
    it('rechecks source lease after reading response bytes', async () => {
        let current = true;
        const f = fixture({ fetch: async () => new Response(new ReadableStream({ start(controller) {
            controller.enqueue(new TextEncoder().encode(JSON.stringify(prepared))); current = false; controller.close();
        } })) });
        await expect(f.client.prepare(target, file(), () => current)).rejects.toThrow('CLOUD_IMAGE_SELECTION_CHANGED');
    });
});

describe('image alt draft recovery without a live approval', () => {
    const identity = { projectId: target.projectId, branchId: target.branchId, actorId: target.actorId, mappingId: 'about', oid: 'image' };
    const draft = { pin: { ...target.pin, projectId: target.projectId, branchId: target.branchId, actorId: target.actorId },
        value: 'Unsaved alt text', previous: 'Original alt', revision: 4 };
    it('recovers the original immutable pin for copy/discard without consulting current grants or repinning', () => {
        const restored = readImportedImageDraft(JSON.stringify(draft), identity);
        expect(restored.value).toBe('Unsaved alt text'); expect(restored.pin.generation).toBe(1); expect(restored.revision).toBe(4);
        expect(Object.isFrozen(restored.pin)).toBe(true); expect(Object.isFrozen(restored.pin.binding)).toBe(true);
        expect(Object.keys(restored).sort()).toEqual(['pin', 'previous', 'revision', 'value']);
    });
    it('does not expose a draft to another actor, scope, image mapping or same-OID sibling', () => {
        for (const change of [{ actorId: 'other' }, { projectId: 'other' }, { branchId: 'other' }, { mappingId: 'security' }, { oid: 'other' }])
            expect(() => readImportedImageDraft(JSON.stringify(draft), { ...identity, ...change })).toThrow('Invalid image draft');
    });
    it('refuses malformed policy, extra authority, oversized or unsafe saved text', () => {
        for (const value of [{ ...draft, approved: true }, { ...draft, revision: 0 }, { ...draft, value: 'x'.repeat(1001) },
            { ...draft, value: 'bad\nalt' }, { ...draft, previous: '\ud800' }, { ...draft, pin: { ...draft.pin, fingerprint: `${'a'.repeat(64)}\n` } }])
            expect(() => readImportedImageDraft(JSON.stringify(value), identity)).toThrow('Invalid image draft');
        expect(() => readImportedImageDraft(' '.repeat(50_001), identity)).toThrow('Invalid image draft');
    });
});
