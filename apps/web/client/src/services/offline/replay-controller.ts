'use client';

import type { Provider } from '@weblab/code-provider';

import { hashContent } from '@/services/sync-engine/sync-engine';
import type { QueueRecord } from './write-queue';
import {
    bumpAttempt,
    getQueueContent,
    listQueueForProject,
    logConflict,
    moveToDeadLetter,
    QUEUE_MAX_ATTEMPTS,
    removeRecord,
} from './write-queue';

export interface ReplayResult {
    drained: number;
    failed: number;
    deadLettered: number;
}

function pathForProvider(rawPath: string): string {
    return rawPath.startsWith('/') ? rawPath.slice(1) : rawPath;
}

/**
 * Drain queued offline writes against a live provider in enqueue order.
 * Last-write-wins semantics: queued local writes always overwrite remote
 * state. Records that fail repeatedly land in the dead-letter store and are
 * surfaced to the user via the offline banner.
 */
export async function replayQueue(
    provider: Provider,
    projectId: string,
    onProgress?: (record: QueueRecord, remaining: number) => void,
): Promise<ReplayResult> {
    const records = await listQueueForProject(projectId);
    let drained = 0;
    let failed = 0;
    let deadLettered = 0;

    for (let i = 0; i < records.length; i++) {
        const record = records[i];
        if (!record) continue;
        const remaining = records.length - i - 1;
        try {
            await applyRecord(provider, record);
            await removeRecord(record);
            drained++;
            onProgress?.(record, remaining);
        } catch (err) {
            failed++;
            const updated = await bumpAttempt(record, err);
            if (updated.attempts >= QUEUE_MAX_ATTEMPTS) {
                await moveToDeadLetter(updated);
                deadLettered++;
            }
            console.warn('[offline] replay failed for', record.path, err);
        }
    }

    return { drained, failed, deadLettered };
}

async function applyRecord(provider: Provider, record: QueueRecord): Promise<void> {
    const path = pathForProvider(record.path);

    switch (record.op) {
        case 'mkdir':
            await provider.createDirectory({ args: { path } });
            return;
        case 'delete':
            await provider.deleteFiles({ args: { path, recursive: true } });
            return;
        case 'rename': {
            if (!record.oldPath) {
                throw new Error('rename record missing oldPath');
            }
            await provider.renameFile({
                args: {
                    oldPath: pathForProvider(record.oldPath),
                    newPath: path,
                },
            });
            return;
        }
        case 'write': {
            const content = await getQueueContent(record);
            if (content === null) {
                throw new Error('write record missing content blob');
            }
            // LWW conflict detection: if the remote content drifted from
            // what we had at queue time, log it BEFORE overwriting so the
            // user can recover the remote version from the conflicts UI.
            if (record.baseHash) {
                try {
                    const remote = await provider.readFile({ args: { path } });
                    const remoteContent = remote.file.content;
                    if (remoteContent !== undefined && remoteContent !== null) {
                        const remoteHash = await hashContent(remoteContent);
                        if (remoteHash !== record.baseHash) {
                            await logConflict({
                                projectId: record.projectId,
                                branchId: record.branchId,
                                path: record.path,
                                baseHash: record.baseHash,
                                remoteContent,
                                remoteHash,
                                localContent: content,
                            });
                        }
                    }
                } catch {
                    // File may not exist remotely (it was created offline).
                    // Treat as no-conflict and proceed.
                }
            }
            await provider.writeFile({
                args: { path, content, overwrite: true },
            });
            return;
        }
    }
}
