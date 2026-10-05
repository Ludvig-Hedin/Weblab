import type {
    CopyFileOutput,
    CopyFilesInput,
    CreateDirectoryInput,
    CreateDirectoryOutput,
    CreateProjectInput,
    CreateProjectOutput,
    CreateSessionInput,
    CreateSessionOutput,
    CreateTerminalInput,
    CreateTerminalOutput,
    DeleteFilesInput,
    DeleteFilesOutput,
    DownloadFilesInput,
    DownloadFilesOutput,
    GetTaskInput,
    GetTaskOutput,
    GitStatusInput,
    GitStatusOutput,
    InitializeInput,
    InitializeOutput,
    ListFilesInput,
    ListFilesOutput,
    ListProjectsInput,
    ListProjectsOutput,
    PauseProjectInput,
    PauseProjectOutput,
    ReadFileInput,
    ReadFileOutput,
    RenameFileInput,
    RenameFileOutput,
    SetupInput,
    SetupOutput,
    StatFileInput,
    StatFileOutput,
    StopProjectInput,
    StopProjectOutput,
    TerminalBackgroundCommandInput,
    TerminalBackgroundCommandOutput,
    TerminalCommandInput,
    TerminalCommandOutput,
    WatchEvent,
    WatchFilesInput,
    WatchFilesOutput,
    WriteFileInput,
    WriteFileOutput,
} from '../../types';
import {
    Provider,
    ProviderBackgroundCommand,
    ProviderFileWatcher,
    ProviderTask,
    ProviderTerminal,
} from '../../types';

export interface NodeFsProviderOptions {
    rootPath?: string | null;
    devCommand?: string | null;
    port?: number | null;
}

export interface LocalHandoffFile {
    path: string;
    original: string | null;
    updated: string | null;
}

export interface LocalHandoffPlan {
    copyId: string;
    sourceRootPath: string;
    changedFiles: LocalHandoffFile[];
    unsupportedChanges: string[];
    sourceChanged: boolean;
    planToken: string | null;
}

// --- Desktop IPC bridge contract ---------------------------------------------
// Implemented in apps/desktop/preload.js (`window.weblabNative.localfs/localdev`),
// backed by apps/desktop/weblab-local.js in the Electron main process. The
// provider runs in the renderer and cannot touch Node APIs directly, so every
// operation is delegated over this bridge. Local mode is desktop-only — these
// are undefined in a normal browser, and the provider throws a clear error.

interface LocalFsBridge {
    pickFolder(): Promise<{ rootPath: string } | null>;
    createPrivateWorkingCopy(sourceRoot: string): Promise<{
        rootPath?: string;
        sourceRootPath?: string;
        copyId?: string;
        reused?: boolean;
        priorCopyId?: string;
        previewNeedsInstall?: boolean;
        excludedPaths?: string[];
        exclusions?: { path: string; reason: 'credentials' | 'dependencies' | 'generated' }[];
        error?: string;
    }>;
    planPrivateHandoff(root: string): Promise<Partial<LocalHandoffPlan> & { error?: string }>;
    exportPrivateHandoff(root: string, planToken: string, files?: LocalHandoffFile[]): Promise<{
        patchPath?: string;
        changedFiles?: string[];
        error?: string;
    }>;
    read(root: string, path: string): Promise<{
        content?: string;
        sha256?: string;
        error?: string;
        notFound?: boolean;
    }>;
    writeIfUnchanged(
        root: string,
        path: string,
        content: string,
        expectedSha256: string | null,
    ): Promise<{
        success?: boolean;
        hash?: string | null;
        conflict?: boolean;
        error?: string;
        recoveryPath?: string;
    }>;
    deleteFileIfUnchanged(
        root: string,
        path: string,
        expectedSha256: string,
    ): Promise<{
        success?: boolean;
        hash?: string | null;
        conflict?: boolean;
        error?: string;
        recoveryPath?: string;
        quarantinePath?: string;
    }>;
    createPreparationPublicDirectory(root: string): Promise<{ success?: boolean; error?: string }>;
    deletePreparationPublicDirectory(root: string): Promise<{
        success?: boolean;
        conflict?: boolean;
        error?: string;
    }>;
    list(
        root: string,
        path: string,
    ): Promise<{
        files?: { name: string; type: 'file' | 'directory'; isSymlink: boolean }[];
        error?: string;
    }>;
    stat(
        root: string,
        path: string,
    ): Promise<{
        type?: 'file' | 'directory';
        isSymlink?: boolean;
        size?: number;
        mtime?: number;
        error?: string;
        notFound?: boolean;
    }>;
    watchStart(root: string, excludes?: string[]): Promise<{ watchId?: string; error?: string }>;
    watchStop(watchId: string): Promise<{ success?: boolean; error?: string }>;
    onWatchEvent(listener: (payload: { watchId: string; event: WatchEvent }) => void): () => void;
}

interface LocalDevBridge {
    start(
        root: string,
        command?: string | null,
        port?: number | null,
    ): Promise<{ port?: number; url?: string; error?: string }>;
    /**
     * Pick a free dev-server port without starting anything — used at project
     * create time so the frame URL is built from a port that's guaranteed free
     * (and uncommon), avoiding a collision with the editor's own :3000.
     */
    pickPort?(root: string, preferredPort?: number | null): Promise<{ port?: number; error?: string }>;
    stop(root: string): Promise<{ success?: boolean; error?: string }>;
    status(root: string): Promise<{ running: boolean; port?: number; url?: string }>;
    gitInfo(root: string): Promise<{
        isRepositoryRoot: boolean;
        branch?: string;
        error?: string;
    }>;
    gitStatus(root: string): Promise<{ changedFiles: string[]; error?: string }>;
    onOutput(listener: (payload: { root: string; data: string }) => void): () => void;
}

interface WeblabNativeBridge {
    localfs?: LocalFsBridge;
    localdev?: LocalDevBridge;
}

function getNative(): WeblabNativeBridge | undefined {
    return (globalThis as unknown as { weblabNative?: WeblabNativeBridge }).weblabNative;
}

const DESKTOP_REQUIRED =
    'Local project mode requires the Weblab desktop app (window.weblabNative is unavailable).';

function requireLocalFs(): LocalFsBridge {
    const fs = getNative()?.localfs;
    if (!fs) throw new Error(DESKTOP_REQUIRED);
    return fs;
}

function requireLocalDev(): LocalDevBridge {
    const dev = getNative()?.localdev;
    if (!dev) throw new Error(DESKTOP_REQUIRED);
    return dev;
}

export class LocalFileConflictError extends Error {
    constructor(
        path: string,
        public readonly currentSha256: string | null,
        public readonly recoveryPath?: string,
    ) {
        super(
            `File changed on disk: ${path}` +
                (recoveryPath ? `. On-disk snapshot: ${recoveryPath}` : ''),
        );
        this.name = 'LocalFileConflictError';
    }
}

const LOCAL_COMMANDS_UNAVAILABLE =
    'Local shell commands are unavailable here. Use your terminal app in the project folder.';
const LOCAL_MUTATIONS_UNAVAILABLE =
    'Direct local file mutations are unavailable. Edit text through the guarded local mirror.';

/**
 * Local folder provider. Text writes use a disk hash check through the desktop
 * bridge; generic file mutations and shell commands are unavailable. Selected
 * by `session.ts` when `branch.runtime.type === 'local'`.
 */
export class NodeFsProvider extends Provider {
    private readonly options: NodeFsProviderOptions;

    constructor(options: NodeFsProviderOptions) {
        super();
        this.options = options;
    }

    static async createPrivateWorkingCopy(sourceRoot: string): Promise<{
        rootPath: string;
        sourceRootPath: string;
        copyId: string;
        reused: boolean;
        priorCopyId?: string;
        previewNeedsInstall: boolean;
        excludedPaths: string[];
        exclusions: { path: string; reason: 'credentials' | 'dependencies' | 'generated' }[];
    }> {
        const result = await requireLocalFs().createPrivateWorkingCopy(sourceRoot);
        if (result.error) throw new Error(result.error);
        if (!result.rootPath || !result.sourceRootPath || !result.copyId ||
            result.reused === undefined || result.previewNeedsInstall === undefined ||
            !Array.isArray(result.excludedPaths)) {
            throw new Error('Native private working copy response is incomplete.');
        }
        return {
            rootPath: result.rootPath,
            sourceRootPath: result.sourceRootPath,
            copyId: result.copyId,
            reused: result.reused,
            ...(result.priorCopyId ? { priorCopyId: result.priorCopyId } : {}),
            previewNeedsInstall: result.previewNeedsInstall,
            excludedPaths: result.excludedPaths,
            exclusions: result.exclusions ?? [],
        };
    }

    async planPrivateHandoff(): Promise<LocalHandoffPlan> {
        const result = await requireLocalFs().planPrivateHandoff(this.requireRoot());
        if (result.error) throw new Error(result.error);
        if (!result.copyId || !result.sourceRootPath || !Array.isArray(result.changedFiles) ||
            !Array.isArray(result.unsupportedChanges) || typeof result.sourceChanged !== 'boolean' ||
            (result.planToken !== null && typeof result.planToken !== 'string')) {
            throw new Error('Native handoff plan response is incomplete.');
        }
        return result as LocalHandoffPlan;
    }

    /** `files` narrows the reviewed plan to cleaned contents (see handoff-clean). */
    async exportPrivateHandoff(
        planToken: string,
        files?: LocalHandoffFile[],
    ): Promise<{ patchPath: string; changedFiles: string[] }> {
        const result = await requireLocalFs().exportPrivateHandoff(this.requireRoot(), planToken, files);
        if (result.error) throw new Error(result.error);
        if (!result.patchPath || !Array.isArray(result.changedFiles)) {
            throw new Error('Native handoff export response is incomplete.');
        }
        return { patchPath: result.patchPath, changedFiles: result.changedFiles };
    }

    private requireRoot(): string {
        const root = this.options.rootPath;
        if (!root) throw new Error('Local project has no rootPath configured.');
        return root;
    }

    async initialize(_input: InitializeInput): Promise<InitializeOutput> {
        return {};
    }

    async writeFile(_input: WriteFileInput): Promise<WriteFileOutput> {
        throw new Error(LOCAL_MUTATIONS_UNAVAILABLE);
    }

    /** Read a text file and the disk version used by guarded writes. */
    async readFileWithHash(path: string): Promise<{ content: string; sha256: string }> {
        const res = await requireLocalFs().read(this.requireRoot(), path);
        if (res.error) throw new Error(res.notFound ? `File not found: ${path}` : res.error);
        if (res.content === undefined || !res.sha256) {
            throw new Error(`Local file read did not return content and hash: ${path}`);
        }
        return { content: res.content, sha256: res.sha256 };
    }

    /** Write only if the file still matches the version read from disk. */
    async writeFileIfUnchanged(
        path: string,
        content: string,
        expectedSha256: string | null,
    ): Promise<{ sha256: string }> {
        const res = await requireLocalFs().writeIfUnchanged(
            this.requireRoot(),
            path,
            content,
            expectedSha256,
        );
        if (res.conflict) {
            throw new LocalFileConflictError(path, res.hash ?? null, res.recoveryPath);
        }
        if (res.error) {
            throw new Error(
                res.recoveryPath
                    ? `${res.error}. On-disk snapshot: ${res.recoveryPath}`
                    : res.error,
            );
        }
        if (!res.success || !res.hash) {
            throw new Error(`Local file write did not return a hash: ${path}`);
        }
        return { sha256: res.hash };
    }

    /** Undo a recent native-created file only while its exact disk version remains. */
    async deleteFileIfUnchanged(path: string, expectedSha256: string): Promise<void> {
        const res = await requireLocalFs().deleteFileIfUnchanged(
            this.requireRoot(), path, expectedSha256,
        );
        if (res.conflict && !res.error) {
            throw new LocalFileConflictError(path, res.hash ?? null, res.recoveryPath);
        }
        if (res.error) {
            throw new Error(
                res.error +
                    (res.recoveryPath ? `. On-disk snapshot: ${res.recoveryPath}` : '') +
                    (res.quarantinePath ? `. Moved file: ${res.quarantinePath}` : ''),
            );
        }
        if (!res.success) throw new Error(`Local file delete did not succeed: ${path}`);
    }

    /** Create only the reviewed Next.js public folder, if it is still absent. */
    async createPreparationPublicDirectory(): Promise<void> {
        const res = await requireLocalFs().createPreparationPublicDirectory(this.requireRoot());
        if (!res.success) throw new Error(res.error ?? 'Could not create public directory');
    }

    /** Roll back only the empty public folder created by this native session. */
    async deletePreparationPublicDirectory(): Promise<void> {
        const res = await requireLocalFs().deletePreparationPublicDirectory(this.requireRoot());
        if (!res.success) throw new Error(res.error ?? 'Could not remove public directory');
    }

    async renameFile(_input: RenameFileInput): Promise<RenameFileOutput> {
        throw new Error(LOCAL_MUTATIONS_UNAVAILABLE);
    }

    async statFile(input: StatFileInput): Promise<StatFileOutput> {
        const res = await requireLocalFs().stat(this.requireRoot(), input.args.path);
        if (!res.type) throw new Error(res.error ?? `Cannot stat ${input.args.path}`);
        return { type: res.type, isSymlink: res.isSymlink, size: res.size, mtime: res.mtime };
    }

    async deleteFiles(_input: DeleteFilesInput): Promise<DeleteFilesOutput> {
        throw new Error(LOCAL_MUTATIONS_UNAVAILABLE);
    }

    async listFiles(input: ListFilesInput): Promise<ListFilesOutput> {
        const res = await requireLocalFs().list(this.requireRoot(), input.args.path);
        if (res.error) throw new Error(res.error);
        return { files: res.files ?? [] };
    }

    async readFile(input: ReadFileInput): Promise<ReadFileOutput> {
        const res = await requireLocalFs().read(this.requireRoot(), input.args.path);
        if (res.error) throw new Error(res.notFound ? `File not found: ${input.args.path}` : res.error);
        const content = res.content ?? '';
        return {
            file: {
                path: input.args.path,
                content,
                type: 'text',
                toString: () => content,
            },
        };
    }

    async downloadFiles(_input: DownloadFilesInput): Promise<DownloadFilesOutput> {
        // Not applicable locally — files already live on disk.
        return {};
    }

    async copyFiles(_input: CopyFilesInput): Promise<CopyFileOutput> {
        throw new Error(LOCAL_MUTATIONS_UNAVAILABLE);
    }

    async createDirectory(_input: CreateDirectoryInput): Promise<CreateDirectoryOutput> {
        throw new Error(LOCAL_MUTATIONS_UNAVAILABLE);
    }

    async watchFiles(input: WatchFilesInput): Promise<WatchFilesOutput> {
        const watcher = new NodeFsFileWatcher(this.requireRoot());
        if (input.onFileChange) watcher.registerEventCallback(input.onFileChange);
        await watcher.start(input);
        return { watcher };
    }

    async createTerminal(_input: CreateTerminalInput): Promise<CreateTerminalOutput> {
        return { terminal: new NodeFsTerminal(this.requireRoot()) };
    }

    async getTask(_input: GetTaskInput): Promise<GetTaskOutput> {
        return { task: new NodeFsTask(this.options) };
    }

    async runCommand(_input: TerminalCommandInput): Promise<TerminalCommandOutput> {
        throw new Error(LOCAL_COMMANDS_UNAVAILABLE);
    }

    async runBackgroundCommand(
        _input: TerminalBackgroundCommandInput,
    ): Promise<TerminalBackgroundCommandOutput> {
        throw new Error(LOCAL_COMMANDS_UNAVAILABLE);
    }

    async gitInfo(): Promise<{ isRepositoryRoot: boolean; branch?: string }> {
        const result = await requireLocalDev().gitInfo(this.requireRoot());
        if (result.error) throw new Error(result.error);
        return { isRepositoryRoot: result.isRepositoryRoot, branch: result.branch };
    }

    async gitStatus(_input: GitStatusInput): Promise<GitStatusOutput> {
        const result = await requireLocalDev().gitStatus(this.requireRoot());
        if (result.error) throw new Error(result.error);
        return { changedFiles: result.changedFiles };
    }

    async setup(_input: SetupInput): Promise<SetupOutput> {
        // Explicit preview starts check for dependencies in the desktop bridge.
        // Project open never calls setup().
        const res = await requireLocalDev().start(
            this.requireRoot(),
            this.options.devCommand,
            this.options.port,
        );
        if (res.error) throw new Error(res.error);
        return {};
    }

    async createSession(_input: CreateSessionInput): Promise<CreateSessionOutput> {
        const root = this.requireRoot();
        const res = await requireLocalDev().start(root, this.options.devCommand, this.options.port);
        if (res.error) throw new Error(res.error);
        return { previewUrl: res.url };
    }

    async reload(): Promise<boolean> {
        return true;
    }

    async reconnect(): Promise<void> {
        // Dev server is local + persistent; nothing to reconnect.
    }

    async ping(): Promise<boolean> {
        return !!getNative()?.localfs;
    }

    static async createProject(input: CreateProjectInput): Promise<CreateProjectOutput> {
        // Local create (scaffold-to-folder) lands in a later phase; the row id
        // is enough for the caller to proceed.
        return { id: input.id };
    }

    static async createProjectFromGit(_input: {
        repoUrl: string;
        branch: string;
        subpath?: string;
    }): Promise<CreateProjectOutput> {
        throw new Error('createProjectFromGit not implemented for NodeFs provider');
    }

    async pauseProject(_input: PauseProjectInput): Promise<PauseProjectOutput> {
        return {};
    }

    async stopProject(_input: StopProjectInput): Promise<StopProjectOutput> {
        const root = this.options.rootPath;
        if (root) {
            try {
                await getNative()?.localdev?.stop(root);
            } catch {
                // best-effort
            }
        }
        return {};
    }

    async listProjects(_input: ListProjectsInput): Promise<ListProjectsOutput> {
        return {};
    }

    async destroy(): Promise<void> {
        const root = this.options.rootPath;
        if (root) {
            try {
                await getNative()?.localdev?.stop(root);
            } catch {
                // best-effort
            }
        }
    }
}

export class NodeFsFileWatcher extends ProviderFileWatcher {
    private watchId: string | null = null;
    private unsubscribe: (() => void) | null = null;
    private callbacks: Array<(event: WatchEvent) => Promise<void>> = [];

    constructor(private readonly root: string) {
        super();
    }

    async start(input: WatchFilesInput): Promise<void> {
        const fs = requireLocalFs();
        const res = await fs.watchStart(this.root, input.args.excludes);
        if (res.error || !res.watchId) {
            throw new Error(res.error ?? 'Local file watcher did not return an ID');
        }
        this.watchId = res.watchId;
        try {
            this.unsubscribe = fs.onWatchEvent(({ watchId, event }) => {
                if (watchId !== this.watchId) return;
                for (const cb of this.callbacks) void cb(event);
            });
        } catch (error) {
            await fs.watchStop(res.watchId);
            this.watchId = null;
            throw error;
        }
    }

    async stop(): Promise<void> {
        this.unsubscribe?.();
        this.unsubscribe = null;
        if (this.watchId) {
            try {
                await getNative()?.localfs?.watchStop(this.watchId);
            } catch {
                // best-effort
            }
            this.watchId = null;
        }
    }

    registerEventCallback(callback: (event: WatchEvent) => Promise<void>): void {
        this.callbacks.push(callback);
    }
}

export class NodeFsTerminal extends ProviderTerminal {
    private outputCallbacks: Array<(data: string) => void> = [];

    constructor(_root: string) {
        super();
    }

    get id(): string {
        return 'local-terminal';
    }

    get name(): string {
        return 'Local terminal';
    }

    async open(): Promise<string> {
        for (const cb of this.outputCallbacks) cb(`${LOCAL_COMMANDS_UNAVAILABLE}\r\n`);
        return this.id;
    }

    async write(): Promise<void> {
        // Interactive stdin is not supported over the v1 bridge.
    }

    async run(_input: string): Promise<void> {
        throw new Error(LOCAL_COMMANDS_UNAVAILABLE);
    }

    async kill(): Promise<void> {
        // There is no local shell process to stop.
    }

    onOutput(callback: (data: string) => void): () => void {
        this.outputCallbacks.push(callback);
        return () => {
            this.outputCallbacks = this.outputCallbacks.filter((c) => c !== callback);
        };
    }
}

export class NodeFsTask extends ProviderTask {
    private outputCallbacks: Array<(data: string) => void> = [];
    private unsubscribe: (() => void) | null = null;

    constructor(private readonly options: NodeFsProviderOptions) {
        super();
    }

    private requireRoot(): string {
        const root = this.options.rootPath;
        if (!root) throw new Error('Local project has no rootPath configured.');
        return root;
    }

    get id(): string {
        return 'local-dev';
    }

    get name(): string {
        return 'Local dev server';
    }

    get command(): string {
        return this.options.devCommand ?? 'npm run dev';
    }

    async open(): Promise<string> {
        const root = this.requireRoot();
        if (!this.unsubscribe) {
            this.unsubscribe =
                getNative()?.localdev?.onOutput(({ root: r, data }) => {
                    if (r !== root) return;
                    for (const cb of this.outputCallbacks) cb(data);
                }) ?? null;
        }
        // open() is the method the editor's task-init reliably calls (run() only
        // fires on resume), so boot the dev server here. Idempotent on the bridge
        // side — returns the already-running server if one is up.
        const res = await requireLocalDev().start(root, this.options.devCommand, this.options.port);
        if (res.error) return `Failed to start local dev server: ${res.error}\n`;
        // Prefer the bridge's actually-bound url/port. The final fallback is the
        // uncommon local default (WEBLAB_LOCAL_DEFAULT_PORT) — never :3000, which
        // is the editor's own dev server and would render the editor in the frame.
        const url = res.url ?? `http://localhost:${res.port ?? this.options.port ?? 31847}`;
        return `Local dev server running on ${url}\n`;
    }

    async run(): Promise<void> {
        const res = await requireLocalDev().start(
            this.requireRoot(),
            this.options.devCommand,
            this.options.port,
        );
        if (res.error) throw new Error(res.error);
    }

    async restart(): Promise<void> {
        const dev = requireLocalDev();
        const root = this.requireRoot();
        const stopped = await dev.stop(root);
        if (stopped.error) throw new Error(stopped.error);
        const started = await dev.start(root, this.options.devCommand, this.options.port);
        if (started.error) throw new Error(started.error);
    }

    async stop(): Promise<void> {
        await requireLocalDev().stop(this.requireRoot());
    }

    onOutput(callback: (data: string) => void): () => void {
        this.outputCallbacks.push(callback);
        return () => {
            this.outputCallbacks = this.outputCallbacks.filter((c) => c !== callback);
        };
    }
}

export class NodeFsCommand extends ProviderBackgroundCommand {
    private outputCallbacks: Array<(data: string) => void> = [];

    constructor(
        _root: string,
        private readonly cmd: string,
    ) {
        super();
    }

    get name(): string | undefined {
        return 'local-command';
    }

    get command(): string {
        return this.cmd;
    }

    async open(): Promise<string> {
        throw new Error(LOCAL_COMMANDS_UNAVAILABLE);
    }

    async restart(): Promise<void> {
        await this.open();
    }

    async kill(): Promise<void> {
        // One-shot command; nothing persistent to kill.
    }

    onOutput(callback: (data: string) => void): () => void {
        this.outputCallbacks.push(callback);
        return () => {
            this.outputCallbacks = this.outputCallbacks.filter((c) => c !== callback);
        };
    }
}
