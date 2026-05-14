import { Buffer } from 'node:buffer';
import { Sandbox } from '@vercel/sandbox';

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
    ProviderTerminalShellSize,
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
import type { Command, CommandFinished } from '@vercel/sandbox';
import {
    Provider,
    ProviderBackgroundCommand,
    ProviderFileWatcher,
    ProviderTask,
    ProviderTerminal,
} from '../../types';

const DEFAULT_PORT = 3000;
const DEFAULT_RUNTIME = 'node24';
const DEFAULT_TIMEOUT_MS = 45 * 60 * 1000;
const DEFAULT_DEV_COMMAND = 'npm run dev -- --hostname 0.0.0.0';
const PROJECT_ROOT = '/vercel/sandbox';

export interface VercelSandboxProviderOptions {
    sandboxId?: string;
    snapshotId?: string | null;
    userId?: string;
    initClient?: boolean;
    port?: number | null;
    devCommand?: string | null;
    runtime?: string | null;
    timeoutMs?: number | null;
}

type VercelCredentials = {
    teamId: string;
    projectId: string;
    token: string;
};

function getCredentials(): VercelCredentials {
    const teamId = process.env.VERCEL_TEAM_ID;
    const projectId = process.env.VERCEL_PROJECT_ID;
    const token = process.env.VERCEL_TOKEN;

    if (!teamId || !projectId || !token) {
        throw new Error(
            'Vercel Sandbox requires VERCEL_TEAM_ID, VERCEL_PROJECT_ID, and VERCEL_TOKEN.',
        );
    }
    return { teamId, projectId, token };
}

function getTimeoutMs(input?: number | null) {
    const fromEnv = Number(process.env.VERCEL_SANDBOX_TIMEOUT_MS);
    if (input && Number.isFinite(input)) return input;
    if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
    return DEFAULT_TIMEOUT_MS;
}

function splitShellCommand(command: string) {
    return {
        cmd: 'bash',
        args: ['-lc', command],
        cwd: PROJECT_ROOT,
    };
}

function createOutput(
    sandbox: Sandbox,
    port: number,
    devCommand: string,
    snapshotId?: string,
): CreateProjectOutput {
    return {
        id: sandbox.sandboxId,
        previewUrl: sandbox.domain(port),
        provider: 'vercel_sandbox',
        port,
        devCommand,
        runtime: DEFAULT_RUNTIME,
        snapshotId: snapshotId ?? sandbox.sourceSnapshotId,
    };
}

async function resumeFromSnapshot(snapshotId: string, port: number) {
    return await Sandbox.create({
        source: { type: 'snapshot', snapshotId },
        ports: [port],
        timeout: getTimeoutMs(),
        resources: { vcpus: 2 },
        ...getCredentials(),
    });
}

async function checkpointAndResume(sandbox: Sandbox, port: number) {
    const snapshot = await sandbox.snapshot({ expiration: 0 });
    const resumedSandbox = await resumeFromSnapshot(snapshot.snapshotId, port);
    return {
        sandbox: resumedSandbox,
        snapshotId: snapshot.snapshotId,
    };
}

async function scaffoldNextProject(sandbox: Sandbox) {
    await sandbox.writeFiles([
        {
            path: 'package.json',
            content: JSON.stringify(
                {
                    scripts: {
                        dev: 'next dev',
                        build: 'next build',
                        start: 'next start',
                    },
                    dependencies: {
                        '@tailwindcss/postcss': '^4.1.6',
                        next: '^15.3.2',
                        react: '^19.0.0',
                        'react-dom': '^19.0.0',
                        tailwindcss: '^4.1.6',
                    },
                    devDependencies: {
                        typescript: '^5.8.3',
                        '@types/node': '^22.15.3',
                        '@types/react': '^19.0.12',
                        '@types/react-dom': '^19.0.4',
                    },
                },
                null,
                2,
            ),
        },
        {
            path: 'src/app/page.tsx',
            content:
                'export default function Page() {\n  return <main className="min-h-screen p-10">New Weblab project</main>;\n}\n',
        },
        {
            path: 'src/app/layout.tsx',
            content:
                'import \'./globals.css\';\n\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return <html lang="en"><body>{children}</body></html>;\n}\n',
        },
        {
            path: 'src/app/globals.css',
            content: "@import 'tailwindcss';\n",
        },
        {
            path: 'tsconfig.json',
            content: JSON.stringify(
                {
                    compilerOptions: {
                        target: 'ES2017',
                        lib: ['dom', 'dom.iterable', 'esnext'],
                        allowJs: true,
                        skipLibCheck: true,
                        strict: true,
                        noEmit: true,
                        esModuleInterop: true,
                        module: 'esnext',
                        moduleResolution: 'bundler',
                        resolveJsonModule: true,
                        isolatedModules: true,
                        jsx: 'preserve',
                        incremental: true,
                        plugins: [{ name: 'next' }],
                        paths: { '@/*': ['./src/*'] },
                    },
                    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
                    exclude: ['node_modules'],
                },
                null,
                2,
            ),
        },
        {
            path: 'next-env.d.ts',
            content:
                '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n',
        },
    ]);
}

export class VercelSandboxProvider extends Provider {
    private readonly options: VercelSandboxProviderOptions;
    private sandbox: Sandbox | null = null;

    constructor(options: VercelSandboxProviderOptions) {
        super();
        this.options = options;
    }

    async initialize(_input: InitializeInput): Promise<InitializeOutput> {
        if (typeof window !== 'undefined') {
            throw new Error('Vercel Sandbox provider is server-side only.');
        }

        if (this.options.sandboxId) {
            try {
                this.sandbox = await Sandbox.get({
                    sandboxId: this.options.sandboxId,
                    ...getCredentials(),
                });
            } catch (error) {
                if (!this.options.snapshotId) {
                    throw error;
                }
                this.sandbox = await resumeFromSnapshot(
                    this.options.snapshotId,
                    this.options.port ?? DEFAULT_PORT,
                );
            }
            return {};
        }

        if (this.options.snapshotId) {
            this.sandbox = await Sandbox.create({
                source: { type: 'snapshot', snapshotId: this.options.snapshotId },
                ports: [this.options.port ?? DEFAULT_PORT],
                timeout: getTimeoutMs(this.options.timeoutMs),
                resources: { vcpus: 2 },
                ...getCredentials(),
            });
        }
        return {};
    }

    private requireSandbox() {
        if (!this.sandbox) {
            throw new Error('Vercel Sandbox client not initialized');
        }
        return this.sandbox;
    }

    static async createProject(input: CreateProjectInput): Promise<CreateProjectOutput> {
        const port = input.port ?? DEFAULT_PORT;
        const devCommand = input.devCommand ?? DEFAULT_DEV_COMMAND;
        const sandbox = input.snapshotId
            ? await resumeFromSnapshot(input.snapshotId, port)
            : await Sandbox.create({
                  ports: [port],
                  runtime: DEFAULT_RUNTIME,
                  timeout: getTimeoutMs(),
                  resources: { vcpus: 2 },
                  ...getCredentials(),
              });

        if (!input.snapshotId) {
            await scaffoldNextProject(sandbox);
            await sandbox.runCommand(splitShellCommand('npm install'));
            const checkpoint = await checkpointAndResume(sandbox, port);
            return createOutput(checkpoint.sandbox, port, devCommand, checkpoint.snapshotId);
        }

        return createOutput(sandbox, port, devCommand, input.snapshotId);
    }

    static async createProjectFromGit(input: {
        repoUrl: string;
        branch: string;
        subpath?: string;
        privacy?: 'public' | 'unlisted' | 'private';
        port?: number;
        devCommand?: string;
    }): Promise<CreateProjectOutput> {
        const port = input.port ?? DEFAULT_PORT;
        const devCommand = input.devCommand ?? DEFAULT_DEV_COMMAND;
        const sandbox = await Sandbox.create({
            source: {
                type: 'git',
                url: input.repoUrl,
                revision: input.branch,
                depth: 1,
            },
            ports: [port],
            runtime: DEFAULT_RUNTIME,
            timeout: getTimeoutMs(),
            resources: { vcpus: 2 },
            ...getCredentials(),
        });

        if (input.subpath?.trim()) {
            await sandbox.runCommand({
                cmd: 'bash',
                args: [
                    '-lc',
                    `
set -euo pipefail
SUBPATH="\${WEBLAB_TEMPLATE_SUBPATH:-}"
case "$SUBPATH" in
  ""|/*|*..*|*//*) exit 64 ;;
esac
test -d "$SUBPATH"
tmp="$(mktemp -d)"
shopt -s dotglob nullglob
cp -a "$SUBPATH"/. "$tmp"/
find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -a "$tmp"/. .
rm -rf "$tmp"
`,
                ],
                cwd: PROJECT_ROOT,
                env: {
                    WEBLAB_TEMPLATE_SUBPATH: input.subpath,
                },
            });
        }

        await sandbox.runCommand(splitShellCommand('npm install'));
        const checkpoint = await checkpointAndResume(sandbox, port);
        return createOutput(checkpoint.sandbox, port, devCommand, checkpoint.snapshotId);
    }

    async writeFile(input: WriteFileInput): Promise<WriteFileOutput> {
        await this.requireSandbox().writeFiles([
            {
                path: input.args.path,
                content:
                    typeof input.args.content === 'string'
                        ? input.args.content
                        : Buffer.from(input.args.content),
            },
        ]);
        return { success: true };
    }

    async renameFile(input: RenameFileInput): Promise<RenameFileOutput> {
        await this.requireSandbox().fs.rename(input.args.oldPath, input.args.newPath);
        return {};
    }

    async statFile(input: StatFileInput): Promise<StatFileOutput> {
        const stats = await this.requireSandbox().fs.stat(input.args.path);
        return {
            type: stats.isDirectory() ? 'directory' : 'file',
            isSymlink: stats.isSymbolicLink(),
            size: stats.size,
            mtime: stats.mtimeMs,
            ctime: stats.ctimeMs,
            atime: stats.atimeMs,
        };
    }

    async deleteFiles(input: DeleteFilesInput): Promise<DeleteFilesOutput> {
        await this.requireSandbox().fs.rm(input.args.path, {
            recursive: input.args.recursive ?? false,
            force: true,
        });
        return {};
    }

    async listFiles(input: ListFilesInput): Promise<ListFilesOutput> {
        const files = await this.requireSandbox().fs.readdir(input.args.path, {
            withFileTypes: true,
        });
        return {
            files: files.map((file) => ({
                name: file.name,
                type: file.isDirectory() ? 'directory' : 'file',
                isSymlink: file.isSymbolicLink(),
            })),
        };
    }

    async readFile(input: ReadFileInput): Promise<ReadFileOutput> {
        const buffer = await this.requireSandbox().readFileToBuffer({ path: input.args.path });
        if (!buffer) {
            throw new Error(`File not found: ${input.args.path}`);
        }
        const content = buffer.toString('utf8');
        return {
            file: {
                path: input.args.path,
                content,
                type: 'text',
                toString: () => content,
            },
        };
    }

    async downloadFiles(input: DownloadFilesInput): Promise<DownloadFilesOutput> {
        const buffer = await this.requireSandbox().readFileToBuffer({ path: input.args.path });
        if (!buffer) return {};
        return {
            url: `data:application/octet-stream;base64,${buffer.toString('base64')}`,
        };
    }

    async copyFiles(input: CopyFilesInput): Promise<CopyFileOutput> {
        if (input.args.recursive) {
            const result = await this.requireSandbox().runCommand({
                ...splitShellCommand(
                    `
set -euo pipefail
src="\${WEBLAB_COPY_SOURCE:?}"
dst="\${WEBLAB_COPY_TARGET:?}"
if [ "\${WEBLAB_COPY_OVERWRITE:-false}" != "true" ] && [ -e "$dst" ]; then
  exit 17
fi
mkdir -p "$(dirname "$dst")"
cp -a "$src" "$dst"
`,
                ),
                env: {
                    WEBLAB_COPY_SOURCE: input.args.sourcePath,
                    WEBLAB_COPY_TARGET: input.args.targetPath,
                    WEBLAB_COPY_OVERWRITE: String(input.args.overwrite ?? true),
                },
            });
            if (result.exitCode !== 0) {
                throw new Error(await result.stderr());
            }
            return {};
        }
        if (input.args.overwrite === false) {
            const exists = await this.requireSandbox().fs.exists(input.args.targetPath);
            if (exists) {
                throw new Error(`Target file already exists: ${input.args.targetPath}`);
            }
        }
        await this.requireSandbox().fs.copyFile(input.args.sourcePath, input.args.targetPath);
        return {};
    }

    async createDirectory(input: CreateDirectoryInput): Promise<CreateDirectoryOutput> {
        await this.requireSandbox().fs.mkdir(input.args.path, { recursive: true });
        return {};
    }

    async watchFiles(_input: WatchFilesInput): Promise<WatchFilesOutput> {
        return { watcher: new VercelFileWatcher() };
    }

    async createTerminal(_input: CreateTerminalInput): Promise<CreateTerminalOutput> {
        return { terminal: new VercelTerminal(this.requireSandbox()) };
    }

    async getTask(input: GetTaskInput): Promise<GetTaskOutput> {
        return {
            task: new VercelTask(
                this.requireSandbox(),
                input.args.id,
                this.options.devCommand ?? DEFAULT_DEV_COMMAND,
            ),
        };
    }

    async runCommand(input: TerminalCommandInput): Promise<TerminalCommandOutput> {
        const result = await this.requireSandbox().runCommand(
            splitShellCommand(input.args.command),
        );
        return {
            output: await result.output('both'),
        };
    }

    async runBackgroundCommand(
        input: TerminalBackgroundCommandInput,
    ): Promise<TerminalBackgroundCommandOutput> {
        const command = await this.requireSandbox().runCommand({
            ...splitShellCommand(input.args.command),
            detached: true,
        });
        return { command: new VercelBackgroundCommand(command, input.args.command) };
    }

    async gitStatus(_input: GitStatusInput): Promise<GitStatusOutput> {
        const result = await this.requireSandbox().runCommand(
            splitShellCommand('git status --porcelain'),
        );
        const changedFiles = (await result.stdout())
            .split('\n')
            .map((line) => line.slice(3).trim())
            .filter(Boolean);
        return { changedFiles };
    }

    async setup(_input: SetupInput): Promise<SetupOutput> {
        const sandbox = this.requireSandbox();
        await sandbox.runCommand(splitShellCommand('npm install'));
        // Pre-warm the dev server so it starts compiling before the editor
        // opens the preview iframe. If the port is already bound the new
        // process exits immediately without affecting the running instance.
        await sandbox.runCommand({
            ...splitShellCommand(this.options.devCommand ?? DEFAULT_DEV_COMMAND),
            detached: true,
        });
        return {};
    }

    async createSession(_input: CreateSessionInput): Promise<CreateSessionOutput> {
        const sandbox = this.requireSandbox();
        const port = this.options.port ?? DEFAULT_PORT;
        return {
            sandboxId: sandbox.sandboxId,
            previewUrl: sandbox.domain(port),
        };
    }

    async reload(): Promise<boolean> {
        const task = new VercelTask(
            this.requireSandbox(),
            'dev',
            this.options.devCommand ?? DEFAULT_DEV_COMMAND,
        );
        await task.restart();
        return true;
    }

    async reconnect(): Promise<void> {
        if (!this.options.sandboxId) return;
        this.sandbox = await Sandbox.get({
            sandboxId: this.options.sandboxId,
            ...getCredentials(),
        });
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
        await this.requireSandbox().stop({ blocking: false });
        return {};
    }

    async listProjects(_input: ListProjectsInput): Promise<ListProjectsOutput> {
        const { json } = await Sandbox.list(getCredentials());
        return {
            projects: json.sandboxes.map((sandbox) => ({
                id: sandbox.id,
                name: sandbox.id,
                description: sandbox.status,
                createdAt: new Date(sandbox.createdAt),
                updatedAt: new Date(sandbox.updatedAt),
            })),
        };
    }

    async destroy(): Promise<void> {
        this.sandbox = null;
    }
}

class VercelFileWatcher extends ProviderFileWatcher {
    start(_input: WatchFilesInput): Promise<void> {
        return Promise.resolve();
    }

    stop(): Promise<void> {
        return Promise.resolve();
    }

    registerEventCallback(_callback: (event: WatchEvent) => Promise<void>): void {
        return undefined;
    }
}

class VercelTerminal extends ProviderTerminal {
    private command: VercelBackgroundCommand | null = null;
    private readonly terminalId = 'vercel-terminal';
    private readonly terminalName = 'terminal';

    constructor(private readonly sandbox: Sandbox) {
        super();
    }

    get id(): string {
        return this.terminalId;
    }

    get name(): string {
        return this.terminalName;
    }

    async open(_dimensions?: ProviderTerminalShellSize): Promise<string> {
        return '';
    }

    async write(input: string, _dimensions?: ProviderTerminalShellSize): Promise<void> {
        if (!input.trim()) return;
        await this.run(input);
    }

    async run(input: string, _dimensions?: ProviderTerminalShellSize): Promise<void> {
        const command = await this.sandbox.runCommand({
            ...splitShellCommand(input),
            detached: true,
        });
        this.command = new VercelBackgroundCommand(command, input);
    }

    async kill(): Promise<void> {
        await this.command?.kill();
    }

    onOutput(callback: (data: string) => void): () => void {
        return this.command?.onOutput(callback) ?? (() => undefined);
    }
}

class VercelTask extends ProviderTask {
    private activeCommand: VercelBackgroundCommand | null = null;

    constructor(
        private readonly sandbox: Sandbox,
        private readonly taskId: string,
        private readonly taskCommand: string,
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

    async open(_dimensions?: ProviderTerminalShellSize): Promise<string> {
        if (!this.activeCommand) {
            await this.run();
        }
        return this.activeCommand?.open() ?? '';
    }

    async run(): Promise<void> {
        const command = await this.sandbox.runCommand({
            ...splitShellCommand(this.taskCommand),
            detached: true,
        });
        this.activeCommand = new VercelBackgroundCommand(command, this.taskCommand);
    }

    async restart(): Promise<void> {
        await this.stop().catch(() => undefined);
        await this.run();
    }

    async stop(): Promise<void> {
        await this.activeCommand?.kill();
        this.activeCommand = null;
    }

    onOutput(callback: (data: string) => void): () => void {
        return this.activeCommand?.onOutput(callback) ?? (() => undefined);
    }
}

class VercelBackgroundCommand extends ProviderBackgroundCommand {
    private buffer = '';
    private callbacks = new Set<(data: string) => void>();
    private abortController = new AbortController();

    constructor(
        private readonly vercelCommand: Command | CommandFinished,
        private readonly originalCommand: string,
    ) {
        super();
        void this.streamLogs();
    }

    get name(): string | undefined {
        return this.originalCommand;
    }

    get command(): string {
        return this.originalCommand;
    }

    async open(): Promise<string> {
        return this.buffer;
    }

    async restart(): Promise<void> {
        return Promise.resolve();
    }

    async kill(): Promise<void> {
        this.abortController.abort();
        await this.vercelCommand.kill().catch(() => undefined);
    }

    onOutput(callback: (data: string) => void): () => void {
        this.callbacks.add(callback);
        if (this.buffer) callback(this.buffer);
        return () => {
            this.callbacks.delete(callback);
        };
    }

    private async streamLogs() {
        try {
            for await (const log of this.vercelCommand.logs({
                signal: this.abortController.signal,
            })) {
                const data = log.data;
                this.buffer += data;
                for (const callback of this.callbacks) {
                    callback(data);
                }
            }
        } catch (error) {
            if (!this.abortController.signal.aborted) {
                const message = error instanceof Error ? error.message : String(error);
                this.buffer += message;
                for (const callback of this.callbacks) {
                    callback(message);
                }
            }
        }
    }
}
