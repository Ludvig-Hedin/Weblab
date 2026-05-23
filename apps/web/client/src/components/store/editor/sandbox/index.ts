import { makeAutoObservable, reaction, runInAction } from 'mobx';

import type { Provider } from '@weblab/code-provider';
import type { CodeFileSystem } from '@weblab/file-system';
import type { Branch, RouterConfig } from '@weblab/models';
import { EXCLUDED_SYNC_PATHS } from '@weblab/constants';
import { type FileEntry } from '@weblab/file-system';

import type { EditorEngine } from '../engine';
import type { ErrorManager } from '../error';
import { OfflineWriteWatcher } from '@/services/offline/write-queue-watcher';
import { CodeProviderSync } from '@/services/sync-engine/sync-engine';
import { GitManager } from '../git';
import { detectRouterConfig } from '../pages/helper';
import { isSandboxGoneError } from './errors';
import {
    copyPreloadScriptToPublic,
    copyPreloadScriptToStaticHtml,
    getLayoutPath as detectLayoutPath,
} from './preload-script';
import { SessionManager } from './session';

export enum PreloadScriptState {
    NOT_INJECTED = 'not-injected',
    LOADING = 'loading',
    INJECTED = 'injected',
}

const PRELOAD_RETRY_DELAY_MS = 2000;
const MAX_PRELOAD_RETRY_ATTEMPTS = 5;

export class SandboxManager {
    readonly session: SessionManager;
    readonly gitManager: GitManager;
    private providerReactionDisposer?: () => void;
    private sync: CodeProviderSync | null = null;
    private offlineWatcher: OfflineWriteWatcher | null = null;
    private preloadRetryTimeout: ReturnType<typeof setTimeout> | null = null;
    private preloadRetryCount = 0;
    /**
     * When true the provider reaction skips sync-engine init. Used during
     * the offline → online swap so the durable write queue can be drained
     * before `pullFromSandbox` runs; otherwise the pull would overwrite
     * just-edited ZenFS files with stale CSB content.
     */
    private suppressSyncInit = false;
    preloadScriptState: PreloadScriptState = PreloadScriptState.NOT_INJECTED;
    routerConfig: RouterConfig | null = null;
    /**
     * Set true by the primary (Desktop) frame once its penpal handshake
     * completes. Sibling breakpoint frames wait on this before mounting
     * their own iframe so the CSB dev server only cold-compiles once,
     * then serves cached chunks to siblings. Without this all 3
     * breakpoint frames hit `next dev` in parallel during the first
     * compile and triple the perceived load time.
     */
    primaryFrameAlive = false;

    setPrimaryFrameAlive(alive: boolean) {
        this.primaryFrameAlive = alive;
    }

    constructor(
        private branch: Branch,
        private readonly editorEngine: EditorEngine,
        private readonly errorManager: ErrorManager,
        private readonly fs: CodeFileSystem,
    ) {
        this.session = new SessionManager(this.branch, this.errorManager);
        this.gitManager = new GitManager(this);
        makeAutoObservable(this);
    }

    async init() {
        // Defensive: a branch with no real sandbox id (test fixtures, synthetic
        // projects created directly via Convex mutation without forking a
        // CodeSandbox / Vercel Sandbox) used to throw
        // `TypeError: Cannot read properties of undefined (reading 'id')`
        // here and crashed the entire editor mount. Skip the session start
        // instead — the reaction below still wires up when (if) a provider
        // becomes available later.
        const sandboxId = this.branch?.sandbox?.id;
        if (!this.session.provider && sandboxId) {
            this.session.start(sandboxId).catch((err) => {
                console.error('[SandboxManager] Initial connection failed:', err);
                // Don't throw - let reaction handle retries/reconnects
            });
        } else if (!sandboxId) {
            console.warn(
                '[SandboxManager] Branch has no sandbox.id — skipping session start. The editor will mount in a no-sandbox state; reconnect when a sandbox is provisioned.',
            );
        }

        // React to provider becoming available (now or later)
        this.providerReactionDisposer = reaction(
            () => this.session.provider,
            async (provider) => {
                if (provider) {
                    // Offline path: skip the bidirectional sync engine. The
                    // OfflineProvider would return empty file lists which
                    // would wipe ZenFS via the initial `pullFromSandbox`
                    // delete pass. Just rebuild the index so the file tree
                    // shows whatever's already cached in ZenFS, and start
                    // the offline write watcher so edits get queued for
                    // replay on reconnect.
                    if (this.session.isOffline) {
                        await this.fs.rebuildIndex();
                        this.startOfflineWatcher();
                    } else if (this.branch.runtime.type === 'local') {
                        this.stopOfflineWatcher();
                        await this.fs.rebuildIndex();
                    } else if (this.suppressSyncInit) {
                        // Replay-in-progress: don't run pullFromSandbox yet.
                        // resumeSyncInit() will fire init manually once the
                        // queue has drained.
                        this.stopOfflineWatcher();
                    } else {
                        this.stopOfflineWatcher();
                        try {
                            await this.initializeSyncEngine(provider);
                        } catch (err) {
                            // 410 here means the Vercel sandbox got
                            // reclaimed between session start and the
                            // first listFiles call. Mark the session as
                            // gone so subsequent reaction passes skip
                            // the cascade, and let the Restore CTA take
                            // over instead of bubbling a noisy error.
                            if (isSandboxGoneError(err)) {
                                runInAction(() => {
                                    this.session.sandboxGone = true;
                                });
                                console.warn(
                                    '[SandboxManager] Sync engine init aborted — sandbox is gone (410). Waiting for restore.',
                                );
                                return;
                            }
                            throw err;
                        }
                    }
                    // Fire-and-forget: GitManager.init runs sandbox
                    // shell commands (git config, init, listCommits)
                    // that can take 500-2000ms on cold boot. Nothing
                    // in the first-paint path depends on it — the git
                    // panel lazy-reads from gitManager and version
                    // history is opt-in. Awaiting here blocks the
                    // editor's "ready" signal for no user benefit.
                    void this.gitManager.init().catch((err) => {
                        if (isSandboxGoneError(err)) {
                            // Same 410 short-circuit as the sync engine
                            // path. The restore flow will refork the
                            // sandbox and trigger a fresh start.
                            runInAction(() => {
                                this.session.sandboxGone = true;
                            });
                            return;
                        }
                        console.error('[SandboxManager] gitManager.init failed:', err);
                    });
                } else if (this.sync) {
                    // If the provider is null, release the sync engine reference
                    this.sync.release();
                    this.sync = null;
                }
            },
            { fireImmediately: true },
        );
    }

    async getRouterConfig(): Promise<RouterConfig | null> {
        if (this.routerConfig) {
            return this.routerConfig;
        }
        if (!this.session.provider) {
            throw new Error('Provider not initialized');
        }
        this.routerConfig = await detectRouterConfig(this.session.provider);
        return this.routerConfig;
    }

    /**
     * Block the provider-reaction sync engine init. Call BEFORE swapping the
     * offline shim for the cloud provider, drain the durable write queue,
     * then call `resumeSyncInit()` to run the deferred `initializeSyncEngine`.
     */
    suppressSyncInitForReplay(): void {
        this.suppressSyncInit = true;
    }

    /**
     * Lift the suppress flag and run the deferred sync engine init against
     * the current provider. Safe to call when no provider is attached — it
     * becomes a no-op until one is.
     */
    async resumeSyncInit(): Promise<void> {
        this.suppressSyncInit = false;
        const provider = this.session.provider;
        if (!provider) return;
        if (this.session.isOffline) return;
        if (this.branch.runtime.type === 'local') {
            await this.fs.rebuildIndex();
            return;
        }
        this.stopOfflineWatcher();
        await this.initializeSyncEngine(provider);
    }

    private startOfflineWatcher() {
        if (this.offlineWatcher) return;
        this.offlineWatcher = new OfflineWriteWatcher(
            this.fs,
            this.branch.projectId,
            this.branch.id,
        );
        this.offlineWatcher.start();
    }

    private stopOfflineWatcher() {
        if (!this.offlineWatcher) return;
        this.offlineWatcher.stop();
        this.offlineWatcher = null;
    }

    async initializeSyncEngine(provider: Provider) {
        if (this.sync) {
            this.sync.release();
            this.sync = null;
        }

        // Defensive: see `init()` above. If we ever reach this branch without
        // a real sandbox id, fail loud here rather than crashing the editor
        // mount — sync engine needs a sandbox to talk to.
        const sandboxId = this.branch?.sandbox?.id;
        if (!sandboxId) {
            console.warn(
                '[SandboxManager] initializeSyncEngine called without a sandbox id — skipping sync.',
            );
            return;
        }
        this.sync = CodeProviderSync.getInstance(provider, this.fs, sandboxId, {
            exclude: EXCLUDED_SYNC_PATHS,
        });

        await this.sync.start();
        await this.ensurePreloadScriptExists();
        await this.fs.rebuildIndex();
    }

    private async ensurePreloadScriptExists(): Promise<void> {
        // Sentinel for the common transient case: the sandbox file system
        // hasn't synced yet so the App/Pages router directory doesn't show up
        // on the first attempt. We retry quietly and only escalate to a real
        // error once attempts are exhausted (~10s wall clock with the current
        // retry settings) so the console isn't flooded during normal cold-boot.
        const MISSING_ROUTER_CONFIG = '__missing_router_config__';
        try {
            if (this.preloadScriptState !== PreloadScriptState.NOT_INJECTED) {
                return;
            }
            // Sandbox reclaimed: skip preload injection entirely. Each
            // listFiles/readFile/writeFile inside copyPreloadScriptToPublic
            // would throw 410, and our retry loop (up to 5x with 2s
            // backoff) would multiply that into ~15 console errors before
            // exhausting. Restore CTA owns recovery.
            if (this.session.sandboxGone) {
                runInAction(() => {
                    this.preloadScriptState = PreloadScriptState.NOT_INJECTED;
                });
                return;
            }

            runInAction(() => {
                this.preloadScriptState = PreloadScriptState.LOADING;
            });

            if (!this.session.provider) {
                throw new Error('No provider available for preload script injection');
            }

            // Static-HTML projects don't have a Next.js router or layout file
            // to inject into. Use the dedicated path that writes the preload
            // bundle to the project root and injects a <script> tag into
            // index.html's <head>.
            if (this.editorEngine.framework === 'static-html') {
                await copyPreloadScriptToStaticHtml(this.session.provider);
            } else {
                const routerConfig = await this.getRouterConfig();
                if (!routerConfig) {
                    throw new Error(MISSING_ROUTER_CONFIG);
                }
                await copyPreloadScriptToPublic(this.session.provider, routerConfig);
            }
            runInAction(() => {
                this.preloadScriptState = PreloadScriptState.INJECTED;
                this.preloadRetryCount = 0;
                if (this.preloadRetryTimeout) {
                    clearTimeout(this.preloadRetryTimeout);
                    this.preloadRetryTimeout = null;
                }
            });
        } catch (error) {
            // 410 surfaced from one of the inner provider calls (listFiles
            // / readFile / writeFile in copyPreloadScriptToPublic). Latch
            // sandboxGone so the next reaction pass skips the cascade and
            // don't schedule another retry — the Restore CTA will reset
            // state and re-fire init when a fresh sandbox forks.
            if (isSandboxGoneError(error)) {
                runInAction(() => {
                    this.session.sandboxGone = true;
                    this.preloadScriptState = PreloadScriptState.NOT_INJECTED;
                });
                console.debug(
                    '[SandboxManager] Preload script injection aborted — sandbox is gone (410).',
                );
                return;
            }
            const isTransient = error instanceof Error && error.message === MISSING_ROUTER_CONFIG;
            const willRetry = this.preloadRetryCount < MAX_PRELOAD_RETRY_ATTEMPTS;
            if (isTransient && willRetry) {
                // Sandbox files probably haven't synced yet. The reaction-driven
                // retry below handles this — keep the console clean.
                console.debug(
                    '[SandboxManager] Router config not detected yet, retrying preload injection…',
                );
            } else {
                console.error('[SandboxManager] Failed to ensure preload script exists:', error);
            }
            runInAction(() => {
                this.preloadScriptState = PreloadScriptState.NOT_INJECTED;
            });
            this.schedulePreloadRetry();
        }
    }

    private schedulePreloadRetry(): void {
        if (this.preloadRetryTimeout || this.preloadRetryCount >= MAX_PRELOAD_RETRY_ATTEMPTS) {
            return;
        }

        this.preloadRetryCount += 1;
        this.preloadRetryTimeout = setTimeout(() => {
            this.preloadRetryTimeout = null;
            void this.ensurePreloadScriptExists();
        }, PRELOAD_RETRY_DELAY_MS);
    }

    async getLayoutPath(): Promise<string | null> {
        const routerConfig = await this.getRouterConfig();
        if (!routerConfig) {
            return null;
        }
        return detectLayoutPath(routerConfig, (path) => this.fileExists(path));
    }

    get errors() {
        return this.errorManager.errors;
    }

    get syncEngine() {
        return this.sync;
    }

    async readFile(path: string): Promise<string | Uint8Array> {
        if (!this.fs) throw new Error('File system not initialized');
        return this.fs.readFile(path);
    }

    async writeFile(path: string, content: string | Uint8Array): Promise<void> {
        if (!this.fs) throw new Error('File system not initialized');
        return this.fs.writeFile(path, content);
    }

    listAllFiles() {
        if (!this.fs) throw new Error('File system not initialized');
        return this.fs.listAll();
    }

    async readDir(dir: string): Promise<FileEntry[]> {
        if (!this.fs) throw new Error('File system not initialized');
        return this.fs.readDirectory(dir);
    }

    async listFilesRecursively(dir: string): Promise<string[]> {
        if (!this.fs) throw new Error('File system not initialized');
        return this.fs.listFiles(dir);
    }

    async fileExists(path: string): Promise<boolean> {
        if (!this.fs) throw new Error('File system not initialized');
        return this.fs?.exists(path);
    }

    async copyFile(path: string, targetPath: string): Promise<void> {
        if (!this.fs) throw new Error('File system not initialized');
        return this.fs.copyFile(path, targetPath);
    }

    async copyDirectory(path: string, targetPath: string): Promise<void> {
        if (!this.fs) throw new Error('File system not initialized');
        return this.fs.copyDirectory(path, targetPath);
    }

    async createDirectory(path: string): Promise<void> {
        if (!this.fs) throw new Error('File system not initialized');
        return this.fs.createDirectory(path);
    }

    async deleteFile(path: string): Promise<void> {
        if (!this.fs) throw new Error('File system not initialized');
        return this.fs.deleteFile(path);
    }

    async deleteDirectory(path: string): Promise<void> {
        if (!this.fs) throw new Error('File system not initialized');
        return this.fs.deleteDirectory(path);
    }

    async rename(oldPath: string, newPath: string): Promise<void> {
        if (!this.fs) throw new Error('File system not initialized');
        return this.fs.moveFile(oldPath, newPath);
    }

    async moveDirectory(oldPath: string, newPath: string): Promise<void> {
        if (!this.fs) throw new Error('File system not initialized');
        return this.fs.moveDirectory(oldPath, newPath);
    }

    // Download the code as a zip
    async downloadFiles(
        projectName?: string,
    ): Promise<{ downloadUrl: string; fileName: string } | null> {
        if (this.session.sandboxGone) {
            // Calling downloadFiles on a dead sandbox would throw 410.
            // Return null so the caller surfaces "download unavailable"
            // instead of bubbling a generic error toast.
            return null;
        }
        if (!this.session.provider) {
            console.error('No sandbox provider found for download');
            return null;
        }
        try {
            const { url } = await this.session.provider.downloadFiles({
                args: {
                    path: './',
                },
            });
            return {
                // in case there is no URL provided then the code must be updated
                // to handle this case
                downloadUrl: url ?? '',
                fileName: `${projectName ?? 'weblab-project'}-${Date.now()}.zip`,
            };
        } catch (error) {
            if (isSandboxGoneError(error)) {
                runInAction(() => {
                    this.session.sandboxGone = true;
                });
                console.debug('[SandboxManager] downloadFiles aborted — sandbox is gone (410).');
                return null;
            }
            console.error('Error generating download URL:', error);
            return null;
        }
    }

    clear() {
        this.providerReactionDisposer?.();
        this.providerReactionDisposer = undefined;
        this.sync?.release();
        this.sync = null;
        this.stopOfflineWatcher();
        if (this.preloadRetryTimeout) {
            clearTimeout(this.preloadRetryTimeout);
            this.preloadRetryTimeout = null;
        }
        this.preloadRetryCount = 0;
        this.preloadScriptState = PreloadScriptState.NOT_INJECTED;
        this.session.clear();
    }
}
