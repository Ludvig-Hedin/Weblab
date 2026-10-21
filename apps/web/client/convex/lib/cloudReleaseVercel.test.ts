import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { CloudReleaseVercel } from './cloudReleaseVercel';

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
            if (deploymentType === 'prod_deployment_urls_and_all_previews') await expect(client().verifyProject()).resolves.toBeUndefined();
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
