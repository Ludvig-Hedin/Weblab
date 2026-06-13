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

import { getSandboxServerClient } from '@/lib/sandbox-server-client';
import { isSandboxGoneError } from './errors';

// Browser → Fastify sandbox proxy. File ops, `commandRun`, and dev-server
// `setup` route through the authed tRPC client (getSandboxServerClient) to the
// Vercel Sandbox SDK on the server. Each method degrades to a safe default on
// transport failure so a flaky server can't brick editor boot.
//
// Still unported (return safe defaults, not yet on the proxy):
//   downloadFiles, copyFiles, runBackgroundCommand, real file watch.
// renameFile is emulated as read → write → delete; gitStatus is derived from
// `commandRun` (`git status --porcelain`); the `dev` task starts the dev
// server via the idempotent `setup` route (no streamed logs over the proxy).

export interface VercelBrowserProviderOptions {
    sandboxId: string;
    port?: number | null;
    devCommand?: string | null;
}

export class VercelBrowserProvider extends Provider {
    constructor(private readonly options: VercelBrowserProviderOptions) {
        super();
    }

    private get sandboxId() {
        return this.options.sandboxId;
    }

    private get port() {
        // Only forward a usable port. A 0 / NaN / out-of-range value would fail
        // the server's Zod check (`.int().positive().max(65535)`), reject the
        // whole `setup` mutation (caught + logged), and leave the preview 502ing
        // forever. Fall through to the server-side default instead.
        const value = this.options.port;
        return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 65_535
            ? value
            : undefined;
    }

    private get devCommand() {
        // An empty / whitespace-only command would fail the server's
        // `.trim().min(1)` Zod check and reject `setup`. Fall through to the
        // server's package.json-derived default instead.
        const value = this.options.devCommand?.trim();
        return value && value.length > 0 ? value : undefined;
    }

    async initialize(_input: InitializeInput): Promise<InitializeOutput> {
        return {};
    }

    async writeFile(input: WriteFileInput): Promise<WriteFileOutput> {
        const content =
            typeof input.args.content === 'string'
                ? input.args.content
                : new TextDecoder().decode(input.args.content);
        try {
            return await getSandboxServerClient().sandbox.fileWrite.mutate({
                sandboxId: this.sandboxId,
                path: input.args.path,
                content,
            });
        } catch (err) {
            console.error('[VercelBrowserProvider] writeFile failed', err);
            return { success: false };
        }
    }

    async renameFile(input: RenameFileInput): Promise<RenameFileOutput> {
        // No dedicated server rename op — emulate as copy-to-new + delete-old.
        // Order matters: read → write → delete so a mid-way failure never
        // destroys the source. Errors propagate intentionally — the sync engine
        // relies on a throw to detect a failed rename and keep its hash map
        // consistent (swallowing here would desync tracked file hashes).
        const client = getSandboxServerClient();
        const res = await client.sandbox.fileRead.query({
            sandboxId: this.sandboxId,
            path: input.args.oldPath,
        });
        await client.sandbox.fileWrite.mutate({
            sandboxId: this.sandboxId,
            path: input.args.newPath,
            content: res.content,
        });
        await client.sandbox.fileDelete.mutate({
            sandboxId: this.sandboxId,
            path: input.args.oldPath,
        });
        return {};
    }

    async statFile(input: StatFileInput): Promise<StatFileOutput> {
        try {
            const stat = await getSandboxServerClient().sandbox.fileStat.query({
                sandboxId: this.sandboxId,
                path: input.args.path,
            });
            return { type: stat.type, isSymlink: false, size: stat.size };
        } catch {
            return { type: 'file', isSymlink: false, size: 0 };
        }
    }

    async deleteFiles(input: DeleteFilesInput): Promise<DeleteFilesOutput> {
        try {
            await getSandboxServerClient().sandbox.fileDelete.mutate({
                sandboxId: this.sandboxId,
                path: input.args.path,
                recursive: input.args.recursive,
            });
        } catch (err) {
            console.error('[VercelBrowserProvider] deleteFiles failed', err);
        }
        return {};
    }

    async listFiles(input: ListFilesInput): Promise<ListFilesOutput> {
        try {
            return await getSandboxServerClient().sandbox.fileList.query({
                sandboxId: this.sandboxId,
                path: input.args.path,
            });
        } catch (err) {
            // MUST rethrow. Returning an empty list on a transient per-subdir
            // failure makes the subtree look deleted to the sync engine —
            // pullFromSandbox's `listingIncomplete` guard only trips on a THROW
            // (getAllSandboxFiles catch sets the flag), so swallowing here
            // would let one flaky listing wipe the local subtree and echo the
            // deletion back into the sandbox (same class as the boot-sync wipe).
            // The sole other caller — getAllSandboxFiles' recursive directory
            // sync inside the watcher — already wraps each listFiles call in its
            // own try/catch and tolerates a throw.
            console.error('[VercelBrowserProvider] listFiles failed', err);
            throw err;
        }
    }

    async readFile(input: ReadFileInput): Promise<ReadFileOutput> {
        try {
            const res = await getSandboxServerClient().sandbox.fileRead.query({
                sandboxId: this.sandboxId,
                path: input.args.path,
            });
            return {
                file: {
                    path: res.path,
                    type: 'text' as const,
                    content: res.content,
                    toString: () => res.content,
                },
            };
        } catch {
            const decoded = '';
            return {
                file: {
                    path: input.args.path,
                    type: 'text' as const,
                    content: decoded,
                    toString: () => decoded,
                },
            };
        }
    }

    async downloadFiles(_input: DownloadFilesInput): Promise<DownloadFilesOutput> {
        // TODO(sandbox-port): no fileDownload route yet — omit url so callers
        // treat it as "nothing to download" rather than fetching a bad URL.
        return {};
    }

    async copyFiles(_input: CopyFilesInput): Promise<CopyFileOutput> {
        // TODO(sandbox-port): no fileCopy route yet. Not on the boot path.
        return {};
    }

    async createDirectory(input: CreateDirectoryInput): Promise<CreateDirectoryOutput> {
        try {
            await getSandboxServerClient().sandbox.fileMkdir.mutate({
                sandboxId: this.sandboxId,
                path: input.args.path,
            });
        } catch (err) {
            console.error('[VercelBrowserProvider] createDirectory failed', err);
        }
        return {};
    }

    async watchFiles(_input: WatchFilesInput): Promise<WatchFilesOutput> {
        return { watcher: new VercelBrowserFileWatcher() };
    }

    async createTerminal(_input: CreateTerminalInput): Promise<CreateTerminalOutput> {
        return { terminal: new VercelBrowserTerminal(this.sandboxId) };
    }

    async getTask(input: GetTaskInput): Promise<GetTaskOutput> {
        // TODO(bug-hunt): VercelBrowserTask boots the dev server via
        // `sandbox.setup` WITHOUT forwarding this provider's `port`/`devCommand`
        // options (compare `setup()` below, which does). On the task-driven boot
        // path the server falls back to package.json inference, so a branch
        // with a custom port or dev command starts on the wrong port/command.
        // Fix needs a server-contract decision (thread options through the
        // task → setup route) — deliberately not changed here.
        return { task: new VercelBrowserTask(this.sandboxId, input.args.id) };
    }

    async runCommand(input: TerminalCommandInput): Promise<TerminalCommandOutput> {
        try {
            const { output } = await getSandboxServerClient().sandbox.commandRun.mutate({
                sandboxId: this.sandboxId,
                command: input.args.command,
            });
            return { output };
        } catch (err) {
            if (isSandboxGoneError(err)) {
                console.debug(
                    '[VercelBrowserProvider] runCommand skipped — sandbox is gone (410).',
                );
                throw err;
            }
            // TODO(bug-hunt): returning `{ output: '' }` here hides transport
            // failures from callers — git manager / terminal cannot tell
            // "command printed nothing" from "sandbox unreachable". Throwing is
            // the right fix but needs a caller audit (see CODE_REVIEW_BACKLOG).
            // tRPC errors stringify poorly when logged raw — surface the
            // message so the console line isn't an empty payload.
            console.error(
                '[VercelBrowserProvider] runCommand failed:',
                err instanceof Error ? err.message : String(err),
                '— command:',
                input.args.command,
            );
            return { output: '' };
        }
    }

    async runBackgroundCommand(
        input: TerminalBackgroundCommandInput,
    ): Promise<TerminalBackgroundCommandOutput> {
        // TODO(sandbox-port): no detached-command route yet. Returning a no-op
        // command is safe — the dev server is started by the `dev` task via
        // the idempotent `setup` route, not through this path.
        return {
            command: new VercelBrowserBackgroundCommand(input.args.command, ''),
        };
    }

    async gitStatus(_input: GitStatusInput): Promise<GitStatusOutput> {
        try {
            // 2>/dev/null so a non-git project yields empty stdout (→ no changes)
            // instead of leaking "fatal: not a git repository" into the list.
            const { output } = await getSandboxServerClient().sandbox.commandRun.mutate({
                sandboxId: this.sandboxId,
                command: 'git status --porcelain 2>/dev/null',
            });
            const changedFiles = output
                .split('\n')
                .map((line) => line.slice(3).trim())
                .filter(Boolean);
            return { changedFiles };
        } catch {
            return { changedFiles: [] };
        }
    }

    async createSession(_input: CreateSessionInput): Promise<CreateSessionOutput> {
        return {};
    }

    async setup(_input: SetupInput): Promise<SetupOutput> {
        try {
            // Idempotent server-side: installs deps if missing and starts the
            // dev server only if one isn't already running.
            await getSandboxServerClient().sandbox.setup.mutate({
                sandboxId: this.sandboxId,
                port: this.port,
                devCommand: this.devCommand,
            });
        } catch (err) {
            if (isSandboxGoneError(err)) {
                console.debug('[VercelBrowserProvider] setup skipped — sandbox is gone (410).');
                throw err;
            }
            console.error('[VercelBrowserProvider] setup failed', err);
        }
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
        let output = '';
        try {
            const res = await getSandboxServerClient().sandbox.commandRun.mutate({
                sandboxId: this.sandboxId,
                command: input,
            });
            output = res.output;
        } catch (err) {
            console.error('[VercelBrowserProvider] terminal run failed', err);
        }
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
    // Dedupe concurrent open()/run() during boot into a single setup call.
    private starting: Promise<void> | null = null;

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
        // The editor calls open() first on boot — ensure the dev server is up.
        // We can't stream sandbox stdout over the proxy, so logs stay empty;
        // the preview iframe polls the domain and self-heals once it serves.
        await this.ensureDevServer();
        return this.output;
    }

    async run(): Promise<void> {
        await this.ensureDevServer();
    }

    async restart(): Promise<void> {
        // setup is idempotent server-side (won't double-spawn while one is
        // already running), so this re-asserts liveness rather than force-
        // killing. True restart needs a dedicated route — TODO(sandbox-port).
        // Replace the dedup promise atomically (no null window) so a racing
        // open()/run() awaits this call instead of spawning a second setup.
        this.starting = this.startDevServer();
        await this.starting;
    }

    async stop(): Promise<void> {
        return undefined;
    }

    private async ensureDevServer(): Promise<void> {
        // Start once; concurrent open()/run() during boot await the same call.
        this.starting ??= this.startDevServer();
        await this.starting;
    }

    private startDevServer(): Promise<void> {
        return getSandboxServerClient()
            .sandbox.setup.mutate({ sandboxId: this.sandboxId })
            .then(() => undefined)
            .catch((err) => {
                // Clear so a later reload / self-heal can retry.
                this.starting = null;
                if (isSandboxGoneError(err)) {
                    console.debug(
                        '[VercelBrowserProvider] dev server setup skipped — sandbox is gone (410).',
                    );
                    throw err;
                }
                console.error(
                    '[VercelBrowserProvider] dev server setup failed:',
                    err instanceof Error ? err.message : String(err),
                );
                throw err;
            });
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
