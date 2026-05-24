'use client';

import type {
    CopyFileOutput,
    CopyFilesInput,
    CreateDirectoryInput,
    CreateDirectoryOutput,
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
} from '@weblab/code-provider';
import {
    Provider,
    ProviderBackgroundCommand,
    ProviderFileWatcher,
    ProviderTask,
    ProviderTerminal,
} from '@weblab/code-provider';

// TODO(sandbox-port): `api.sandbox.*` endpoints (fileWrite, fileRename,
// fileStat, fileDelete, fileList, fileRead, fileDownload, fileCopy, fileMkdir,
// commandRun, commandRunBackground, gitStatus, delete, taskOpen, taskRestart)
// have no Convex equivalent yet — sandbox proxy lives outside the Convex
// migration scope. All sandbox calls return safe defaults until the routes
// are ported.

export interface VercelBrowserProviderOptions {
    sandboxId: string;
}

export class VercelBrowserProvider extends Provider {
    constructor(private readonly options: VercelBrowserProviderOptions) {
        super();
    }

    private get sandboxId() {
        return this.options.sandboxId;
    }

    async initialize(_input: InitializeInput): Promise<InitializeOutput> {
        return {};
    }

    async writeFile(_input: WriteFileInput): Promise<WriteFileOutput> {
        // TODO(sandbox-port): api.sandbox.fileWrite has no Convex equivalent yet.
        return { success: false } as never;
    }

    async renameFile(_input: RenameFileInput): Promise<RenameFileOutput> {
        // TODO(sandbox-port): api.sandbox.fileRename has no Convex equivalent yet.
        return { success: false } as never;
    }

    async statFile(_input: StatFileInput): Promise<StatFileOutput> {
        // TODO(sandbox-port): api.sandbox.fileStat has no Convex equivalent yet.
        return { type: 'file', isSymlink: false, size: 0 } as never;
    }

    async deleteFiles(_input: DeleteFilesInput): Promise<DeleteFilesOutput> {
        // TODO(sandbox-port): api.sandbox.fileDelete has no Convex equivalent yet.
        return { success: false } as never;
    }

    async listFiles(_input: ListFilesInput): Promise<ListFilesOutput> {
        // TODO(sandbox-port): api.sandbox.fileList has no Convex equivalent yet.
        return { files: [] } as never;
    }

    async readFile(input: ReadFileInput): Promise<ReadFileOutput> {
        // TODO(sandbox-port): api.sandbox.fileRead has no Convex equivalent yet.
        const decoded = '';
        return {
            file: {
                path: input.args.path,
                type: 'text',
                content: decoded,
                toString: () => decoded,
            },
        } as never;
    }

    async downloadFiles(_input: DownloadFilesInput): Promise<DownloadFilesOutput> {
        // TODO(sandbox-port): api.sandbox.fileDownload has no Convex equivalent yet.
        return { downloadUrl: '' } as never;
    }

    async copyFiles(_input: CopyFilesInput): Promise<CopyFileOutput> {
        // TODO(sandbox-port): api.sandbox.fileCopy has no Convex equivalent yet.
        return { success: false } as never;
    }

    async createDirectory(_input: CreateDirectoryInput): Promise<CreateDirectoryOutput> {
        // TODO(sandbox-port): api.sandbox.fileMkdir has no Convex equivalent yet.
        return { success: false } as never;
    }

    async watchFiles(_input: WatchFilesInput): Promise<WatchFilesOutput> {
        return { watcher: new VercelBrowserFileWatcher() };
    }

    async createTerminal(_input: CreateTerminalInput): Promise<CreateTerminalOutput> {
        return { terminal: new VercelBrowserTerminal(this.sandboxId) };
    }

    async getTask(input: GetTaskInput): Promise<GetTaskOutput> {
        return { task: new VercelBrowserTask(this.sandboxId, input.args.id) };
    }

    async runCommand(_input: TerminalCommandInput): Promise<TerminalCommandOutput> {
        // TODO(sandbox-port): api.sandbox.commandRun has no Convex equivalent yet.
        return { output: '', success: false, exitCode: 0 } as never;
    }

    async runBackgroundCommand(
        input: TerminalBackgroundCommandInput,
    ): Promise<TerminalBackgroundCommandOutput> {
        // TODO(sandbox-port): api.sandbox.commandRunBackground has no Convex equivalent yet.
        return {
            command: new VercelBrowserBackgroundCommand(input.args.command, ''),
        };
    }

    async gitStatus(_input: GitStatusInput): Promise<GitStatusOutput> {
        // TODO(sandbox-port): api.sandbox.gitStatus has no Convex equivalent yet.
        return { hasGit: false, branch: '', ahead: 0, behind: 0, changes: [] } as never;
    }

    async createSession(_input: CreateSessionInput): Promise<CreateSessionOutput> {
        return {};
    }

    async setup(_input: SetupInput): Promise<SetupOutput> {
        await this.runCommand({ args: { command: 'npm install' } });
        return {};
    }

    async reload(): Promise<boolean> {
        const task = new VercelBrowserTask(this.sandboxId, 'dev');
        await task.restart();
        return true;
    }

    async reconnect(): Promise<void> {
        return undefined;
    }

    async ping(): Promise<boolean> {
        try {
            await this.runCommand({ args: { command: 'echo "ping"' } });
            return true;
        } catch {
            return false;
        }
    }

    async pauseProject(_input: PauseProjectInput): Promise<PauseProjectOutput> {
        return {};
    }

    async stopProject(_input: StopProjectInput): Promise<StopProjectOutput> {
        // TODO(sandbox-port): api.sandbox.delete has no Convex equivalent yet.
        return {};
    }

    async listProjects(_input: PauseProjectInput): Promise<object> {
        return {};
    }

    async destroy(): Promise<void> {
        return undefined;
    }
}

class VercelBrowserFileWatcher extends ProviderFileWatcher {
    async start(_input: WatchFilesInput): Promise<void> {
        return undefined;
    }

    async stop(): Promise<void> {
        return undefined;
    }

    registerEventCallback(_callback: (event: WatchEvent) => Promise<void>): void {
        return undefined;
    }
}

class VercelBrowserTerminal extends ProviderTerminal {
    private output = '';
    private callbacks = new Set<(data: string) => void>();
    private readonly terminalId = 'vercel-terminal';
    private readonly terminalName = 'terminal';

    // sandboxId currently unused — kept for restoration when api.sandbox.* ports.
    constructor(private readonly _sandboxId: string) {
        super();
    }

    get id(): string {
        return this.terminalId;
    }

    get name(): string {
        return this.terminalName;
    }

    async open(): Promise<string> {
        return this.output;
    }

    async write(input: string): Promise<void> {
        if (!input.trim()) return;
        await this.run(input);
    }

    async run(_input: string): Promise<void> {
        // TODO(sandbox-port): api.sandbox.commandRun has no Convex equivalent yet.
        const output = '';
        this.output += output;
        for (const callback of this.callbacks) {
            callback(output);
        }
    }

    async kill(): Promise<void> {
        return undefined;
    }

    onOutput(callback: (data: string) => void): () => void {
        this.callbacks.add(callback);
        if (this.output) callback(this.output);
        return () => {
            this.callbacks.delete(callback);
        };
    }
}

class VercelBrowserTask extends ProviderTask {
    private output = '';
    private callbacks = new Set<(data: string) => void>();
    private readonly taskCommand = 'npm run dev -- --hostname 0.0.0.0';

    // sandboxId currently unused — kept for restoration when api.sandbox.* ports.
    constructor(
        private readonly _sandboxId: string,
        private readonly taskId: string,
    ) {
        super();
    }

    get id(): string {
        return this.taskId;
    }

    get name(): string {
        return this.taskId;
    }

    get command(): string {
        return this.taskCommand;
    }

    async open(): Promise<string> {
        if (!this.output) {
            await this.run();
        }
        return this.output;
    }

    async run(): Promise<void> {
        // TODO(sandbox-port): api.sandbox.taskOpen has no Convex equivalent yet.
        const output = '';
        this.output = output;
        for (const callback of this.callbacks) {
            callback(output);
        }
    }

    async restart(): Promise<void> {
        // TODO(sandbox-port): api.sandbox.taskRestart has no Convex equivalent yet.
        const output = '';
        this.output = output;
        for (const callback of this.callbacks) {
            callback(output);
        }
    }

    async stop(): Promise<void> {
        return undefined;
    }

    onOutput(callback: (data: string) => void): () => void {
        this.callbacks.add(callback);
        if (this.output) callback(this.output);
        return () => {
            this.callbacks.delete(callback);
        };
    }
}

class VercelBrowserBackgroundCommand extends ProviderBackgroundCommand {
    constructor(
        private readonly originalCommand: string,
        private readonly output: string,
    ) {
        super();
    }

    get name(): string | undefined {
        return this.originalCommand;
    }

    get command(): string {
        return this.originalCommand;
    }

    async open(): Promise<string> {
        return this.output;
    }

    async restart(): Promise<void> {
        return undefined;
    }

    async kill(): Promise<void> {
        return undefined;
    }

    onOutput(callback: (data: string) => void): () => void {
        callback(this.output);
        return () => undefined;
    }
}
