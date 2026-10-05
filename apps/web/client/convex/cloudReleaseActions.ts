'use node';

import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';
import type { Infer } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { action, internalAction } from './_generated/server';
import type { ActionCtx } from './_generated/server';
import type { CloudStudioArtifact, CloudStudioFreezeInput } from './lib/cloudStudioContent';
import type { releaseFile } from './cloudReleasesSchema';
import { manifestHash, prepareReleaseArtifact, sha256 } from './lib/cloudReleaseArtifact';
import { CloudReleaseVercel } from './lib/cloudReleaseVercel';

type File = Infer<typeof releaseFile>;
type Input = { release: Doc<'cloudReleases'>; files: Doc<'cloudReleaseFiles'>[]; baselineFiles: Doc<'cloudReleaseFiles'>[] };
type WorkerInput = Omit<Input, 'baselineFiles'> & { op: Doc<'cloudReleaseOperations'>; destination: Doc<'cloudReleaseDestinations'> };
const inputRef = makeFunctionReference<'query', { releaseId: Id<'cloudReleases'> }, Input>('cloudReleases:_input');
const sealRef = makeFunctionReference<'mutation', { releaseId: Id<'cloudReleases'>; sourceHash: string; hash: string; artifactJson: string; files: File[] }, null>('cloudReleases:_seal');
const workerInputRef = makeFunctionReference<'query', { operationId: Id<'cloudReleaseOperations'>; nonce: string }, WorkerInput | null>('cloudReleases:_workerInput');
const beginRef = makeFunctionReference<'mutation', { operationId: Id<'cloudReleaseOperations'>; nonce: string }, boolean>('cloudReleases:_beginSend');
const resultRef = makeFunctionReference<'mutation', { operationId: Id<'cloudReleaseOperations'>; nonce: string; outcome: 'confirmed' | 'failed' | 'unknown'; deploymentId?: string; deploymentUrl?: string; error?: string; drifted?: boolean; terminalBuildFailure?: boolean }, null>('cloudReleases:_result');

export function plainFile(file: File): File {
    return { path: file.path, kind: file.kind, text: file.text, storageId: file.storageId, hash: file.hash, bytes: file.bytes };
}
export async function verifiedFileBytes(ctx: ActionCtx, file: File): Promise<Uint8Array> {
    let bytes: Uint8Array;
    if (file.text !== undefined) bytes = Buffer.from(file.text, 'utf8');
    else {
        if (!file.storageId) throw new Error('CLOUD_RELEASE_ASSET_MISSING');
        const blob = await ctx.storage.get(file.storageId);
        if (!blob || blob.size !== file.bytes || blob.size > 2_000_000) throw new Error('CLOUD_RELEASE_ASSET_MISSING');
        bytes = new Uint8Array(await blob.arrayBuffer());
    }
    if (bytes.byteLength !== file.bytes || sha256(bytes) !== file.hash) throw new Error('CLOUD_RELEASE_HASH_MISMATCH');
    return bytes;
}

/** Source preparation is free of provider calls and can be resumed using the captured release ID. */
export const prepare = action({
    args: { releaseId: v.id('cloudReleases') },
    handler: async (ctx, { releaseId }) => {
        const input = await ctx.runQuery(inputRef, { releaseId });
        if (input.release.status !== 'captured') return { releaseId, hash: input.release.hash ?? null };
        const source = input.files.map(plainFile);
        for (const file of source) if (file.kind === 'file') await verifiedFileBytes(ctx, file);
        if (input.release.purpose === 'backup') {
            const hash = sha256(JSON.stringify({ source: manifestHash(source), studio: input.release.studioInputJson }));
            await ctx.runMutation(sealRef, { releaseId, sourceHash: manifestHash(source), hash, artifactJson: 'null', files: [] });
            return { releaseId, hash };
        }
        const prepared = prepareReleaseArtifact(source, JSON.parse(input.release.studioInputJson) as CloudStudioFreezeInput | null,
            JSON.parse(input.release.previousArtifactJson) as CloudStudioArtifact | null, input.baselineFiles.map(plainFile));
        const files = prepared.files.map(file => ({ ...file, storageId: file.storageId as Id<'_storage'> | undefined }));
        await ctx.runMutation(sealRef, { releaseId, ...prepared, files });
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
            const token = process.env.WEBLAB_CLOUD_RELEASE_TOKEN, bypass = process.env.WEBLAB_CLOUD_RELEASE_BYPASS;
            if (!token || !bypass) throw new Error('CLOUD_RELEASE_SETUP_REQUIRED');
            const signal = AbortSignal.timeout(210_000);
            const api = new CloudReleaseVercel({ token, bypass, teamId: input.destination.teamId,
                projectId: input.destination.providerProjectId, hostname: input.destination.hostname }, signal);
            await api.verifyProject();
            if (await api.aliasTarget() !== (input.op.expectedDeploymentId ?? null)) throw new Error('CLOUD_RELEASE_ALIAS_CHANGED');
            if (input.op.kind === 'build') {
                const files: Array<{ path: string; bytes: Uint8Array }> = [];
                if (manifestHash(input.files) !== input.op.sourceHash) throw new Error('CLOUD_RELEASE_HASH_MISMATCH');
                for (const file of input.files) if (file.kind === 'file') files.push({ path: file.path, bytes: await verifiedFileBytes(ctx, file) });
                if (!(await ctx.runMutation(beginRef, args))) throw new Error('CLOUD_RELEASE_NOT_ALLOWED');
                sent = true;
                const deploymentId = await api.create(files, input.release._id, input.op.sourceHash);
                while (!signal.aborted) {
                    const deployment = await api.deployment(deploymentId, input.release._id, input.op.sourceHash);
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
