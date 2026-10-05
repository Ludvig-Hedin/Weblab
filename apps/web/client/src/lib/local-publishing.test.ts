import { describe, expect, test } from 'bun:test';

import { acquirePublishingRequest, releasePublishingRequest, canBuildRelease, canPublishRelease, cancelPublishing, matchesAcceptLiveReview, matchesRollbackReview, prepareAcceptLiveReview, prepareRollbackReview, preparePublishingReview, publishingFreezeSchema, publishingPlanSchema, publishingStateSchema, requestPublishing, publishingNeedsStatus } from './local-publishing';
import type { NativePublishingBridge, PublishingPlan, PublishingState } from './local-publishing';
import { WEBLAB_DEV_PRELOAD_SCRIPT_PATH } from '@weblab/constants';

const hash = 'a'.repeat(64);
const releaseId = '00000000-0000-4000-8000-000000000001';
test('one renderer owner prevents competing native flows and only its lease can release admission', () => {
    const owner = acquirePublishingRequest();
    expect(owner).not.toBeNull();
    try {
        expect(acquirePublishingRequest()).toBeNull();
        releasePublishingRequest(Symbol('another-dialog'));
        expect(acquirePublishingRequest()).toBeNull();
    } finally { releasePublishingRequest(owner!); }
    const next = acquirePublishingRequest();
    expect(next).not.toBeNull();
    expect(next).not.toBe(owner);
    releasePublishingRequest(next!);
});
test('a missing shared coordination capability defaults to unavailable and prevents live actions', () => {
    const legacy = state();
    delete (legacy as Partial<PublishingState>).productionSwitchEnabled;
    const parsed = publishingStateSchema.parse(legacy);
    expect(parsed.productionSwitchEnabled).toBe(false);
    expect(canPublishRelease(parsed, parsed.releases[0], releaseId)).toBe(false);
    expect(prepareRollbackReview(parsed)).toBeNull();
});
function plan(): PublishingPlan {
    return { copyId: 'copy', planToken: hash, sourceChanged: false, unsupportedChanges: [], changedFiles: [
        { path: 'app/page.tsx', original: 'export default function Page(){return <h1>Hello</h1>}', updated: 'export default function Page(){return <h1 data-oid="heading">Changed</h1>}' },
        { path: 'app/layout.tsx', original: 'export default function Layout(){return <html><body /></html>}', updated: 'export default function Layout(){return <html data-oid="html"><body data-oid="body" /></html>}' },
        { path: WEBLAB_DEV_PRELOAD_SCRIPT_PATH, original: null, updated: 'generated editor runtime' },
    ] };
}
function state(): PublishingState {
    return { connected: true, routingChanged: false, productionSwitchEnabled: true, observedRouting: null, target: { projectId: 'vercel', teamId: null, name: 'Site', domains: ['example.com'] },
        live: { deploymentId: 'old', releaseId: null, previousDeploymentId: null }, pending: null,
        releases: [{ id: releaseId, createdAt: 1, sourceHash: hash, changedFiles: ['app/page.tsx'], includedPaths: ['package.json', 'app/page.tsx'], skippedPaths: ['.env.local'], target: { projectId: 'vercel', teamId: null, name: 'Site', domains: ['example.com'] }, sharedPublicConfig: [],
            preview: { id: 'preview', readyState: 'READY', url: 'https://preview.vercel.app' },
            production: { id: 'production', readyState: 'READY', url: 'https://production.vercel.app' }, publishedAt: null }] };
}

describe('reviewed native publishing', () => {
    test('covers every raw plan path while showing only the cleaned designer diff', () => {
        const reviewed = preparePublishingReview(plan());
        expect(reviewed.cleanedFiles.map((file) => file.path)).toEqual(plan().changedFiles.map((file) => file.path));
        expect(reviewed.changes.map((file) => file.path)).toEqual(['app/page.tsx']);
        expect(reviewed.cleanedFiles[0]?.updated).not.toContain('data-oid');
        expect(reviewed.cleanedFiles[0]?.updated).toContain('Changed');
        expect(reviewed.cleanedFiles[1]?.updated).toBe(plan().changedFiles[1]?.original);
        expect(reviewed.cleanedFiles[2]?.updated).toBe('generated editor runtime');
    });

    test('an unchanged prepared site can freeze its original baseline bytes', () => {
        const input = plan();
        input.changedFiles.shift();
        expect(preparePublishingReview(input).changes).toEqual([]);
        expect(preparePublishingReview({ ...input, changedFiles: [] }).cleanedFiles).toEqual([]);
    });

    test('keeps planned deletions and refuses source drift or duplicate paths', () => {
        const input = plan();
        input.changedFiles.push({ path: 'app/old.tsx', original: 'old', updated: null });
        expect(preparePublishingReview(input).cleanedFiles.at(-1)?.updated).toBeNull();
        expect(() => preparePublishingReview({ ...input, sourceChanged: true })).toThrow();
        expect(() => preparePublishingReview({ ...input, unsupportedChanges: ['image.png'] })).toThrow();
        expect(() => preparePublishingReview({ ...input, changedFiles: [input.changedFiles[0]!, input.changedFiles[0]!] })).toThrow('duplicate');
    });

    test('rejects malformed plans, statuses and unsafe preview URLs', () => {
        expect(publishingPlanSchema.safeParse({ ...plan(), planToken: 'unbound' }).success).toBe(false);
        const input = state();
        expect(publishingStateSchema.safeParse(input).success).toBe(true);
        input.releases[0]!.preview!.url = 'https://evil.example/';
        expect(publishingStateSchema.safeParse(input).success).toBe(false);
        expect(publishingStateSchema.safeParse({ releases: [] }).success).toBe(false);
    });

    test('every operation uses a newly requested session token and captured project scope', async () => {
        const tokens: string[] = [];
        let tokenRequests = 0;
        const bridge: NativePublishingBridge = { cancel: async () => ({ success: true }), request: async (_method, input) => {
            tokens.push(input.jwt);
            expect(input.projectId).toBe('project');
            expect(input.branchId).toBe('branch');
            return { success: true, result: state() };
        } };
        const getToken = async () => `session-${++tokenRequests}`;
        const scope = { projectId: 'project', branchId: 'branch' };
        await requestPublishing(bridge, scope, 'status', {}, getToken, () => undefined);
        await requestPublishing(bridge, scope, 'rollback', { expectedLiveDeploymentId: 'old', expectedPreviousDeploymentId: 'previous', expectedDomains: ['example.com'] }, getToken, () => undefined);
        expect(tokens).toEqual(['session-1', 'session-2']);
    });

    test('a scope change while authentication resolves never sends a native mutation', async () => {
        let current = true;
        let sends = 0;
        const bridge: NativePublishingBridge = { cancel: async () => ({ success: true }), request: async () => { sends++; return { success: true }; } };
        await expect(requestPublishing(bridge, { projectId: 'project', branchId: 'branch' }, 'rollback', { expectedLiveDeploymentId: 'old', expectedPreviousDeploymentId: 'previous', expectedDomains: ['example.com'] },
            async () => { current = false; return 'session'; },
            () => { if (!current) throw new Error('Project changed'); })).rejects.toThrow('Project changed');
        expect(sends).toBe(0);
    });

    test('publishing requires a verified target and the same checked ready preview and production build', () => {
        const input = state();
        expect(canPublishRelease(input, input.releases[0], null)).toBe(false);
        expect(canPublishRelease(input, input.releases[0], releaseId)).toBe(true);
        expect(canPublishRelease({ ...input, target: undefined }, input.releases[0], releaseId)).toBe(false);
        input.pending = { kind: 'switch', deploymentId: 'production', previousDeploymentId: 'old', releaseId, startedAt: 1 };
        expect(canPublishRelease(input, input.releases[0], releaseId)).toBe(false);
    });

    test('builds require a visible review and production cannot skip the checked preview', () => {
        const input = state();
        const release = input.releases[0]!;
        release.preview = null;
        release.production = null;
        expect(canBuildRelease(input, release, false, false, null)).toBe(false);
        expect(canBuildRelease(input, release, true, false, null)).toBe(true);
        expect(canBuildRelease(input, release, true, true, releaseId)).toBe(false);
        release.preview = { id: 'preview', readyState: 'READY', url: 'https://preview.vercel.app' };
        expect(canBuildRelease(input, release, true, true, null)).toBe(false);
        expect(canBuildRelease(input, release, true, true, releaseId)).toBe(true);
        input.productionSwitchEnabled = false;
        expect(canBuildRelease(input, release, true, true, releaseId)).toBe(false);
        release.preview = null;
        expect(canBuildRelease(input, release, true, false, null)).toBe(true);
        input.productionSwitchEnabled = true;
        release.preview = { id: 'preview', readyState: 'READY', url: 'https://preview.vercel.app' };
        input.target!.domains = ['other.example'];
        expect(canBuildRelease(input, release, true, true, releaseId)).toBe(false);
        expect(canPublishRelease(input, release, releaseId)).toBe(false);
    });

    test('only pending or unfinished deployments request status reconciliation', () => {
        const input = state();
        expect(publishingNeedsStatus(input)).toBe(false);
        input.releases[0]!.preview!.readyState = 'BUILDING';
        expect(publishingNeedsStatus(input)).toBe(true);
        input.releases[0]!.preview!.readyState = 'ERROR';
        expect(publishingNeedsStatus(input)).toBe(false);
        input.pending = { kind: 'build', releaseId, target: 'preview', startedAt: 1 };
        expect(publishingNeedsStatus(input)).toBe(true);
    });

    test('a scope change after an ambiguous mutation never accepts its reply', async () => {
        let current = true;
        const bridge: NativePublishingBridge = { cancel: async () => ({ success: true }), request: async () => { current = false; return { success: true, result: state() }; } };
        await expect(requestPublishing(bridge, { projectId: 'project', branchId: 'branch' }, 'publish', { releaseId },
            async () => 'session', () => { if (!current) throw new Error('Project changed'); })).rejects.toThrow('Project changed');
    });

    test('changed routing prevents builds, publishing and rollback', () => {
        const input = state();
        input.live!.previousDeploymentId = 'previous';
        const reviewed = prepareRollbackReview(input)!;
        expect(matchesRollbackReview(input, reviewed)).toBe(true);
        input.routingChanged = true;
        expect(canPublishRelease(input, input.releases[0], releaseId)).toBe(false);
        input.releases[0]!.production = null;
        expect(canBuildRelease(input, input.releases[0], true, true, releaseId)).toBe(false);
        expect(canPublishRelease(input, input.releases[0], releaseId)).toBe(false);
        expect(prepareRollbackReview(input)).toBeNull();
        expect(matchesRollbackReview(input, reviewed)).toBe(false);
    });

    test('rollback pins the displayed live, previous version and domains without accepting fresh replacements', () => {
        const input = state();
        input.live!.previousDeploymentId = 'previous';
        const reviewed = prepareRollbackReview(input)!;
        expect(reviewed).toEqual({ expectedLiveDeploymentId: 'old', expectedPreviousDeploymentId: 'previous', expectedDomains: ['example.com'] });
        input.live!.deploymentId = 'new-live';
        expect(matchesRollbackReview(input, reviewed)).toBe(false);
        input.live!.deploymentId = 'old';
        input.live!.previousDeploymentId = 'new-previous';
        expect(matchesRollbackReview(input, reviewed)).toBe(false);
        input.live!.previousDeploymentId = 'previous';
        input.target!.domains.push('another.example');
        expect(reviewed.expectedDomains).toEqual(['example.com']);
        expect(matchesRollbackReview(input, reviewed)).toBe(false);
    });

    test('native cancellation is invoked before renderer results are dropped', async () => {
        const order: string[] = [];
        const bridge: NativePublishingBridge = { cancel: async () => { order.push('cancel'); return { success: true }; }, request: async () => ({ success: true }) };
        expect(await cancelPublishing(bridge, () => { order.push('invalidate'); })).toBe(true);
        expect(order).toEqual(['cancel', 'invalidate']);
    });

    test('a failed native cancellation still invalidates results and reports failure', async () => {
        let invalidated = false;
        const bridge: NativePublishingBridge = { cancel: async () => { throw new Error('IPC unavailable'); }, request: async () => ({ success: true }) };
        expect(await cancelPublishing(bridge, () => { invalidated = true; })).toBe(false);
        expect(invalidated).toBe(true);
    });

    test('accepting an externally changed baseline pins the version and domains the user saw', () => {
        const input = state();
        expect(prepareAcceptLiveReview(input)).toBeNull();
        input.routingChanged = true;
        input.live = null;
        input.observedRouting = { deploymentId: 'external', domains: ['example.com'] };
        const reviewed = prepareAcceptLiveReview(input)!;
        expect(matchesAcceptLiveReview(input, reviewed)).toBe(true);
        input.observedRouting.deploymentId = 'newer-external';
        expect(matchesAcceptLiveReview(input, reviewed)).toBe(false);
        input.observedRouting.deploymentId = 'external';
        input.observedRouting.domains.push('unreviewed.example');
        expect(reviewed.expectedDomains).toEqual(['example.com']);
        expect(matchesAcceptLiveReview(input, reviewed)).toBe(false);
        input.routingChanged = false;
        expect(matchesAcceptLiveReview(input, reviewed)).toBe(false);
    });

    test('a saved version without a complete uploaded file manifest cannot build', () => {
        const input = state();
        input.releases[0]!.includedPaths = [];
        expect(canPublishRelease(input, input.releases[0], releaseId)).toBe(false);
        input.releases[0]!.production = null;
        expect(canBuildRelease(input, input.releases[0], true, true, releaseId)).toBe(false);
    });
});


test('freeze identifies the newly created artifact even when another instance added unseen history', () => {
    const input = state();
    const unseen = { ...input.releases[0]!, id: '00000000-0000-4000-8000-000000000002', sourceHash: 'b'.repeat(64) };
    const created = { ...input.releases[0]!, id: '00000000-0000-4000-8000-000000000003', sourceHash: 'c'.repeat(64) };
    input.releases.push(unseen, created);
    const result = publishingFreezeSchema.parse({ ...input, createdReleaseId: created.id });
    expect(result.releases.find((release) => release.id === result.createdReleaseId)?.sourceHash).toBe(created.sourceHash);
    expect(publishingFreezeSchema.safeParse(input).success).toBe(false);
    expect(publishingFreezeSchema.safeParse({ ...input, createdReleaseId: '00000000-0000-4000-8000-000000000004' }).success).toBe(false);
    expect(publishingFreezeSchema.safeParse({ ...input, releases: [...input.releases, created], createdReleaseId: created.id }).success).toBe(false);
});
