import type * as P from '@weblab/code-provider';
import type { CodeFileSystem } from '@weblab/file-system';
import { Provider, ProviderFileWatcher } from '@weblab/code-provider';

import type { CloudSource } from './cloud-source';

function sourcePath(input: string, allowRoot = false): string {
    const path = input.replace(/^\/+/, '').replace(/\/+$/, '');
    if (!path && allowRoot) return '';
    if (
        !path ||
        /[\\\u0000-\u001f]/.test(path) ||
        path.split('/').some((part) => !part || part === '.' || part === '..')
    )
        throw new Error('Invalid cloud source path');
    return path;
}

export class CloudUnavailableError extends Error {
    constructor(operation: string) {
        super(`${operation} is not available for this cloud project.`);
        this.name = 'CloudUnavailableError';
    }
}

/** Source operations acknowledge durable storage; runtime operations remain separate. */
export class CloudProvider extends Provider {
    private readonly downloads = new Set<string>();
    private readonly watchers = new Set<CloudFileWatcher>();

    constructor(
        private readonly fs: CodeFileSystem,
        readonly source: CloudSource,
    ) {
        super();
    }

    async initialize(_input: P.InitializeInput): Promise<P.InitializeOutput> {
        await this.source.start();
        return {};
    }
    async setup(_input: P.SetupInput): Promise<P.SetupOutput> {
        await this.source.start();
        return {};
    }

    async writeFile(input: P.WriteFileInput): Promise<P.WriteFileOutput> {
        const path = sourcePath(input.args.path);
        if (input.args.overwrite === false && (await this.fs.fileExists(path)))
            throw new Error('Destination already exists');
        await this.fs.writeFile(path, input.args.content);
        return { success: true };
    }

    async renameFile(input: P.RenameFileInput): Promise<P.RenameFileOutput> {
        const from = sourcePath(input.args.oldPath),
            to = sourcePath(input.args.newPath);
        const info = await this.fs.getInfo(from);
        if (info.isDirectory) await this.fs.moveDirectory(from, to);
        else await this.fs.moveFile(from, to);
        return {};
    }

    async statFile(input: P.StatFileInput): Promise<P.StatFileOutput> {
        const info = await this.fs.getInfo(sourcePath(input.args.path, true) || '/');
        return {
            type: info.isDirectory ? 'directory' : 'file',
            isSymlink: false,
            size: info.size,
            mtime: info.modifiedTime.getTime(),
            ctime: info.createdTime.getTime(),
            atime: info.accessedTime.getTime(),
        };
    }

    async deleteFiles(input: P.DeleteFilesInput): Promise<P.DeleteFilesOutput> {
        const path = sourcePath(input.args.path);
        const info = await this.fs.getInfo(path);
        if (info.isDirectory) {
            if (!input.args.recursive && (await this.fs.readDirectory(path)).length)
                throw new Error('Directory is not empty');
            await this.fs.deleteDirectory(path);
        } else await this.fs.deleteFile(path);
        return {};
    }

    async listFiles(input: P.ListFilesInput): Promise<P.ListFilesOutput> {
        const entries = await this.fs.readDirectory(sourcePath(input.args.path, true) || '/');
        return {
            files: entries
                .filter(
                    (entry) =>
                        !/^\/?\.weblab\/(?:index\.json|components\.json|cache|recovery)(?:\/|$)/.test(
                            entry.path,
                        ),
                )
                .map((entry) => ({
                    name: entry.name,
                    type: entry.isDirectory ? 'directory' : 'file',
                    isSymlink: false,
                })),
        };
    }

    async readFile(input: P.ReadFileInput): Promise<P.ReadFileOutput> {
        const path = sourcePath(input.args.path);
        const binary = this.source.binaryContent(path);
        if (binary)
            return {
                file: {
                    path,
                    type: 'binary',
                    content: binary,
                    toString: () => {
                        throw new Error('Binary source cannot be read as text');
                    },
                },
            };
        const content = await this.fs.readFile(path);
        if (typeof content !== 'string')
            return {
                file: {
                    path,
                    type: 'binary',
                    content,
                    toString: () => {
                        throw new Error('Binary source cannot be read as text');
                    },
                },
            };
        return { file: { path, type: 'text', content, toString: () => content } };
    }

    async downloadFiles(input: P.DownloadFilesInput): Promise<P.DownloadFilesOutput> {
        const { file } = await this.readFile(input);
        if (file.content === null) throw new Error('File contents are unavailable');
        const bytes =
            typeof file.content === 'string'
                ? new TextEncoder().encode(file.content)
                : Uint8Array.from(file.content);
        const url = URL.createObjectURL(new Blob([bytes.buffer]));
        this.downloads.add(url);
        return { url };
    }

    async copyFiles(input: P.CopyFilesInput): Promise<P.CopyFileOutput> {
        const from = sourcePath(input.args.sourcePath),
            to = sourcePath(input.args.targetPath);
        if (from === to || to.startsWith(`${from}/`) || from.startsWith(`${to}/`))
            throw new Error('Source and destination overlap');
        const info = await this.fs.getInfo(from);
        if (info.isDirectory) {
            if (!input.args.recursive)
                throw new Error('Copying a directory requires recursive mode');
            await this.fs.copyDirectory(from, to);
        } else await this.fs.copyFile(from, to, { overwrite: input.args.overwrite });
        return {};
    }

    async createDirectory(input: P.CreateDirectoryInput): Promise<P.CreateDirectoryOutput> {
        await this.fs.createDirectory(sourcePath(input.args.path));
        return {};
    }

    async watchFiles(input: P.WatchFilesInput): Promise<P.WatchFilesOutput> {
        const watcher = new CloudFileWatcher(this.fs, this.source);
        await watcher.start(input);
        this.watchers.add(watcher);
        return { watcher };
    }

    async createSession(_input: P.CreateSessionInput): Promise<P.CreateSessionOutput> {
        await this.source.start();
        return { previewUrl: this.source.state.runtime?.previewUrl ?? undefined };
    }
    async reload(): Promise<boolean> {
        await this.source.retryPreview();
        return true;
    }
    async reconnect(): Promise<void> {
        await this.source.retryPreview();
    }
    async ping(): Promise<boolean> {
        return this.source.state.runtime?.status === 'ready';
    }

    async createTerminal(_input: P.CreateTerminalInput): Promise<P.CreateTerminalOutput> {
        throw new CloudUnavailableError('Terminal');
    }
    async getTask(_input: P.GetTaskInput): Promise<P.GetTaskOutput> {
        throw new CloudUnavailableError('Tasks');
    }
    async runCommand(_input: P.TerminalCommandInput): Promise<P.TerminalCommandOutput> {
        throw new CloudUnavailableError('Commands');
    }
    async runBackgroundCommand(
        _input: P.TerminalBackgroundCommandInput,
    ): Promise<P.TerminalBackgroundCommandOutput> {
        throw new CloudUnavailableError('Background commands');
    }
    async gitStatus(_input: P.GitStatusInput): Promise<P.GitStatusOutput> {
        throw new CloudUnavailableError('Git');
    }
    async pauseProject(_input: P.PauseProjectInput): Promise<P.PauseProjectOutput> {
        throw new CloudUnavailableError('Pausing the preview');
    }
    async stopProject(_input: P.StopProjectInput): Promise<P.StopProjectOutput> {
        throw new CloudUnavailableError('Stopping the preview');
    }
    async listProjects(_input: P.ListProjectsInput): Promise<P.ListProjectsOutput> {
        throw new CloudUnavailableError('Listing projects');
    }

    async destroy(): Promise<void> {
        for (const watcher of this.watchers) await watcher.stop();
        this.watchers.clear();
        for (const url of this.downloads) URL.revokeObjectURL(url);
        this.downloads.clear();
        await this.source.stop();
    }
}

class CloudFileWatcher extends ProviderFileWatcher {
    private unsubscribe: (() => void) | null = null;
    private callbacks = new Set<(event: P.WatchEvent) => Promise<void>>();
    private existing = new Set<string>();
    private active = false;

    constructor(
        private readonly fs: CodeFileSystem,
        private readonly source: CloudSource,
    ) {
        super();
    }

    async start(input: P.WatchFilesInput): Promise<void> {
        await this.stop();
        const root = sourcePath(input.args.path, true);
        if (input.onFileChange) this.callbacks.add(input.onFileChange);
        this.existing = new Set(
            (await this.fs.listAll()).map((file) => file.path.replace(/^\/+/, '')),
        );
        this.active = true;
        this.unsubscribe = this.source.subscribe((paths) => {
            void this.emit(
                paths.filter((path) => {
                    if (root && path !== root && !path.startsWith(`${root}/`)) return false;
                    const relative = root ? path.slice(root.length + 1) : path;
                    if (!input.args.recursive && relative.includes('/')) return false;
                    return !(input.args.excludes ?? []).some((excluded) =>
                        path.split('/').includes(excluded),
                    );
                }),
            ).catch(() => undefined);
        });
    }

    private async emit(paths: string[]): Promise<void> {
        // The durable handler runs before the filesystem applies its cache.
        // Queue an empty write to observe the fully settled filesystem lock.
        await this.fs.writeFiles([]);
        for (const path of paths) {
            if (!this.active) return;
            const exists = await this.fs.fileExists(path);
            const type = exists ? (this.existing.has(path) ? 'change' : 'add') : 'remove';
            if (exists) this.existing.add(path);
            else this.existing.delete(path);
            for (const callback of this.callbacks) await callback({ type, paths: [path] });
        }
    }

    async stop(): Promise<void> {
        this.active = false;
        this.unsubscribe?.();
        this.unsubscribe = null;
    }
    registerEventCallback(callback: (event: P.WatchEvent) => Promise<void>): void {
        this.callbacks.add(callback);
    }
}
