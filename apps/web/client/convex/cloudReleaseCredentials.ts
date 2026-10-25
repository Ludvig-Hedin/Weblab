import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internalMutation, internalQuery } from './_generated/server';
import { cloudError } from './lib/cloudEditor';
import { destinationKey } from './lib/cloudReleasePolicy';
import { hostingHash, IMPORTED_HOSTING_PROFILE } from './lib/cloudImportedHostingState';
import { readImportedHostingExecution } from './lib/cloudImportedHostingBackend';

export const CLOUD_RELEASE_PROFILE = 'cloud-studio-v1';
const MAX_CIPHERTEXT_LENGTH = 32_768;
const MAX_CREDENTIAL_LIFETIME = 90 * 86400_000;
type Context = QueryCtx | MutationCtx;
type Destination = Doc<'cloudReleaseDestinations'>;
const hash = (value: string | undefined): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const positiveInteger = (value: number | undefined): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

function teamAllowed(teamId: string): boolean {
    const configured = process.env.WEBLAB_CLOUD_RELEASE_ACCOUNT_IDS;
    if (!configured) return false;
    const teams = configured.split(',').map(team => team.trim());
    return teams.length <= 8 && teams.every(team => /^team_[A-Za-z0-9]+$/.test(team)) && teams.includes(teamId);
}

/** Identity checks deliberately do not depend on a currently valid spending grant. */
async function destinationScope(ctx: Context, destination: Destination): Promise<Id<'workspaces'> | null> {
    if (destination.hostingProfile !== undefined && destination.hostingProfile !== IMPORTED_HOSTING_PROFILE) return null;
    if (!positiveInteger(destination.generation) || !teamAllowed(destination.teamId)) return null;
    try {
        if (destination.key !== destinationKey(destination.teamId, destination.providerProjectId, destination.hostname)) return null;
    } catch { return null; }
    const [project, branch] = await Promise.all([ctx.db.get(destination.projectId), ctx.db.get(destination.branchId)]);
    if (!project?.workspaceId || !branch || branch.projectId !== project._id) return null;
    if (destination.workspaceId !== undefined && destination.workspaceId !== project.workspaceId) return null;
    if (!(await ctx.db.get(project.workspaceId))) return null;
    const [providerRows, hostnameRows] = await Promise.all([
        ctx.db.query('cloudReleaseDestinations').withIndex('by_teamId_and_providerProjectId', q =>
            q.eq('teamId', destination.teamId).eq('providerProjectId', destination.providerProjectId)).take(2),
        ctx.db.query('cloudReleaseDestinations').withIndex('by_hostname', q => q.eq('hostname', destination.hostname)).take(2),
    ]);
    if (providerRows.length !== 1 || hostnameRows.length !== 1 ||
        providerRows[0]!._id !== destination._id || hostnameRows[0]!._id !== destination._id) return null;
    return project.workspaceId;
}

/** A copied or partly populated credential can never become the current identity. */
async function pinnedCredential(ctx: Context, destination: Destination) {
    const imported = destination.hostingProfile === IMPORTED_HOSTING_PROFILE;
    if ((destination.hostingProfile !== undefined && !imported) || destination.registrationVersion !== (imported ? 2 : 1) || !destination.workspaceId || !destination.credentialId ||
        !positiveInteger(destination.credentialVersion) || !hash(destination.credentialHash) || !hash(destination.providerProof)) return null;
    const row = await ctx.db.get(destination.credentialId);
    if (!row || row.destinationId !== destination._id || row.workspaceId !== destination.workspaceId ||
        row.projectId !== destination.projectId || row.branchId !== destination.branchId ||
        row.teamId !== destination.teamId || row.providerProjectId !== destination.providerProjectId || row.hostname !== destination.hostname ||
        row.hostingProfile !== destination.hostingProfile || row.version !== destination.credentialVersion || row.ciphertextHash !== destination.credentialHash || row.providerProof !== destination.providerProof ||
        !row.ciphertext || row.ciphertext.length > MAX_CIPHERTEXT_LENGTH) return null;
    return row;
}

export async function activeReleaseCredential(ctx: Context, destination: Destination): Promise<Doc<'cloudReleaseCredentials'> | null> {
    if (!(await destinationScope(ctx, destination))) return null;
    const row = await pinnedCredential(ctx, destination);
    return row && Number.isSafeInteger(row.expiresAt) && row.expiresAt > Date.now() && row.revokedAt === undefined ? row : null;
}

function requireGeneration(destination: Destination | null, expectedGeneration: number): asserts destination is Destination {
    if (!positiveInteger(expectedGeneration) || !destination || destination.generation !== expectedGeneration) cloudError('CLOUD_RELEASE_STALE_REGISTRATION');
}
function nextGeneration(destination: Destination): number {
    const generation = destination.generation + 1;
    if (!positiveInteger(generation)) cloudError('CLOUD_RELEASE_STALE_REGISTRATION');
    return generation;
}
async function registrationInput(ctx: Context, destinationId: Id<'cloudReleaseDestinations'>, expectedGeneration: number) {
    const destination = await ctx.db.get(destinationId);
    requireGeneration(destination, expectedGeneration);
    if (destination.lockOperationId || destination.drifted) cloudError('CLOUD_RELEASE_BUSY');
    const workspaceId = await destinationScope(ctx, destination);
    if (!workspaceId) return cloudError('CLOUD_RELEASE_INVALID_REGISTRATION');
    const hasPins = destination.registrationVersion !== undefined || destination.credentialId !== undefined ||
        destination.credentialVersion !== undefined || destination.credentialHash !== undefined || destination.providerProof !== undefined;
    if (hasPins && !(await pinnedCredential(ctx, destination))) cloudError('CLOUD_RELEASE_INVALID_REGISTRATION');
    return { destination, workspaceId };
}

export const _registrationInput = internalQuery({
    args: { destinationId: v.id('cloudReleaseDestinations'), expectedGeneration: v.number() },
    handler: (ctx, args) => registrationInput(ctx, args.destinationId, args.expectedGeneration),
});

/** Finalize only the exact destination state inspected before read-only provider verification. */
export const _register = internalMutation({
    args: {
        destinationId: v.id('cloudReleaseDestinations'), expectedGeneration: v.number(),
        expectedLiveDeploymentId: v.union(v.string(), v.null()), expectedWorkspaceId: v.id('workspaces'), ciphertext: v.string(), ciphertextHash: v.string(),
        providerProof: v.string(), expiresAt: v.number(), expectedHostingProfile: v.optional(v.literal('imported-next-hosting-v1')),
    },
    handler: async (ctx, args) => {
        const { destination, workspaceId } = await registrationInput(ctx, args.destinationId, args.expectedGeneration);
        if (workspaceId !== args.expectedWorkspaceId || (destination.liveDeploymentId ?? null) !== args.expectedLiveDeploymentId ||
            destination.hostingProfile !== args.expectedHostingProfile) cloudError('CLOUD_RELEASE_STALE_REGISTRATION');
        const now = Date.now();
        if (!hash(args.ciphertextHash) || !hash(args.providerProof) || !args.ciphertext || args.ciphertext.length > MAX_CIPHERTEXT_LENGTH ||
            !Number.isSafeInteger(args.expiresAt) || args.expiresAt <= now || args.expiresAt > now + MAX_CREDENTIAL_LIFETIME) cloudError('CLOUD_RELEASE_INVALID_CREDENTIAL');
        const credentialVersion = (destination.credentialVersion ?? 0) + 1;
        if (!positiveInteger(credentialVersion)) cloudError('CLOUD_RELEASE_INVALID_CREDENTIAL');
        const generation = nextGeneration(destination);
        const credentialId = await ctx.db.insert('cloudReleaseCredentials', {
            destinationId: destination._id, workspaceId, projectId: destination.projectId, branchId: destination.branchId,
            teamId: destination.teamId, providerProjectId: destination.providerProjectId, hostname: destination.hostname,
            version: credentialVersion, ciphertext: args.ciphertext, ciphertextHash: args.ciphertextHash,
            providerProof: args.providerProof, expiresAt: args.expiresAt,
            ...(destination.hostingProfile === undefined ? {} : { hostingProfile: destination.hostingProfile }),
        });
        if (destination.credentialId) {
            const previous = await ctx.db.get(destination.credentialId);
            if (previous && previous.revokedAt === undefined) await ctx.db.patch(previous._id, { revokedAt: now });
        }
        await ctx.db.patch(destination._id, {
            registrationVersion: destination.hostingProfile === undefined ? 1 : 2, workspaceId, credentialId, credentialVersion,
            credentialHash: args.ciphertextHash, providerProof: args.providerProof, generation,
            reviewGatewayVerified: false, publicAliasVerified: false,
        });
        return { generation, credentialId, credentialVersion };
    },
});

/** Revocation remains available with an unknown operation or a removed account allowlist. */
export const _revoke = internalMutation({
    args: { destinationId: v.id('cloudReleaseDestinations'), expectedGeneration: v.number() },
    handler: async (ctx, args) => {
        const destination = await ctx.db.get(args.destinationId);
        requireGeneration(destination, args.expectedGeneration);
        const generation = nextGeneration(destination);
        const row = await pinnedCredential(ctx, destination);
        if (!row) return cloudError('CLOUD_RELEASE_INVALID_REGISTRATION');
        if (row.revokedAt === undefined) await ctx.db.patch(row._id, { revokedAt: Date.now() });
        await ctx.db.patch(destination._id, { generation, reviewGatewayVerified: false, publicAliasVerified: false });
        return { generation };
    },
});

export const _recordProof = internalMutation({
    args: {
        destinationId: v.id('cloudReleaseDestinations'), expectedGeneration: v.number(), providerProof: v.string(),
        reviewGatewayVerified: v.boolean(), publicAliasVerified: v.boolean(),
        importedAliasProof: v.optional(v.object({
            releaseId: v.id('cloudReleases'), hash: v.string(), deploymentId: v.string(), deployHash: v.string(), buildPolicyHash: v.string(),
            expectedLiveReleaseId: v.union(v.id('cloudReleases'), v.null()), expectedLiveDeploymentId: v.union(v.string(), v.null()),
        })),
    },
    handler: async (ctx, args) => {
        const destination = await ctx.db.get(args.destinationId);
        requireGeneration(destination, args.expectedGeneration);
        if (destination.lockOperationId || destination.drifted) cloudError('CLOUD_RELEASE_BUSY');
        const row = await activeReleaseCredential(ctx, destination);
        if (!row || row.providerProof !== args.providerProof) cloudError('CLOUD_RELEASE_INVALID_REGISTRATION');
        const importedPublic = destination.hostingProfile === IMPORTED_HOSTING_PROFILE && args.publicAliasVerified;
        if (importedPublic) {
            const proof = args.importedAliasProof;
            if (!proof || !args.reviewGatewayVerified || ![proof.hash, proof.deployHash, proof.buildPolicyHash].every(hostingHash) ||
                (destination.liveReleaseId ?? null) !== proof.expectedLiveReleaseId ||
                (destination.liveDeploymentId ?? null) !== proof.expectedLiveDeploymentId) return cloudError('CLOUD_RELEASE_INVALID_REGISTRATION');
            const release = await ctx.db.get(proof.releaseId);
            if (!release || release.status !== 'ready' || release.projectId !== destination.projectId || release.branchId !== destination.branchId ||
                release.workspaceId !== destination.workspaceId || release.hash !== proof.hash || release.deploymentId !== proof.deploymentId ||
                release.builtDestinationKey !== destination.key) return cloudError('CLOUD_RELEASE_INVALID_REGISTRATION');
            const { candidate } = await readImportedHostingExecution(ctx, release);
            if (candidate.importedHosting.visibility !== 'publishable' || candidate.importedHosting.deployHash !== proof.deployHash ||
                candidate.importedHosting.buildPolicyHash !== proof.buildPolicyHash) return cloudError('CLOUD_RELEASE_INVALID_REGISTRATION');
        } else if (args.importedAliasProof !== undefined) return cloudError('CLOUD_RELEASE_INVALID_REGISTRATION');
        await ctx.db.patch(destination._id, { reviewGatewayVerified: args.reviewGatewayVerified, publicAliasVerified: args.publicAliasVerified });
        return null;
    },
});

/** Internal lost-ack/status lookup: explicit non-secret pins only. */
export const _metadata = internalQuery({
    args: { destinationId: v.id('cloudReleaseDestinations') },
    handler: async (ctx, args) => {
        const destination = await ctx.db.get(args.destinationId);
        if (!destination) return null;
        const row = await pinnedCredential(ctx, destination);
        return {
            destinationId: destination._id, profile: destination.hostingProfile ?? CLOUD_RELEASE_PROFILE, projectId: destination.projectId,
            branchId: destination.branchId, workspaceId: destination.workspaceId ?? null,
            teamId: destination.teamId, providerProjectId: destination.providerProjectId, hostname: destination.hostname,
            generation: destination.generation, registrationVersion: destination.registrationVersion ?? null,
            credentialId: destination.credentialId ?? null, credentialVersion: destination.credentialVersion ?? null,
            credentialHash: destination.credentialHash ?? null, providerProof: destination.providerProof ?? null,
            expiresAt: row?.expiresAt ?? null, revokedAt: row?.revokedAt ?? null,
            reviewGatewayVerified: destination.reviewGatewayVerified, publicAliasVerified: destination.publicAliasVerified,
            liveDeploymentId: destination.liveDeploymentId ?? null, lockOperationId: destination.lockOperationId ?? null,
            drifted: destination.drifted,
        };
    },
});
