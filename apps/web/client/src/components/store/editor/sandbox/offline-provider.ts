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
} from '@weblab/code-provider';
import {
    Provider,
    ProviderFileWatcher,
    ProviderTask,
    ProviderTerminal,
} from '@weblab/code-provider';

/**
 * Offline-mode shim for the code-provider Provider abstract class.
 *
 * Source of truth for files in offline mode is the in-browser ZenFS volume
 * (mounted by `@weblab/file-system`). This shim exists so the editor's
 * `SessionManager.provider` is non-null — which is what `useStartProject`
 * gates the editor "ready" state on. Methods either no-op (file ops, since
 * actual reads/writes flow through `CodeFileSystem` against ZenFS) or throw
 * a clear error for runtime ops that require a live sandbox (terminals,
 * git, tasks). The sync engine treats those throws as "offline write" and
 * enqueues for replay — see services/offline/write-queue.ts.
 */

export class OfflineUnavailableError extends Error {
    constructor(op: string) {
        super(`Operation "${op}" is unavailable while offline.`);
        this.name = 'OfflineUnavailableError';
    }
}

export class OfflineProvider extends Provider {
    async initialize(_input: InitializeInput): Promise<InitializeOutput> {
        return {};
    }

    async writeFile(_input: WriteFileInput): Promise<WriteFileOutput> {
        return { success: true };
    }

    async renameFile(_input: RenameFileInput): Promise<RenameFileOutput> {
        return {};
    }

    async statFile(_input: StatFileInput): Promise<StatFileOutput> {
        return { type: 'file' };
    }

    async deleteFiles(_input: DeleteFilesInput): Promise<DeleteFilesOutput> {
        return {};
    }

    async listFiles(_input: ListFilesInput): Promise<ListFilesOutput> {
        return { files: [] };
    }

    async readFile(input: ReadFileInput): Promise<ReadFileOutput> {
        return {
            file: {
                path: input.args.path,
                content: '',
                type: 'text',
                toString: () => '',
            },
        };
    }

    async downloadFiles(_input: DownloadFilesInput): Promise<DownloadFilesOutput> {
        return { url: '' };
    }

    async copyFiles(_input: CopyFilesInput): Promise<CopyFileOutput> {
        return {};
    }

    async createDirectory(_input: CreateDirectoryInput): Promise<CreateDirectoryOutput> {
        return {};
    }

    async watchFiles(_input: WatchFilesInput): Promise<WatchFilesOutput> {
        return { watcher: new OfflineFileWatcher() };
    }

    async createTerminal(_input: CreateTerminalInput): Promise<CreateTerminalOutput> {
        return { terminal: new OfflineTerminal() };
    }

    async getTask(_input: GetTaskInput): Promise<GetTaskOutput> {
        return { task: new OfflineTask() };
    }

    async runCommand(_input: TerminalCommandInput): Promise<TerminalCommandOutput> {
        throw new OfflineUnavailableError('runCommand');
    }

    async runBackgroundCommand(
        _input: TerminalBackgroundCommandInput,
    ): Promise<TerminalBackgroundCommandOutput> {
        // Throw consistently with runCommand. Returning a stub object here
        // would let callers think they have a live background process and
        // silently no-op on every interaction.
        throw new OfflineUnavailableError('runBackgroundCommand');
    }

    async gitStatus(_input: GitStatusInput): Promise<GitStatusOutput> {
        return { changedFiles: [] };
    }

    async setup(_input: SetupInput): Promise<SetupOutput> {
        return {};
    }

    async createSession(_input: CreateSessionInput): Promise<CreateSessionOutput> {
        return {};
    }

    async reload(): Promise<boolean> {
        return false;
    }

    async reconnect(): Promise<void> {
        // Reconnect is a no-op offline; the replay controller handles the
        // real provider swap when the user comes back online.
    }

    async ping(): Promise<boolean> {
        return false;
    }

    async pauseProject(_input: PauseProjectInput): Promise<PauseProjectOutput> {
        return {};
    }

    async stopProject(_input: StopProjectInput): Promise<StopProjectOutput> {
        return {};
    }

    async listProjects(_input: ListProjectsInput): Promise<ListProjectsOutput> {
        return {};
    }

    async destroy(): Promise<void> {
        return undefined;
    }
}

const NOOP = (): void => undefined;

class OfflineFileWatcher extends ProviderFileWatcher {
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

class OfflineTerminal extends ProviderTerminal {
    readonly id = 'offline-terminal';
    readonly name = 'Offline';
    async open() {
        return '';
    }
    async write() {
        return undefined;
    }
    async run() {
        return undefined;
    }
    async kill() {
        return undefined;
    }
    onOutput(_callback: (data: string) => void) {
        return NOOP;
    }
}

class OfflineTask extends ProviderTask {
    readonly id = 'offline-task';
    readonly name = 'Offline';
    readonly command = '';
    async open() {
        return '';
    }
    async run() {
        return undefined;
    }
    async restart() {
        return undefined;
    }
    async stop() {
        return undefined;
    }
    onOutput(_callback: (data: string) => void) {
        return NOOP;
    }
}

