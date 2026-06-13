/**
 * Handles syncing files between a code provider and a local file system.
 *
 * On initial start, it pulls all files from the provider and stores them in the local file system.
 * After this, it watches for changes either in the local file system or the provider and syncs the changes back and forth.
 */
import type { CodeFileSystem } from '@weblab/file-system';
import { type Provider, type ProviderFileWatcher } from '@weblab/code-provider';
import { WEBLAB_INTERACTIONS_CACHE_PATH } from '@weblab/constants';

import { isSandboxGoneError } from '@/components/store/editor/sandbox/errors';
import { normalizePath } from '@/components/store/editor/sandbox/helpers';

/**
 * Paths inside otherwise-excluded directories that should still sync.
 * `.weblab/` is wholesale excluded for cache/index files, but
 * `interactions.json` is editable user content and must round-trip.
 */
const SYNC_PATH_OVERRIDES = new Set<string>([WEBLAB_INTERACTIONS_CACHE_PATH]);

export interface SyncConfig {
    include?: string[];
    exclude?: string[];
}

const DEFAULT_EXCLUDES = ['node_modules', '.git', '.next', 'dist', 'build', '.turbo'];

/**
 * Directory names that must be excluded at EVERY depth, mirroring the watcher's
 * intent for dependency / VCS / tooling caches that legitimately nest (a
 * monorepo has nested node_modules under each package, nested `.git`
 * worktrees, etc.). A top-level-only anchor would let these huge trees sync
 * from deep paths.
 *
 * Everything else in the exclude list (build / dist / static / out /
 * .next-prod) is anchored to the TOP-LEVEL segment only, so genuine user
 * source under `src/build`, `app/static`, etc. still round-trips. This matches
 * the local watcher's root-anchored "dir then everything below" exclude
 * semantics (a build output only lives at the project root).
 */
const DEEP_EXCLUDED_DIR_NAMES = new Set<string>([
    'node_modules',
    '.git',
    '.next',
    '.turbo',
    '.weblab',
]);

/**
 * How long a sync-initiated local deletion suppresses the matching local
 * watcher event from being pushed back to the sandbox. Watcher events are
 * debounced ~50ms in the FS layer; 15s gives slack for large directory
 * deletes that emit events over several seconds.
 */
const SYNC_DELETE_ECHO_WINDOW_MS = 15_000;

export async function hashContent(content: string | Uint8Array): Promise<string> {
    const encoder = new TextEncoder();
    const data = typeof content === 'string' ? encoder.encode(content) : new Uint8Array(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface SyncInstance {
    sync: CodeProviderSync;
    refCount: number;
}

export class CodeProviderSync {
    private static instances = new Map<string, SyncInstance>();

    private watcher: ProviderFileWatcher | null = null;
    private localWatcher: (() => void) | null = null;
    private isRunning = false;
    private isPaused = false;
    /**
     * Latched true the first time any provider call here throws a 410.
     * Every subsequent provider-touching branch in the file watcher
     * (statFile / readFile / listFiles / writeFile / deleteFiles /
     * renameFile / createDirectory) checks this flag and bails silently
     * instead of letting each event cascade into another console.error.
     * Cleared in stop() so a fresh sandbox (post-restore) starts clean.
     */
    private sandboxGone = false;
    /**
     * Set true whenever getAllSandboxFiles swallows a listing error, meaning the
     * returned entry list may be missing whole subtrees. pullFromSandbox checks
     * this before its deletion phase — deleting local files because they're
     * "not in the sandbox" is only safe when the sandbox listing is complete.
     * A transient listFiles failure during sandbox boot previously returned an
     * empty list here, which wiped the entire local FS and then echoed those
     * deletions back into the sandbox via the local watcher.
     */
    private listingIncomplete = false;
    /**
     * Paths (sandbox-relative, no leading slash) that THIS sync engine deleted
     * locally (pull reconciliation or remote-delete replay), mapped to the
     * timestamp of the delete. The local FS watcher consults this so it doesn't
     * push sync-initiated deletions back to the sandbox as if the user made
     * them — that echo is what destroyed `public/_weblab` in the sandbox.
     */
    private syncDeletedRoots = new Map<string, number>();
    /**
     * Local paths (with leading slash, matching `fs.listFiles` output) whose
     * sandbox read FAILED during the current pull. pushModifiedFilesToSandbox
     * skips these so a transient read miss during pull doesn't cause the
     * immediately-following push to overwrite the newer sandbox copy with the
     * stale local one. Cleared at the start of every pull and re-populated.
     */
    private pullReadFailures = new Set<string>();
    private readonly excludes: string[];
    private readonly excludePatterns: string[];
    private fileHashes = new Map<string, string>();
    private instanceKey: string | null = null;

    private constructor(
        private provider: Provider,
        private fs: CodeFileSystem,
        private config: SyncConfig = { include: [], exclude: [] },
    ) {
        // Compute excludes once
        this.excludes = [...DEFAULT_EXCLUDES, ...(this.config.exclude ?? [])];
        this.excludePatterns = this.excludes.map((dir) => `${dir}/**`);
    }

    /**
     * Get or create a sync instance for the given provider and filesystem.
     * Uses reference counting to ensure the same provider+fs combination shares a single sync instance.
     *
     * Note: Config is only applied on first creation. Subsequent calls with the same provider+fs
     * will reuse the existing instance with its original config. In practice, configs are static
     * (EXCLUDED_SYNC_PATHS) so this shouldn't cause issues, but a warning is logged if detected.
     */
    static getInstance(
        provider: Provider,
        fs: CodeFileSystem,
        sandboxId: string,
        config: SyncConfig = { include: [], exclude: [] },
    ): CodeProviderSync {
        const key = CodeProviderSync.generateKey(sandboxId, fs);

        const existing = CodeProviderSync.instances.get(key);
        if (existing) {
            // Warn if configs differ to help debug unexpected behavior
            const sameConfig =
                JSON.stringify(existing.sync.config ?? {}) === JSON.stringify(config ?? {});
            if (!sameConfig) {
                console.warn(
                    `[Sync] getInstance(${key}) called with different config; reusing existing instance config`,
                );
            }
            existing.refCount++;
            console.log(
                `[Sync] Reusing existing sync instance for ${key} (refCount: ${existing.refCount})`,
            );
            return existing.sync;
        }

        const sync = new CodeProviderSync(provider, fs, config);
        sync.instanceKey = key;
        CodeProviderSync.instances.set(key, { sync, refCount: 1 });
        console.log(`[Sync] Created new sync instance for ${key} (refCount: 1)`);
        return sync;
    }

    /**
     * Generate a unique key for a provider+filesystem combination.
     */
    private static generateKey(sandboxId: string, fs: CodeFileSystem): string {
        return `${sandboxId}:${fs.rootPath}`;
    }

    /**
     * Release a reference to this sync instance.
     * When the last reference is released, the sync will be stopped and removed from the registry.
     */
    release(): void {
        if (!this.instanceKey) {
            console.warn('[Sync] Attempted to release sync instance without a key');
            return;
        }

        const instance = CodeProviderSync.instances.get(this.instanceKey);
        if (!instance) {
            console.warn(`[Sync] Instance ${this.instanceKey} not found in registry`);
            return;
        }

        instance.refCount--;
        console.log(
            `[Sync] Released reference to ${this.instanceKey} (refCount: ${instance.refCount})`,
        );

        if (instance.refCount <= 0) {
            console.log(`[Sync] Stopping and removing sync instance ${this.instanceKey}`);
            this.stop();
            CodeProviderSync.instances.delete(this.instanceKey);
            this.instanceKey = null;
        }
    }

    /**
     * Pause syncing temporarily. Useful before operations that cause many file changes (e.g., git restore).
     * While paused, file change events are ignored.
     */
    pause(): void {
        this.isPaused = true;
    }

    /**
     * Resume syncing after being paused. Pulls fresh state from sandbox to ensure consistency.
     */
    async unpause(): Promise<void> {
        // Keep paused while reconciling to avoid echoing local writes back to the provider
        if (this.isRunning) {
            try {
                await this.pullFromSandbox();
            } finally {
                this.isPaused = false;
            }
        } else {
            this.isPaused = false;
        }
    }

    async start(): Promise<void> {
        if (this.isRunning) {
            return;
        }

        this.isRunning = true;
        // Reset the latched 410 flag so a freshly-forked sandbox (post
        // restore) gets a clean run instead of inheriting the previous
        // session's "gone" state.
        this.sandboxGone = false;

        try {
            await this.pullFromSandbox();
            await this.setupWatching();
            // Push any locally modified files (with OIDs) back to sandbox. This is required for the first time sync.
            void this.pushModifiedFilesToSandbox();
            // A booting sandbox can fail its first listing (transient
            // listFiles/runCommand errors) which leaves the local FS stale and
            // the OID index empty — re-pull in the background until we get one
            // complete pass so the editor self-heals without a manual reload.
            if (this.listingIncomplete) {
                void this.retryPullUntilComplete();
            }
        } catch (error) {
            this.isRunning = false;
            throw error;
        }
    }

    /**
     * Background re-pull loop for the boot race where the very first
     * pullFromSandbox ran against a sandbox that wasn't serving file listings
     * yet. Bounded attempts; stops early once a pull completes cleanly, the
     * sync is stopped, or the sandbox is gone.
     */
    private async retryPullUntilComplete(maxAttempts = 5, delayMs = 5_000): Promise<void> {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            if (!this.isRunning || this.sandboxGone) return;
            console.log(`[Sync] Retrying initial pull (attempt ${attempt}/${maxAttempts})…`);
            try {
                await this.pullFromSandbox();
            } catch (error) {
                if (this.noteSandboxGone(error)) return;
                console.debug('[Sync] Retry pull failed:', error);
                continue;
            }
            if (!this.listingIncomplete) {
                console.log('[Sync] Initial pull completed on retry.');
                void this.pushModifiedFilesToSandbox();
                return;
            }
        }
        console.warn('[Sync] Initial pull still incomplete after retries — giving up.');
    }

    stop(): void {
        this.isRunning = false;
        this.sandboxGone = false;

        if (this.watcher) {
            void this.watcher.stop();
            this.watcher = null;
        }

        if (this.localWatcher) {
            this.localWatcher();
            this.localWatcher = null;
        }

        // Clear file hashes
        this.fileHashes.clear();
    }

    /**
     * Treat the next sandbox-touching call as a no-op once we've seen 410.
     * Centralises the per-call branch so each watcher arm reads as a single
     * `if (this.sandboxGone) return;` instead of repeating the comment.
     */
    private noteSandboxGone(error: unknown): boolean {
        if (isSandboxGoneError(error)) {
            if (!this.sandboxGone) {
                console.debug('[Sync] Sandbox is gone (410). Suppressing further sync ops.');
            }
            this.sandboxGone = true;
            return true;
        }
        return false;
    }

    private async pullFromSandbox(): Promise<void> {
        this.listingIncomplete = false;
        // Reset per-pull read-failure tracking. A path that failed to read on a
        // previous (partial) pull must get a fresh chance this pass; if it
        // succeeds now it's cleared, if it fails again it stays excluded from
        // the subsequent push.
        this.pullReadFailures.clear();
        const sandboxEntries = await this.getAllSandboxFiles('./');
        if (this.sandboxGone) {
            return;
        }
        const sandboxEntriesSet = new Set(
            sandboxEntries.map((e) => (e.path.startsWith('/') ? e.path : `/${e.path}`)),
        );

        const localEntries = await this.fs.listAll();

        // Deleting local entries because they're "not in the sandbox" is only
        // safe when the sandbox listing is trustworthy. An incomplete listing
        // (transient listFiles error during boot) or a fully empty one (a real
        // project always has at least package.json / index.html) means the
        // sandbox isn't ready — skip reconciliation deletes rather than wiping
        // the local FS and echoing those deletions back into the sandbox.
        const canReconcileDeletes = !this.listingIncomplete && sandboxEntries.length > 0;
        if (!canReconcileDeletes) {
            console.warn(
                '[Sync] Sandbox listing incomplete or empty — skipping local deletion reconciliation this pass.',
            );
        }

        // Find entries to delete (exist locally but not in sandbox)
        const entriesToDelete = !canReconcileDeletes
            ? []
            : localEntries.filter((entry) => {
                  if (!this.shouldSync(entry.path)) return false;

                  const sandboxPath = entry.path.startsWith('/')
                      ? entry.path.substring(1)
                      : entry.path;
                  return !sandboxEntriesSet.has(entry.path) && !sandboxEntriesSet.has(sandboxPath);
              });

        for (const entry of entriesToDelete) {
            try {
                this.markSyncDeleted(entry.path);
                if (entry.type === 'file') {
                    await this.fs.deleteFile(entry.path);
                    console.log(`[Sync] Deleted file: ${entry.path}`);
                } else {
                    await this.fs.deleteDirectory(entry.path);
                    console.log(`[Sync] Deleted directory: ${entry.path}`);
                }
            } catch (error) {
                console.debug(
                    `[Sync] Failed to delete ${entry.path}:`,
                    error instanceof Error ? error.message : 'Unknown error',
                );
            }
        }

        // Process sandbox entries
        const directoriesToCreate = [];
        const filesToWrite = [];

        for (const entry of sandboxEntries) {
            if (entry.type === 'directory') {
                directoriesToCreate.push(entry.path);
            } else {
                // 410 latched mid-loop — every remaining readFile would
                // throw the same. Break out instead of debug-logging once
                // per file in the project.
                if (this.sandboxGone) break;
                try {
                    const result = await this.provider.readFile({
                        args: { path: entry.path },
                    });
                    const { file } = result;

                    if ((file.type === 'text' || file.type === 'binary') && file.content) {
                        filesToWrite.push({ path: entry.path, content: file.content });
                    }
                } catch (error) {
                    if (this.noteSandboxGone(error)) break;
                    // Record the read failure so the immediately-following push
                    // doesn't overwrite a newer sandbox copy with the stale
                    // local one. Stored without a leading slash to match the
                    // push's `fs.listFiles` path form.
                    const key = entry.path.startsWith('/') ? entry.path.substring(1) : entry.path;
                    this.pullReadFailures.add(key);
                    console.debug(`[Sync] Skipping ${entry.path}:`, error);
                }
            }
        }

        // Create directories first
        for (const dirPath of directoriesToCreate) {
            try {
                await this.fs.createDirectory(dirPath);
            } catch (error) {
                console.debug(`[Sync] Error creating directory ${dirPath}:`, error);
            }
        }

        // Write files sequentially to avoid race conditions
        for (const { path, content } of filesToWrite) {
            try {
                await this.fs.writeFile(path, content);
            } catch (error) {
                console.error(`[Sync] Failed to write ${path}:`, error);
            }
        }

        // Store hashes of files so we can skip syncing if the content hasn't changed later.
        for (const { path, content } of filesToWrite) {
            const hash = await hashContent(content);
            this.fileHashes.set(path, hash);
        }
    }

    private async getAllSandboxFiles(
        dir: string,
    ): Promise<Array<{ path: string; type: 'file' | 'directory' }>> {
        const files: Array<{ path: string; type: 'file' | 'directory' }> = [];

        // Top-of-method short-circuit: once a 410 has surfaced, every
        // recursive listFiles call would throw the same error and tick
        // the debug log per directory. The restore CTA owns recovery.
        if (this.sandboxGone) return files;

        try {
            const result = await this.provider.listFiles({ args: { path: dir } });
            const entries = result.files;

            for (const entry of entries) {
                // Build path - when dir is './', just use entry.name
                const fullPath = dir === './' ? entry.name : `${dir}/${entry.name}`;

                if (entry.type === 'directory') {
                    const normalizedDir = fullPath.startsWith('/')
                        ? fullPath.substring(1)
                        : fullPath;
                    // An excluded directory is normally not descended into. BUT
                    // a SYNC_PATH_OVERRIDES entry (e.g. `.weblab/interactions
                    // .json`) can live inside one — descend when any override
                    // path sits under this directory, otherwise the override is
                    // unreachable on pulls and the file never round-trips.
                    const isExcludedDir = this.excludes.includes(entry.name);
                    const hasOverrideInside =
                        isExcludedDir &&
                        [...SYNC_PATH_OVERRIDES].some((ov) => ov.startsWith(`${normalizedDir}/`));
                    if (!isExcludedDir || hasOverrideInside) {
                        // Only push the directory entry itself if it actually
                        // syncs (an override-bearing excluded dir does not).
                        if (this.shouldSync(fullPath)) {
                            files.push({ path: fullPath, type: 'directory' });
                        }
                        const subFiles = await this.getAllSandboxFiles(fullPath);
                        files.push(...subFiles);
                    }
                } else {
                    // Only add files that should be synced
                    if (this.shouldSync(fullPath)) {
                        files.push({ path: fullPath, type: entry.type });
                    }
                }
            }
        } catch (error) {
            if (this.noteSandboxGone(error)) {
                return files;
            }
            // A swallowed listing error means this subtree is missing from the
            // result — flag it so pullFromSandbox won't treat absent entries
            // as sandbox-side deletions.
            this.listingIncomplete = true;
            console.debug(
                `[Sync] Error reading directory ${dir}:`,
                error instanceof Error ? error.message : 'Unknown error',
            );
        }

        return files;
    }

    /**
     * Remember that the sync engine itself deleted this local path, so the
     * local watcher can tell sync-initiated deletions apart from user edits.
     * Stored without a leading slash to match the watcher's sandboxPath form.
     */
    private markSyncDeleted(path: string): void {
        const key = path.startsWith('/') ? path.substring(1) : path;
        this.syncDeletedRoots.set(key, Date.now());
        // Bounded cleanup so the map can't grow unbounded across a long session.
        if (this.syncDeletedRoots.size > 500) {
            const cutoff = Date.now() - SYNC_DELETE_ECHO_WINDOW_MS;
            for (const [k, t] of this.syncDeletedRoots) {
                if (t < cutoff) this.syncDeletedRoots.delete(k);
            }
        }
    }

    /**
     * True when `sandboxPath` equals — or sits inside — a path this engine
     * deleted locally within the echo window. Directory deletes emit one
     * watcher event per descendant, so prefix matching is required.
     */
    private wasSyncDeleted(sandboxPath: string): boolean {
        const now = Date.now();
        for (const [root, t] of this.syncDeletedRoots) {
            if (now - t > SYNC_DELETE_ECHO_WINDOW_MS) continue;
            if (sandboxPath === root || sandboxPath.startsWith(`${root}/`)) {
                return true;
            }
        }
        return false;
    }

    private async pushModifiedFilesToSandbox(): Promise<void> {
        console.log('[Sync] Pushing locally modified files back to sandbox...');

        // 410 already latched: skip the whole push pass. Every writeFile
        // would otherwise throw and log a warning per touched JSX/TSX file.
        if (this.sandboxGone) return;

        try {
            // Get all local JSX/TSX files that might have been modified with OIDs
            const localFiles = await this.fs.listFiles('/');
            const jsxFiles = localFiles.filter((path) => {
                if (!/\.(jsx?|tsx?)$/i.test(path)) return false;
                // Skip files whose sandbox read FAILED during the preceding
                // pull: the local copy is potentially stale, so pushing it would
                // clobber a newer sandbox version. They re-sync on the next pull.
                const key = path.startsWith('/') ? path.substring(1) : path;
                if (this.pullReadFailures.has(key)) {
                    console.debug(
                        `[Sync] Skipping push of ${path} — its sandbox read failed during pull.`,
                    );
                    return false;
                }
                return true;
            });

            // TODO: Use available batch write API
            await Promise.all(
                jsxFiles.map(async (filePath) => {
                    if (this.sandboxGone) return;
                    try {
                        const content = await this.fs.readFile(filePath);
                        if (typeof content === 'string') {
                            // Push to sandbox
                            await this.provider.writeFile({
                                args: {
                                    path: filePath.startsWith('/')
                                        ? filePath.substring(1)
                                        : filePath,
                                    content,
                                    overwrite: true,
                                },
                            });
                            console.log(`[Sync] Pushed ${filePath} to sandbox`);
                        }
                    } catch (error) {
                        if (this.noteSandboxGone(error)) return;
                        console.warn(`[Sync] Failed to push ${filePath} to sandbox:`, error);
                    }
                }),
            );
        } catch (error) {
            if (this.noteSandboxGone(error)) return;
            console.error('[Sync] Error pushing files to sandbox:', error);
        }
    }

    private shouldSync(path: string): boolean {
        const normalized = path.startsWith('/') ? path.substring(1) : path;
        const segments = normalized.split('/');

        // Check if path matches any exclude pattern
        const isExcluded = this.excludes.some((exc) => {
            // Exact path / nested-under-path match (handles full-path excludes
            // like `public/weblab-preload-script.js`).
            if (normalized === exc || normalized.startsWith(`${exc}/`)) {
                return true;
            }
            // Single-segment excludes only: a multi-segment exclude is already a
            // full relative path and was handled above.
            if (exc.includes('/')) {
                return false;
            }
            // Dependency / VCS / tooling caches: exclude at ANY depth so nested
            // copies (monorepo node_modules, nested .git) never sync.
            if (DEEP_EXCLUDED_DIR_NAMES.has(exc)) {
                return segments.includes(exc);
            }
            // Build outputs (build / dist / static / out / .next-prod): exclude
            // ONLY when they are the top-level segment, mirroring the watcher's
            // root-anchored `${dir}/**`. User files under `src/build/` sync.
            return segments[0] === exc;
        });

        if (isExcluded) {
            // Specific files inside excluded directories may still need to
            // round-trip (e.g. `.weblab/interactions.json` so external IDE
            // edits flow back into the editor). The override list is small
            // and matched against the leading-slash-stripped relative path so
            // both pull (sandbox-relative) and watcher (`/`-prefixed) callers
            // resolve identically.
            if (SYNC_PATH_OVERRIDES.has(normalized)) {
                return true;
            }
            return false;
        }

        // Check includes if specified
        if (this.config.include && this.config.include.length > 0) {
            const included = this.config.include.some((inc) => {
                const normalizedInc = inc.startsWith('/') ? inc.substring(1) : inc;
                return path.startsWith(normalizedInc) || path === normalizedInc;
            });
            return included;
        }

        return true;
    }

    private async setupWatching(): Promise<void> {
        try {
            // Watch the current directory (relative to workspace)
            const watchResult = await this.provider.watchFiles({
                args: {
                    path: './',
                    recursive: true,
                    excludes: this.excludePatterns,
                },
                onFileChange: async (event) => {
                    // Skip processing if paused
                    if (this.isPaused) {
                        return;
                    }
                    // 410 latched: the watcher may still drain queued
                    // events from the dead provider for a few seconds
                    // before the SDK gives up. Every statFile / readFile
                    // inside this handler would re-throw — short-circuit
                    // so each event is a no-op instead of three more
                    // console errors and a possible "Issues" tick.
                    if (this.sandboxGone) {
                        return;
                    }

                    // Process based on event type
                    if (event.type === 'change' || event.type === 'add') {
                        // Check if this is a rename (change event with 2 paths)
                        if (
                            event.type === 'change' &&
                            event.paths.length === 2 &&
                            event.paths[0] &&
                            event.paths[1]
                        ) {
                            // This is likely a rename operation
                            const oldPath = normalizePath(event.paths[0]);
                            const newPath = normalizePath(event.paths[1]);

                            if (this.shouldSync(oldPath) && this.shouldSync(newPath)) {
                                try {
                                    // Check if the old file exists locally
                                    if (await this.fs.exists(oldPath)) {
                                        // Rename the file locally
                                        await this.fs.moveFile(oldPath, newPath);

                                        // Update hash tracking
                                        const oldHash = this.fileHashes.get(oldPath);
                                        if (oldHash) {
                                            this.fileHashes.delete(oldPath);
                                            this.fileHashes.set(newPath, oldHash);
                                        }
                                    } else {
                                        // Old file doesn't exist, just create the new one

                                        try {
                                            const result = await this.provider.readFile({
                                                args: { path: newPath },
                                            });
                                            const { file } = result;

                                            if (
                                                (file.type === 'text' || file.type === 'binary') &&
                                                file.content
                                            ) {
                                                await this.fs.writeFile(newPath, file.content);
                                                const hash = await hashContent(file.content);
                                                this.fileHashes.set(newPath, hash);
                                            }
                                        } catch (error) {
                                            if (this.noteSandboxGone(error)) return;
                                            console.error(
                                                `[Sync] Error creating ${newPath}:`,
                                                error,
                                            );
                                        }
                                    }
                                } catch (error) {
                                    if (this.noteSandboxGone(error)) return;
                                    console.error(`[Sync] Error handling rename:`, error);
                                }
                            }
                        } else {
                            // Normal processing for non-rename events
                            for (const path of event.paths) {
                                // Normalize the path to remove any duplicate prefixes
                                const normalizedPath = normalizePath(path);

                                if (!this.shouldSync(normalizedPath)) {
                                    continue;
                                }

                                try {
                                    // First check if it's a directory or file
                                    const stat = await this.provider.statFile({
                                        args: { path: normalizedPath },
                                    });

                                    if (stat.type === 'directory') {
                                        // It's a directory, create it locally
                                        const localPath = normalizedPath;

                                        try {
                                            await this.fs.createDirectory(localPath);

                                            // After creating the directory, recursively sync all its contents
                                            // This is needed because sandbox watcher might only report parent directory creation

                                            // Recursive function to sync directory contents
                                            const syncDirectoryContents = async (
                                                sandboxPath: string,
                                                localDirPath: string,
                                            ) => {
                                                try {
                                                    const dirContents =
                                                        await this.provider.listFiles({
                                                            args: { path: sandboxPath },
                                                        });

                                                    if (
                                                        dirContents.files &&
                                                        dirContents.files.length > 0
                                                    ) {
                                                        for (const item of dirContents.files) {
                                                            const itemSandboxPath = `${sandboxPath}/${item.name}`;
                                                            const itemLocalPath = `${localDirPath}/${item.name}`;

                                                            if (item.type === 'directory') {
                                                                // Create subdirectory
                                                                await this.fs.createDirectory(
                                                                    itemLocalPath,
                                                                );

                                                                // Recursively sync its contents
                                                                await syncDirectoryContents(
                                                                    itemSandboxPath,
                                                                    itemLocalPath,
                                                                );
                                                            } else if (item.type === 'file') {
                                                                // Sync all files including .gitkeep
                                                                try {
                                                                    const fileResult =
                                                                        await this.provider.readFile(
                                                                            {
                                                                                args: {
                                                                                    path: itemSandboxPath,
                                                                                },
                                                                            },
                                                                        );
                                                                    if (
                                                                        fileResult.file.content !==
                                                                        undefined
                                                                    ) {
                                                                        // Write file even if content is empty (like .gitkeep)
                                                                        await this.fs.writeFile(
                                                                            itemLocalPath,
                                                                            fileResult.file
                                                                                .content || '',
                                                                        );
                                                                        // Update hash tracking
                                                                        const hash =
                                                                            await hashContent(
                                                                                fileResult.file
                                                                                    .content || '',
                                                                            );
                                                                        this.fileHashes.set(
                                                                            itemLocalPath,
                                                                            hash,
                                                                        );
                                                                    } else {
                                                                        console.log(
                                                                            `[Sync] File ${itemSandboxPath} has undefined content, skipping`,
                                                                        );
                                                                    }
                                                                } catch (fileError) {
                                                                    if (
                                                                        this.noteSandboxGone(
                                                                            fileError,
                                                                        )
                                                                    ) {
                                                                        return;
                                                                    }
                                                                    console.error(
                                                                        `[Sync] Error syncing file ${itemSandboxPath}:`,
                                                                        fileError,
                                                                    );
                                                                }
                                                            }
                                                        }
                                                    }
                                                } catch (listError) {
                                                    if (this.noteSandboxGone(listError)) return;
                                                    console.error(
                                                        `[Sync] Error listing contents of ${sandboxPath}:`,
                                                        listError,
                                                    );
                                                }
                                            };

                                            // Start recursive sync
                                            await syncDirectoryContents(normalizedPath, localPath);
                                        } catch (dirError) {
                                            if (this.noteSandboxGone(dirError)) return;
                                            console.error(
                                                `[Sync] Error creating directory ${localPath}:`,
                                                dirError,
                                            );
                                            // Directory creation might fail if parent doesn't exist
                                            // The createDirectory method should handle this with recursive: true
                                        }
                                    } else {
                                        // It's a file, read and sync it
                                        const result = await this.provider.readFile({
                                            args: { path: normalizedPath },
                                        });
                                        const { file } = result;

                                        if (
                                            (file.type === 'text' || file.type === 'binary') &&
                                            file.content
                                        ) {
                                            const localPath = normalizedPath;

                                            // Check if content has changed
                                            const newHash = await hashContent(file.content);
                                            const existingHash = this.fileHashes.get(localPath);

                                            if (newHash !== existingHash) {
                                                await this.fs.writeFile(localPath, file.content);
                                                this.fileHashes.set(localPath, newHash);
                                            } else {
                                                console.debug(
                                                    `[Sync] Skipping ${localPath} - content unchanged`,
                                                );
                                            }
                                        }
                                    }
                                } catch (error) {
                                    if (this.noteSandboxGone(error)) return;
                                    console.error(
                                        `[Sync] Error processing ${normalizedPath}:`,
                                        error,
                                    );
                                }
                            }
                        }
                    } else if (event.type === 'remove') {
                        for (const path of event.paths) {
                            // Normalize the path to remove any duplicate prefixes
                            const normalizedPath = normalizePath(path);

                            if (!this.shouldSync(normalizedPath)) {
                                console.debug(
                                    `[Sync] Skipping sandbox delete for excluded path: ${normalizedPath}`,
                                );
                                continue;
                            }

                            try {
                                const localPath = normalizedPath;

                                // Check if path exists before trying to delete
                                if (await this.fs.exists(localPath)) {
                                    // Check if it's a directory or file
                                    const fileInfo = await this.fs.getInfo(localPath);

                                    // Replaying a sandbox-side delete locally —
                                    // mark it so the local watcher doesn't push
                                    // the same delete straight back.
                                    this.markSyncDeleted(localPath);
                                    if (fileInfo.isDirectory) {
                                        await this.fs.deleteDirectory(localPath);
                                    } else {
                                        await this.fs.deleteFile(localPath);
                                    }
                                }

                                // Remove hash regardless
                                this.fileHashes.delete(localPath);
                            } catch (error) {
                                console.debug(
                                    `[Sync] Error deleting ${normalizedPath} locally:`,
                                    error instanceof Error ? error.message : 'Unknown error',
                                );
                            }
                        }
                    }
                },
            });

            this.watcher = watchResult.watcher;

            // Setup local file system watching for bidirectional sync
            await this.setupLocalWatching();
        } catch (error) {
            // 410 during setupWatching: latch the flag and re-throw so
            // SandboxManager.init's catch can flip session.sandboxGone.
            // The Restore CTA owns recovery; don't log a noisy error
            // for what is really just a reclaimed sandbox.
            if (this.noteSandboxGone(error)) {
                throw error;
            }
            console.error(
                '[Sync] Failed to setup file watching:',
                error instanceof Error ? error.message : 'Unknown error',
            );
            throw error;
        }
    }

    private async setupLocalWatching(): Promise<void> {
        // Watch the root directory for local changes
        this.localWatcher = this.fs.watchDirectory('/', async (event) => {
            // Skip processing if paused
            if (this.isPaused) {
                return;
            }
            // 410 latched: don't try to push local edits at the dead
            // provider — every writeFile / deleteFiles / renameFile here
            // would throw and pile up. Local edits stay in ZenFS and
            // will be replayed once the sandbox is restored.
            if (this.sandboxGone) {
                return;
            }

            const { path, type } = event;

            // Check if file should be synced
            // Need to remove leading / for sandbox path
            const sandboxPath = path.startsWith('/') ? path.substring(1) : path;
            if (!this.shouldSync(sandboxPath)) {
                console.debug(`[Sync] Skipping local ${type} for excluded path: ${path}`);
                return;
            }

            try {
                switch (type) {
                    case 'create':
                    case 'update': {
                        // Check if it's a directory
                        const fileInfo = await this.fs.getInfo(path);

                        if (fileInfo.isDirectory) {
                            // Create directory in provider
                            await this.provider.createDirectory({
                                args: {
                                    path: sandboxPath,
                                },
                            });
                        } else {
                            // Read from local and write to provider
                            const content = await this.fs.readFile(path);
                            const currentHash = await hashContent(content);

                            // Check if this change was from our own sync
                            if (this.fileHashes.get(path) === currentHash) {
                                return;
                            }

                            // Snapshot the previous hash so a failed write can
                            // roll it back. The provider returns `{ success:
                            // false }` (not a throw) on a transport error; if we
                            // optimistically kept the new hash, the next local
                            // edit that produced the same content would be
                            // skipped as "unchanged" and the failed write would
                            // never be retried — the sandbox stays stale
                            // silently.
                            const previousHash = this.fileHashes.get(path);
                            this.fileHashes.set(path, currentHash);
                            const writeResult = await this.provider.writeFile({
                                args: {
                                    path: sandboxPath,
                                    content,
                                    overwrite: true,
                                },
                            });
                            if (writeResult?.success === false) {
                                // Roll back so a retry can happen on the next
                                // watcher tick (or pushModifiedFilesToSandbox).
                                if (previousHash === undefined) {
                                    this.fileHashes.delete(path);
                                } else {
                                    this.fileHashes.set(path, previousHash);
                                }
                                console.warn(
                                    `[Sync] Provider reported failed write for ${sandboxPath}; rolled back hash for retry.`,
                                );
                            }
                        }
                        break;
                    }
                    case 'delete': {
                        // Sync-initiated deletions (pull reconciliation or a
                        // replayed sandbox-side delete) must NOT be echoed back
                        // to the sandbox — that loop is how a bad pull once
                        // destroyed `public/_weblab` server-side.
                        if (this.wasSyncDeleted(sandboxPath)) {
                            console.debug(
                                `[Sync] Skipping echo of sync-initiated delete: ${sandboxPath}`,
                            );
                            this.fileHashes.delete(path);
                            break;
                        }

                        try {
                            await this.provider.deleteFiles({
                                args: {
                                    path: sandboxPath,
                                    recursive: true,
                                },
                            });
                        } catch (error) {
                            if (this.noteSandboxGone(error)) break;
                            console.debug(
                                `[Sync] Failed to delete ${sandboxPath} from sandbox:`,
                                error instanceof Error ? error.message : 'Unknown error',
                            );
                        }

                        // Remove hash for deleted file (if it exists)
                        if (this.fileHashes.has(path)) {
                            this.fileHashes.delete(path);
                            console.debug(`[Sync] Removed hash entry for deleted file: ${path}`);
                        }
                        break;
                    }
                    case 'rename': {
                        // Handle rename if oldPath is provided
                        if (event.oldPath) {
                            const oldSandboxPath = event.oldPath.startsWith('/')
                                ? event.oldPath.substring(1)
                                : event.oldPath;

                            try {
                                await this.provider.renameFile({
                                    args: {
                                        oldPath: oldSandboxPath,
                                        newPath: sandboxPath,
                                    },
                                });

                                // Update hash tracking for renamed files
                                const oldHash = this.fileHashes.get(event.oldPath);
                                if (oldHash) {
                                    this.fileHashes.delete(event.oldPath);
                                    this.fileHashes.set(path, oldHash);
                                }
                            } catch (error) {
                                if (this.noteSandboxGone(error)) break;
                                console.error(`[Sync] Failed to rename in sandbox:`, error);
                                throw error; // Re-throw to be caught by outer try-catch
                            }
                        } else {
                            console.warn(`[Sync] Rename event received without oldPath`);
                        }
                        break;
                    }
                }
            } catch (error) {
                if (this.noteSandboxGone(error)) return;
                console.error(
                    `[Sync] Error pushing local ${type} for ${path} to sandbox:`,
                    error instanceof Error ? error.message : 'Unknown error',
                );
            }
        });
    }
}
