'use client';

import type { CodeFileSystem, FileChangeEvent } from '@weblab/file-system';

import { hashContent } from '@/services/sync-engine/sync-engine';
import { enqueue } from './write-queue';

/**
 * Runs while the editor is in offline mode. Watches the in-browser ZenFS
 * volume mounted at the project's branch directory and enqueues every file
 * change to the durable write queue so it can be replayed against the real
 * code provider on reconnect.
 */
export class OfflineWriteWatcher {
    private cleanup: (() => void) | null = null;

    constructor(
        private readonly fs: CodeFileSystem,
        private readonly projectId: string,
        private readonly branchId: string,
    ) {}

    start(): void {
        if (this.cleanup) return;
        this.cleanup = this.fs.watchDirectory('/', (event) => {
            void this.handleEvent(event);
        });
    }

    stop(): void {
        this.cleanup?.();
        this.cleanup = null;
    }

    private async handleEvent(event: FileChangeEvent): Promise<void> {
        const { type, path } = event;
        try {
            if (type === 'create' || type === 'update') {
                const fileInfo = await this.fs.getInfo(path).catch(() => null);
                if (fileInfo?.isDirectory) {
                    await enqueue({
                        projectId: this.projectId,
                        branchId: this.branchId,
                        op: 'mkdir',
                        path,
                    });
                    return;
                }
                const content = await this.fs.readFile(path);
                const baseHash = await hashContent(content);
                await enqueue({
                    projectId: this.projectId,
                    branchId: this.branchId,
                    op: 'write',
                    path,
                    content,
                    baseHash,
                });
            } else if (type === 'delete') {
                await enqueue({
                    projectId: this.projectId,
                    branchId: this.branchId,
                    op: 'delete',
                    path,
                });
            } else if (type === 'rename' && event.oldPath) {
                await enqueue({
                    projectId: this.projectId,
                    branchId: this.branchId,
                    op: 'rename',
                    path,
                    oldPath: event.oldPath,
                });
            }
        } catch (err) {
            console.warn('[offline] failed to enqueue local change', path, err);
        }
    }
}
