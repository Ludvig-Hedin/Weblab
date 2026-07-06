import { Buffer } from 'node:buffer';
import { Sandbox } from '@vercel/sandbox';

import { EMPTY_INTERACTIONS_DOCUMENT } from '@weblab/models';

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
    ScaffoldFramework,
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
import { WEBLAB_NEXTJS_GLOBALS_CSS } from '../../scaffold-templates';
import {
    Provider,
    ProviderBackgroundCommand,
    ProviderFileWatcher,
    ProviderTask,
    ProviderTerminal,
} from '../../types';
import {
    instrumentScaffoldJsx,
    NEXT_SCAFFOLD_LAYOUT_SRC,
    NEXT_SCAFFOLD_PAGE_SRC,
} from './scaffold-instrument';

const DEFAULT_PORT = 3000;
const DEFAULT_RUNTIME = 'node24';
const DEFAULT_TIMEOUT_MS = 45 * 60 * 1000;
// Hard ceiling on any single Vercel SDK call. Vercel API rarely
// stalls but when it does (network blip, region failover), we want
// to throw fast and let our retry layer try again instead of hanging
// for minutes. 45s covers a worst-case snapshot resume; anything
// past that is wedged and the user is better served by an error.
const SDK_CALL_TIMEOUT_MS = 45_000;
// `--turbopack` runs Next 15's Turbopack bundler instead of webpack.
// Stable in Next 15.x. Cold-compiles the first page request 5-10x
// faster, which dominates the perceived "blank project loading
// forever" time. The `--` separates npm args from script args so
// both `--turbopack` and `--hostname` reach `next dev`.
const DEFAULT_DEV_COMMAND = 'npm run dev -- --turbopack --hostname 0.0.0.0';
const GIT_NEXT_DEV_COMMAND = 'npm run dev -- -H 0.0.0.0';
// Static HTML dev server. `serve -s` rewrites all routes to index.html
// so client-side routing works; `-l <port>` binds. Listen on the host
// interface so Vercel Sandbox's port forwarder can reach it.
const STATIC_HTML_DEV_COMMAND = 'npm run dev';
const STATIC_HTML_PORT = 8080;

/**
 * Framework scaffolders supported on Vercel Sandbox today.
 *
 * `nextjs` and `static-html` are wired end-to-end (scaffold +
 * dev command + port). Other frameworks (Vite/Remix/Astro/TanStack)
 * are gated upstream by `@weblab/framework` registry — adding them
 * here means writing a matching scaffolder and adding the case to
 * `scaffoldByFramework` below.
 *
 * Re-exports `ScaffoldFramework` from `../../types` so callers can keep
 * importing the type from the provider barrel; the canonical definition
 * lives in `types.ts` because `CreateProjectInput.framework` consumes it.
 */
export type VercelScaffoldFramework = ScaffoldFramework;

interface FrameworkRuntime {
    port: number;
    devCommand: string;
}

const FRAMEWORK_RUNTIME: Record<VercelScaffoldFramework, FrameworkRuntime> = {
    nextjs: { port: DEFAULT_PORT, devCommand: DEFAULT_DEV_COMMAND },
    'static-html': { port: STATIC_HTML_PORT, devCommand: STATIC_HTML_DEV_COMMAND },
};

// vCPU count for sandboxes. Reads WEBLAB_VERCEL_VCPUS at module
// load so the value is stable per server process — Vercel SDK
// rejects mid-flight changes anyway. Clamps to Vercel's 1-8 range
// to avoid an unhelpful API error on a typo.
function getVcpuCount(): number {
    const raw = Number(process.env.WEBLAB_VERCEL_VCPUS);
    if (Number.isFinite(raw) && raw >= 1 && raw <= 8) return Math.floor(raw);
    return 4;
}
const VCPUS = getVcpuCount();

// Race a promise against a timeout so we never hang forever on a
// stalled Vercel SDK call. Caller layers (SessionManager.start,
// sandbox.fork retry loop) already retry on rejection, so the
// timeout failure becomes a fast retry instead of a wedged UI.
// TODO(bug-hunt): losing the race only rejects locally — it does NOT abort the
// underlying SDK call. A slow-but-successful `Sandbox.create` leaves an
// orphaned paid VM running until its own `timeout` elapses. Thread an
// AbortSignal into the SDK calls so a timeout actually cancels the request.
async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            p,
            new Promise<T>((_, reject) => {
                timer = setTimeout(
                    () => reject(new Error(`[VercelSandbox] ${label} timed out after ${ms}ms`)),
                    ms,
                );
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}
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
    // Guard `> 0`: a negative `input` is truthy + finite and would otherwise
    // be returned verbatim as the sandbox lifetime.
    if (typeof input === 'number' && Number.isFinite(input) && input > 0) return input;
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

const INSTALL_COMMAND = [
    'set -e',
    'legacy_next_major="$(node -e \'try { const p=require("./package.json"); const v=(p.dependencies?.next||p.devDependencies?.next||"").replace(/^[^0-9]*/, ""); const m=parseInt(v.split(".")[0]||"",10); if (Number.isFinite(m) && m < 12) process.stdout.write(String(m)); } catch {} \')"',
    'if [ -n "$legacy_next_major" ]; then',
    '  npm pkg set dependencies.next="^12.3.4" dependencies.react="^17.0.2" dependencies.react-dom="^17.0.2" scripts.dev="next dev"',
    '  rm -f package-lock.json yarn.lock pnpm-lock.yaml bun.lock bun.lockb',
    '  npm install --legacy-peer-deps --ignore-scripts',
    'elif [ -f pnpm-lock.yaml ]; then',
    '  corepack enable >/dev/null 2>&1 || true',
    '  corepack prepare pnpm@latest --activate >/dev/null 2>&1 || true',
    '  pnpm install --ignore-scripts',
    'elif [ -f yarn.lock ]; then',
    '  corepack enable >/dev/null 2>&1 || true',
    '  corepack prepare yarn@1.22.22 --activate >/dev/null 2>&1 || true',
    '  yarn install --frozen-lockfile --ignore-scripts',
    'else',
    '  npm install --legacy-peer-deps --ignore-scripts',
    'fi',
    // Post-install codegen that `--ignore-scripts` deliberately suppressed.
    // Best-effort + non-fatal (`|| true`): auth-backed imports commonly rely on
    // a `prisma generate` postinstall to emit `@prisma/client`; without it the
    // app boots and 502s. Guarded on the local binary so non-Prisma repos are
    // untouched. (Other postinstall codegen — patch-package, native builds —
    // stays intentionally skipped; extend here with the same guarded pattern.)
    'if [ -x node_modules/.bin/prisma ]; then node_modules/.bin/prisma generate || true; fi',
    // NOTE: keep this install pipeline in sync with the setup-time copy in
    // apps/web/server/src/sandbox/index.ts (INSTALL_COMMAND). They have already
    // drifted once (server-only `startd-theme` special-case) — reconcile
    // intentional differences rather than letting them diverge silently.
].join('\n');

// Run the dependency install and fail loudly on a non-zero exit. The SDK's
// `runCommand` resolves with the finished command instead of throwing, so an
// unchecked install failure would get snapshotted as the project's permanent
// broken state (preview 502s forever with no signal).
async function runInstallOrThrow(sandbox: Sandbox): Promise<void> {
    const result = await sandbox.runCommand(splitShellCommand(INSTALL_COMMAND));
    if (result.exitCode !== 0) {
        const output = await result.output('both');
        throw new Error(
            `[VercelSandbox] dependency install failed (exit code ${result.exitCode}). Recent output:\n${output.slice(-2000)}`,
        );
    }
}

// Process patterns that match the dev servers we spawn — Next.js (`next dev`
// or the post-compile `next-server` worker) and the static-html `serve` CLI.
// Kept as a list rather than one piped regex because `pgrep` BRE handling of
// `|` alternation varies across procps builds; running each pattern through
// `-f` and OR-ing the exit codes is portable. The `serve` pattern is anchored
// to `node_modules/serve` to avoid matching unrelated processes like
// `observe` or a user-installed binary that happens to contain the substring.
// The Next pattern matches the bare `next dev` prefix: the actual command
// lines vary (`next dev --turbopack --hostname 0.0.0.0` via
// DEFAULT_DEV_COMMAND, `next dev -H 0.0.0.0` via GIT_NEXT_DEV_COMMAND), so
// anchoring on a specific flag order misses running servers and spawns
// duplicates.
const DEV_SERVER_PATTERNS = [
    '[n]ext-server',
    '[n]ext dev',
    'node .*/node_modules/serve/',
];

async function isDevServerRunning(sandbox: Sandbox): Promise<boolean> {
    // Run all checks in parallel; any match means a dev server is up.
    const results = await Promise.all(
        DEV_SERVER_PATTERNS.map((pattern) =>
            sandbox.runCommand(splitShellCommand(`pgrep -f "${pattern}" >/dev/null`)),
        ),
    );
    return results.some((r) => r.exitCode === 0);
}

async function stopDevServers(sandbox: Sandbox): Promise<void> {
    // `|| true` so a no-match pkill (exit 1) doesn't trip the outer
    // shell strict mode that `splitShellCommand` enables via `bash -lc`.
    await Promise.all(
        DEV_SERVER_PATTERNS.map((pattern) =>
            sandbox.runCommand(splitShellCommand(`pkill -f "${pattern}" || true`)),
        ),
    );
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
    return await withTimeout(
        Sandbox.create({
            source: { type: 'snapshot', snapshotId },
            ports: [port],
            timeout: getTimeoutMs(),
            resources: { vcpus: VCPUS },
            ...getCredentials(),
        }),
        SDK_CALL_TIMEOUT_MS,
        'resumeFromSnapshot',
    );
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
    // Pre-stamp `data-oid` onto the scaffold JSX so the first render the dev
    // server serves is already source-mapped and editable. Scaffold files are
    // written straight to the sandbox, bypassing CodeFileSystem (the only other
    // oid-injection path) — without this, deleting a freshly-scaffolded element
    // fails with "Remove action not found". See scaffold-instrument.ts.
    const [pageContent, layoutContent] = await Promise.all([
        instrumentScaffoldJsx(NEXT_SCAFFOLD_PAGE_SRC),
        instrumentScaffoldJsx(NEXT_SCAFFOLD_LAYOUT_SRC),
    ]);
    await sandbox.writeFiles([
        {
            path: 'package.json',
            content: JSON.stringify(
                {
                    scripts: {
                        dev: 'next dev --turbopack',
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
            content: pageContent,
        },
        {
            path: 'src/app/layout.tsx',
            content: layoutContent,
        },
        {
            path: 'src/app/globals.css',
            content: WEBLAB_NEXTJS_GLOBALS_CSS,
        },
        {
            path: 'public/_weblab/interactions.json',
            content: JSON.stringify(EMPTY_INTERACTIONS_DOCUMENT, null, 2),
        },
        {
            path: 'public/_weblab/interactions-initial.css',
            content: '',
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

async function scaffoldStaticHtmlProject(sandbox: Sandbox) {
    await sandbox.writeFiles([
        {
            path: 'package.json',
            content: JSON.stringify(
                {
                    name: 'weblab-static-html',
                    private: true,
                    scripts: {
                        // `-s` makes serve treat the directory as a SPA and
                        // rewrite unknown routes to index.html. `--no-clipboard`
                        // skips serve's clipboard write that can fail in
                        // headless sandboxes. `-l tcp://0.0.0.0:<port>` binds
                        // to the host interface so the Vercel port forwarder
                        // can reach it.
                        dev: `serve -s --no-clipboard -l tcp://0.0.0.0:${STATIC_HTML_PORT}`,
                        start: `serve -s --no-clipboard -l tcp://0.0.0.0:${STATIC_HTML_PORT}`,
                    },
                    dependencies: {
                        serve: '^14.2.4',
                    },
                },
                null,
                2,
            ),
        },
        {
            path: 'index.html',
            content:
                '<!doctype html>\n' +
                '<html lang="en">\n' +
                '  <head>\n' +
                '    <meta charset="utf-8" />\n' +
                '    <meta name="viewport" content="width=device-width, initial-scale=1" />\n' +
                '    <title>New Weblab project</title>\n' +
                '    <link rel="stylesheet" href="./styles.css" />\n' +
                '  </head>\n' +
                '  <body>\n' +
                '    <main></main>\n' +
                '  </body>\n' +
                '</html>\n',
        },
        {
            path: 'styles.css',
            content:
                ':root { color-scheme: light dark; font-family: system-ui, sans-serif; }\n' +
                'body { margin: 0; min-height: 100vh; }\n',
        },
        {
            path: 'public/_weblab/interactions.json',
            content: JSON.stringify(EMPTY_INTERACTIONS_DOCUMENT, null, 2),
        },
        {
            path: 'public/_weblab/interactions-initial.css',
            content: '',
        },
    ]);
}

async function scaffoldByFramework(sandbox: Sandbox, framework: VercelScaffoldFramework) {
    if (framework === 'nextjs') {
        await scaffoldNextProject(sandbox);
        return;
    }
    if (framework === 'static-html') {
        await scaffoldStaticHtmlProject(sandbox);
        return;
    }
    // Exhaustiveness guard. If a new framework is added to the union but
    // not handled, fail loudly instead of silently shipping an empty VM.
    const exhaustive: never = framework;
    throw new Error(`Unhandled Vercel scaffold framework: ${String(exhaustive)}`);
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
                this.sandbox = await withTimeout(
                    Sandbox.get({
                        sandboxId: this.options.sandboxId,
                        ...getCredentials(),
                    }),
                    SDK_CALL_TIMEOUT_MS,
                    'Sandbox.get',
                );
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
            this.sandbox = await withTimeout(
                Sandbox.create({
                    source: { type: 'snapshot', snapshotId: this.options.snapshotId },
                    ports: [this.options.port ?? DEFAULT_PORT],
                    timeout: getTimeoutMs(this.options.timeoutMs),
                    resources: { vcpus: VCPUS },
                    ...getCredentials(),
                }),
                SDK_CALL_TIMEOUT_MS,
                'Sandbox.create(initialize)',
            );
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
        // Default to Next.js for back-compat — earlier call sites that
        // never passed `framework` were always provisioning Next.
        const framework: VercelScaffoldFramework = input.framework ?? 'nextjs';
        const runtime = FRAMEWORK_RUNTIME[framework];
        const port = input.port ?? runtime.port;
        const devCommand = input.devCommand ?? runtime.devCommand;

        // Fast path: resume from a pre-built snapshot (e.g.
        // VERCEL_BLANK_SNAPSHOT_ID). Snapshots can expire or be
        // deleted out-of-band, which would otherwise hard-fail every
        // new project. Catch the resume error and fall through to the
        // scaffold path so the user still gets a working sandbox —
        // slower, but functional. Snapshots are framework-specific —
        // only honor for the framework they were baked for.
        if (input.snapshotId && framework === 'nextjs') {
            try {
                const sandbox = await resumeFromSnapshot(input.snapshotId, port);
                return createOutput(sandbox, port, devCommand, input.snapshotId);
            } catch (err) {
                console.warn(
                    '[VercelSandbox] resumeFromSnapshot failed; falling back to scaffold + install. The snapshot may be expired or invalid. Re-bake via scripts/create-vercel-template.mjs and update VERCEL_BLANK_SNAPSHOT_ID.',
                    err instanceof Error ? err.message : err,
                );
            }
        }

        // Slow path: fresh VM + scaffold + npm install + snapshot.
        const sandbox = await withTimeout(
            Sandbox.create({
                ports: [port],
                runtime: DEFAULT_RUNTIME,
                timeout: getTimeoutMs(),
                resources: { vcpus: VCPUS },
                ...getCredentials(),
            }),
            SDK_CALL_TIMEOUT_MS,
            'Sandbox.create(scaffold)',
        );
        await scaffoldByFramework(sandbox, framework);
        await runInstallOrThrow(sandbox);
        const checkpoint = await checkpointAndResume(sandbox, port);
        return createOutput(checkpoint.sandbox, port, devCommand, checkpoint.snapshotId);
    }

    static async createProjectFromGit(input: {
        repoUrl: string;
        branch: string;
        subpath?: string;
        privacy?: 'public' | 'unlisted' | 'private';
        port?: number;
        devCommand?: string;
        framework?: VercelScaffoldFramework;
    }): Promise<CreateProjectOutput> {
        const runtime = FRAMEWORK_RUNTIME[input.framework ?? 'nextjs'];
        const port = input.port ?? runtime.port;
        const devCommand =
            input.devCommand ??
            (input.framework === 'static-html' ? runtime.devCommand : GIT_NEXT_DEV_COMMAND);
        // Git clone needs a longer ceiling than the snapshot path —
        // Vercel sandbox clones can take up to 5 minutes for large
        // repos. Use the per-sandbox timeout (default 45min) rather
        // than the short SDK-call timeout.
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
            resources: { vcpus: VCPUS },
            ...getCredentials(),
        });

        if (input.subpath?.trim()) {
            const extractResult = await sandbox.runCommand({
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
            // `runCommand` resolves (never throws) on a non-zero exit — an
            // unchecked failure here would silently import the WHOLE repo
            // instead of the requested subdirectory.
            if (extractResult.exitCode === 64) {
                // Deliberate `exit 64` from the script's input validation.
                throw new Error(
                    `[VercelSandbox] invalid template subpath ${JSON.stringify(input.subpath)}: ` +
                        'must be a relative path inside the repo (no leading "/", "..", or "//").',
                );
            }
            if (extractResult.exitCode !== 0) {
                const output = await extractResult.output('both');
                throw new Error(
                    `[VercelSandbox] template subpath extraction failed for ${JSON.stringify(input.subpath)} ` +
                        `(exit code ${extractResult.exitCode}). Recent output:\n${output.slice(-2000)}`,
                );
            }
        }

        await runInstallOrThrow(sandbox);
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
        await sandbox.runCommand(splitShellCommand(INSTALL_COMMAND));
        // Pre-warm the dev server so it starts compiling before the editor
        // opens the preview iframe. Do not spawn duplicate Next dev servers:
        // they can fight over the same .next output and leave preview assets 404ing.
        if (!(await isDevServerRunning(sandbox))) {
            await sandbox.runCommand({
                ...splitShellCommand(this.options.devCommand ?? DEFAULT_DEV_COMMAND),
                detached: true,
            });
        }
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
        this.sandbox = await withTimeout(
            Sandbox.get({
                sandboxId: this.options.sandboxId,
                ...getCredentials(),
            }),
            SDK_CALL_TIMEOUT_MS,
            'Sandbox.get(reconnect)',
        );
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

// TODO(sandbox-watch): All three methods are intentional no-ops. Vercel Sandbox
// has no server-push filesystem mechanism, so there is no event source to subscribe
// to here. Sandbox → local propagation is dead: if a server-side process inside the
// sandbox VM writes to the filesystem, those changes never reach the editor.
// The working path is the reverse direction only — AI writes → ZenFS (in-browser
// IndexedDB) → fs.watchFile() native event → editor buffer re-render.
// To implement real watching we'd need either polling the sandbox for file changes
// via tRPC, or a WebSocket event stream from the sandbox server pushing change events.
class VercelFileWatcher extends ProviderFileWatcher {
    start(_input: WatchFilesInput): Promise<void> {
        // TODO(sandbox-watch): no-op — nothing to start; no sandbox-side push source exists.
        return Promise.resolve();
    }

    stop(): Promise<void> {
        // TODO(sandbox-watch): no-op — start() never registers a watcher, so nothing to tear down.
        return Promise.resolve();
    }

    registerEventCallback(_callback: (event: WatchEvent) => Promise<void>): void {
        // TODO(sandbox-watch): no-op — callback is never invoked because no sandbox→local events fire.
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

    // TODO(bug-hunt): each run() replaces `this.command` without killing the
    // previous detached process — repeated runs leak background processes in
    // the sandbox. Kill (or await) the prior command before replacing it.
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

    // TODO(bug-hunt): subscribes to the CURRENT command only — a subsequent
    // run() swaps `this.command` and existing subscribers silently stop
    // receiving output. Keep terminal-level subscribers and re-attach them to
    // each new command.
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
        if (!this.activeCommand && !(await isDevServerRunning(this.sandbox))) {
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
        await stopDevServers(this.sandbox);
        await this.run();
    }

    async stop(): Promise<void> {
        await this.activeCommand?.kill();
        this.activeCommand = null;
    }

    // TODO(bug-hunt): binds to the CURRENT command only — after restart()
    // swaps `this.activeCommand`, earlier subscribers are silently dropped.
    // Keep task-level subscribers and re-attach them on each run().
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
