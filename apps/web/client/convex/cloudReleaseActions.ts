'use node';

import { importedHostingPrepareArgs } from './cloudReleasesSchema';
import { hasImportedHostingFields } from './lib/cloudImportedHostingBackend';
import { assertImportedHostingOperationPins, type ImportedHostingCandidate } from './lib/cloudImportedHostingState';
import { openRegisteredReleaseCredential } from './lib/cloudReleaseCredentialEnvelope';
import { prepareImportedHostingCandidate } from './lib/cloudImportedHosting';
import type { HostingPrepareRequest, HostingSealRequest, HostingReceipt, HostingPreparationInput } from './lib/cloudImportedHostingBackend';
import { isImportedRelease, importedMetadata } from './lib/cloudImportedRelease';
import { prepareImportedReleaseArtifact } from './lib/cloudImportedReleaseArtifact';
import { MAX_IMPORT_ASSET_BYTES } from './lib/cloudImportManifest';

import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';
import type { Infer } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { action, internalAction } from './_generated/server';
import type { ActionCtx } from './_generated/server';
import type { CloudStudioArtifact, CloudStudioFreezeInput } from './lib/cloudStudioContent';
import type { releaseFile, frozenReleaseFile } from './cloudReleasesSchema';
import { manifestHash, prepareReleaseArtifact, sha256 } from './lib/cloudReleaseArtifact';
import { CloudReleaseVercel, validateImportedHostingManifest, type ImportedVercelPins, type ImportedVercelFile } from './lib/cloudReleaseVercel';

type File = Infer<typeof releaseFile>;
type Input = { release: Doc<'cloudReleases'>; files: Infer<typeof frozenReleaseFile>[]; baselineFiles: Infer<typeof releaseFile>[]; originalFiles?: Infer<typeof releaseFile>[] };
type WorkerInput = Omit<Input, 'baselineFiles'> & { op: Doc<'cloudReleaseOperations'>; destination: Doc<'cloudReleaseDestinations'>; credential: Doc<'cloudReleaseCredentials'>; importedCandidate?: ImportedHostingCandidate };
const inputRef = makeFunctionReference<'query', { releaseId: Id<'cloudReleases'>; expectedActorId?: Id<'users'> }, Input>('cloudReleases:_input');
const sealRef = makeFunctionReference<'mutation', { releaseId: Id<'cloudReleases'>; sourceHash: string; hash: string; artifactJson: string; files: File[]; expectedActorId?: Id<'users'> }, null>('cloudReleases:_seal');
const workerInputRef = makeFunctionReference<'query', { operationId: Id<'cloudReleaseOperations'>; nonce: string }, WorkerInput | null>('cloudReleases:_workerInput');
const beginRef = makeFunctionReference<'mutation', { operationId: Id<'cloudReleaseOperations'>; nonce: string }, boolean>('cloudReleases:_beginSend');
const resultRef = makeFunctionReference<'mutation', { operationId: Id<'cloudReleaseOperations'>; nonce: string; outcome: 'confirmed' | 'failed' | 'unknown'; deploymentId?: string; deploymentUrl?: string; error?: string; drifted?: boolean; terminalBuildFailure?: boolean }, null>('cloudReleases:_result');

const hostingInputRef = makeFunctionReference<'query', HostingPrepareRequest, HostingPreparationInput>('cloudReleases:_hostingInput');
const hostingSealRef = makeFunctionReference<'mutation', HostingSealRequest, HostingReceipt>('cloudReleases:_sealHosting');

export function plainFile(file: File): File {
    return { path: file.path, kind: file.kind, text: file.text, storageId: file.storageId, hash: file.hash, bytes: file.bytes };
}
export async function verifiedFileBytes(ctx: ActionCtx, file: File, assetLimit = 2_000_000): Promise<Uint8Array> {
    let bytes: Uint8Array;
    if (file.text !== undefined) bytes = Buffer.from(file.text, 'utf8');
    else {
        if (!file.storageId) throw new Error('CLOUD_RELEASE_ASSET_MISSING');
        const blob = await ctx.storage.get(file.storageId);
        if (!blob || blob.size !== file.bytes || blob.size > assetLimit) throw new Error('CLOUD_RELEASE_ASSET_MISSING');
        bytes = new Uint8Array(await blob.arrayBuffer());
    }
    if (bytes.byteLength !== file.bytes || sha256(bytes) !== file.hash) throw new Error('CLOUD_RELEASE_HASH_MISMATCH');
    return bytes;
}

/** Free preparation only. No pending row, provider request, scheduler or build allowance is used. */
export const prepareHosting = action({
    args: importedHostingPrepareArgs,
    handler: async (ctx, args): Promise<HostingReceipt> => {
        const input = await ctx.runQuery(hostingInputRef, args);
        if (input.kind === 'existing') return input.receipt;
        const prepared = await prepareImportedHostingCandidate(input.input);
        const retained = new Map<string, { hash: string; bytes: number }>();
        for (const file of [...input.input.source, ...input.input.original]) {
            if (!file.storageId) continue;
            const previous = retained.get(file.storageId);
            if (previous) {
                if (previous.hash !== file.hash || previous.bytes !== file.bytes) throw new Error('CLOUD_IMPORTED_HOSTING_ARTIFACT_MISMATCH');
                continue;
            }
            await verifiedFileBytes(ctx, { ...file, storageId: file.storageId as Id<'_storage'> }, MAX_IMPORT_ASSET_BYTES);
            retained.set(file.storageId, { hash: file.hash, bytes: file.bytes });
        }
        return ctx.runMutation(hostingSealRef, { ...args, sourceHash: prepared.sourceHash, hash: prepared.hash,
            artifactJson: prepared.artifactJson, buildPolicyJson: prepared.buildPolicyJson,
            files: prepared.files.map(file => ({ path: file.path, kind: file.kind, hash: file.hash, bytes: file.bytes,
                ...(file.text === undefined ? {} : { text: file.text }),
                ...(file.storageId === undefined ? {} : { storageId: file.storageId as Id<'_storage'> }) })) });
    },
});

/** Source preparation is free of provider calls and can be resumed using the captured release ID. */
export const prepare = action({
    args: { releaseId: v.id('cloudReleases'), expectedActorId: v.optional(v.id('users')) },
    handler: async (ctx, { releaseId, expectedActorId }) => {
        const input = await ctx.runQuery(inputRef, { releaseId, expectedActorId });
        if (input.release.status !== 'captured') return { releaseId, hash: input.release.hash ?? null };
        const source = input.files.map(plainFile);
        if (isImportedRelease(input.release)) {
            if (!input.originalFiles) throw new Error('CLOUD_IMPORTED_ARTIFACT_INVALID');
            const metadata = importedMetadata(input.release);
            const original = input.originalFiles.map(plainFile);
            const seen = new Set<string>();
            for (const file of [...source, ...original]) {
                if (file.storageId && seen.has(file.storageId)) continue;
                await verifiedFileBytes(ctx, file, MAX_IMPORT_ASSET_BYTES);
                if (file.storageId) seen.add(file.storageId);
            }
            const purpose = input.release.purpose;
            if (purpose !== 'backup' && purpose !== 'private-artifact' && purpose !== 'release') throw new Error('CLOUD_RELEASE_NOT_ALLOWED');
            const frozenSource = input.files.map(file => ({ ...plainFile(file), ...(file.media === undefined ? {} : { media: file.media }) }));
            const prepared = await prepareImportedReleaseArtifact({ purpose, publicationIntent: input.release.publicationIntent, source: frozenSource, original, metadata });
            const files = prepared.files.map(file => ({ ...file, storageId: file.storageId as Id<'_storage'> | undefined }));
            await ctx.runMutation(sealRef, { releaseId, sourceHash: prepared.sourceHash, hash: prepared.hash,
                artifactJson: prepared.artifactJson, files, expectedActorId });
            return { releaseId, hash: prepared.hash };
        }
        for (const file of source) if (file.kind === 'file') await verifiedFileBytes(ctx, file);
        if (input.release.purpose === 'backup') {
            const hash = sha256(JSON.stringify({ source: manifestHash(source), studio: input.release.studioInputJson }));
            await ctx.runMutation(sealRef, { releaseId, sourceHash: manifestHash(source), hash, artifactJson: 'null', files: [], expectedActorId });
            return { releaseId, hash };
        }
        const prepared = prepareReleaseArtifact(source, JSON.parse(input.release.studioInputJson) as CloudStudioFreezeInput | null,
            JSON.parse(input.release.previousArtifactJson) as CloudStudioArtifact | null, input.baselineFiles.map(plainFile));
        const files = prepared.files.map(file => ({ ...file, storageId: file.storageId as Id<'_storage'> | undefined }));
        await ctx.runMutation(sealRef, { releaseId, ...prepared, files, expectedActorId });
        return { releaseId, hash: prepared.hash };
    },
});

/** No provider retries. An interrupted POST keeps its destination locked for explicit recovery. */
export const work = internalAction({
    args: { operationId: v.id('cloudReleaseOperations'), nonce: v.string() },
    handler: async (ctx, args): Promise<null> => {
        let sent = false;
        try {
            const input = await ctx.runQuery(workerInputRef, args);
            if (!input) throw new Error('CLOUD_RELEASE_NOT_ALLOWED');
            const imported = hasImportedHostingFields(input.release);
            let importedPins: ImportedVercelPins | null = null;
            let importedManifest: ImportedVercelFile[] = [];
            if (imported) {
                if (!input.release.importedHosting || !['protected-only', 'publishable'].includes(input.release.importedHosting.visibility) || !input.release.hash ||
                    (input.op.kind !== 'build' && (input.release.importedHosting.visibility !== 'publishable' || !input.importedCandidate)) ||
                    input.destination.hostingProfile !== 'imported-next-hosting-v1' || input.credential.hostingProfile !== input.destination.hostingProfile) throw new Error('CLOUD_RELEASE_NOT_ALLOWED');
                assertImportedHostingOperationPins({ sourceHash: input.op.sourceHash, deployHash: input.op.deployHash, buildPolicyHash: input.op.buildPolicyHash }, input.release.hash, input.release.importedHosting);
                importedPins = { releaseId: input.release._id, candidateHash: input.op.sourceHash,
                    deployHash: input.op.deployHash!, buildPolicyHash: input.op.buildPolicyHash! };
                importedManifest = validateImportedHostingManifest(input.files.map(file => {
                    if (file.kind !== 'file') throw new Error('CLOUD_RELEASE_HASH_MISMATCH');
                    return { path: file.path, kind: file.kind, hash: file.hash, bytes: file.bytes };
                }), importedPins.deployHash);
            } else if (input.destination.hostingProfile !== undefined || input.credential.hostingProfile !== undefined ||
                input.op.deployHash !== undefined || input.op.buildPolicyHash !== undefined) throw new Error('CLOUD_RELEASE_NOT_ALLOWED');
            const { token, bypass } = openRegisteredReleaseCredential(input.credential);
            const signal = AbortSignal.timeout(210_000);
            const api = new CloudReleaseVercel({ token, bypass, teamId: input.destination.teamId,
                projectId: input.destination.providerProjectId, hostname: input.destination.hostname, expectedProof: input.credential.providerProof,
                ...(input.destination.hostingProfile === undefined ? {} : { hostingProfile: input.destination.hostingProfile }) }, signal);
            if (importedPins && input.op.kind !== 'build') {
                if (!input.op.targetDeploymentId || !input.importedCandidate) throw new Error('CLOUD_RELEASE_NOT_READY');
                await api.assignImported({ deploymentId: input.op.targetDeploymentId, expectedPrevious: input.op.expectedDeploymentId ?? null,
                    pins: importedPins, candidate: input.importedCandidate, beforeSend: async () => {
                        if (!(await ctx.runMutation(beginRef, args))) throw new Error('CLOUD_RELEASE_NOT_ALLOWED');
                        sent = true;
                    } });
                await ctx.runMutation(resultRef, { ...args, outcome: 'confirmed', deploymentId: input.op.targetDeploymentId });
                return null;
            }
            await api.verifyProject();
            if (await api.aliasTarget() !== (input.op.expectedDeploymentId ?? null)) throw new Error('CLOUD_RELEASE_ALIAS_CHANGED');
            if (input.op.kind === 'build') {
                const files: Array<{ path: string; bytes: Uint8Array }> = [];
                if (!imported) {
                    if (manifestHash(input.files) !== input.op.sourceHash) throw new Error('CLOUD_RELEASE_HASH_MISMATCH');
                    for (const file of input.files) if (file.kind === 'file') files.push({ path: file.path, bytes: await verifiedFileBytes(ctx, file) });
                }
                signal.throwIfAborted();
                if (!(await ctx.runMutation(beginRef, args))) throw new Error('CLOUD_RELEASE_NOT_ALLOWED');
                sent = true;
                const byPath = new Map(input.files.map(file => [file.path, file]));
                async function* retainedFiles() {
                    for (const descriptor of importedManifest) {
                        signal.throwIfAborted();
                        const file = byPath.get(descriptor.path);
                        if (!file) throw new Error('CLOUD_RELEASE_HASH_MISMATCH');
                        const bytes = await verifiedFileBytes(ctx, file, MAX_IMPORT_ASSET_BYTES);
                        signal.throwIfAborted();
                        yield { path: descriptor.path, bytes };
                    }
                }
                const deploymentId = importedPins ? await api.createImported({ ...importedPins, manifest: importedManifest, files: retainedFiles() }) :
                    await api.create(files, input.release._id, input.op.sourceHash);
                while (!signal.aborted) {
                    const deployment = importedPins ? await api.deploymentImported(deploymentId, importedPins) :
                        await api.deployment(deploymentId, input.release._id, input.op.sourceHash);
                    if (deployment.failed) {
                        if (await api.aliasTarget() !== (input.op.expectedDeploymentId ?? null)) throw new Error('CLOUD_RELEASE_ALIAS_CHANGED');
                        await ctx.runMutation(resultRef, { ...args, outcome: 'failed', terminalBuildFailure: true, deploymentId, error: 'CLOUD_RELEASE_BUILD_FAILED' });
                        return null;
                    }
                    if (deployment.ready) {
                        await api.verifyProtected(deployment.url);
                        await api.verifyServed(deployment.url, true);
                        if (await api.aliasTarget() !== (input.op.expectedDeploymentId ?? null)) throw new Error('CLOUD_RELEASE_ALIAS_CHANGED');
                        await ctx.runMutation(resultRef, { ...args, outcome: 'confirmed', deploymentId, deploymentUrl: deployment.url });
                        return null;
                    }
                    await new Promise(resolve => setTimeout(resolve, 2500));
                }
                throw new Error('CLOUD_RELEASE_BUILD_UNCERTAIN');
            }
            const deploymentId = input.op.targetDeploymentId;
            if (!deploymentId) throw new Error('CLOUD_RELEASE_NOT_READY');
            const deployment = await api.deployment(deploymentId, input.release._id, input.op.sourceHash);
            if (!deployment.ready) throw new Error('CLOUD_RELEASE_NOT_READY');
            await api.verifyServed(deployment.url, true);
            if (!(await ctx.runMutation(beginRef, args))) throw new Error('CLOUD_RELEASE_NOT_ALLOWED');
            sent = true;
            await api.assign(deploymentId, input.op.expectedDeploymentId ?? null);
            await api.verifyProtected(deployment.url);
            await ctx.runMutation(resultRef, { ...args, outcome: 'confirmed', deploymentId });
        } catch (cause) {
            const error = cause instanceof Error && /^CLOUD_RELEASE_[A-Z0-9_]+$/.test(cause.message) ? cause.message : 'CLOUD_RELEASE_PROVIDER_UNCERTAIN';
            await ctx.runMutation(resultRef, { ...args, outcome: sent ? 'unknown' : 'failed', error, drifted: error === 'CLOUD_RELEASE_ALIAS_CHANGED' });
        }
        return null;
    },
});
