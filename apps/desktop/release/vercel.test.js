import { expect, test } from 'bun:test';
import { VercelApi } from './vercel';

const project = { id: 'project1', name: 'site', accountId: 'team1', framework: 'nextjs',
    ssoProtection: { deploymentType: 'prod_deployment_urls_and_all_previews' } };

function api(handler) {
    return new VercelApi({ token: 'private-token', projectId: 'project1', accountId: 'team1', teamId: 'team1',
        fetchImpl: async (url, options) => handler(new URL(url), options) });
}
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });

test('preflight refusals are definite and never send a build or alias request', async () => {
    const calls = [];
    const client = api((url, options) => { calls.push(options.method); return json({ ...project, framework: 'vite' }); });
    for (const operation of [() => client.create({ release: { files: [] }, releaseId: 'reviewed', beforePost: async () => {} }),
        () => client.switchProduction('deployment1', { beforePost: async () => {} })]) {
        let failure;
        try { await operation(); } catch (error) { failure = error; }
        expect(failure?.uncertain).toBe(false);
    }
    expect(calls).toEqual(['GET', 'GET']);
});

test('builds upload captured bytes without automatically assigning live domains', async () => {
    let sent;
    const client = api((url, options) => {
        expect(url.origin).toBe('https://api.vercel.com');
        expect(options.redirect).toBe('error');
        if (options.method === 'GET') return json(project);
        sent = JSON.parse(options.body);
        return json({ id: 'deployment1', readyState: 'BUILDING' });
    });
    await client.create({ release: { hash: 'frozen-hash', files: [{ path: 'logo.png', bytes: Buffer.from([0, 255]) }] }, releaseId: 'reviewed1', production: true, beforePost: async () => {} });
    expect(sent.autoAssignCustomDomains).toBe(false);
    expect(sent.target).toBe('production');
    expect(sent.files[0].data).toBe('AP8=');
    expect(sent.meta).toEqual({ weblabReleaseId: 'reviewed1', weblabSourceHash: 'frozen-hash' });
});

test('malformed accepted responses and queued switches remain uncertain', async () => {
    const client = api((url, options) => {
        if (url.pathname.includes('/projects/') && options.method === 'GET') return json(project);
        if (options.method === 'GET') return json({ id: 'deployment1', projectId: 'project1', target: 'production', readyState: 'READY' });
        return url.pathname.endsWith('/deployments') ? new Response('{', { status: 200 }) : json({}, 202);
    });
    for (const operation of [() => client.create({ release: { hash: 'x', files: [] }, releaseId: 'reviewed', beforePost: async () => {} }),
        () => client.switchProduction('deployment1', { beforePost: async () => {} })]) {
        let failure;
        try { await operation(); } catch (error) { failure = error; }
        expect(failure?.uncertain).toBe(true);
    }
});

test('rollback uses the documented endpoint for the captured deployment and account', async () => {
    const calls = [];
    const client = api((url, options) => {
        calls.push({ path: url.pathname, method: options.method, team: url.searchParams.get('teamId') });
        if (options.method === 'POST') return json({}, 201);
        if (url.pathname.includes('/projects/')) return json(project);
        return json({ id: 'deployment1', projectId: 'project1', target: 'production', readyState: 'READY' });
    });
    await client.switchProduction('deployment1', { rollback: true, beforePost: async () => {} });
    expect(calls.filter((call) => call.method === 'POST')).toEqual([
        { path: '/v1/projects/project1/rollback/deployment1', method: 'POST', team: 'team1' },
    ]);
});

test('shared live credentials and incomplete environment responses refuse verification', async () => {
    const env = { id: 'shared', key: 'PAYMENT_SECRET', target: ['preview', 'production'], value: 'live-value' };
    await expect(api(() => json({ envs: [env] })).environmentBindings([])).rejects.toThrow('own value');
    await expect(api(() => json({ envs: [], pagination: { next: 1 } })).environmentBindings([])).rejects.toThrow('completely');
    const split = [{ ...env, id: 'preview', target: ['preview'], value: 'test-value' }, { ...env, target: ['production'] }];
    expect(await api(() => json({ envs: split })).environmentBindings([])).toMatch(/^[a-f0-9]{64}$/);
});

test('a succeeded job with mixed live aliases never confirms publication', async () => {
    const client = api((url) => {
        if (url.pathname.endsWith('/domains')) return json({ domains: [{ name: 'site.example' }] });
        if (url.pathname.includes('/aliases/')) return json({ alias: 'site.example', deploymentId: 'other' });
        return json({ ...project, targets: { production: { id: 'deployment1' } },
            lastAliasRequest: { toDeploymentId: 'deployment1', requestedAt: Date.now(), jobStatus: 'succeeded' } });
    });
    await expect(client.confirmSwitch('deployment1', 0)).rejects.toThrow('different versions');
});


test('fresh access is checked after provider preflights and refusal never sends POST', async () => {
    const calls = [];
    const client = api((url, options) => {
        calls.push(options.method);
        return json(url.pathname.includes('/projects/') ? project :
            { id: 'deployment1', projectId: 'project1', target: 'production', readyState: 'READY' });
    });
    const beforePost = async () => { throw new Error('revoked during provider preflight'); };
    for (const operation of [() => client.create({ release: { files: [] }, releaseId: 'r', beforePost }),
        () => client.switchProduction('deployment1', { beforePost })]) {
        let failure;
        try { await operation(); } catch (error) { failure = error; }
        expect(failure?.message).toContain('revoked');
        expect(failure?.uncertain).toBe(false);
    }
    expect(calls).toEqual(['GET', 'GET', 'GET']);
});

test('only bounded public Sanity config may be shared, and it is exposed for review', async () => {
    const shared = { id: 'shared', key: 'NEXT_PUBLIC_SANITY_PROJECT_ID', target: ['preview', 'production'], value: 'abcd1234' };
    const client = api(() => json({ envs: [shared] }));
    expect(await client.environmentBindings([])).toMatch(/^[a-f0-9]{64}$/);
    expect(client.sharedPublicConfig).toEqual([{ key: shared.key, value: shared.value }]);
    for (const key of ['NEXT_PUBLIC_PAYMENT_KEY', 'SANITY_API_TOKEN', 'FORM_ENDPOINT']) {
        await expect(api(() => json({ envs: [{ ...shared, key }] })).environmentBindings([])).rejects.toThrow('own value');
    }
    await expect(api(() => json({ envs: [{ ...shared, value: 'secret-too-long-for-project-id' }] })).environmentBindings([])).rejects.toThrow('own value');
});


test('timeout and unclassified provider failures never prove that a POST was refused', async () => {
    for (const status of [408, 409, 425, 500, 503]) {
        const client = api((_url, options) => options.method === 'GET' ? json(project) : json({}, status));
        let failure;
        try { await client.create({ release: { hash: 'x', files: [] }, releaseId: 'r', beforePost: async () => {} }); }
        catch (error) { failure = error; }
        expect(failure?.uncertain).toBe(true);
    }
    const refused = api((_url, options) => options.method === 'GET' ? json(project) : json({}, 403));
    let failure;
    try { await refused.create({ release: { hash: 'x', files: [] }, releaseId: 'r', beforePost: async () => {} }); }
    catch (error) { failure = error; }
    expect(failure?.uncertain).toBe(false);
});
