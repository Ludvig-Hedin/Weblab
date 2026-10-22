import { describe, expect, it } from 'bun:test';
import { imageHash, validImageMetadataProof } from '@convex/lib/cloudContentImage';
import {
    createImageInspectionV2Handler, createImageUploadV2Handler, imageBearerToken,
    type ImageInspectionDependenciesV2, type ImageInspectionTargetV2, type ImageUploadDependenciesV2, type ImageUploadTargetV2,
} from './transport-v2';
import type { ImportSessionVerifier } from '@/lib/cloud-imports/auth';

const site = 'https://weblab.example', secret = 's'.repeat(64), convexUrl = 'https://test.convex.cloud';
const attemptId = 'attempt-1' as Awaited<ReturnType<ImageUploadDependenciesV2['reserve']>>;
const normalized = Buffer.from('normalized-webp'), original = Buffer.from('saved-image');
const originalHash = imageHash(original);
const asset = { path: 'public/media/about/hero.webp', hash: originalHash, bytes: original.length };
const target = {
    projectId: 'project-1', branchId: 'branch-1', actorId: 'actor-1', expectedRevision: 7, operationId: 'image_operation_0001',
    pin: { version: 2, path: 'src/content/about.ts', generation: 2, designRevision: 3, fingerprint: 'a'.repeat(64), binding: {
        bindingId: 'about-hero', target: { kind: 'object-image', exportName: 'aboutHero', srcProperty: 'imageSrc', altProperty: 'imageAlt' },
        fields: ['src', 'alt'], allowImageUploads: true, originalAsset: asset, aspectRatio: { width: 16, height: 9 }, allowedAssets: [asset],
        renderMapping: { version: 1, kind: 'object-prop-image', mappingId: 'about-hero',
            callsite: { path: 'src/components/About.tsx', exportName: 'About', oid: 'about-instance' },
            renderer: { path: 'src/components/PageHero.tsx', exportName: 'PageHero', oid: 'hero-image' } },
    } },
} as ImageUploadTargetV2;
const inspectTarget = { projectId: target.projectId, branchId: target.branchId, actorId: target.actorId,
    expectedRevision: target.expectedRevision, path: asset.path, expectedHash: originalHash } satisfies ImageInspectionTargetV2;
const verify: ImportSessionVerifier = async () => ({ status: 'signed-in', tokenType: 'session_token',
    toAuth: () => ({ userId: 'clerk-actor', getToken: async () => 'captured-convex-token' }) });
function request(kind: 'upload' | 'inspect', options: { body?: BodyInit; headers?: Record<string, string>; signal?: AbortSignal } = {}) {
    return new Request(`http://internal:8080/api/cloud-editor/images${kind === 'inspect' ? '/inspect' : ''}?__clerk_db_jwt=ignored`, {
        method: 'POST', body: options.body ?? (kind === 'inspect' ? JSON.stringify(inspectTarget) : 'raw-image'), signal: options.signal,
        headers: { origin: site, authorization: 'Bearer captured.session.signature', cookie: '__session=other-account',
            'x-weblab-image-protocol': '2', 'content-type': kind === 'inspect' ? 'application/json' : 'application/octet-stream',
            ...(kind === 'upload' ? { 'x-weblab-image-target': JSON.stringify(target) } : {}), ...options.headers },
        duplex: 'half',
    } as RequestInit);
}
function upload(overrides: Partial<ImageUploadDependenciesV2> = {}) {
    const calls: Array<{ stage: string; token: string; args: unknown }> = [];
    const deps: ImageUploadDependenciesV2 = { siteUrl: site, secret, verify,
        reserve: async (args, token) => { calls.push({ stage: 'reserve', token, args }); return attemptId; },
        prepare: async (args, token) => {
            calls.push({ stage: 'prepare', token, args });
            expect(validImageMetadataProof(secret, { kind: 'upload', attemptId, hash: imageHash(normalized), bytes: normalized.length, width: 160, height: 90 }, args.proof)).toBe(true);
            return { attemptId, assetPath: `public/weblab-upload-${imageHash(normalized)}.webp`, hash: imageHash(normalized), width: 160, height: 90 };
        },
        cancel: async (args, token) => { calls.push({ stage: 'cancel', token, args }); return null; },
        decode: async () => ({ bytes: normalized, width: 160, height: 90 }), ...overrides,
    };
    return { handler: createImageUploadV2Handler(deps), calls, deps };
}
function inspection(overrides: Partial<ImageInspectionDependenciesV2> = {}) {
    const calls: Array<{ token: string; args: unknown }> = [];
    let fetched = 0, decoded = 0;
    const deps: ImageInspectionDependenciesV2 = { siteUrl: site, secret, convexUrl, verify,
        asset: async (args, token) => { calls.push({ token, args }); return { url: `${convexUrl}/api/storage/saved-asset`, hash: originalHash, bytes: original.length }; },
        fetch: async (url, init) => {
            fetched++; expect(url).toBe(`${convexUrl}/api/storage/saved-asset`);
            expect(init?.credentials).toBe('omit'); expect(init?.redirect).toBe('error'); expect(init?.cache).toBe('no-store');
            expect(init?.headers).toBeUndefined(); expect(init?.signal).toBeDefined();
            return new Response(original, { headers: { 'content-length': String(original.length) } });
        },
        inspect: async bytes => { decoded++; expect(bytes.equals(original)).toBe(true); return { width: 160, height: 90 }; }, ...overrides,
    };
    return { handler: createImageInspectionV2Handler(deps), calls, deps, fetched: () => fetched, decoded: () => decoded };
}

describe('captured image bearer', () => {
    it('validates only the supplied bearer against canonical HEAD without cookies or proxy auth', async () => {
        const input = request('upload', { headers: { 'x-clerk-auth-status': 'signed-in', 'x-forwarded-host': 'evil.example' } });
        expect(await imageBearerToken(input, site, async (canonical, options) => {
            expect(canonical.url).toBe(`${site}/api/cloud-editor/images`); expect(canonical.method).toBe('HEAD'); expect(canonical.body).toBeNull();
            expect([...canonical.headers.keys()].sort()).toEqual(['authorization', 'origin']);
            expect(canonical.headers.get('authorization')).toBe('Bearer captured.session.signature');
            expect(options).toEqual({ acceptsToken: 'session_token', authorizedParties: [site] });
            return verify(canonical, options);
        })).toBe('captured-convex-token');
        expect(input.bodyUsed).toBe(false);
    });
    it('never falls back to cookies for missing or malformed bearer, including both routes', async () => {
        for (const authorization of ['', 'Basic token', 'Bearer ', 'Bearer one two', 'Bearer one,Bearer two']) {
            const noVerify: ImportSessionVerifier = async () => { throw new Error('Must not verify cookies'); };
            expect((await upload({ verify: noVerify }).handler(request('upload', { headers: { authorization } }))).status).toBe(401);
            expect((await inspection({ verify: noVerify }).handler(request('inspect', { headers: { authorization } }))).status).toBe(401);
        }
    });
    it('refuses unknown or absent v2 protocol and foreign origins before authentication', async () => {
        let verified = 0;
        const deps = { verify: async (...args: Parameters<ImportSessionVerifier>) => { verified++; return verify(...args); } };
        for (const kind of ['upload', 'inspect'] as const) {
            const handler = kind === 'upload' ? upload(deps).handler : inspection(deps).handler;
            for (const protocol of ['', '1', '3', '2, 1']) expect((await handler(request(kind, { headers: { 'x-weblab-image-protocol': protocol } }))).status).toBe(400);
            expect((await handler(request(kind, { headers: { origin: 'https://evil.example' } }))).status).toBe(403);
        }
        expect(verified).toBe(0);
    });
});

describe('v2 image upload boundary', () => {
    it('reserves first, signs normalized dimensions and forwards one captured token throughout', async () => {
        const fixture = upload({ decode: async (_input, limits) => {
            expect(fixture.calls.map(call => call.stage)).toEqual(['reserve']); expect(limits).toEqual({ maxBytes: 600_000, maxPixels: 16_000_000 });
            return { bytes: normalized, width: 160, height: 90 };
        } });
        const response = await fixture.handler(request('upload'));
        expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(await response.json()).toEqual({ attemptId, assetPath: `public/weblab-upload-${imageHash(normalized)}.webp`, hash: imageHash(normalized), width: 160, height: 90, bytes: normalized.toString('base64') });
        expect(fixture.calls.map(call => [call.stage, call.token])).toEqual([['reserve', 'captured-convex-token'], ['prepare', 'captured-convex-token']]);
    });
    it('refuses unbounded or extra pin metadata before reservation', async () => {
        const fixture = upload();
        for (const value of [{ ...target, url: 'https://evil.example' }, { ...target, pin: { ...target.pin, extra: true } },
            { ...target, actorId: 'actor\n' }, { ...target, pin: { ...target.pin, fingerprint: `${'a'.repeat(64)}\n` } }]) {
            expect((await fixture.handler(request('upload', { headers: { 'x-weblab-image-target': JSON.stringify(value) } }))).status).toBe(400);
        }
        expect((await fixture.handler(request('upload', { headers: { 'x-weblab-image-target': 'a'.repeat(32769) } }))).status).toBe(400);
        expect(fixture.calls).toEqual([]);
    });
    it('cancels only the captured actor attempt for decode, input bound and ratio failures', async () => {
        for (const decode of [async () => { throw new Error('Malformed image'); }, async () => ({ bytes: normalized, width: 16, height: 10 })]) {
            const fixture = upload({ decode }); expect((await fixture.handler(request('upload'))).status).toBe(400);
            expect(fixture.calls.map(call => call.stage)).toEqual(['reserve', 'cancel']);
            expect(fixture.calls[1]).toEqual({ stage: 'cancel', token: 'captured-convex-token', args: { attemptId, actorId: target.actorId } });
        }
        const fixture = upload({ decode: async () => { throw new Error('Must not decode'); } });
        expect((await fixture.handler(request('upload', { body: new Uint8Array(4_000_001) }))).status).toBe(400);
        expect(fixture.calls.map(call => call.stage)).toEqual(['reserve', 'cancel']);
    });
    it('cancels a preparation that fails or returns mismatched normalized facts', async () => {
        const fixture = upload({ prepare: async () => ({ attemptId, assetPath: 'public/wrong.webp', hash: 'a'.repeat(64), width: 160, height: 90 }) });
        expect((await fixture.handler(request('upload'))).status).toBe(400);
        expect(fixture.calls.at(-1)?.stage).toBe('cancel');
    });
    it('aborts a pending preparation and cancels with the initiating actor and token', async () => {
        const abort = new AbortController();
        let started!: () => void;
        const preparing = new Promise<void>(resolve => { started = resolve; });
        let finish!: (value: Awaited<ReturnType<ImageUploadDependenciesV2['prepare']>>) => void;
        const fixture = upload({ prepare: async (_args, token) => {
            expect(token).toBe('captured-convex-token'); started();
            return new Promise(resolve => { finish = resolve; });
        } });
        const response = fixture.handler(request('upload', { signal: abort.signal }));
        await preparing; abort.abort(); expect((await response).status).toBe(400);
        expect(fixture.calls.at(-1)).toEqual({ stage: 'cancel', token: 'captured-convex-token', args: { attemptId, actorId: target.actorId } });
        finish({ attemptId, assetPath: `public/weblab-upload-${imageHash(normalized)}.webp`, hash: imageHash(normalized), width: 160, height: 90 });
    });
});

describe('v2 saved image inspection boundary', () => {
    it('fully decodes exact scoped bytes and rechecks authority before signing without exposing a storage URL', async () => {
        const fixture = inspection(), response = await fixture.handler(request('inspect'));
        expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store');
        const result = await response.json();
        expect(Object.keys(result).sort()).toEqual(['bytes', 'hash', 'height', 'path', 'proof', 'width']);
        expect(validImageMetadataProof(secret, { kind: 'approval', projectId: target.projectId, branchId: target.branchId, actorId: target.actorId,
            revision: target.expectedRevision, path: asset.path, hash: originalHash, bytes: original.length, width: 160, height: 90 }, result.proof)).toBe(true);
        expect(fixture.calls).toEqual(Array.from({ length: 2 }, () => ({ token: 'captured-convex-token', args: { ...inspectTarget, secret } })));
        expect(fixture.fetched()).toBe(1); expect(fixture.decoded()).toBe(1);
    });
    it('rejects URL/storage authority or excessive metadata supplied by the browser', async () => {
        const fixture = inspection();
        for (const body of [{ ...inspectTarget, url: `${convexUrl}/api/storage/other` }, { ...inspectTarget, storageId: 'other' },
            { ...inspectTarget, path: 'public/../other.webp' }, { ...inspectTarget, path: 'public/a\ud800.webp' }, { ...inspectTarget, expectedHash: `${originalHash}\n` }]) {
            expect((await fixture.handler(request('inspect', { body: JSON.stringify(body) }))).status).toBe(400);
        }
        expect((await fixture.handler(request('inspect', { body: ' '.repeat(2049) }))).status).toBe(400);
        expect(fixture.calls).toEqual([]); expect(fixture.fetched()).toBe(0);
    });
    it('rejects untrusted storage destinations and saved byte counts before fetching', async () => {
        for (const url of ['https://evil.example/api/storage/id', `${convexUrl}/other/id`, 'http://test.convex.cloud/api/storage/id', `${convexUrl}/api/storage/id#fragment`, 'https://user@test.convex.cloud/api/storage/id']) {
            const fixture = inspection({ asset: async () => ({ url, hash: originalHash, bytes: original.length }) });
            expect((await fixture.handler(request('inspect'))).status).toBe(400); expect(fixture.fetched()).toBe(0);
        }
        const fixture = inspection({ asset: async () => ({ url: `${convexUrl}/api/storage/id`, hash: originalHash, bytes: 32 * 1024 * 1024 + 1 }) });
        expect((await fixture.handler(request('inspect'))).status).toBe(400); expect(fixture.fetched()).toBe(0);
    });
    it('refuses redirects, wrong bytes, wrong lengths and revoked or changed final authority', async () => {
        for (const fetch of [async () => new Response(null, { status: 302, headers: { location: 'https://evil.example' } }),
            async () => new Response('saved-imagX'), async () => new Response('short'),
            async () => new Response(original, { headers: { 'content-length': '999' } })]) {
            const fixture = inspection({ fetch }); expect((await fixture.handler(request('inspect'))).status).toBe(400); expect(fixture.decoded()).toBe(0);
        }
        for (const revoke of [true, false]) {
            let lookups = 0;
            const fixture = inspection({ asset: async () => {
                if (++lookups === 2 && revoke) throw new Error('Access revoked');
                return { url: `${convexUrl}/api/storage/saved-asset`, hash: lookups === 2 ? 'b'.repeat(64) : originalHash, bytes: original.length };
            } });
            expect((await fixture.handler(request('inspect'))).status).toBe(400); expect(fixture.decoded()).toBe(1);
        }
    });
    it('shares two decode slots across routes and retains timed-out native work until settled', async () => {
        const expires: Array<() => void> = [], finishes: Array<(size: { width: number; height: number }) => void> = [];
        let started!: () => void;
        const bothStarted = new Promise<void>(resolve => { started = resolve; });
        const fixture = inspection({ timer: callback => { expires.push(callback); return () => {}; },
            inspect: () => new Promise(resolve => { finishes.push(resolve); if (finishes.length === 2) started(); }) });
        const first = fixture.handler(request('inspect')), second = fixture.handler(request('inspect'));
        await bothStarted;
        expect((await upload().handler(request('upload'))).status).toBe(429);
        expires.forEach(expire => expire());
        expect((await first).status).toBe(400); expect((await second).status).toBe(400);
        expect((await upload().handler(request('upload'))).status).toBe(429);
        finishes.forEach(finish => finish({ width: 160, height: 90 })); await Promise.resolve(); await Promise.resolve();
        expect((await upload().handler(request('upload'))).status).toBe(200);
    });
});
