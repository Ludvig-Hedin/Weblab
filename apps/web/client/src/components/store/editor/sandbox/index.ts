import { makeAutoObservable, observable, reaction, runInAction } from 'mobx';

import type { Provider } from '@weblab/code-provider';
import { NodeFsProvider } from '@weblab/code-provider';
import type { CodeFileSystem } from '@weblab/file-system';
import type { Branch, RouterConfig } from '@weblab/models';
import { EXCLUDED_SYNC_PATHS } from '@weblab/constants';
import { type FileEntry } from '@weblab/file-system';

import type { EditorEngine } from '../engine';
import type { ErrorManager } from '../error';
import type { BranchData } from '../branch/manager';
import type { HistoryDisposalCheckpoint, HistoryDisposalLease } from '../history';
import { OfflineWriteWatcher } from '@/services/offline/write-queue-watcher';
import { CodeProviderSync } from '@/services/sync-engine/sync-engine';
import { GitManager } from '../git';
import { detectRouterConfig } from '../pages/helper';
import { isSandboxGoneError } from './errors';
import {
    MAX_PRELOAD_RETRY_ATTEMPTS,
    planPreloadRetry,
    PRELOAD_RETRY_DELAY_MS,
} from './preload-retry';
import {
    copyPreloadScriptToPublic,
    copyPreloadScriptToStaticHtml,
    getLayoutPath as detectLayoutPath,
    planLocalProjectPreparation,
    type LocalPreparationFile,
    type LocalPreparationPlan,
} from './preload-script';
import { SessionManager } from './session';
import { LocalMirror, readMirroredLocalTextVersion } from './local-mirror';
import { CloudSource } from './cloud-source';
import { CloudProvider } from './cloud-provider';
import { isCloudEditorRuntime } from '@convex/lib/cloudEditor';
import type { Id } from '@convex/_generated/dataModel';
import { getConvexHttpClient, whenConvexAuthReady } from '@/components/store/lib/convex-http-client';

export enum PreloadScriptState {
    NOT_INJECTED = 'not-injected',
    LOADING = 'loading',
    INJECTED = 'injected',
}

export class LocalPreparationApplyError extends Error {
    constructor(
        message: string,
        readonly remainingPaths: string[],
        readonly rollbackIssues: string[],
    ) {
        super(message);
        this.name = 'LocalPreparationApplyError';
    }
}

export class SandboxManager {
    readonly session: SessionManager;
    readonly gitManager: GitManager;
    private providerReactionDisposer?: () => void;
    private sync: CodeProviderSync | null = null;
    private localMirror: LocalMirror | null = null;
    cloudSource: CloudSource | null = null;
    /** True once a local folder's source mirror has loaded, so setup can start. */
    localSourceReady = false;
    private localPreparationPlan: LocalPreparationPlan | null = null;
    private localPreparationProvider: NodeFsProvider | null = null;
    private localPreparationApplying = false;
    /**
     * Latched by `clear()`. `init()` is invoked from `BranchManager.init`'s
     * `Promise.all` AFTER an `await codeEditor.initialize()`, so a `clear()`
     * (engine teardown / project switch) can land before `init()` even runs.
     * Without this guard the continuation would start a session and register a
     * `fireImmediately` provider reaction + refcounted `CodeProviderSync` that
     * nothing ever disposes — a zombie sandbox stack per abandoned load.
     * Per-branch instances are never reused after clear(), so a permanent
     * latch is safe (a fresh SandboxManager is created on re-init).
     */
    private disposed = false;
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
        // The exact reviewed plan object is the apply token. Keep its identity
        // instead of letting MobX deep-convert it into a different object.
        makeAutoObservable<this, 'localPreparationPlan' | 'localPreparationProvider'>(this, {
            localPreparationPlan: observable.ref,
            localPreparationProvider: observable.ref,
        });
    }

    async init() {
        // Bail if this manager was already torn down while its enclosing
        // BranchManager.init() was awaiting an earlier step (codeEditor
        // initialize). Continuing would start a session and register the
        // provider reaction / sync engine on a disposed manager.
        if (this.disposed) return;
        if (isCloudEditorRuntime(this.branch.runtime)) {
            await whenConvexAuthReady();
            if (this.disposed) return;
            const source: CloudSource = new CloudSource(getConvexHttpClient(), {
                projectId: this.editorEngine.projectId as Id<'projects'>,
                branchId: this.branch.id as Id<'branches'>,
            }, this.fs, { recoverableText: () => this.editorEngine.text.recoverableText, hasLocalWork: () => {
                const engine = this.editorEngine;
                const history = engine.branches?.getBranchDataById(this.branch.id)?.history;
                return engine.isClosing || engine.text.hasPendingWork || engine.code.hasPendingWrites ||
                    engine.action.hasPendingRebases || engine.action.hasPendingStylePreflights ||
                    !!history?.isTransactionOpen || !!history?.isPreparingForDisposal;
            }, prepareRejectedTextNavigation: () => {
                const engine = this.editorEngine;
                const assertOwner = () => {
                    if (this.disposed || this.cloudSource !== source || engine.isClosing ||
                        engine.projectId !== source.scope.projectId || !engine.branches.hasActiveBranch ||
                        engine.branches.activeBranch.id !== this.branch.id ||
                        engine.branches.getBranchDataById(this.branch.id)?.sandbox !== this ||
                        engine.code.hasPendingWrites || engine.action.hasPendingRebases ||
                        engine.action.hasPendingStylePreflights)
                        throw new Error('This source changed or other editor work is still pending');
                };
                assertOwner();
                const lease = engine.text.prepareRejectedCloudNavigation(this.branch.id);
                return { assertCurrent: () => { assertOwner(); lease.assertCurrent(); }, release: () => lease.release() };
            }, onSourceChanged: (paths, external) => {
                for (const path of paths) this.editorEngine.branches?.invalidateStyleWriterForSourceChange(this.branch.id, path);
                if (external) this.editorEngine.branches?.getBranchDataById(this.branch.id)?.history.clear();
            } });
            this.cloudSource = source;
            try {
                await source.start();
                if (this.disposed) { source.stop(); return; }
                this.session.installCloudProvider(new CloudProvider(this.fs, source));
                await this.getRouterConfig();
                runInAction(() => { this.preloadScriptState = PreloadScriptState.INJECTED; });
            } catch (error) {
                runInAction(() => { this.session.connectionError = 'Workspace setup failed: The saved cloud project could not be loaded. Reload to try again.'; });
                throw error;
            }
            return;
        }
        if (this.branch.runtime.type === 'local') {
            // Local source is loaded from disk before BranchManager considers
            // this branch ready. The cloud reaction below must never pull or
            // push a local folder on open.
            await this.session.start(this.branch.sandbox?.id ?? `local-${this.branch.id}`);
            const provider = this.session.provider;
            if (!(provider instanceof NodeFsProvider)) {
                throw new Error('Local project did not create a desktop file provider');
            }
            const mirror = new LocalMirror(provider, this.fs, (path) =>
                this.editorEngine.branches?.invalidateStyleWriterForSourceChange(this.branch.id, path));
            this.localMirror = mirror;
            await mirror.start();
            if (this.disposed) {
                await mirror.stop();
                return;
            }
            runInAction(() => { this.localSourceReady = true; });
            void this.gitManager.init().catch((error) => {
                console.error('[SandboxManager] local Git probe failed:', error);
            });
            return;
        }
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
        // TODO(bug-hunt): this reaction body is async but not serialized. If the
        // observed inputs (provider / sandboxGone) change again while a prior
        // `initializeSyncEngine(provider)` is still awaiting, MobX fires a
        // second run that can `releaseSyncEngine()` the instance the first run
        // is mid-start on — releasing/disposing it underneath the in-flight
        // start(). Guard with a per-run generation token or an awaited mutex so
        // overlapping provider transitions can't interleave init and release.
        this.providerReactionDisposer = reaction(
            () => ({ provider: this.session.provider, sandboxGone: this.session.sandboxGone }),
            async ({ provider, sandboxGone }) => {
                if (provider) {
                    if (sandboxGone) {
                        this.stopOfflineWatcher();
                        this.releaseSyncEngine();
                        return;
                    }
                    // Fresh provider connection (initial boot OR reconnect after
                    // a "Restart sandbox"): give preload injection a clean retry
                    // budget. Without this, a slow first boot that exhausted its
                    // transient-retry budget could never inject the preload
                    // script even after the sandbox came back, leaving the
                    // canvas tools permanently dead.
                    this.resetPreloadRetryState();
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
                    } else if (this.session.sandboxGone) {
                        this.stopOfflineWatcher();
                        this.releaseSyncEngine();
                    } else if (this.suppressSyncInit) {
                        // Replay-in-progress: don't run pullFromSandbox yet.
                        // resumeSyncInit() will fire init manually once the
                        // queue has drained.
                        this.stopOfflineWatcher();
                    } else {
                        this.stopOfflineWatcher();
                        try {
                            await this.initializeSyncEngine(provider);
                            // clear() may have landed while the sync engine was
                            // starting (the reaction body is async and outlives
                            // the disposer). Release what we just acquired
                            // instead of leaking a running sync engine.
                            if (this.disposed) {
                                this.releaseSyncEngine();
                                return;
                            }
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
                                this.releaseSyncEngine();
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
                    if (this.session.sandboxGone) {
                        return;
                    }
                    void this.gitManager.init().catch((err) => {
                        if (isSandboxGoneError(err)) {
                            // Same 410 short-circuit as the sync engine
                            // path. The restore flow will refork the
                            // sandbox and trigger a fresh start.
                            runInAction(() => {
                                this.session.sandboxGone = true;
                            });
                            this.releaseSyncEngine();
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

    /** Preview exact on-disk changes. This method never writes to the folder. */
    async planLocalPreparation(): Promise<LocalPreparationPlan> {
        const provider = this.session.provider;
        if (this.disposed || this.branch.runtime.type !== 'local' || !(provider instanceof NodeFsProvider)) {
            throw new Error('A local project must finish loading before it can be prepared.');
        }
        if (this.localPreparationApplying) throw new Error('Local preparation is already applying.');
        this.localPreparationPlan = null;
        this.localPreparationProvider = null;
        const framework = this.editorEngine.framework;
        if (framework !== 'nextjs' && framework !== 'static-html') {
            throw new Error('Visual preparation currently supports Next.js and static HTML projects.');
        }
        const entries = await this.fs.listAll();
        const routerConfig = framework === 'nextjs' ? await this.getRouterConfig() : null;
        const plan = await planLocalProjectPreparation(
            provider,
            framework,
            entries.filter((entry) => entry.type === 'file').map((entry) => entry.path),
            routerConfig,
        );
        for (const file of plan.files) Object.freeze(file);
        Object.freeze(plan.files);
        if (plan.createDirectories) Object.freeze(plan.createDirectories);
        Object.freeze(plan);
        this.localPreparationPlan = plan;
        this.localPreparationProvider = provider;
        return plan;
    }

    getLocalSourceVersion(): string | null {
        return this.localMirror?.sourceVersion() ?? null;
    }

    getLocalExternalRevision(): string | null {
        return this.localMirror?.externalRevision() ?? null;
    }

    getLocalOwnRevision(): string | null {
        return this.localMirror?.ownRevision() ?? null;
    }

    /** Apply only the plan the user reviewed, using disk-hash guarded writes. */
    async applyLocalPreparation(plan: LocalPreparationPlan): Promise<void> {
        const provider = this.session.provider;
        if (this.disposed || this.branch.runtime.type !== 'local' || !(provider instanceof NodeFsProvider)) {
            throw new Error('The local project is no longer available.');
        }
        if (plan !== this.localPreparationPlan || provider !== this.localPreparationProvider) {
            throw new Error('Review the current source changes before applying.');
        }
        if (this.localPreparationApplying) throw new Error('Local preparation is already applying.');
        this.localPreparationPlan = null;
        this.localPreparationProvider = null;
        this.localPreparationApplying = true;
        const written: Array<{ file: LocalPreparationFile; writtenHash: string }> = [];
        const createdDirectories: string[] = [];
        const rollbackIssues: string[] = [];
        let failure: unknown = null;
        let mirrorStopped = false;
        let branchData: BranchData | null = null;
        let lease: HistoryDisposalLease | null = null;
        let checkpoint: HistoryDisposalCheckpoint | null = null;
        let actionPrepared = false;
        const assertOwner = () => {
            if (!branchData || !lease || !checkpoint || this.disposed || this.session.provider !== provider ||
                this.editorEngine.branches.getBranchDataById(this.branch.id) !== branchData ||
                this.editorEngine.branches.activeBranchData !== branchData || branchData.sandbox !== this) {
                throw new Error('The local project changed during preparation.');
            }
            branchData.history.assertEmptySourcePreparationOwner(lease, checkpoint);
        };

        try {
            branchData = await this.editorEngine.branches.awaitBranchInitialization(this.branch.id);
            if (branchData.sandbox !== this || this.editorEngine.branches.activeBranchData !== branchData ||
                this.disposed || this.session.provider !== provider) {
                throw new Error('The local project changed while loading.');
            }
            lease = branchData.history.beginDisposalPreparation();
            this.editorEngine.action.beginHistoryDisposalPreparation(this.branch.id, lease);
            actionPrepared = true;
            checkpoint = branchData.history.captureEmptySourcePreparation(lease);
            assertOwner();
            if (plan.files.length > 0 && !this.localMirror) {
                throw new Error('Local source mirror is not ready. Reopen the project and retry.');
            }
            for (const directory of plan.createDirectories ?? []) {
                if (directory !== 'public') throw new Error('Unsupported local preparation directory.');
                const root = await provider.listFiles({ args: { path: '' } });
                if (root.files.some((entry) => entry.name === directory)) {
                    throw new Error(`${directory}/ appeared since review. Prepare a fresh diff.`);
                }
            }
            // Check every reviewed version before the first write. The native
            // compare-and-swap repeats this check for each individual file.
            for (const file of plan.files) {
                if (file.expectedSha256) {
                    const current = await provider.readFileWithHash(file.path);
                    if (current.sha256 !== file.expectedSha256) {
                        branchData.history.rejectChangedPreparationSource(lease, checkpoint);
                        throw new Error(`${file.path} changed since review. Prepare a fresh diff.`);
                    }
                } else {
                    const parent = file.path.split('/').slice(0, -1).join('/');
                    const name = file.path.split('/').at(-1);
                    if (plan.createDirectories?.includes(parent)) continue;
                    const listing = await provider.listFiles({ args: { path: parent } });
                    if (listing.files.some((entry) => entry.name === name)) {
                        branchData.history.rejectChangedPreparationSource(lease, checkpoint);
                        throw new Error(`${file.path} was created since review. Prepare a fresh diff.`);
                    }
                }
            }
            assertOwner();
            branchData.history.assertDisposalCheckpoint(lease, checkpoint);
            // Include new/deleted mirrored paths, even when the file watcher has
            // not observed an outside edit. This scan never mutates the editor FS.
            if (await readMirroredLocalTextVersion(provider) !== checkpoint.sourceVersion) {
                branchData.history.rejectChangedPreparationSource(lease, checkpoint);
                throw new Error('The mirrored local source changed since loading. Prepare a fresh diff.');
            }
            assertOwner();
            if (plan.files.length > 0 && this.localMirror) {
                branchData.history.assertDisposalCheckpoint(lease, checkpoint);
                await this.localMirror.stop();
                this.localMirror = null;
                mirrorStopped = true;
            }
            for (const directory of plan.createDirectories ?? []) {
                assertOwner();
                await provider.createPreparationPublicDirectory();
                createdDirectories.push(directory);
            }
            for (const file of plan.files) {
                assertOwner();
                const result = await provider.writeFileIfUnchanged(
                    file.path,
                    file.updated,
                    file.expectedSha256,
                );
                written.push({ file, writtenHash: result.sha256 });
            }
        } catch (error) {
            failure = error;
            // Roll back only our own versions. An external edit must win the
            // hash check and remain untouched; the native bridge also retains
            // a private byte-exact backup of each overwritten original.
            for (const { file, writtenHash } of written.toReversed()) {
                try {
                    if (file.original === null) {
                        await provider.deleteFileIfUnchanged(file.path, writtenHash);
                    } else {
                        await provider.writeFileIfUnchanged(file.path, file.original, writtenHash);
                    }
                } catch (rollbackError) {
                    console.error(`[SandboxManager] Could not restore ${file.path}:`, rollbackError);
                    const detail = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
                    const recoveryPath =
                        rollbackError instanceof Error &&
                        'recoveryPath' in rollbackError &&
                        typeof rollbackError.recoveryPath === 'string'
                            ? rollbackError.recoveryPath
                            : undefined;
                    rollbackIssues.push(
                        `${file.path}: ${detail}${recoveryPath ? ` Backup: ${recoveryPath}` : ''}`,
                    );
                }
            }
            for (const directory of createdDirectories.toReversed()) {
                try {
                    await provider.deletePreparationPublicDirectory();
                } catch (rollbackError) {
                    console.error(`[SandboxManager] Could not remove ${directory}/:`, rollbackError);
                    rollbackIssues.push(`${directory}/: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
                }
            }
        }

        try {
            if (mirrorStopped && !this.disposed && this.session.provider === provider) {
                const mirror = new LocalMirror(provider, this.fs, (path) =>
                    this.editorEngine.branches?.invalidateStyleWriterForSourceChange(this.branch.id, path));
                let adopted = false;
                try {
                    await mirror.start();
                    assertOwner();
                    this.localMirror = mirror;
                    adopted = true;
                } finally {
                    if (!adopted) await mirror.stop();
                }
                await this.editorEngine.branches?.refreshStyleWriter(this.branch.id);
                assertOwner();
                if (branchData && lease && checkpoint?.sourceVersion) {
                    const mirroredHashes = new Map<string, string>(JSON.parse(checkpoint.sourceVersion));
                    if (!failure) for (const { file, writtenHash } of written) mirroredHashes.set(file.path, writtenHash);
                    const expectedMirroredVersion = JSON.stringify([...mirroredHashes].sort(([left], [right]) =>
                        left < right ? -1 : left > right ? 1 : 0));
                    // A clean rollback may restore the original baseline. Any partial
                    // rollback or unrelated edit must retain strict history refusal.
                    branchData.history.completeEmptySourcePreparation(lease, checkpoint, expectedMirroredVersion);
                }
            }
        } catch (error) {
            failure ??= error;
        } finally {
            this.localPreparationApplying = false;
            if (lease && branchData) {
                if (actionPrepared) this.editorEngine.action.cancelHistoryDisposalPreparation(this.branch.id, lease);
                branchData.history.cancelDisposalPreparation(lease);
            }
        }

        if (failure) {
            const remainingPaths: string[] = [];
            for (const directory of createdDirectories) {
                try {
                    const root = await provider.listFiles({ args: { path: '' } });
                    if (root.files.some((entry) => entry.name === directory)) remainingPaths.push(`${directory}/`);
                } catch {
                    remainingPaths.push(`${directory}/`);
                }
            }
            for (const { file } of written) {
                try {
                    if (file.original === null) {
                        const parent = file.path.split('/').slice(0, -1).join('/');
                        const name = file.path.split('/').at(-1);
                        const listing = await provider.listFiles({ args: { path: parent } });
                        if (listing.files.some((entry) => entry.name === name)) remainingPaths.push(file.path);
                    } else if ((await provider.readFileWithHash(file.path)).sha256 !== file.expectedSha256) {
                        remainingPaths.push(file.path);
                    }
                } catch {
                    remainingPaths.push(file.path);
                }
            }
            throw new LocalPreparationApplyError(
                `Preparation stopped: ${failure instanceof Error ? failure.message : String(failure)}`,
                remainingPaths,
                rollbackIssues,
            );
        }
        runInAction(() => { this.preloadScriptState = PreloadScriptState.INJECTED; });
    }

    /**
     * Block the provider-reaction sync engine init. Call BEFORE swapping the
     * offline shim for the cloud provider, drain the durable write queue,
     * then call `resumeSyncInit()` to run the deferred `initializeSyncEngine`.
     */
    suppressSyncInitForReplay(): void {
        this.suppressSyncInit = true;
        // Stop the offline write watcher SYNCHRONOUSLY, before the caller swaps
        // to the cloud provider and drains the queue. The provider-reaction also
        // stops it (the `suppressSyncInit` branch), but that runs asynchronously
        // AFTER `swapToOnline` changes the provider — leaving a window where the
        // watcher is still live during `replayQueue`. A write captured in that
        // window enqueues a NEW record whose `supersedePriorRecords` deletes the
        // snapshot record's content blob mid-replay (so the snapshot write fails
        // "missing content blob"), and the new record isn't in the replay
        // snapshot — so the user's last offline edit is silently dropped.
        // Stopping here closes that window deterministically; going offline
        // again restarts the watcher via the reaction's offline branch.
        this.stopOfflineWatcher();
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
        if (this.session.sandboxGone) {
            this.releaseSyncEngine();
            return;
        }
        if (this.session.isOffline) return;
        if (this.branch.runtime.type === 'local') {
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

    private releaseSyncEngine(): void {
        if (!this.sync) return;
        this.sync.release();
        this.sync = null;
    }

    async initializeSyncEngine(provider: Provider) {
        this.releaseSyncEngine();

        if (this.session.sandboxGone) {
            return;
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
        if (this.session.sandboxGone) {
            this.releaseSyncEngine();
            return;
        }
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
            const { maxAttempts, logLevel } = planPreloadRetry(isTransient, this.preloadRetryCount);
            if (logLevel === 'debug') {
                // Expected during cold boot: the sandbox FS hasn't synced the
                // router directory yet. Retry patiently — escalating to
                // console.error (or giving up) here is what stranded slow
                // Vercel cold-boots on a forever spinner.
                console.debug(
                    '[SandboxManager] Router config not detected yet, retrying preload injection…',
                );
            } else {
                console.error('[SandboxManager] Failed to ensure preload script exists:', error);
            }
            runInAction(() => {
                this.preloadScriptState = PreloadScriptState.NOT_INJECTED;
            });
            this.schedulePreloadRetry(maxAttempts);
        }
    }

    private schedulePreloadRetry(maxAttempts: number = MAX_PRELOAD_RETRY_ATTEMPTS): void {
        if (this.preloadRetryTimeout || this.preloadRetryCount >= maxAttempts) {
            return;
        }

        this.preloadRetryCount += 1;
        this.preloadRetryTimeout = setTimeout(() => {
            this.preloadRetryTimeout = null;
            void this.ensurePreloadScriptExists();
        }, PRELOAD_RETRY_DELAY_MS);
    }

    // Clears any pending retry and resets the attempt budget. Called on a fresh
    // provider connection so a reconnect/restart gets a full retry budget; the
    // retry loop itself never calls this (it must keep incrementing).
    private resetPreloadRetryState(): void {
        if (this.preloadRetryTimeout) {
            clearTimeout(this.preloadRetryTimeout);
            this.preloadRetryTimeout = null;
        }
        this.preloadRetryCount = 0;
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
        const binary = this.cloudSource?.binaryContent(path);
        if (binary) return binary;
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
            // No URL means the provider has no working download path (e.g. the
            // Vercel browser provider's fileDownload route isn't ported yet).
            // Return null so the caller surfaces an honest error instead of an
            // empty-string URL — `{ downloadUrl: '' }` is a truthy object, so
            // callers that guard on `if (result)` would open a blank tab and
            // show a false "download succeeded" toast.
            if (!url) {
                console.warn(
                    '[SandboxManager] downloadFiles returned no URL — download unavailable for this provider.',
                );
                return null;
            }
            return {
                downloadUrl: url,
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
        this.disposed = true;
        this.cloudSource?.stop();
        this.cloudSource = null;
        this.providerReactionDisposer?.();
        this.providerReactionDisposer = undefined;
        this.sync?.release();
        this.sync = null;
        void this.localMirror?.stop();
        this.localMirror = null;
        this.localPreparationPlan = null;
        this.localPreparationProvider = null;
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
