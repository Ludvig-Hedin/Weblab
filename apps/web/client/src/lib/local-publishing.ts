import { z } from 'zod';

import { cleanHandoffFile, WEBLAB_HANDOFF_ASSET_PATHS } from '@/components/store/editor/git/handoff-clean';
import type { CleanHandoffFile } from '@/components/store/editor/git/handoff-clean';
import type { ContentSelection } from './sanity-publication-selection';

export interface PublishingAuth {
    projectId: string;
    branchId: string;
    jwt: string;
}

export interface PublishingInputs {
    connect: PublishingAuth & { vercelToken: string; vercelProjectId: string; teamId?: string };
    plan: PublishingAuth;
    review: PublishingAuth & { planToken: string; cleanedFiles: { path: string; updated: string | null }[] };
    startBuild: PublishingAuth & { releaseId: string; production: boolean };
    status: PublishingAuth;
    publish: PublishingAuth & { releaseId: string };
    rollback: PublishingAuth & { expectedLiveDeploymentId: string; expectedPreviousDeploymentId: string; expectedDomains: string[] };
    acceptLive: PublishingAuth & { expectedLiveDeploymentId: string; expectedDomains: string[] };
    prepareContent: PublishingAuth & { connectionId: string; connectionRevision: number; selections: ContentSelection[] };
    resumeContent: PublishingInputs['prepareContent'] & { recovery?: boolean };
    contentStatus: PublishingAuth;
}

export type PublishingMethod = keyof PublishingInputs;
let nativeRequestOwner: symbol | null = null;

/** Native cancellation belongs to one sender, so renderer flows share admission. */
export function acquirePublishingRequest(): symbol | null {
    if (nativeRequestOwner) return null;
    nativeRequestOwner = Symbol('native-publishing-owner');
    return nativeRequestOwner;
}

export function releasePublishingRequest(owner: symbol): void {
    if (nativeRequestOwner === owner) nativeRequestOwner = null;
}
export interface NativePublishingBridge {
    cancel(): Promise<{ success: boolean }>;
    request<M extends PublishingMethod>(method: M, input: PublishingInputs[M]): Promise<{
        success: boolean;
        result?: unknown;
        error?: string;
    }>;
}

const id = z.string().min(1).max(160);
const fileSchema = z.object({ path: z.string().min(1).max(1024), original: z.string().nullable(), updated: z.string().nullable() });
export const publishingPlanSchema = z.object({
    copyId: id,
    changedFiles: z.array(fileSchema).max(100),
    unsupportedChanges: z.array(z.string()),
    sourceChanged: z.boolean(),
    planToken: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
});
export type PublishingPlan = z.infer<typeof publishingPlanSchema>;

const deploymentSchema = z.object({
    id,
    readyState: z.string(),
    url: z.string().regex(/^https:\/\/[a-zA-Z0-9-]+\.vercel\.app$/).nullable(),
});
const targetSchema = z.object({
    projectId: id,
    teamId: id.nullable(),
    name: z.string().min(1).max(160),
    domains: z.array(z.string().regex(/^[A-Za-z0-9.-]{1,253}$/)).min(1).max(50),
});
const releaseSchema = z.object({
    id: z.string().uuid(),
    createdAt: z.number().finite(),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    changedFiles: z.array(z.string()),
    includedPaths: z.array(z.string().min(1).max(1024)).max(50000),
    skippedPaths: z.array(z.string().min(1).max(1024)).max(50000),
    target: targetSchema.nullable(),
    sharedPublicConfig: z.array(z.object({ key: z.string().max(128), value: z.string().max(256) })),
    preview: deploymentSchema.nullable(),
    production: deploymentSchema.nullable(),
    publishedAt: z.number().finite().nullable(),
});
export const publishingStateSchema = z.object({
    connected: z.boolean().optional(),
    name: z.string().optional(),
    target: targetSchema.nullable().optional(),
    routingChanged: z.boolean(),
    productionSwitchEnabled: z.boolean().default(false),
    observedRouting: z.object({ deploymentId: id, domains: z.array(z.string().regex(/^[A-Za-z0-9.-]{1,253}$/)).min(1).max(50) }).nullable(),
    live: z.object({ deploymentId: id, releaseId: z.string().uuid().nullable(), previousDeploymentId: id.nullable() }).nullable(),
    pending: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('build'), releaseId: z.string().uuid(), target: z.enum(['preview', 'production']), startedAt: z.number() }),
        z.object({ kind: z.literal('switch'), deploymentId: id, previousDeploymentId: id, releaseId: z.string().uuid().nullable(), startedAt: z.number() }),
    ]).nullable(),
    releases: z.array(releaseSchema).max(100),
});
export const publishingFreezeSchema = publishingStateSchema.extend({ createdReleaseId: z.string().uuid() }).refine((result) =>
    result.releases.filter((release) => release.id === result.createdReleaseId).length === 1, 'The frozen release identity is missing or duplicated.');
export type PublishingState = z.infer<typeof publishingStateSchema>;
export type PublishingRelease = PublishingState['releases'][number];

export interface PublishingReview {
    planToken: string;
    /** Every raw plan path is required, including cleanup-only and excluded runtime files. */
    cleanedFiles: { path: string; updated: string | null }[];
    /** Only effective cleaned changes are shown as the release diff. */
    changes: CleanHandoffFile[];
}

export function preparePublishingReview(plan: PublishingPlan): PublishingReview {
    if (plan.sourceChanged || plan.unsupportedChanges.length > 0 || !plan.planToken) {
        throw new Error('Project files changed outside this working copy. Review a fresh copy before publishing.');
    }
    const changes: CleanHandoffFile[] = [];
    const paths = new Set<string>();
    const cleanedFiles = plan.changedFiles.map((file) => {
        if (paths.has(file.path)) throw new Error('The release review contains duplicate files.');
        paths.add(file.path);
        if (WEBLAB_HANDOFF_ASSET_PATHS.has(file.path)) {
            // Native policy excludes these generated assets. Its review envelope
            // still requires the path and cannot invent an unplanned deletion.
            return { path: file.path, updated: file.updated };
        }
        const cleaned = cleanHandoffFile(file);
        if (cleaned.updated !== cleaned.original) changes.push(cleaned);
        return { path: cleaned.path, updated: cleaned.updated };
    });
    return { planToken: plan.planToken, cleanedFiles, changes };
}

export function publishingNeedsStatus(state: PublishingState | null): boolean {
    if (!state) return false;
    if (state.pending) return true;
    return state.releases.some((release) => [release.preview, release.production].some((deployment) =>
        deployment && ['QUEUED', 'INITIALIZING', 'BUILDING'].includes(deployment.readyState)));
}

export function previewReady(release: PublishingRelease | undefined): boolean {
    return release?.preview?.readyState === 'READY' && !!release.preview.url;
}

export function canPublishRelease(state: PublishingState, release: PublishingRelease | undefined, checkedPreviewId: string | null): boolean {
    return state.productionSwitchEnabled && !state.routingChanged && !state.pending && !!state.target && state.target.domains.length > 0 &&
        !!release && release.includedPaths.length > 0 && !!release.target && release.target.projectId === state.target.projectId &&
        release.target.teamId === state.target.teamId &&
        [...release.target.domains].sort().join() === [...state.target.domains].sort().join() && previewReady(release) && checkedPreviewId === release.id &&
        release.production?.readyState === 'READY' && state.live?.deploymentId !== release.production.id;
}

export function canBuildRelease(state: PublishingState, release: PublishingRelease | undefined, reviewed: boolean, production: boolean, checkedPreviewId: string | null): boolean {
    if (!reviewed || state.routingChanged || state.pending || !state.target || !release?.target || !release.includedPaths.length ||
        release.target.projectId !== state.target.projectId || release.target.teamId !== state.target.teamId ||
        [...release.target.domains].sort().join() !== [...state.target.domains].sort().join()) return false;
    return production ? state.productionSwitchEnabled && !release.production && previewReady(release) && checkedPreviewId === release.id : !release.preview;
}

export type RollbackReview = Omit<PublishingInputs['rollback'], keyof PublishingAuth>;
export type AcceptLiveReview = Omit<PublishingInputs['acceptLive'], keyof PublishingAuth>;

export function prepareAcceptLiveReview(state: PublishingState): AcceptLiveReview | null {
    if (!state.routingChanged || state.pending || !state.observedRouting?.domains.length) return null;
    return { expectedLiveDeploymentId: state.observedRouting.deploymentId, expectedDomains: [...state.observedRouting.domains] };
}

export function matchesAcceptLiveReview(state: PublishingState, review: AcceptLiveReview): boolean {
    const current = prepareAcceptLiveReview(state);
    return !!current && current.expectedLiveDeploymentId === review.expectedLiveDeploymentId &&
        [...current.expectedDomains].sort().join() === [...review.expectedDomains].sort().join();
}

export function prepareRollbackReview(state: PublishingState): RollbackReview | null {
    if (!state.productionSwitchEnabled || state.routingChanged || state.pending || !state.live?.previousDeploymentId || !state.target?.domains.length) return null;
    return { expectedLiveDeploymentId: state.live.deploymentId,
        expectedPreviousDeploymentId: state.live.previousDeploymentId,
        expectedDomains: [...state.target.domains] };
}

export function matchesRollbackReview(state: PublishingState, review: RollbackReview): boolean {
    const current = prepareRollbackReview(state);
    return !!current && current.expectedLiveDeploymentId === review.expectedLiveDeploymentId &&
        current.expectedPreviousDeploymentId === review.expectedPreviousDeploymentId &&
        [...current.expectedDomains].sort().join() === [...review.expectedDomains].sort().join();
}

/** Invoke native cancellation before invalidating renderer results, even if IPC fails. */
export async function cancelPublishing(bridge: NativePublishingBridge | undefined, invalidate: () => void): Promise<boolean> {
    let result: Promise<{ success: boolean }> | undefined;
    try {
        result = bridge?.cancel();
    } catch {
        return false;
    } finally {
        invalidate();
    }
    try { return result ? (await result).success : true; }
    catch { return false; }
}


/** Fetch the current session for every operation; no renderer credential cache. */
export async function requestPublishing<M extends PublishingMethod>(
    bridge: NativePublishingBridge,
    scope: { projectId: string; branchId: string },
    method: M,
    input: Omit<PublishingInputs[M], keyof PublishingAuth>,
    getSessionToken: () => Promise<string | null>,
    assertCurrent: () => void,
): Promise<unknown> {
    assertCurrent();
    const jwt = await getSessionToken();
    assertCurrent();
    if (!jwt) throw new Error('Sign in again before publishing.');
    const reply = await bridge.request(method, { ...input, ...scope, jwt } as PublishingInputs[M]);
    assertCurrent();
    if (!reply.success) throw new Error(reply.error || 'Publishing could not be confirmed.');
    return reply.result;
}
