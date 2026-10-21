import type { NodeFsProvider, ProviderFileWatcher, WatchEvent } from '@weblab/code-provider';
import type { CodeFileSystem } from '@weblab/file-system';

const EXCLUDED_DIRECTORIES = new Set([
    '.git', '.next', '.weblab', 'node_modules', 'dist', 'build', 'out', 'coverage',
]);
const TEXT_EXTENSIONS = new Set([
    'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'json', 'css', 'scss', 'sass',
    'html', 'htm', 'md', 'mdx', 'txt', 'svg', 'yaml', 'yml', 'toml', 'xml',
]);
const TEXT_FILENAMES = new Set([
    'package.json', 'tsconfig.json', 'postcss.config.js', 'tailwind.config.js',
    '.gitignore', '.prettierrc', '.eslintrc', 'README', 'LICENSE',
]);
let nextMirrorId = 0;

function normalizedPath(path: string): string {
    return path.replace(/^\/+/, '').replace(/\\/g, '/');
}

function shouldMirror(path: string): boolean {
    const normalized = normalizedPath(path);
    const parts = normalized.split('/');
    if (parts.some((part) => EXCLUDED_DIRECTORIES.has(part))) return false;
    const filename = parts.at(-1) ?? '';
    return TEXT_FILENAMES.has(filename) || TEXT_EXTENSIONS.has(filename.split('.').at(-1) ?? '');
}

/** Read-only disk scan of exactly the text paths mirrored by the local editor. */
async function readMirroredTextFiles(provider: NodeFsProvider): Promise<Array<{ path: string; content: string; sha256: string }>> {
    const files: Array<{ path: string; content: string; sha256: string }> = [];
    const visit = async (directory: string): Promise<void> => {
        const { files: entries } = await provider.listFiles({ args: { path: directory } });
        for (const entry of entries) {
            if (entry.isSymlink) continue;
            const path = [directory, entry.name].filter(Boolean).join('/');
            if (entry.type === 'directory') {
                if (!EXCLUDED_DIRECTORIES.has(entry.name)) await visit(path);
            } else if (shouldMirror(path)) {
                files.push({ path, ...await provider.readFileWithHash(path) });
            }
        }
    };
    await visit('');
    return files;
}

export async function readMirroredLocalTextVersion(provider: NodeFsProvider): Promise<string> {
    const files = await readMirroredTextFiles(provider);
    return JSON.stringify(files.map(({ path, sha256 }) => [path, sha256] as const).sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0));
}

/** Keeps the disk folder authoritative for a local editor branch. */
export class LocalMirror {
    // The editor's compare-and-swap baseline changes only after its own save.
    // A watcher refresh must not advance it: an edit begun before that refresh
    // would otherwise overwrite the external change using the new disk hash.
    private editBaselines = new Map<string, string>();
    private mirroredHashes = new Map<string, string>();
    private watcher: ProviderFileWatcher | null = null;
    private disposed = false;
    private pending = new Set<string>();
    private changedWhilePending = new Map<string, WatchEvent['type']>();
    private readonly mirrorId = ++nextMirrorId;
    private externalChanges = 0;
    private ownWrites = 0;
    private refreshes = new Set<Promise<void>>();

    constructor(
        private readonly provider: NodeFsProvider,
        private readonly fs: CodeFileSystem,
        private readonly onSourceChanged?: (path: string) => void,
    ) {}

    /** Exact mirrored disk version used to reject stale local undo history. */
    sourceVersion(): string {
        return JSON.stringify(
            Array.from(this.mirroredHashes.entries()).sort(([left], [right]) =>
                left < right ? -1 : left > right ? 1 : 0,
            ),
        );
    }

    externalRevision(): string {
        return `${this.mirrorId}:${this.externalChanges}`;
    }

    ownRevision(): string {
        return `${this.mirrorId}:${this.ownWrites}`;
    }

    async start(): Promise<void> {
        const files = await readMirroredTextFiles(this.provider);
        if (this.disposed) return;
        for (const { path, sha256 } of files) {
            this.editBaselines.set(path, sha256);
            this.mirroredHashes.set(path, sha256);
        }
        await this.fs.replaceLocalSnapshot(files.map(({ path, content }) => ({ path, content })));
        if (this.disposed) return;
        this.fs.setLocalWriteHandler((path, content) => this.write(path, content));
        const { watcher } = await this.provider.watchFiles({
            args: { path: '', recursive: true, excludes: Array.from(EXCLUDED_DIRECTORIES) },
            onFileChange: (event) => this.onDiskChange(event),
        });
        if (this.disposed) {
            await watcher.stop();
            return;
        }
        this.watcher = watcher;
    }

    private async write(rawPath: string, content: string): Promise<void> {
        const path = normalizedPath(rawPath);
        if (this.disposed) throw new Error('Local project was closed');
        if (!shouldMirror(path)) throw new Error(`Unsupported local text path: ${path}`);
        const expected = this.editBaselines.get(path) ?? null;
        this.pending.add(path);
        try {
            const { sha256 } = await this.provider.writeFileIfUnchanged(path, content, expected);
            this.editBaselines.set(path, sha256);
            this.mirroredHashes.set(path, sha256);
            this.ownWrites++;
            this.onSourceChanged?.(path);
        } catch (error) {
            // A conflict may be detected even if the file watcher coalesced
            // away the external change. Refresh after the caller has released
            // CodeFileSystem's write lock and saved the attempted source.
            setTimeout(() => void this.refreshPath(path, 'change'), 0);
            throw error;
        } finally {
            this.pending.delete(path);
            const eventType = this.changedWhilePending.get(path);
            if (eventType) {
                this.changedWhilePending.delete(path);
                // CodeFileSystem still holds its write lock here. Refresh on
                // the next task after that write has committed or failed.
                setTimeout(() => void this.refreshPath(path, eventType), 0);
            }
        }
    }

    private async onDiskChange(event: WatchEvent): Promise<void> {
        for (const rawPath of event.paths) {
            const path = normalizedPath(rawPath);
            if (!shouldMirror(path) || this.disposed) continue;
            if (this.pending.has(path)) {
                this.changedWhilePending.set(path, event.type);
                continue;
            }
            await this.refreshPath(path, event.type);
        }
    }

    private refreshPath(path: string, eventType: WatchEvent['type']): Promise<void> {
        if (this.disposed) return Promise.resolve();
        const refresh = this.refreshActivePath(path, eventType);
        this.refreshes.add(refresh);
        void refresh.then(() => this.refreshes.delete(refresh), () => this.refreshes.delete(refresh));
        return refresh;
    }

    private async refreshActivePath(path: string, eventType: WatchEvent['type']): Promise<void> {
        if (this.disposed) return;
        let current: { content: string; sha256: string } | null = null;
        if (eventType === 'remove') {
            // Atomic-save editors often rename the old file away and create
            // the replacement before this queued remove event is handled.
            try {
                current = await this.provider.readFileWithHash(path);
            } catch (error) {
                if (!(error instanceof Error) || !error.message.startsWith('File not found:')) {
                    console.error(`[LocalMirror] Could not check removed ${path}:`, error);
                    return;
                }
                if (this.disposed) return;
                if (this.mirroredHashes.delete(path)) this.externalChanges++;
                this.onSourceChanged?.(path);
                await this.fs.removeLocalFile(path);
                return;
            }
        }
        try {
            const { content, sha256 } = current ?? await this.provider.readFileWithHash(path);
            if (this.disposed) return;
            if (this.mirroredHashes.get(path) === sha256) return;
            await this.fs.replaceLocalFile(path, content);
            if (this.disposed) return;
            this.mirroredHashes.set(path, sha256);
            this.externalChanges++;
            this.onSourceChanged?.(path);
        } catch (error) {
            console.error(`[LocalMirror] Could not reload ${path}:`, error);
        }
    }

    async stop(): Promise<void> {
        this.disposed = true;
        this.fs.setLocalWriteHandler(() => Promise.reject(new Error('Local project was closed')));
        try {
            await this.watcher?.stop();
        } finally {
            this.watcher = null;
            // A refresh may already be inside an awaited disk read or FS write.
            // No replacement snapshot starts until every admitted refresh settles.
            while (this.refreshes.size) await Promise.allSettled([...this.refreshes]);
        }
    }
}
