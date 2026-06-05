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

// Process patterns that match the dev servers we spawn — Next.js (`next dev`
// or the post-compile `next-server` worker) and the static-html `serve` CLI.
// Kept as a list rather than one piped regex because `pgrep` BRE handling of
// `|` alternation varies across procps builds; running each pattern through
// `-f` and OR-ing the exit codes is portable. The `serve` pattern is anchored
// to `node_modules/serve` to avoid matching unrelated processes like
// `observe` or a user-installed binary that happens to contain the substring.
const DEV_SERVER_PATTERNS = [
    '[n]ext-server',
    '[n]ext dev --hostname 0.0.0.0',
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

/**
 * Weblab design tokens baked into every blank Next.js project so it ships
 * on-brand BEFORE the AI touches it (tinted neutrals, impure black/white, one
 * teal whisper accent on ring/active only, flat). Maps the shadcn/ui CSS-var
 * contract via Tailwind v4 `@theme inline`, so catalog components render
 * correctly and `bg-background` / `text-foreground` / `border-border` work.
 *
 * Canonical source: component-registry/theme/tokens.css — keep the two in sync
 * (tracked in BACKLOG to codegen this from that file).
 */
const NEXTJS_GLOBALS_CSS = `@import 'tailwindcss';
@custom-variant dark (&:is(.dark *));

:root {
  --background: oklch(0.99 0.002 250);
  --foreground: oklch(0.2 0.01 250);
  --card: oklch(0.99 0.002 250);
  --card-foreground: oklch(0.2 0.01 250);
  --popover: oklch(0.99 0.002 250);
  --popover-foreground: oklch(0.2 0.01 250);
  --primary: oklch(0.22 0.012 250);
  --primary-foreground: oklch(0.98 0.002 250);
  --secondary: oklch(0.96 0.004 250);
  --secondary-foreground: oklch(0.22 0.012 250);
  --muted: oklch(0.96 0.004 250);
  --muted-foreground: oklch(0.5 0.012 250);
  --accent: oklch(0.95 0.005 250);
  --accent-foreground: oklch(0.22 0.012 250);
  --destructive: oklch(0.55 0.16 25);
  --destructive-foreground: oklch(0.98 0.002 250);
  --border: oklch(0.92 0.004 250);
  --input: oklch(0.92 0.004 250);
  --ring: oklch(0.62 0.07 195);
  --brand-accent: oklch(0.62 0.07 195);
  --chart-1: oklch(0.3 0.01 250);
  --chart-2: oklch(0.45 0.012 250);
  --chart-3: oklch(0.6 0.012 250);
  --chart-4: oklch(0.74 0.01 250);
  --chart-5: oklch(0.62 0.07 195);
  --radius: 0.625rem;
}

.dark {
  --background: oklch(0.18 0.012 250);
  --foreground: oklch(0.96 0.003 250);
  --card: oklch(0.21 0.012 250);
  --card-foreground: oklch(0.96 0.003 250);
  --popover: oklch(0.21 0.012 250);
  --popover-foreground: oklch(0.96 0.003 250);
  --primary: oklch(0.96 0.003 250);
  --primary-foreground: oklch(0.2 0.012 250);
  --secondary: oklch(0.26 0.01 250);
  --secondary-foreground: oklch(0.96 0.003 250);
  --muted: oklch(0.26 0.01 250);
  --muted-foreground: oklch(0.68 0.012 250);
  --accent: oklch(0.28 0.01 250);
  --accent-foreground: oklch(0.96 0.003 250);
  --destructive: oklch(0.62 0.17 25);
  --destructive-foreground: oklch(0.98 0.002 250);
  --border: oklch(0.3 0.01 250);
  --input: oklch(0.32 0.01 250);
  --ring: oklch(0.6 0.07 195);
  --brand-accent: oklch(0.62 0.08 195);
  --chart-1: oklch(0.85 0.01 250);
  --chart-2: oklch(0.7 0.012 250);
  --chart-3: oklch(0.56 0.012 250);
  --chart-4: oklch(0.42 0.01 250);
  --chart-5: oklch(0.62 0.08 195);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-brand-accent: var(--brand-accent);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

@layer base {
  * {
    border-color: var(--border);
  }
  body {
    background-color: var(--background);
    color: var(--foreground);
    font-family: system-ui, sans-serif;
  }
}
`;

async function scaffoldNextProject(sandbox: Sandbox) {
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
            content:
                'export default function Page() {\n  return <main className="min-h-screen" />;\n}\n',
        },
        {
            path: 'src/app/layout.tsx',
            content:
                'import \'./globals.css\';\n\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return <html lang="en"><body>{children}</body></html>;\n}\n',
        },
        {
            path: 'src/app/globals.css',
            content: NEXTJS_GLOBALS_CSS,
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
        await sandbox.runCommand(splitShellCommand(INSTALL_COMMAND));
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

        await sandbox.runCommand(splitShellCommand(INSTALL_COMMAND));
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
