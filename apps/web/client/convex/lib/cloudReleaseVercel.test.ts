import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { createHash } from 'node:crypto';
import { CloudReleaseVercel, IMPORTED_VERCEL_PROJECT_SETTINGS, validateImportedHostingManifest, type ImportedVercelFile, type ImportedVercelPins } from './cloudReleaseVercel';
import { manifestHash } from './cloudReleaseArtifact';
import { IMPORTED_HOSTING_PROFILE } from './cloudImportedHostingState';
import { MAX_IMPORT_ASSET_BYTES, MAX_IMPORT_BYTES } from './cloudImportManifest';

const originalFetch = globalThis.fetch;
function mockFetch(handler: (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => Promise<Response>) {
    return spyOn(globalThis, 'fetch').mockImplementation(Object.assign(handler, { preconnect: originalFetch.preconnect }));
}
afterEach(() => { globalThis.fetch = originalFetch; });
const options = { token: 'private-api-token', teamId: 'team_test', projectId: 'prj_test', hostname: 'beta-live.vercel.app', bypass: 'private-review-bypass' };
function client() { return new CloudReleaseVercel(options, AbortSignal.timeout(5000)); }
function json(value: unknown) { return Response.json(value); }
function liveRoutes() {
    return { routes: [{ id: 'rule', name: 'Credential isolation', enabled: true, staged: false, srcSyntax: 'regex', routeType: 'transform',
        route: { src: '^/.*$', transforms: [{ type: 'request.headers', op: 'delete', target: { key: 'x-vercel-protection-bypass' } }] } }],
        version: { id: 'live-version', ruleCount: 1 }, limit: { currentRoutes: 1 } };
}
function project() {
    return { id: options.projectId, accountId: options.teamId, autoExposeSystemEnvs: false,
        ssoProtection: { deploymentType: 'prod_deployment_urls_and_all_previews' } };
}
function liveVersions() { return { versions: [{ id: 'live-version', isLive: true }] }; }
function mockVerifiedFetch(handler: (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => Promise<Response>) {
    return mockFetch(async (url, init) => {
        const path = new URL(String(url)).pathname;
        if (path === '/v9/projects/prj_test') return json(project());
        if (path === '/v10/projects/prj_test/env') return json({ envs: [] });
        if (path === '/v1/projects/prj_test/routes/versions') return json(liveVersions());
        if (path === '/v1/projects/prj_test/routes') return json(liveRoutes());
        return handler(url, init);
    });
}
describe('cloud hosting transport', () => {
    it('sends the immutable files as a staged production build without assigning the stable alias', async () => {
        const calls: Array<{ url: string; body: unknown; headers: Headers }> = [];
        mockVerifiedFetch(async (url, init) => {
            calls.push({ url: String(url), body: init?.body, headers: new Headers(init?.headers) });
            return String(url).includes('/v2/files') ? new Response(null, { status: 200 }) : json({ id: 'dpl_review', target: 'production' });
        });
        expect(await client().create([{ path: 'src/app/page.tsx', bytes: new TextEncoder().encode('frozen-source') }], 'release', 'hash')).toBe('dpl_review');
        expect(calls.length).toBe(2);
        const body = JSON.parse(String(calls[1]!.body));
        expect(body.target).toBe('production'); expect(body.autoAssignCustomDomains).toBe(false); expect(body.project).toBe('prj_test');
        expect(body.files[0].file).toBe('src/app/page.tsx'); expect(body.files[0].sha).toHaveLength(40);
        expect(body.meta.weblabCloudReleaseHash).toBe('hash');
        expect(calls.every(call => call.url.startsWith('https://api.vercel.com/'))).toBe(true);
        expect(calls.some(call => call.url.includes('/aliases'))).toBe(false);
    });
    it('never retries an ambiguous alias POST', async () => {
        let calls = 0;
        mockVerifiedFetch(async () => { calls++; throw new Error('response lost'); });
        await expect(client().assign('dpl_new', 'dpl_old')).rejects.toThrow();
        expect(calls).toBe(1);
    });
    it('detects outside routing changes even when the requested target is now live', async () => {
        let calls = 0;
        mockVerifiedFetch(async () => ++calls === 1
            ? json({ alias: options.hostname, uid: 'alias_id', oldDeploymentId: 'outside_change' })
            : json({ alias: options.hostname, projectId: options.projectId, deploymentId: 'dpl_new' }));
        await expect(client().assign('dpl_new', 'dpl_old')).rejects.toThrow('CLOUD_RELEASE_ALIAS_CHANGED');
        expect(calls).toBe(2);
    });
    it('keeps the provider API token out of site probes and the bypass out of public probes', async () => {
        const headers: Headers[] = [];
        mockVerifiedFetch(async (_url, init) => {
            headers.push(new Headers(init?.headers)); return new Response('<main/>', { headers: { 'Content-Type': 'text/html' } });
        });
        await client().verifyServed('https://frozen.vercel.app', true);
        await client().verifyServed(`https://${options.hostname}`, false);
        expect(headers[0]!.get('authorization')).toBeNull();
        expect(headers[0]!.get('x-vercel-protection-bypass')).toBe(options.bypass);
        expect(headers[1]!.get('authorization')).toBeNull();
        expect(headers[1]!.get('x-vercel-protection-bypass')).toBeNull();
    });
});

describe('staged production safeguards', () => {
    for (const target of [undefined, null, 'preview']) {
        it(`rejects a create response with target ${target}`, async () => {
            mockVerifiedFetch(async () => json({ id: 'dpl_review', target }));
            await expect(client().create([], 'release', 'hash')).rejects.toThrow('CLOUD_RELEASE_UNEXPECTED_TARGET');
        });
        it(`rejects an observed deployment with target ${target}`, async () => {
            mockFetch(async () => json({ id: 'dpl_review', projectId: options.projectId, target,
                meta: { weblabCloudReleaseId: 'release', weblabCloudReleaseHash: 'hash' }, readyState: 'READY', url: 'frozen.vercel.app' }));
            await expect(client().deployment('dpl_review', 'release', 'hash')).rejects.toThrow('CLOUD_RELEASE_BUILD_CHANGED');
        });
    }
    for (const deploymentType of ['all', 'preview', undefined, 'prod_deployment_urls_and_all_previews']) {
        it(`accepts only the protection mode that permits a public production alias: ${deploymentType}`, async () => {
            mockFetch(async url => String(url).includes('/routes/versions?') ? json(liveVersions()) : String(url).includes('/routes?') ? json(liveRoutes()) : String(url).includes('/env?') ? json({ envs: [] }) : json({
                id: options.projectId, accountId: options.teamId, autoExposeSystemEnvs: false, ssoProtection: { deploymentType },
            }));
            if (deploymentType === 'prod_deployment_urls_and_all_previews') await expect(client().verifyProject()).resolves.toMatch(/^[a-f0-9]{64}$/);
            else await expect(client().verifyProject()).rejects.toThrow('CLOUD_RELEASE_PROVIDER_SETUP');
        });
    }
    for (const autoExposeSystemEnvs of [undefined, true, false]) {
        it(`requires explicitly disabled system environment exposure before reading env or building: ${autoExposeSystemEnvs}`, async () => {
            const paths: string[] = [];
            mockFetch(async url => {
                const path = new URL(String(url)).pathname;
                paths.push(path);
                if (path.endsWith('/env')) return json({ envs: [] });
                if (path.endsWith('/versions')) return json(liveVersions());
                if (path.endsWith('/routes')) return json(liveRoutes());
                if (path === '/v13/deployments') return json({ id: 'dpl_review', target: 'production' });
                return json({ id: options.projectId, accountId: options.teamId, autoExposeSystemEnvs,
                    ssoProtection: { deploymentType: 'prod_deployment_urls_and_all_previews' } });
            });
            const provider = client();
            const verifiedBuild = () => provider.create([], 'release', 'hash');
            if (autoExposeSystemEnvs === false) {
                await expect(verifiedBuild()).resolves.toBe('dpl_review');
                expect(paths).toEqual(['/v9/projects/prj_test', '/v10/projects/prj_test/env', '/v1/projects/prj_test/routes/versions', '/v1/projects/prj_test/routes', '/v1/projects/prj_test/routes/versions', '/v13/deployments']);
            } else {
                await expect(verifiedBuild()).rejects.toThrow('CLOUD_RELEASE_PROVIDER_SETUP');
                expect(paths).toEqual(['/v9/projects/prj_test']);
            }
        });
    }
    it('requires anonymous HTML after a successful alias receipt and exact target lookup', async () => {
        let calls = 0;
        mockVerifiedFetch(async (_url, init) => {
            calls++;
            if (calls === 1) return json({ alias: options.hostname, uid: 'alias_id', oldDeploymentId: 'dpl_old' });
            if (calls === 2) return json({ alias: options.hostname, projectId: options.projectId, deploymentId: 'dpl_new' });
            expect(new Headers(init?.headers).get('x-vercel-protection-bypass')).toBeNull();
            return new Response('protected', { status: 401 });
        });
        await expect(client().assign('dpl_new', 'dpl_old')).rejects.toThrow('CLOUD_RELEASE_SITE_UNAVAILABLE');
        expect(calls).toBe(3);
    });
});

describe('live CDN credential isolation', () => {
    it('pins verified identity and route policy across later operations', async () => {
        let routeVersion = 'live-version';
        let providerWrites = 0;
        mockFetch(async (url, init) => {
            const path = new URL(String(url)).pathname;
            if (init?.method === 'POST') providerWrites++;
            if (path === '/v9/projects/prj_test') return json(project());
            if (path === '/v10/projects/prj_test/env') return json({ envs: [] });
            if (path.endsWith('/versions')) return json({ versions: [{ id: routeVersion, isLive: true }] });
            const routes = liveRoutes();
            routes.version.id = routeVersion;
            return json(routes);
        });
        const proof = await client().verifyProject();
        const registered = new CloudReleaseVercel({ ...options, expectedProof: proof }, AbortSignal.timeout(5000));
        expect(await registered.verifyProject()).toBe(proof);
        routeVersion = 'new-live-version';
        await expect(registered.create([], 'release', 'hash')).rejects.toThrow('CLOUD_RELEASE_CREDENTIAL_CHANGED');
        expect(providerWrites).toBe(0);
        expect(await client().verifyProject()).not.toBe(proof);
    });
    it('rejects a proof registered for a different hostname', async () => {
        mockVerifiedFetch(async () => { throw new Error('Unexpected provider request'); });
        const proof = await client().verifyProject();
        const changed = new CloudReleaseVercel({ ...options, hostname: 'other-site.vercel.app', expectedProof: proof }, AbortSignal.timeout(5000));
        await expect(changed.verifyProject()).rejects.toThrow('CLOUD_RELEASE_CREDENTIAL_CHANGED');
    });
    const invalidHistories: Array<[string, unknown]> = [
        ['missing history', {}],
        ['no live version', { versions: [{ id: 'staging', isStaging: true }] }],
        ['duplicate live versions', { versions: [{ id: 'one', isLive: true }, { id: 'two', isLive: true }] }],
        ['contradictory live and staging', { versions: [{ id: 'live-version', isLive: true, isStaging: true }] }],
    ];
    for (const [name, history] of invalidHistories) {
        it(`refuses ${name} before reading any route or sending the bypass`, async () => {
            const paths: string[] = [];
            mockFetch(async url => {
                const path = new URL(String(url)).pathname; paths.push(path);
                if (path === '/v9/projects/prj_test') return json(project());
                if (path === '/v10/projects/prj_test/env') return json({ envs: [] });
                return json(history);
            });
            await expect(client().verifyServed('https://frozen.vercel.app', true)).rejects.toThrow('CLOUD_RELEASE_CREDENTIAL_ISOLATION');
            expect(paths).toEqual(['/v9/projects/prj_test', '/v10/projects/prj_test/env', '/v1/projects/prj_test/routes/versions']);
        });
    }
    for (const change of ['mismatched content version', 'live version changed'] as const) {
        it(`refuses ${change} before a credential-bearing request`, async () => {
            let histories = 0, siteRequests = 0;
            mockFetch(async url => {
                const parsed = new URL(String(url));
                if (parsed.origin !== 'https://api.vercel.com') { siteRequests++; return new Response('unsafe'); }
                if (parsed.pathname === '/v9/projects/prj_test') return json(project());
                if (parsed.pathname === '/v10/projects/prj_test/env') return json({ envs: [] });
                if (parsed.pathname.endsWith('/versions')) {
                    histories++;
                    return histories === 2 ? json({ versions: [{ id: 'changed-version', isLive: true }] }) : json(liveVersions());
                }
                const routes = liveRoutes();
                if (change === 'mismatched content version') routes.version.id = 'different-version';
                return json(routes);
            });
            await expect(client().verifyServed('https://frozen.vercel.app', true)).rejects.toThrow('CLOUD_RELEASE_CREDENTIAL_ISOLATION');
            expect(siteRequests).toBe(0);
            expect(histories).toBe(change === 'mismatched content version' ? 1 : 2);
        });
    }
    it('reads the explicit live version without caching and rechecks it immediately before the site request', async () => {
        const paths: string[] = [];
        mockFetch(async (url, init) => {
            const parsed = new URL(String(url)); paths.push(parsed.pathname);
            if (parsed.origin !== 'https://api.vercel.com') return new Response('<main/>', { headers: { 'Content-Type': 'text/html' } });
            expect(init?.cache).toBe('no-store');
            expect(parsed.searchParams.get('teamId')).toBe(options.teamId);
            if (parsed.pathname === '/v9/projects/prj_test') return json(project());
            if (parsed.pathname === '/v10/projects/prj_test/env') return json({ envs: [] });
            if (parsed.pathname.endsWith('/versions')) return json(liveVersions());
            expect(parsed.searchParams.get('versionId')).toBe('live-version');
            return json(liveRoutes());
        });
        await client().verifyServed('https://frozen.vercel.app', true);
        expect(paths).toEqual(['/v9/projects/prj_test', '/v10/projects/prj_test/env', '/v1/projects/prj_test/routes/versions', '/v1/projects/prj_test/routes', '/v1/projects/prj_test/routes/versions', '/']);
    });
    const receipt = liveRoutes(), rule = receipt.routes[0]!;
    const invalid: Array<[string, unknown]> = [
        ['missing', {}],
        ['empty', { ...receipt, routes: [] }],
        ['disabled', { ...receipt, routes: [{ ...rule, enabled: false }] }],
        ['staged only', { ...receipt, routes: [{ ...rule, staged: true }] }],
        ['unknown activation', { ...receipt, routes: [{ ...rule, staged: undefined }] }],
        ['conditional', { ...receipt, routes: [{ ...rule, route: { ...rule.route, has: [{ type: 'header', key: 'accept' }] } }] }],
        ['limited methods', { ...receipt, routes: [{ ...rule, route: { ...rule.route, methods: ['GET'] } }] }],
        ['limited path', { ...receipt, routes: [{ ...rule, route: { ...rule.route, src: '^/api/.*$' } }] }],
        ['response header', { ...receipt, routes: [{ ...rule, route: { ...rule.route, transforms: [{ type: 'response.headers', op: 'delete', target: { key: 'x-vercel-protection-bypass' } }] } }] }],
        ['rewritten header', { ...receipt, routes: [{ ...rule, route: { ...rule.route, transforms: [{ type: 'request.headers', op: 'set', target: { key: 'x-vercel-protection-bypass' } }] } }] }],
        ['other header', { ...receipt, routes: [{ ...rule, route: { ...rule.route, transforms: [{ type: 'request.headers', op: 'delete', target: { key: 'authorization' } }] } }] }],
        ['extra transform', { ...receipt, routes: [{ ...rule, route: { ...rule.route, transforms: [...rule.route.transforms, ...rule.route.transforms] } }] }],
        ['interfering route', { ...receipt, routes: [rule, rule] }],
        ['partial response', { ...receipt, version: { ruleCount: 2 } }],
    ];
    for (const [name, routes] of invalid) {
        for (const operation of ['build', 'publish', 'probe'] as const) {
            it(`refuses ${name} before ${operation} can send anything to the site`, async () => {
                const calls: string[] = [];
                mockFetch(async (url, init) => {
                    const parsed = new URL(String(url)); calls.push(parsed.pathname);
                    expect(parsed.origin).toBe('https://api.vercel.com');
                    expect(new Headers(init?.headers).has('x-vercel-protection-bypass')).toBe(false);
                    if (parsed.pathname === '/v9/projects/prj_test') return json(project());
                    if (parsed.pathname === '/v10/projects/prj_test/env') return json({ envs: [] });
                    if (parsed.pathname === '/v1/projects/prj_test/routes/versions') return json(liveVersions());
                    return json(routes);
                });
                const provider = client();
                const pending = operation === 'build' ? provider.create([{ path: 'page', bytes: new Uint8Array([1]) }], 'release', 'hash')
                    : operation === 'publish' ? provider.assign('dpl_new', null) : provider.verifyServed('https://frozen.vercel.app', true);
                await expect(pending).rejects.toThrow();
                expect(calls).toEqual(['/v9/projects/prj_test', '/v10/projects/prj_test/env', '/v1/projects/prj_test/routes/versions', '/v1/projects/prj_test/routes']);
            });
        }
    }
    it('rechecks the live rule for each credential-bearing probe without caching approval', async () => {
        let routeChecks = 0, siteRequests = 0;
        mockFetch(async url => {
            const parsed = new URL(String(url));
            if (parsed.pathname === '/v9/projects/prj_test') return json(project());
            if (parsed.pathname === '/v10/projects/prj_test/env') return json({ envs: [] });
            if (parsed.pathname === '/v1/projects/prj_test/routes/versions') return json(liveVersions());
            if (parsed.pathname === '/v1/projects/prj_test/routes') return ++routeChecks === 1 ? json(liveRoutes()) : json({ routes: [] });
            siteRequests++;
            return new Response('<main/>', { headers: { 'Content-Type': 'text/html' } });
        });
        const provider = client();
        await provider.verifyServed('https://frozen.vercel.app', true);
        await expect(provider.verifyServed('https://frozen.vercel.app', true)).rejects.toThrow();
        expect(routeChecks).toBe(2); expect(siteRequests).toBe(1);
    });
});

function importedClient(signal = AbortSignal.timeout(5000)) {
    return new CloudReleaseVercel({ ...options, hostingProfile: IMPORTED_HOSTING_PROFILE }, signal);
}
function importedProject() { return { ...project(), ...IMPORTED_VERCEL_PROJECT_SETTINGS, rootDirectory: null }; }
function mockImportedFetch(handler: (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => Promise<Response>, readProject: () => unknown = importedProject) {
    return mockFetch(async (url, init) => {
        const path = new URL(String(url)).pathname;
        if (path === '/v9/projects/prj_test') return json(readProject());
        if (path === '/v10/projects/prj_test/env') return json({ envs: [] });
        if (path === '/v1/projects/prj_test/routes/versions') return json(liveVersions());
        if (path === '/v1/projects/prj_test/routes') return json(liveRoutes());
        return handler(url, init);
    });
}
function importedFixture() {
    const bodies = ['first', 'second'].map((text, index) => ({ path: `public/${index}.webp`, bytes: new TextEncoder().encode(text) }));
    const manifest: ImportedVercelFile[] = bodies.map(file => ({ path: file.path, kind: 'file', bytes: file.bytes.length, hash: createHash('sha256').update(file.bytes).digest('hex') }));
    const pins: ImportedVercelPins = { releaseId: 'release_imported', candidateHash: 'a'.repeat(64), deployHash: manifestHash(manifest), buildPolicyHash: 'b'.repeat(64) };
    return { bodies, manifest, pins };
}
async function* streamFiles(files: Array<{ path: string; bytes: Uint8Array }>) { for (const file of files) yield file; }
function importedDeployment() {
    const { pins } = importedFixture();
    return { id: 'dpl_imported', projectId: options.projectId, target: 'production', autoAssignCustomDomains: false,
        projectSettings: { ...IMPORTED_VERCEL_PROJECT_SETTINGS }, readyState: 'READY', buildSkipped: false, url: 'frozen.vercel.app',
        meta: { weblabCloudReleaseId: pins.releaseId, weblabCloudReleaseHash: pins.candidateHash, weblabCloudDeployHash: pins.deployHash,
            weblabCloudBuildPolicyHash: pins.buildPolicyHash, weblabCloudHostingProfile: IMPORTED_HOSTING_PROFILE } };
}

describe('imported provider profile', () => {
    it('preserves the exact starter proof and uses a separate canonical imported proof', async () => {
        mockImportedFetch(async () => { throw new Error('unexpected request'); });
        const starter = createHash('sha256').update(JSON.stringify({ version: 1, teamId: options.teamId, projectId: options.projectId,
            hostname: options.hostname, routeVersion: 'live-version', profile: 'cloud-studio-v1' })).digest('hex');
        expect(await client().verifyProject()).toBe(starter);
        const canonical = JSON.stringify({ version: 2, profile: IMPORTED_HOSTING_PROFILE, teamId: options.teamId, projectId: options.projectId,
            hostname: options.hostname, routeVersion: 'live-version', settings: { ...IMPORTED_VERCEL_PROJECT_SETTINGS, rootDirectory: null,
                target: 'production', autoAssignCustomDomains: false } }, (_key, value: unknown) => value && typeof value === 'object' && !Array.isArray(value)
            ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : value);
        const proof = await importedClient().verifyProject();
        expect(proof).toBe(createHash('sha256').update(canonical).digest('hex'));
        expect(proof).not.toBe(starter);
        await expect(new CloudReleaseVercel({ ...options, hostingProfile: IMPORTED_HOSTING_PROFILE, expectedProof: starter }, AbortSignal.timeout(5000)).verifyProject()).rejects.toThrow('CLOUD_RELEASE_CREDENTIAL_CHANGED');
    });
    for (const [key, value] of [['framework', undefined], ['nodeVersion', '22.x'], ['installCommand', 'bun install'], ['buildCommand', 'bun run build'], ['outputDirectory', 'out'], ['rootDirectory', ''], ['rootDirectory', 'src']] as const) {
        it(`refuses changed imported project ${key}=${value}`, async () => {
            let writes = 0;
            mockImportedFetch(async () => { writes++; return json({}); }, () => ({ ...importedProject(), [key]: value }));
            const { pins, manifest, bodies } = importedFixture();
            await expect(importedClient().createImported({ ...pins, manifest, files: streamFiles(bodies) })).rejects.toThrow('CLOUD_RELEASE_PROVIDER_SETUP');
            expect(writes).toBe(0);
        });
    }
    it('cannot cross profile methods or mutate constructor options to enable alias writes', async () => {
        const fetchSpy = mockFetch(async () => { throw new Error('must not fetch'); });
        const mutable: ConstructorParameters<typeof CloudReleaseVercel>[0] = { ...options, hostingProfile: IMPORTED_HOSTING_PROFILE };
        const provider = new CloudReleaseVercel(mutable, AbortSignal.timeout(5000));
        delete mutable.hostingProfile;
        await expect(provider.create([], 'release', 'hash')).rejects.toThrow('CLOUD_RELEASE_PROVIDER_PROFILE');
        await expect(provider.deployment('dpl_imported', 'release', 'hash')).rejects.toThrow('CLOUD_RELEASE_PROVIDER_PROFILE');
        await expect(provider.assign('dpl_imported', null)).rejects.toThrow('CLOUD_RELEASE_PROVIDER_PROFILE');
        const { pins, manifest, bodies } = importedFixture();
        await expect(client().createImported({ ...pins, manifest, files: streamFiles(bodies) })).rejects.toThrow('CLOUD_RELEASE_PROVIDER_PROFILE');
        await expect(client().deploymentImported('dpl_imported', pins)).rejects.toThrow('CLOUD_RELEASE_PROVIDER_PROFILE');
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});

describe('imported manifest and sequential uploads', () => {
    it('returns a sorted isolated manifest and rejects unsupported descriptors before provider requests', async () => {
        const { manifest, pins, bodies } = importedFixture();
        const copy = validateImportedHostingManifest([...manifest].reverse(), pins.deployHash);
        expect(copy).toEqual(manifest); expect(copy[0]).not.toBe(manifest[0]);
        const fetchSpy = mockFetch(async () => { throw new Error('must not fetch'); });
        const invalid: ImportedVercelFile[][] = [[], [manifest[0]!, manifest[0]!], [{ ...manifest[0]!, path: '../bad' }],
            [{ ...manifest[0]!, bytes: MAX_IMPORT_ASSET_BYTES + 1 }], [{ ...manifest[0]!, bytes: -1 }],
            [{ ...manifest[0]!, hash: `${manifest[0]!.hash}\n` }], [{ ...manifest[0]!, storageId: 'forbidden' } as ImportedVercelFile],
            [{ ...manifest[0]!, path: 'public' }, manifest[0]!]];
        for (const candidate of invalid) await expect(importedClient().createImported({ ...pins, manifest: candidate, files: streamFiles(bodies) })).rejects.toThrow();
        const oversized = Array.from({ length: Math.floor(MAX_IMPORT_BYTES / MAX_IMPORT_ASSET_BYTES) + 1 }, (_, index) => ({ ...manifest[0]!, path: `public/${index}.webp`, bytes: MAX_IMPORT_ASSET_BYTES }));
        expect(() => validateImportedHostingManifest(oversized, pins.deployHash)).toThrow('CLOUD_RELEASE_TOO_LARGE');
        expect(fetchSpy).not.toHaveBeenCalled();
    });
    it('uploads one verified body at a time then creates the exact staged deployment', async () => {
        const { manifest, pins, bodies } = importedFixture();
        const events: string[] = []; let projectReads = 0; let payload: Record<string, unknown> | undefined;
        async function* files() { for (const file of bodies) { events.push(`read:${file.path}`); yield file; } }
        mockImportedFetch(async (url, init) => {
            const path = new URL(String(url)).pathname;
            expect(init?.redirect).toBe('error'); expect(init?.signal).toBeDefined();
            if (path === '/v2/files') {
                const index = events.filter(event => event === 'upload').length;
                expect(Array.from(init?.body as Uint8Array)).toEqual(Array.from(bodies[index]!.bytes));
                expect(new Headers(init?.headers).get('x-vercel-size')).toBe(String(bodies[index]!.bytes.length));
                events.push('upload');
                return new Response(new ReadableStream({ cancel() { events.push('cancel-body'); } }));
            }
            expect(path).toBe('/v13/deployments'); events.push('create'); payload = JSON.parse(String(init?.body));
            return json({ id: 'dpl_imported', target: 'production' });
        }, () => { projectReads++; return importedProject(); });
        expect(await importedClient().createImported({ ...pins, manifest, files: files() })).toBe('dpl_imported');
        expect(projectReads).toBe(2);
        expect(events).toEqual(['read:public/0.webp', 'upload', 'cancel-body', 'read:public/1.webp', 'upload', 'cancel-body', 'create']);
        expect(payload).toMatchObject({ project: options.projectId, target: 'production', autoAssignCustomDomains: false,
            projectSettings: IMPORTED_VERCEL_PROJECT_SETTINGS, meta: importedDeployment().meta });
    });
    for (const mismatch of ['path', 'bytes', 'length', 'missing', 'extra'] as const) {
        it(`refuses ${mismatch} in streamed files without creating a deployment`, async () => {
            const { manifest, pins, bodies } = importedFixture(); let creates = 0;
            mockImportedFetch(async url => {
                if (new URL(String(url)).pathname === '/v13/deployments') creates++;
                return new Response(null);
            });
            if (mismatch === 'path') bodies[0]!.path = 'public/other.webp';
            if (mismatch === 'bytes') bodies[0]!.bytes[0] = 0;
            if (mismatch === 'length') bodies[0]!.bytes = new Uint8Array();
            if (mismatch === 'missing') bodies.pop();
            if (mismatch === 'extra') bodies.push(bodies[0]!);
            await expect(importedClient().createImported({ ...pins, manifest, files: streamFiles(bodies) })).rejects.toThrow('CLOUD_RELEASE_HASH_MISMATCH');
            expect(creates).toBe(0);
        });
    }
    it('stops reading files after cancellation and closes the iterator', async () => {
        const { manifest, pins, bodies } = importedFixture(); const controller = new AbortController();
        let reads = 0, closed = false, uploads = 0;
        async function* files() { try { for (const file of bodies) { reads++; yield file; } } finally { closed = true; } }
        mockImportedFetch(async () => { uploads++; controller.abort(); return new Response(null); });
        await expect(importedClient(controller.signal).createImported({ ...pins, manifest, files: files() })).rejects.toThrow();
        expect(reads).toBe(1); expect(uploads).toBe(1); expect(closed).toBe(true);
        const fetchSpy = mockFetch(async () => { throw new Error('must not fetch'); });
        fetchSpy.mockClear();
        await expect(importedClient(controller.signal).createImported({ ...pins, manifest, files: files() })).rejects.toThrow();
        expect(fetchSpy).not.toHaveBeenCalled(); expect(reads).toBe(1);
    });
    it('cancels failed upload responses and never retries an ambiguous upload', async () => {
        const { manifest, pins, bodies } = importedFixture(); let calls = 0, canceled = false;
        mockImportedFetch(async () => { calls++; return new Response(new ReadableStream({ cancel() { canceled = true; } }), { status: 500 }); });
        await expect(importedClient().createImported({ ...pins, manifest, files: streamFiles(bodies) })).rejects.toThrow('CLOUD_RELEASE_UPLOAD_FAILED');
        expect(calls).toBe(1); expect(canceled).toBe(true);
        calls = 0;
        mockImportedFetch(async () => { calls++; throw new Error('response lost'); });
        await expect(importedClient().createImported({ ...pins, manifest, files: streamFiles(bodies) })).rejects.toThrow('response lost');
        expect(calls).toBe(1);
    });
    it('rechecks project configuration after uploading and before deployment creation', async () => {
        const { manifest, pins, bodies } = importedFixture(); let reads = 0, creates = 0;
        mockImportedFetch(async url => { if (String(url).includes('/v13/deployments')) creates++; return new Response(null); },
            () => ({ ...importedProject(), nodeVersion: ++reads === 1 ? '24.x' : '22.x' }));
        await expect(importedClient().createImported({ ...pins, manifest, files: streamFiles(bodies) })).rejects.toThrow('CLOUD_RELEASE_PROVIDER_SETUP');
        expect(creates).toBe(0); expect(reads).toBe(2);
    });
    it('captures pins and manifest before asynchronous provider reads', async () => {
        const { manifest, pins, bodies } = importedFixture(); const original = { ...pins };
        const input = { ...pins, manifest, files: streamFiles(bodies) }; let meta: unknown;
        mockImportedFetch(async (url, init) => {
            if (String(url).includes('/v2/files')) return new Response(null);
            meta = JSON.parse(String(init?.body)).meta; return json({ id: 'dpl_imported', target: 'production' });
        }, () => { input.candidateHash = 'c'.repeat(64); input.manifest[0]!.hash = 'd'.repeat(64); return importedProject(); });
        await importedClient().createImported(input);
        expect(meta).toMatchObject({ weblabCloudReleaseHash: original.candidateHash, weblabCloudDeployHash: original.deployHash });
    });
});

describe('imported deployment observations', () => {
    it('accepts documented settings without invented root or lambda runtime fields', async () => {
        mockFetch(async () => json(importedDeployment()));
        expect(await importedClient().deploymentImported('dpl_imported', importedFixture().pins)).toEqual({ ready: true, failed: false, url: 'https://frozen.vercel.app' });
        mockFetch(async () => json({ ...importedDeployment(), nodeVersion: '24.x' }));
        expect((await importedClient().deploymentImported('dpl_imported', importedFixture().pins)).ready).toBe(true);
        mockFetch(async () => json({ ...importedDeployment(), readyState: 'BUILDING', buildSkipped: undefined }));
        expect((await importedClient().deploymentImported('dpl_imported', importedFixture().pins)).ready).toBe(false);
    });
    for (const change of [{ nodeVersion: '22.x' }, { nodeVersion: null }, { autoAssignCustomDomains: true }, { autoAssignCustomDomains: undefined },
        { buildSkipped: true }, { buildSkipped: undefined }, { target: 'preview' }, { projectId: 'another' },
        { projectSettings: { ...IMPORTED_VERCEL_PROJECT_SETTINGS, installCommand: 'bun install' } },
        { projectSettings: { ...IMPORTED_VERCEL_PROJECT_SETTINGS, nodeVersion: undefined } }, { url: 'evil.example' }]) {
        it(`rejects changed observation ${JSON.stringify(change)}`, async () => {
            mockFetch(async () => json({ ...importedDeployment(), ...change }));
            await expect(importedClient().deploymentImported('dpl_imported', importedFixture().pins)).rejects.toThrow();
        });
    }
    for (const key of Object.keys(importedDeployment().meta)) {
        it(`binds deployment metadata ${key}`, async () => {
            const response = importedDeployment();
            mockFetch(async () => json({ ...response, meta: { ...response.meta, [key]: 'changed' } }));
            await expect(importedClient().deploymentImported('dpl_imported', importedFixture().pins)).rejects.toThrow('CLOUD_RELEASE_BUILD_CHANGED');
        });
    }
});
