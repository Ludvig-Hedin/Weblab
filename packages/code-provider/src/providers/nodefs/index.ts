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

// --- Desktop IPC bridge contract ---------------------------------------------
// Implemented in apps/desktop/preload.js (`window.weblabNative.localfs/localdev`),
// backed by apps/desktop/weblab-local.js in the Electron main process. The
// provider runs in the renderer and cannot touch Node APIs directly, so every
// operation is delegated over this bridge. Local mode is desktop-only — these
// are undefined in a normal browser, and the provider throws a clear error.

interface LocalFsBridge {
    pickFolder(): Promise<{ rootPath: string } | null>;
    read(root: string, path: string): Promise<{ content?: string; error?: string; notFound?: boolean }>;
    write(
        root: string,
        path: string,
        content: string | Uint8Array,
    ): Promise<{ success?: boolean; error?: string }>;
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
    mkdir(root: string, path: string): Promise<{ success?: boolean; error?: string }>;
    remove(root: string, path: string, recursive?: boolean): Promise<{ success?: boolean; error?: string }>;
    rename(
        root: string,
        oldPath: string,
        newPath: string,
    ): Promise<{ success?: boolean; error?: string }>;
    copy(
        root: string,
        sourcePath: string,
        targetPath: string,
        recursive?: boolean,
    ): Promise<{ success?: boolean; error?: string }>;
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
    stop(root: string): Promise<{ success?: boolean; error?: string }>;
    status(root: string): Promise<{ running: boolean; port?: number; url?: string }>;
    run(root: string, command: string): Promise<{ output?: string; exitCode?: number; error?: string }>;
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

/**
 * Local-first provider. Edits a real folder on the user's disk and runs its dev
 * server locally, all via the Electron IPC bridge. Selected by `session.ts` when
 * `branch.runtime.type === 'local'`. The whole editor (canvas, parser, element
 * editing, AI chat) reuses this through the `Provider` interface unchanged.
 */
export class NodeFsProvider extends Provider {
    private readonly options: NodeFsProviderOptions;

    constructor(options: NodeFsProviderOptions) {
        super();
        this.options = options;
    }

    private requireRoot(): string {
        const root = this.options.rootPath;
        if (!root) throw new Error('Local project has no rootPath configured.');
        return root;
    }

    async initialize(_input: InitializeInput): Promise<InitializeOutput> {
        return {};
    }

    async writeFile(input: WriteFileInput): Promise<WriteFileOutput> {
        const res = await requireLocalFs().write(this.requireRoot(), input.args.path, input.args.content);
        if (res.error) throw new Error(res.error);
        return { success: true };
    }

    async renameFile(input: RenameFileInput): Promise<RenameFileOutput> {
        const res = await requireLocalFs().rename(
            this.requireRoot(),
            input.args.oldPath,
            input.args.newPath,
        );
        if (res.error) throw new Error(res.error);
        return {};
    }

    async statFile(input: StatFileInput): Promise<StatFileOutput> {
        const res = await requireLocalFs().stat(this.requireRoot(), input.args.path);
        if (!res.type) throw new Error(res.error ?? `Cannot stat ${input.args.path}`);
        return { type: res.type, isSymlink: res.isSymlink, size: res.size, mtime: res.mtime };
    }

    async deleteFiles(input: DeleteFilesInput): Promise<DeleteFilesOutput> {
        const res = await requireLocalFs().remove(
            this.requireRoot(),
            input.args.path,
            input.args.recursive,
        );
        if (res.error) throw new Error(res.error);
        return {};
    }

    async listFiles(input: ListFilesInput): Promise<ListFilesOutput> {
        const res = await requireLocalFs().list(this.requireRoot(), input.args.path);
        if (res.error && !res.files) throw new Error(res.error);
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

    async copyFiles(input: CopyFilesInput): Promise<CopyFileOutput> {
        const res = await requireLocalFs().copy(
            this.requireRoot(),
            input.args.sourcePath,
            input.args.targetPath,
            input.args.recursive,
        );
        if (res.error) throw new Error(res.error);
        return {};
    }

    async createDirectory(input: CreateDirectoryInput): Promise<CreateDirectoryOutput> {
        const res = await requireLocalFs().mkdir(this.requireRoot(), input.args.path);
        if (res.error) throw new Error(res.error);
        return {};
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

    async runCommand(input: TerminalCommandInput): Promise<TerminalCommandOutput> {
        const res = await requireLocalDev().run(this.requireRoot(), input.args.command);
        return { output: res.output ?? '' };
    }

    async runBackgroundCommand(
        input: TerminalBackgroundCommandInput,
    ): Promise<TerminalBackgroundCommandOutput> {
        return { command: new NodeFsCommand(this.requireRoot(), input.args.command) };
    }

    async gitStatus(_input: GitStatusInput): Promise<GitStatusOutput> {
        const res = await requireLocalDev().run(this.requireRoot(), 'git status --porcelain');
        const changedFiles = (res.output ?? '')
            .split('\n')
            .map((line) => line.slice(3).trim())
            .filter((p) => p.length > 0);
        return { changedFiles };
    }

    async setup(_input: SetupInput): Promise<SetupOutput> {
        const root = this.requireRoot();
        const fs = requireLocalFs();
        const dev = requireLocalDev();
        // Install deps if node_modules is absent (first open of a folder).
        const nm = await fs.stat(root, 'node_modules');
        if (nm.notFound || !nm.type) {
            await dev.run(root, 'npm install');
        }
        // Start the dev server (idempotent; waits for the port to bind).
        await dev.start(root, this.options.devCommand, this.options.port);
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
        const fs = getNative()?.localfs;
        if (!fs) return; // watch is best-effort; absent off-desktop
        const res = await fs.watchStart(this.root, input.args.excludes);
        if (res.error || !res.watchId) return;
        this.watchId = res.watchId;
        this.unsubscribe = fs.onWatchEvent(({ watchId, event }) => {
            if (watchId !== this.watchId) return;
            for (const cb of this.callbacks) void cb(event);
        });
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
    private unsubscribe: (() => void) | null = null;

    constructor(private readonly root: string) {
        super();
    }

    get id(): string {
        return 'local-terminal';
    }

    get name(): string {
        return 'Local terminal';
    }

    async open(): Promise<string> {
        if (!this.unsubscribe) {
            this.unsubscribe =
                getNative()?.localdev?.onOutput(({ root, data }) => {
                    if (root !== this.root) return;
                    for (const cb of this.outputCallbacks) cb(data);
                }) ?? null;
        }
        return this.id;
    }

    async write(): Promise<void> {
        // Interactive stdin is not supported over the v1 bridge.
    }

    async run(input: string): Promise<void> {
        await requireLocalDev().run(this.root, input);
    }

    async kill(): Promise<void> {
        this.unsubscribe?.();
        this.unsubscribe = null;
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
        if (!this.unsubscribe) {
            const root = this.requireRoot();
            this.unsubscribe =
                getNative()?.localdev?.onOutput(({ root: r, data }) => {
                    if (r !== root) return;
                    for (const cb of this.outputCallbacks) cb(data);
                }) ?? null;
        }
        return this.id;
    }

    async run(): Promise<void> {
        await requireLocalDev().start(this.requireRoot(), this.options.devCommand, this.options.port);
    }

    async restart(): Promise<void> {
        const dev = requireLocalDev();
        const root = this.requireRoot();
        await dev.stop(root);
        await dev.start(root, this.options.devCommand, this.options.port);
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
        private readonly root: string,
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
        const res = await requireLocalDev().run(this.root, this.cmd);
        const output = res.output ?? '';
        for (const cb of this.outputCallbacks) cb(output);
        return output;
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
