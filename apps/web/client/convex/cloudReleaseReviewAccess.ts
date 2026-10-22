import { importedPublicationEnabled } from './cloudEditorAccess';
import { sourceProfileCapabilities } from './lib/cloudImportManifest';
import { releaseIsRemoving, isImportedRelease, importedSnapshotsEnabled } from './lib/cloudImportedRelease';
import { hasImportedHostingFields, readImportedHostingExecution } from './lib/cloudImportedHostingBackend';
import { assertRetainedReviewMedia, retainedReviewMediaPath, retainedReviewMediaType, type RetainedReviewMedia } from './lib/cloudReleaseReviewMedia';
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internalQuery, mutation, query } from './_generated/server';
import { requireCloudAccess } from './cloudEditorAccess';
import { can } from './lib/auth';
import { cloudError } from './lib/cloudEditor';
import { getUserByClerkIdSafe } from './lib/permissions';
import { requireCloudProjectCapability } from './lib/cloudProjectAdmission';
import { isolatedReleaseReviewHost } from './lib/cloudReleaseReviewHost';
import { activeReleaseCredential } from './cloudReleaseCredentials';

type Context = MutationCtx | QueryCtx;
const valid = (value: string) => /^[a-f0-9]{64}$/.test(value);
export async function reviewDigest(value: string) {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
}
function verifierAllowed(value: string) {
    const expected = process.env.WEBLAB_CLOUD_RELEASE_REVIEW_SECRET ?? '';
    if (!valid(value) || !valid(expected)) return false;
    let difference = 0;
    for (let index = 0; index < 64; index++) difference |= value.charCodeAt(index) ^ expected.charCodeAt(index);
    return difference === 0;
}
export function releaseReviewConfigured() {
    const origin = process.env.WEBLAB_CLOUD_RELEASE_APP_ORIGIN ?? '';
    const suffix = process.env.WEBLAB_CLOUD_RELEASE_REVIEW_HOST_SUFFIX ?? '';
    return process.env.WEBLAB_CLOUD_RELEASES_ENABLED === 'true'
            && process.env.WEBLAB_CLOUD_EDITOR_ENABLED === 'true'
            && valid(process.env.WEBLAB_CLOUD_RELEASE_REVIEW_SECRET ?? '')
            && isolatedReleaseReviewHost(origin, suffix, process.env.CLERK_JWT_ISSUER_DOMAIN);
}
async function target(ctx: Context, releaseId: Id<'cloudReleases'>) {
    if (!releaseReviewConfigured()) return null;
    const release = await ctx.db.get(releaseId);
    if (!release || releaseIsRemoving(release) || isImportedRelease(release) || release.purpose !== 'release' || release.status !== 'ready' || !release.hash || !release.deploymentId || !release.deploymentUrl) return null;
    const destination = await ctx.db.query('cloudReleaseDestinations').withIndex('by_branchId', q => q.eq('branchId', release.branchId)).unique();
    if (!destination || destination.projectId !== release.projectId || destination.drifted
        || destination.approvedUntil <= Date.now() || destination.key !== release.builtDestinationKey
        ) return null;
    const credential = await activeReleaseCredential(ctx, destination);
    if (!credential) return null;
    let hosting: Awaited<ReturnType<typeof readImportedHostingExecution>> | undefined;
    if (hasImportedHostingFields(release)) {
        if (!release.importedHosting || (release.importedHosting.visibility === 'publishable' && !importedPublicationEnabled()) || !importedSnapshotsEnabled() || destination.hostingProfile !== 'imported-next-hosting-v1' ||
            destination.workspaceId !== release.workspaceId || credential.hostingProfile !== destination.hostingProfile) return null;
        try { hosting = await readImportedHostingExecution(ctx, release); } catch { return null; }
    } else if (destination.hostingProfile !== undefined || credential.hostingProfile !== undefined) return null;
    return { release, destination, credential, hosting };
}
/** Same current membership policy as cloudPreviewAccess, without any Clerk session on the review host. */
async function actorAllowed(ctx: Context, release: Doc<'cloudReleases'>, actorId: Id<'users'>, bootstrap: boolean) {
    const [user, project, branch, state, workspace] = await Promise.all([
        ctx.db.get(actorId), ctx.db.get(release.projectId), ctx.db.get(release.branchId),
        ctx.db.query('cloudEditorStates').withIndex('by_branchId', q => q.eq('branchId', release.branchId)).unique(), ctx.db.get(release.workspaceId),
    ]);
    const imported = hasImportedHostingFields(release);
    if (!user?.clerkUserId || !project || !branch || !workspace || !state || state.version !== 1 ||
        (imported ? !importedSnapshotsEnabled() || state.profile !== 'imported-next-v1' : !sourceProfileCapabilities(state.profile).release)
        || branch.projectId !== project._id || project.workspaceId !== workspace._id
        || state.projectId !== project._id || state.workspaceId !== workspace._id
        || (await getUserByClerkIdSafe(ctx, user.clerkUserId))?._id !== user._id) return false;
    const [member, workspaceMember, grant] = await Promise.all([
        ctx.db.query('projectMembers').withIndex('by_project_user', q => q.eq('projectId', project._id).eq('userId', actorId)).unique(),
        ctx.db.query('workspaceMembers').withIndex('by_workspace_user', q => q.eq('workspaceId', workspace._id).eq('userId', actorId)).unique(),
        ctx.db.query('cloudEditorGrants').withIndex('by_projectId_userId', q => q.eq('projectId', project._id).eq('userId', actorId)).unique(),
    ]);
    const role = grant?.role ?? (state.createdByUserId === actorId ? 'responsible' : null);
    const resource = {
        workspace: { id: workspace._id, createdByUserId: workspace.createdByUserId }, workspaceRole: workspaceMember?.role ?? null,
        project: { id: project._id, accessMode: project.accessMode, workspaceId: workspace._id }, projectRole: member?.role ?? null,
    };
    // First gateway proof needs a real protected build. Only a current manager
    // may inspect it until that proof is recorded, including on later requests.
    return !!role && can('project.view', resource) &&
        (!bootstrap || (role === 'responsible' && can('project.invite', resource)));
}
async function authorizeContext(ctx: Context, row: Doc<'cloudReleaseReviewTickets'> | null, releaseId: Id<'cloudReleases'>) {
    if (!row || row.releaseId !== releaseId || row.expiresAt <= Date.now()) return null;
    const current = await target(ctx, releaseId);
    if (!current || current.destination._id !== row.destinationId || current.destination.generation !== row.generation
        || current.release.hash !== row.hash || current.release.deploymentId !== row.deploymentId
        || !(await actorAllowed(ctx, current.release, row.actorId, !current.destination.reviewGatewayVerified))) return null;
    const publicTarget = { deploymentUrl: current.release.deploymentUrl!, deploymentId: row.deploymentId, hash: row.hash, expiresAt: row.expiresAt,
        destinationId: current.destination._id, generation: current.destination.generation, credentialId: current.credential._id,
        credentialVersion: current.credential.version, credentialHash: current.credential.ciphertextHash, providerProof: current.credential.providerProof,
        teamId: current.destination.teamId, providerProjectId: current.destination.providerProjectId, hostname: current.destination.hostname,
        ...(current.release.importedHosting ? { hostingProfile: current.release.importedHosting.profile,
            deployHash: current.release.importedHosting.deployHash, buildPolicyHash: current.release.importedHosting.buildPolicyHash } : {}) };
    return { target: publicTarget, credential: current.credential, hosting: current.hosting };
}
async function authorizeRow(ctx: Context, row: Doc<'cloudReleaseReviewTickets'> | null, releaseId: Id<'cloudReleases'>) {
    return (await authorizeContext(ctx, row, releaseId))?.target ?? null;
}

export const issue = mutation({
    args: { releaseId: v.id('cloudReleases') },
    handler: async (ctx, { releaseId }) => {
        const current = await target(ctx, releaseId);
        if (!current) return cloudError('CLOUD_RELEASE_REVIEW_UNAVAILABLE');
        // A retained review does not depend on today's mutable preparation/source head.
        const access = hasImportedHostingFields(current.release) ? await requireCloudProjectCapability(ctx, current.release) :
            await requireCloudAccess(ctx, current.release);
        if (!(await actorAllowed(ctx, current.release, access.user._id, !current.destination.reviewGatewayVerified))) return cloudError('CLOUD_RELEASE_NOT_ALLOWED');
        const prior = await ctx.db.query('cloudReleaseReviewTickets').withIndex('by_releaseId_and_actorId', q => q.eq('releaseId', releaseId).eq('actorId', access.user._id)).unique();
        if (!prior) {
            const rows = await ctx.db.query('cloudReleaseReviewTickets').withIndex('by_releaseId_and_actorId', q => q.eq('releaseId', releaseId)).take(102);
            let retained = rows.length;
            for (const row of rows) if (row.expiresAt <= Date.now()) { await ctx.db.delete(row._id); retained--; }
            if (retained >= 101) return cloudError('CLOUD_RELEASE_REVIEW_LIMIT');
        }
        const ticket = await reviewDigest(`${crypto.randomUUID()}/${crypto.randomUUID()}`);
        const now = Date.now();
        const value = { releaseId, actorId: access.user._id, destinationId: current.destination._id,
            generation: current.destination.generation, deploymentId: current.release.deploymentId!, hash: current.release.hash!,
            ticketHash: await reviewDigest(ticket), exchangeExpiresAt: now + 60_000,
            expiresAt: Math.min(now + 15 * 60_000, current.destination.approvedUntil) };
        if (prior) await ctx.db.replace(prior._id, value);
        else await ctx.db.insert('cloudReleaseReviewTickets', value);
        return { ticket, url: `https://${releaseId}.${process.env.WEBLAB_CLOUD_RELEASE_REVIEW_HOST_SUFFIX}/__weblab_review_access` };
    },
});

export const exchange = mutation({
    args: { protocol: v.literal(2), releaseId: v.id('cloudReleases'), verifier: v.string(), ticket: v.string(), sessionHash: v.string() },
    handler: async (ctx, args) => {
        if (args.protocol !== 2 || !verifierAllowed(args.verifier) || !valid(args.ticket) || !valid(args.sessionHash)) return null;
        const ticketHash = await reviewDigest(args.ticket);
        const row = await ctx.db.query('cloudReleaseReviewTickets').withIndex('by_ticketHash', q => q.eq('ticketHash', ticketHash)).unique();
        if (!row || row.exchangeExpiresAt <= Date.now() || row.sessionHash) return null;
        const allowed = await authorizeRow(ctx, row, args.releaseId);
        if (!allowed) return null;
        await ctx.db.patch(row._id, { ticketHash: '', sessionHash: args.sessionHash });
        return allowed;
    },
});

export const authorize = query({
    args: { protocol: v.literal(2), releaseId: v.id('cloudReleases'), verifier: v.string(), session: v.string() },
    handler: async (ctx, args) => {
        if (args.protocol !== 2 || !verifierAllowed(args.verifier) || !valid(args.session)) return null;
        const sessionHash = await reviewDigest(args.session);
        const row = await ctx.db.query('cloudReleaseReviewTickets').withIndex('by_sessionHash', q => q.eq('sessionHash', sessionHash)).unique();
        return authorizeRow(ctx, row, args.releaseId);
    },
});

/** Only the Node server-credential action calls this; public queries never return ciphertext. */
export const _credentialContext = internalQuery({
    args: { releaseId: v.id('cloudReleases'), session: v.string(), mediaRequest: v.optional(v.object({ path: v.array(v.string()), search: v.string() })) },
    handler: async (ctx, args) => {
        if (!valid(args.session)) return null;
        const sessionHash = await reviewDigest(args.session);
        const row = await ctx.db.query('cloudReleaseReviewTickets').withIndex('by_sessionHash', q => q.eq('sessionHash', sessionHash)).unique();
        const authorized = await authorizeContext(ctx, row, args.releaseId);
        if (!authorized) return null;
        const { target, credential, hosting } = authorized;
        let media: RetainedReviewMedia | undefined;
        if (target.hostingProfile && args.mediaRequest && !args.mediaRequest.search && args.mediaRequest.path.length && args.mediaRequest.path[0] !== '_next') {
            const path = retainedReviewMediaPath(args.mediaRequest.path);
            const contentType = retainedReviewMediaType(path);
            if (contentType) {
                if (!hosting) return null;
                const files = hosting.deployFiles.filter(file => file.path === path);
                if (files.length > 1) return null;
                const file = files[0];
                if (file?.storageId) {
                    media = { kind: 'imported-retained-media-v1', releaseHash: target.hash, path, hash: file.hash, bytes: file.bytes, contentType };
                    assertRetainedReviewMedia(media, target.hash, args.mediaRequest.path, args.mediaRequest.search);
                }
            }
        }
        return { target, credential, ...(media ? { media } : {}) };
    },
});
