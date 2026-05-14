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

import { api } from '@/trpc/client';

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

    async writeFile(input: WriteFileInput): Promise<WriteFileOutput> {
        return api.sandbox.fileWrite.mutate({
            sandboxId: this.sandboxId,
            path: input.args.path,
            content:
                typeof input.args.content === 'string'
                    ? input.args.content
                    : Array.from(input.args.content),
            overwrite: input.args.overwrite,
        });
    }

    async renameFile(input: RenameFileInput): Promise<RenameFileOutput> {
        return api.sandbox.fileRename.mutate({
            sandboxId: this.sandboxId,
            oldPath: input.args.oldPath,
            newPath: input.args.newPath,
        });
    }

    async statFile(input: StatFileInput): Promise<StatFileOutput> {
        return api.sandbox.fileStat.mutate({
            sandboxId: this.sandboxId,
            path: input.args.path,
        });
    }

    async deleteFiles(input: DeleteFilesInput): Promise<DeleteFilesOutput> {
        return api.sandbox.fileDelete.mutate({
            sandboxId: this.sandboxId,
            path: input.args.path,
            recursive: input.args.recursive,
        });
    }

    async listFiles(input: ListFilesInput): Promise<ListFilesOutput> {
        return api.sandbox.fileList.mutate({
            sandboxId: this.sandboxId,
            path: input.args.path,
        });
    }

    async readFile(input: ReadFileInput): Promise<ReadFileOutput> {
        const file = await api.sandbox.fileRead.mutate({
            sandboxId: this.sandboxId,
            path: input.args.path,
        });
        const content: string | Uint8Array =
            file.binary && Array.isArray(file.content)
                ? Uint8Array.from(file.content)
                : String(file.content);
        const decoded = typeof content === 'string' ? content : new TextDecoder().decode(content);
        if (file.binary) {
            return {
                file: {
                    path: file.path,
                    type: 'binary',
                    content:
                        typeof content === 'string' ? new TextEncoder().encode(content) : content,
                    toString: () => decoded,
                },
            };
        }
        return {
            file: {
                path: file.path,
                type: 'text',
                content: decoded,
                toString: () => decoded,
            },
        };
    }

    async downloadFiles(input: DownloadFilesInput): Promise<DownloadFilesOutput> {
        return api.sandbox.fileDownload.mutate({
            sandboxId: this.sandboxId,
            path: input.args.path,
        });
    }

    async copyFiles(input: CopyFilesInput): Promise<CopyFileOutput> {
        return api.sandbox.fileCopy.mutate({
            sandboxId: this.sandboxId,
            sourcePath: input.args.sourcePath,
            targetPath: input.args.targetPath,
            recursive: input.args.recursive,
            overwrite: input.args.overwrite,
        });
    }

    async createDirectory(input: CreateDirectoryInput): Promise<CreateDirectoryOutput> {
        return api.sandbox.fileMkdir.mutate({
            sandboxId: this.sandboxId,
            path: input.args.path,
        });
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

    async runCommand(input: TerminalCommandInput): Promise<TerminalCommandOutput> {
        return api.sandbox.commandRun.mutate({
            sandboxId: this.sandboxId,
            command: input.args.command,
        });
    }

    async runBackgroundCommand(
        input: TerminalBackgroundCommandInput,
    ): Promise<TerminalBackgroundCommandOutput> {
        const result = await api.sandbox.commandRunBackground.mutate({
            sandboxId: this.sandboxId,
            command: input.args.command,
        });
        return {
            command: new VercelBrowserBackgroundCommand(result.command, result.output),
        };
    }

    async gitStatus(_input: GitStatusInput): Promise<GitStatusOutput> {
        return api.sandbox.gitStatus.mutate({ sandboxId: this.sandboxId });
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
        await api.sandbox.delete.mutate({ sandboxId: this.sandboxId });
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

    constructor(private readonly sandboxId: string) {
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

    async run(input: string): Promise<void> {
        const result = await api.sandbox.commandRun.mutate({
            sandboxId: this.sandboxId,
            command: input,
        });
        this.output += result.output;
        for (const callback of this.callbacks) {
            callback(result.output);
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

    constructor(
        private readonly sandboxId: string,
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
        const result = await api.sandbox.taskOpen.mutate({
            sandboxId: this.sandboxId,
            taskId: this.taskId,
        });
        this.output = result.output;
        for (const callback of this.callbacks) {
            callback(result.output);
        }
    }

    async restart(): Promise<void> {
        const result = await api.sandbox.taskRestart.mutate({
            sandboxId: this.sandboxId,
            taskId: this.taskId,
        });
        this.output = result.output;
        for (const callback of this.callbacks) {
            callback(result.output);
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
