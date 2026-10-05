import { expect, test } from 'bun:test';
import { PublishingService, publicDeployment } from './service';
import { freezeFiles } from './policy';

test('unavailable shared coordination refuses publish and rollback before accessing local state or Vercel', async () => {
    const events = [];
    const service = new PublishingService({
        authorize: async () => ({ productionSwitchEnabled: false }),
        requirePrivateRoot: async () => { events.push('root'); },
        store: { locked: async () => { events.push('store'); } },
        apiFactory: () => { events.push('Vercel'); },
    });
    for (const rollback of [false, true]) {
        await expect(service.publish({ productionSwitchEnabled: true }, rollback)).rejects.toThrow('shared publishing coordination');
    }
    await expect(service.startBuild({ production: true, productionSwitchEnabled: true })).rejects.toThrow('shared publishing coordination');
    expect(events).toEqual([]);
});

function fixture() {
    let saved = { version: 1, releases: [], live: null, pending: null };
    let credentials = null;
    let generation = 0;
    const artifacts = new Map();
    const events = [];
    const store = {
        locked: async (_, operation) => operation('/store'),
        connection: async () => credentials,
        saveConnection: async (_, value) => { credentials = value; },
        state: async () => ({ state: structuredClone(saved), bytes: generation }),
        saveState: async (_, state, prior) => {
            expect(prior).toBe(generation);
            saved = structuredClone(state); generation++;
            events.push(saved.pending ? 'intent' : 'saved');
        },
        saveArtifact: async (_, id, release) => { artifacts.set(id, release); return 'artifact-digest'; },
        artifact: async (_, id) => artifacts.get(id),
    };
    const project = { name: 'Customer site', accountId: 'team1', framework: 'nextjs', ssoProtection: { deploymentType: 'all' } };
    let current = 'baseline';
    let domain = 'customer.example';
    let builds = 0;
    let confirmed = false;
    let buildFailure = null;
    let sourceChanged = false;
    const deployments = new Map([['baseline', { id: 'baseline', target: 'production', readyState: 'READY' }]]);
    let uncertainBuild = null;
    let afterPreflight = null;
    let afterPost = null;
    let afterStatus = null;
    let beforeSwitch = null;
    let apiAccesses = 0;
    const api = {
        project: async () => project,
        routing: async () => ({ current, aliases: [{ name: domain, deploymentId: current }] }),
        environmentBindings: async () => 'environment',
        deployment: async (id) => deployments.get(id),
        create: async ({ release, releaseId, production, beforePost }) => {
            afterPreflight?.();
            try { await beforePost(); } catch (error) { error.uncertain = false; throw error; }
            expect(events.at(-1)).toBe('intent');
            builds++;
            if (buildFailure) throw buildFailure;
            const result = { id: 'build' + builds, readyState: 'READY', target: production ? 'production' : undefined,
                meta: { weblabReleaseId: releaseId, weblabSourceHash: release.hash } };
            deployments.set(result.id, result);
            afterPost?.();
            return { id: result.id, readyState: result.readyState };
        },
        findBuild: async () => uncertainBuild,
        switchProduction: async (id, { beforePost }) => { expect(events.at(-1)).toBe('intent'); beforeSwitch?.(); try { await beforePost(); } catch (error) { error.uncertain = false; throw error; } current = id; },
        confirmSwitch: async () => { afterStatus?.(); return { confirmed }; },
    };
    let allowed = true;
    let active = true;
    const authorization = { userId: 'user1', projectId: 'project1', branchId: 'branch1', rootPath: '/private-copy', cmsRequired: false, productionSwitchEnabled: true };
    const files = [{ path: 'package.json', bytes: Buffer.from(JSON.stringify({ dependencies: { next: '16', tailwindcss: '4' } })) },
        { path: 'bun.lock', bytes: Buffer.from('locked') }, { path: 'app/page.tsx', bytes: Buffer.from('reviewed') }];
    const service = new PublishingService({ store, apiFactory: () => { apiAccesses++; return api; },
        authorize: async () => { if (!allowed) throw new Error('access revoked'); if (!active) throw new Error('window changed'); return authorization; },
        requirePrivateRoot: async (root) => root,
        snapshot: async () => ({ copyId: 'private-copy', files }),
        validateSnapshot: async () => { if (sourceChanged) throw new Error('source changed'); },
    });
    const input = { projectId: 'project1', branchId: 'branch1', jwt: 'session' };
    const connect = () => service.connect({ ...input, vercelToken: 'secret-token', vercelProjectId: 'vercel1' });
    const review = async () => {
        const state = await service.review({ ...input, planToken: 'review-token', cleanedFiles: [] });
        expect(state.createdReleaseId).toBe(state.releases.at(-1).id);
        return state.createdReleaseId;
    };
    return { service, input, connect, review, project, deployments, events,
        state: () => saved, builds: () => builds,
        revoke: () => { allowed = false; }, cancel: () => { active = false; }, reopen: () => { active = true; }, drift: () => { sourceChanged = true; },
        externalPublish: () => { current = 'other-publisher'; deployments.set(current, { id: current, target: 'production', readyState: 'READY' }); },
        attachCms: () => { authorization.cmsRequired = true; },
        sourceSanity: () => {
            const manifest = JSON.parse(files[0].bytes.toString());
            manifest.dependencies['next-sanity'] = '^13';
            files[0].bytes = Buffer.from(JSON.stringify(manifest));
        },
        legacySanityRelease: () => {
            const manifest = JSON.parse(files[0].bytes.toString());
            manifest.dependencies.sanity = '^6';
            const legacyFiles = files.map((file) => file.path === 'package.json'
                ? { ...file, bytes: Buffer.from(JSON.stringify(manifest)) } : file);
            for (const release of saved.releases) {
                const artifact = freezeFiles(legacyFiles);
                artifacts.set(release.id, artifact);
                release.sourceHash = artifact.hash;
                release.production = { id: 'legacy-ready', readyState: 'READY' };
            }
        },
        apiAccesses: () => apiAccesses,
        disableSwitch: () => { authorization.productionSwitchEnabled = false; },
        changeDomain: () => { domain = 'unreviewed.example'; },
        confirm: () => { confirmed = true; },
        failBuild: (uncertain) => { buildFailure = Object.assign(new Error('provider failure'), { uncertain }); },
        foundBuild: (value) => { uncertainBuild = value; },
        preflight: (fn) => { afterPreflight = fn; },
        posted: (fn) => { afterPost = fn; },
        statusRead: (fn) => { afterStatus = fn; },
        switchPreflight: (fn) => { beforeSwitch = fn; },
        restoreRouting: () => { current = 'baseline'; },
    };
}

test('unregistered Sanity source refuses review before Vercel access or saving a release', async () => {
    const f = fixture(); await f.connect();
    f.sourceSanity();
    const reads = f.apiAccesses();
    await expect(f.review()).rejects.toThrow('immutable content runtime');
    expect(f.apiAccesses()).toBe(reads);
    expect(f.state().releases).toEqual([]);
    expect(f.state().pending).toBeNull();
});

test('legacy READY Sanity artifacts cannot bypass the content guard through build or direct publish', async () => {
    const f = fixture(); await f.connect(); const id = await f.review();
    f.legacySanityRelease();
    const reads = f.apiAccesses();
    await expect(f.service.startBuild({ ...f.input, releaseId: id })).rejects.toThrow('immutable content runtime');
    await expect(f.service.publish({ ...f.input, releaseId: id })).rejects.toThrow('immutable content runtime');
    expect(f.apiAccesses()).toBe(reads);
    expect(f.builds()).toBe(0);
    expect(f.state().pending).toBeNull();
    expect(f.state().live.deploymentId).toBe('baseline');
});

test('review, protected preview and explicit production build precede live switch and confirmed status', async () => {
    const f = fixture(); await f.connect(); const id = await f.review();
    await expect(f.service.startBuild({ ...f.input, releaseId: id, production: true })).rejects.toThrow('preview');
    await f.service.startBuild({ ...f.input, releaseId: id, production: false });
    await f.service.startBuild({ ...f.input, releaseId: id, production: true });
    const requested = await f.service.publish({ ...f.input, releaseId: id });
    expect(requested.live.deploymentId).toBe('baseline');
    expect(requested.pending.kind).toBe('switch');
    expect((await f.service.status(f.input)).live).toBeNull();
    f.confirm(); const confirmed = await f.service.status(f.input);
    expect(confirmed.live.deploymentId).toBe('build2');
    expect(confirmed.live.previousDeploymentId).toBe('baseline');
    expect(confirmed.pending).toBeNull();
    await f.service.publish({ ...f.input, expectedLiveDeploymentId: confirmed.live.deploymentId, expectedPreviousDeploymentId: 'baseline', expectedDomains: ['customer.example'] }, true);
    expect(f.state().pending.deploymentId).toBe('baseline');
});

test('disabling new live switches still reconciles an existing pending publication', async () => {
    const f = fixture(); await f.connect(); const id = await f.review();
    await f.service.startBuild({ ...f.input, releaseId: id, production: false });
    await f.service.startBuild({ ...f.input, releaseId: id, production: true });
    await f.service.publish({ ...f.input, releaseId: id });
    f.disableSwitch(); f.confirm();
    const status = await f.service.status(f.input);
    expect(status.productionSwitchEnabled).toBe(false);
    expect(status.pending).toBeNull();
    expect(status.live.deploymentId).toBe('build2');
    expect(status.live.previousDeploymentId).toBe('baseline');
});

test('uncertain requests stay pending and cannot trigger a duplicate build', async () => {
    const f = fixture(); await f.connect(); const id = await f.review(); f.failBuild(true);
    await expect(f.service.startBuild({ ...f.input, releaseId: id, production: false })).rejects.toThrow('provider');
    expect(f.state().pending.kind).toBe('build');
    await f.service.status(f.input);
    await expect(f.service.startBuild({ ...f.input, releaseId: id, production: false })).rejects.toThrow('pending');
    expect(f.builds()).toBe(1);
});

test('a definite provider refusal releases intent but keeps the reviewed version', async () => {
    const f = fixture(); await f.connect(); const id = await f.review(); f.failBuild(false);
    await expect(f.service.startBuild({ ...f.input, releaseId: id, production: false })).rejects.toThrow();
    expect(f.state().pending).toBeNull();
    expect(f.state().releases[0].id).toBe(id);
});

test('revoked access, changed source and another publisher prevent provider writes', async () => {
    const revoked = fixture(); await revoked.connect(); const id = await revoked.review(); revoked.revoke();
    await expect(revoked.service.startBuild({ ...revoked.input, releaseId: id, production: false })).rejects.toThrow('revoked');
    expect(revoked.builds()).toBe(0);
    const drifted = fixture(); await drifted.connect(); const changed = await drifted.review(); drifted.drift();
    await expect(drifted.service.startBuild({ ...drifted.input, releaseId: changed, production: false })).rejects.toThrow('source changed');
    expect(drifted.builds()).toBe(0);
    const other = fixture(); await other.connect(); const ready = await other.review();
    await other.service.startBuild({ ...other.input, releaseId: ready, production: false });
    await other.service.startBuild({ ...other.input, releaseId: ready, production: true });
    other.externalPublish();
    await expect(other.service.publish({ ...other.input, releaseId: ready })).rejects.toThrow('Another publisher');
    expect(other.state().pending).toBeNull();
});


test('access revoked in provider preflight cannot send a build', async () => {
    const f = fixture(); await f.connect(); const id = await f.review(); f.preflight(f.revoke);
    await expect(f.service.startBuild({ ...f.input, releaseId: id, production: false })).rejects.toThrow('revoked');
    expect(f.builds()).toBe(0);
    expect(f.state().pending).toBeNull();
});

test('disabled live coordination permits preview but cannot send a production build after preflight', async () => {
    const f = fixture(); await f.connect(); const id = await f.review();
    f.disableSwitch();
    await f.service.startBuild({ ...f.input, releaseId: id, production: false });
    await expect(f.service.startBuild({ ...f.input, releaseId: id, production: true })).rejects.toThrow('shared publishing coordination');
    expect(f.builds()).toBe(1);
    expect(f.state().pending).toBeNull();

    const changed = fixture(); await changed.connect(); const ready = await changed.review();
    await changed.service.startBuild({ ...changed.input, releaseId: ready, production: false });
    changed.preflight(changed.disableSwitch);
    await expect(changed.service.startBuild({ ...changed.input, releaseId: ready, production: true })).rejects.toThrow('shared publishing coordination');
    expect(changed.builds()).toBe(1);
    expect(changed.state().pending).toBeNull();
    expect(changed.state().releases[0].production).toBeUndefined();
});

test('access revoked after provider write preserves reconciliation intent', async () => {
    const f = fixture(); await f.connect(); const id = await f.review(); f.posted(f.revoke);
    await expect(f.service.startBuild({ ...f.input, releaseId: id, production: false })).rejects.toThrow('revoked');
    expect(f.builds()).toBe(1);
    expect(f.state().pending.kind).toBe('build');
    expect(f.state().releases[0].preview).toBeUndefined();
});

test('access revoked during status cannot commit a live-state change', async () => {
    const f = fixture(); await f.connect(); const id = await f.review();
    await f.service.startBuild({ ...f.input, releaseId: id, production: false });
    await f.service.startBuild({ ...f.input, releaseId: id, production: true });
    await f.service.publish({ ...f.input, releaseId: id });
    f.confirm(); f.statusRead(f.revoke);
    await expect(f.service.status(f.input)).rejects.toThrow('revoked');
    expect(f.state().live.deploymentId).toBe('baseline');
    expect(f.state().pending.kind).toBe('switch');
});

test('preview links expose only validated Vercel HTTPS hosts', () => {
    expect(publicDeployment({ id: 'a', readyState: 'READY', url: 'site-123.vercel.app' }).url).toBe('https://site-123.vercel.app');
    for (const url of ['javascript:alert(1)', 'https://evil.example', 'user:password@site.vercel.app', 'site.vercel.app/path']) {
        expect(publicDeployment({ id: 'a', url }).url).toBeNull();
    }
});


test('destination domains are reviewed and later changes cannot build or publish', async () => {
    const f = fixture(); await f.connect(); const id = await f.review();
    expect(f.state().releases[0].target.domains).toEqual(['customer.example']);
    f.changeDomain();
    await expect(f.service.startBuild({ ...f.input, releaseId: id, production: false })).rejects.toThrow('domains changed');
    expect(f.builds()).toBe(0);
});


test('a CMS site cannot publish code alone while its reviewed content integration is unavailable', async () => {
    const f = fixture(); await f.connect(); const id = await f.review(); f.attachCms();
    await expect(f.service.review({ ...f.input, planToken: 'r', cleanedFiles: [] })).rejects.toThrow('CMS content snapshot');
    await expect(f.service.startBuild({ ...f.input, releaseId: id, production: false })).rejects.toThrow('CMS content snapshot');
    expect(f.builds()).toBe(0);
    expect((await f.service.status(f.input)).connected).toBe(true);
});

test('source drift during provider preflight refuses a POST using an older review', async () => {
    const f = fixture(); await f.connect(); const id = await f.review(); f.preflight(f.drift);
    await expect(f.service.startBuild({ ...f.input, releaseId: id, production: false })).rejects.toThrow('source changed');
    expect(f.builds()).toBe(0);
});


test('status withdraws a stale live claim and only explicit reviewed reconciliation adopts an outside publication', async () => {
    const f = fixture(); await f.connect(); await f.review(); f.externalPublish();
    const state = await f.service.status(f.input);
    expect(state.routingChanged).toBe(true);
    expect(state.live).toBeNull();
    expect(state.observedRouting).toEqual({ deploymentId: 'other-publisher', domains: ['customer.example'] });
    await expect(f.service.acceptLive({ ...f.input, expectedLiveDeploymentId: 'baseline', expectedDomains: ['customer.example'] })).rejects.toThrow('changed again');
    const accepted = await f.service.acceptLive({ ...f.input, expectedLiveDeploymentId: 'other-publisher', expectedDomains: ['customer.example'] });
    expect(accepted.routingChanged).toBe(false);
    expect(accepted.live).toEqual({ deploymentId: 'other-publisher', previousDeploymentId: null, releaseId: null });
    expect(accepted.releases).toHaveLength(1);
});

test('domain drift remains blocked until explicitly reviewed, even on a second refresh', async () => {
    const f = fixture(); await f.connect(); await f.review(); f.changeDomain();
    expect((await f.service.status(f.input)).routingChanged).toBe(true);
    expect((await f.service.status(f.input)).routingChanged).toBe(true);
    await expect(f.service.acceptLive({ ...f.input, expectedLiveDeploymentId: 'baseline', expectedDomains: ['customer.example'] })).rejects.toThrow('changed again');
    const accepted = await f.service.acceptLive({ ...f.input, expectedLiveDeploymentId: 'baseline', expectedDomains: ['unreviewed.example'] });
    expect(accepted.routingChanged).toBe(false);
});

test('rollback refuses a version or domain that differs from the displayed confirmation', async () => {
    const f = fixture(); await f.connect(); const id = await f.review();
    await f.service.startBuild({ ...f.input, releaseId: id, production: false });
    await f.service.startBuild({ ...f.input, releaseId: id, production: true });
    await f.service.publish({ ...f.input, releaseId: id }); f.confirm(); await f.service.status(f.input);
    const input = { ...f.input, expectedLiveDeploymentId: 'build2', expectedPreviousDeploymentId: 'baseline', expectedDomains: ['customer.example'] };
    for (const incorrect of [{ expectedLiveDeploymentId: 'older' }, { expectedPreviousDeploymentId: 'different' }, { expectedDomains: ['different.example'] }]) {
        await expect(f.service.publish({ ...input, ...incorrect }, true)).rejects.toThrow(/changed/);
        expect(f.state().pending).toBeNull();
    }
});


test('cancellation after durable intent and before POST retires only the definitely unsent request', async () => {
    const f = fixture(); await f.connect(); const id = await f.review(); f.preflight(f.cancel);
    await expect(f.service.startBuild({ ...f.input, releaseId: id, production: false })).rejects.toThrow('window changed');
    expect(f.builds()).toBe(0);
    expect(f.state().pending).toBeNull();
    f.reopen(); f.preflight(null);
    await f.service.startBuild({ ...f.input, releaseId: id, production: false });
    expect(f.builds()).toBe(1);
});

test('an outside publication also blocks a build without a preceding status refresh', async () => {
    for (const duringPreflight of [false, true]) {
        const f = fixture(); await f.connect(); const id = await f.review();
        if (duringPreflight) f.preflight(f.externalPublish); else f.externalPublish();
        await expect(f.service.startBuild({ ...f.input, releaseId: id, production: false })).rejects.toThrow('Another publisher');
        expect(f.builds()).toBe(0);
        expect(f.state().pending).toBeNull();
    }
});


test('routing drift at the last switch boundary remains blocked even if routing later returns', async () => {
    const f = fixture(); await f.connect(); const id = await f.review();
    await f.service.startBuild({ ...f.input, releaseId: id, production: false });
    await f.service.startBuild({ ...f.input, releaseId: id, production: true });
    f.switchPreflight(f.externalPublish);
    await expect(f.service.publish({ ...f.input, releaseId: id })).rejects.toThrow('Another publisher');
    expect(f.state().pending).toBeNull();
    expect(f.state().routingChanged).toBe(true);
    f.restoreRouting(); f.switchPreflight(null);
    await expect(f.service.publish({ ...f.input, releaseId: id })).rejects.toThrow('outside Weblab');
    expect((await f.service.status(f.input)).routingChanged).toBe(true);
});
