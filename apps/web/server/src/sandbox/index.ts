// Server-side sandbox operations for the editor.
//
// Talks to the Vercel Sandbox SDK directly (NOT @weblab/code-provider — that
// package's barrel transitively pulls client-only editor-store modules into
// this server's tsc program). The browser reaches these via the authed tRPC
// sandbox router (router/routes/sandbox.ts), never the SDK directly.
//
// Runtime env required (present on Railway prod; export locally for dev):
// VERCEL_TEAM_ID, VERCEL_PROJECT_ID, VERCEL_TOKEN.

import { Sandbox } from '@vercel/sandbox';

const DEFAULT_PORT = 3000;

// All project source lives here inside the Vercel sandbox (mirrors
// `PROJECT_ROOT` in @weblab/code-provider's vercel-sandbox provider). Every
// command MUST run with this cwd or `npm install` / `npm run dev` / reads of
// `package.json` execute in the wrong directory and silently fail.
const PROJECT_ROOT = '/vercel/sandbox';

// Next.js needs an explicit external bind or the preview domain 502s; the
// static-HTML scaffold binds 0.0.0.0 in its own `serve` script.
const NEXT_DEV_COMMAND = 'npm run dev -- --turbopack --hostname 0.0.0.0';

/**
 * Run a shell command line inside the project root and resolve to the finished
 * command (combined stdout+stderr available via `.output('both')`). Uses
 * `bash -lc` so pipes, redirects, quoting and `&&`/`||` behave as callers
 * expect — the editor terminal and helpers pass full shell command lines.
 */
async function runShell(sandbox: Sandbox, command: string) {
    return sandbox.runCommand({ cmd: 'bash', args: ['-lc', command], cwd: PROJECT_ROOT });
}

/**
 * Defense-in-depth for mutating file ops: callers pass project-relative paths,
 * so reject absolute paths and `..` traversal. Without this, an imported folder
 * (or any compromised caller) could write/delete outside the project root
 * (e.g. `../../etc/...`).
 */
function assertSafeSandboxPath(path: string): void {
    if (path.startsWith('/') || path.split('/').some((seg) => seg === '..')) {
        throw new Error(`Unsafe sandbox path rejected: ${path}`);
    }
}

/** True when a write failed only because its parent directory doesn't exist. */
function isMissingDirError(err: unknown): boolean {
    const code = (err as { code?: string } | null)?.code;
    if (code === 'ENOENT') return true;
    const msg = err instanceof Error ? err.message : String(err);
    return /ENOENT|no such file/i.test(msg);
}

function credentials(): { teamId: string; projectId: string; token: string } {
    const teamId = process.env.VERCEL_TEAM_ID;
    const projectId = process.env.VERCEL_PROJECT_ID;
    const token = process.env.VERCEL_TOKEN;
    if (!teamId || !projectId || !token) {
        throw new Error(
            'Sandbox server requires VERCEL_TEAM_ID, VERCEL_PROJECT_ID, and VERCEL_TOKEN.',
        );
    }
    return { teamId, projectId, token };
}

const cache = new Map<string, Promise<Sandbox>>();

async function getSandbox(sandboxId: string): Promise<Sandbox> {
    let existing = cache.get(sandboxId);
    if (!existing) {
        existing = Sandbox.get({ sandboxId, ...credentials() });
        cache.set(sandboxId, existing);
        existing.catch(() => cache.delete(sandboxId));
    }
    return existing;
}

/** Evict a cached handle (e.g. after a reclaimed/gone sandbox) so the next op reconnects. */
export function evictSandbox(sandboxId: string): void {
    cache.delete(sandboxId);
}

export interface SandboxFileEntry {
    name: string;
    type: 'file' | 'directory';
    isSymlink: boolean;
}

export async function fileList(
    sandboxId: string,
    path: string,
): Promise<{ files: SandboxFileEntry[] }> {
    const sandbox = await getSandbox(sandboxId);
    const entries = await sandbox.fs.readdir(path, { withFileTypes: true });
    return {
        files: entries.map((d) => ({
            name: d.name,
            type: d.isDirectory() ? 'directory' : 'file',
            isSymlink: d.isSymbolicLink(),
        })),
    };
}

export async function fileRead(
    sandboxId: string,
    path: string,
): Promise<{ path: string; type: 'text'; content: string }> {
    const sandbox = await getSandbox(sandboxId);
    const content = await sandbox.fs.readFile(path, 'utf8');
    return { path, type: 'text', content };
}

export async function fileWrite(
    sandboxId: string,
    path: string,
    content: string,
    encoding: 'utf8' | 'base64' = 'utf8',
): Promise<{ success: boolean }> {
    assertSafeSandboxPath(path);
    const sandbox = await getSandbox(sandboxId);
    // base64 carries binary assets (images, fonts) for folder imports; decode
    // to raw bytes. Text uses utf8. Buffer write takes no encoding arg.
    const write = () =>
        encoding === 'base64'
            ? sandbox.fs.writeFile(path, Buffer.from(content, 'base64'))
            : sandbox.fs.writeFile(path, content, 'utf8');
    try {
        await write();
    } catch (err) {
        // Parent dir may not exist yet (nested import paths) — create it once
        // and retry, but ONLY for a missing-dir error so a real failure
        // (permission, disk-full) isn't masked. Steady-state editor writes
        // (dir already present) keep the fast single-call path.
        const slash = path.lastIndexOf('/');
        if (slash > 0 && isMissingDirError(err)) {
            await sandbox.fs.mkdir(path.slice(0, slash), { recursive: true });
            await write();
        } else {
            throw err;
        }
    }
    return { success: true };
}

export async function fileStat(
    sandboxId: string,
    path: string,
): Promise<{ type: 'file' | 'directory'; size: number }> {
    const sandbox = await getSandbox(sandboxId);
    const stats = await sandbox.fs.stat(path);
    return { type: stats.isDirectory() ? 'directory' : 'file', size: stats.size };
}

export async function fileMkdir(sandboxId: string, path: string): Promise<{ success: boolean }> {
    assertSafeSandboxPath(path);
    const sandbox = await getSandbox(sandboxId);
    await sandbox.fs.mkdir(path, { recursive: true });
    return { success: true };
}

export async function fileDelete(
    sandboxId: string,
    path: string,
    recursive?: boolean,
): Promise<{ success: boolean }> {
    assertSafeSandboxPath(path);
    const sandbox = await getSandbox(sandboxId);
    await sandbox.fs.rm(path, { recursive: recursive ?? false, force: true });
    return { success: true };
}

export async function commandRun(
    sandboxId: string,
    command: string,
): Promise<{ output: string; exitCode: number }> {
    const sandbox = await getSandbox(sandboxId);
    const result = await runShell(sandbox, command);
    // 'both' merges stdout+stderr so terminal callers see warnings/errors too.
    const output = await result.output('both');
    return { output, exitCode: result.exitCode };
}

/** True if a dev server is already up for the project. */
async function isDevServerRunning(sandbox: Sandbox): Promise<boolean> {
    // Match the actual server process — `next dev` (Next.js) or `serve`
    // (static-HTML). `[x]` bracket trick stops pgrep from matching its own
    // command line (which contains the literal pattern).
    const result = await runShell(sandbox, 'pgrep -f "[n]ext dev" || pgrep -f "[s]erve" || true');
    const out = await result.stdout();
    return out.trim().length > 0;
}

/**
 * Idempotently bring the preview online: install deps if missing, then start
 * the framework's dev server unless one is already running. The create/resume
 * path snapshots *after* `npm install`, so on the common path this skips the
 * install and only spawns the dev server — which `createBlank` never does, so
 * without this the preview domain 502s forever.
 */
export async function setup(sandboxId: string): Promise<{ success: boolean; previewUrl: string }> {
    const sandbox = await getSandbox(sandboxId);

    // 1. Deps — skip when node_modules is already present (resumed snapshot).
    const nm = await (
        await runShell(sandbox, 'test -d node_modules && echo yes || echo no')
    ).stdout();
    if (!nm.includes('yes')) {
        await runShell(sandbox, 'npm install');
    }

    // 2. Pick the dev command from package.json. Next.js needs the explicit
    //    host flag; anything else (e.g. static-HTML `serve`) self-binds.
    let devCommand = NEXT_DEV_COMMAND;
    try {
        const pkgRaw = await (await runShell(sandbox, 'cat package.json')).stdout();
        const pkg = JSON.parse(pkgRaw) as { scripts?: { dev?: string } };
        const devScript = pkg.scripts?.dev ?? '';
        if (devScript && !devScript.includes('next')) {
            devCommand = 'npm run dev';
        }
    } catch (err) {
        // Unreadable/missing package.json → fall back to the Next.js command.
        // Log so a non-Next project that got the wrong dev command is visible.
        console.warn('[sandbox.setup] could not read package.json; defaulting to Next dev', err);
    }

    // 3. Spawn detached only when nothing is serving yet — duplicate dev
    //    servers fight over the same build output and 404 preview assets.
    if (!(await isDevServerRunning(sandbox))) {
        await sandbox.runCommand({
            cmd: 'bash',
            args: ['-lc', devCommand],
            cwd: PROJECT_ROOT,
            detached: true,
        });
        // A detached spawn resolves before its child process is visible in the
        // process table. Poll until the dev process appears (or give up after
        // ~15s) so a rapid second setup() detects it and skips, instead of
        // launching a duplicate server.
        const deadline = Date.now() + 15_000;
        while (Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            if (await isDevServerRunning(sandbox)) break;
        }
    }

    return { success: true, previewUrl: sandbox.domain(DEFAULT_PORT) };
}
