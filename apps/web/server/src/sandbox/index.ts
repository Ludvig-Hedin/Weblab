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
const COMPAT_NEXT_DEV_COMMAND = 'npm run dev -- -H 0.0.0.0';

interface SandboxSetupOptions {
    port?: number | null;
    devCommand?: string | null;
}

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

const INSTALL_COMMAND = [
    'set -e',
    'legacy_next_major="$(node -e \'try { const p=require("./package.json"); const v=(p.dependencies?.next||p.devDependencies?.next||"").replace(/^[^0-9]*/, ""); const m=parseInt(v.split(".")[0]||"",10); if ((Number.isFinite(m) && m < 12) || (p.name === "startd-theme" && m !== 12)) process.stdout.write(String(m || 0)); } catch {} \')"',
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
    // NOTE: keep this install pipeline in sync with the create-time copy in
    // packages/code-provider/src/providers/vercel-sandbox/index.ts (INSTALL_COMMAND).
    // They have already drifted once (server-only `startd-theme` special-case) —
    // reconcile intentional differences rather than letting them diverge silently.
].join('\n');

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

function isGoneSandboxError(err: unknown): boolean {
    const status =
        (err as { status?: unknown } | null)?.status ??
        (err as { statusCode?: unknown } | null)?.statusCode ??
        (err as { cause?: { status?: unknown; statusCode?: unknown } } | null)?.cause?.status ??
        (err as { cause?: { status?: unknown; statusCode?: unknown } } | null)?.cause?.statusCode;
    if (status === 410 || status === '410') return true;

    const message = err instanceof Error ? err.message : String(err);
    return /\b410\b|status code 410|gone|reclaimed|not found/i.test(message);
}

async function withSandbox<T>(
    sandboxId: string,
    operation: (sandbox: Sandbox) => Promise<T>,
): Promise<T> {
    try {
        return await operation(await getSandbox(sandboxId));
    } catch (err) {
        if (!isGoneSandboxError(err)) throw err;
        evictSandbox(sandboxId);
        return operation(await getSandbox(sandboxId));
    }
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
    const entries = await withSandbox(sandboxId, (sandbox) =>
        sandbox.fs.readdir(path, { withFileTypes: true }),
    );
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
    const content = await withSandbox(sandboxId, (sandbox) => sandbox.fs.readFile(path, 'utf8'));
    return { path, type: 'text', content };
}

export async function fileWrite(
    sandboxId: string,
    path: string,
    content: string,
    encoding: 'utf8' | 'base64' = 'utf8',
): Promise<{ success: boolean }> {
    assertSafeSandboxPath(path);
    await withSandbox(sandboxId, async (sandbox) => {
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
    });
    return { success: true };
}

export async function fileStat(
    sandboxId: string,
    path: string,
): Promise<{ type: 'file' | 'directory'; size: number }> {
    const stats = await withSandbox(sandboxId, (sandbox) => sandbox.fs.stat(path));
    return { type: stats.isDirectory() ? 'directory' : 'file', size: stats.size };
}

export async function fileMkdir(sandboxId: string, path: string): Promise<{ success: boolean }> {
    assertSafeSandboxPath(path);
    await withSandbox(sandboxId, (sandbox) => sandbox.fs.mkdir(path, { recursive: true }));
    return { success: true };
}

export async function fileDelete(
    sandboxId: string,
    path: string,
    recursive?: boolean,
): Promise<{ success: boolean }> {
    assertSafeSandboxPath(path);
    await withSandbox(sandboxId, (sandbox) =>
        sandbox.fs.rm(path, { recursive: recursive ?? false, force: true }),
    );
    return { success: true };
}

export async function commandRun(
    sandboxId: string,
    command: string,
): Promise<{ output: string; exitCode: number }> {
    const result = await withSandbox(sandboxId, (sandbox) => runShell(sandbox, command));
    // 'both' merges stdout+stderr so terminal callers see warnings/errors too.
    const output = await result.output('both');
    return { output, exitCode: result.exitCode };
}

/** True if a dev server is already up for the project. */
async function isDevServerRunning(sandbox: Sandbox): Promise<boolean> {
    // Match the actual server process — `next dev` (Next.js) or the static-HTML
    // `serve` binary (`node …/node_modules/serve/…`). The narrow `serve` match
    // avoids false-positives on unrelated args like "preserve"/"reserved". The
    // `[x]` bracket trick stops pgrep from matching its own command line.
    const result = await runShell(
        sandbox,
        'pgrep -f "[n]ext dev" || pgrep -f "[n]ode_modules/serve" || true',
    );
    const out = await result.stdout();
    return out.trim().length > 0;
}

async function hasLegacyNextDependency(sandbox: Sandbox): Promise<boolean> {
    const result = await runShell(
        sandbox,
        'node -e \'try { const p=require("./package.json"); const v=(p.dependencies?.next||p.devDependencies?.next||"").replace(/^[^0-9]*/, ""); const m=parseInt(v.split(".")[0]||"",10); process.stdout.write((Number.isFinite(m) && m < 12) || (p.name === "startd-theme" && m !== 12) ? "yes" : "no"); } catch { process.stdout.write("no"); } \'',
    );
    return (await result.stdout()).trim() === 'yes';
}

/**
 * Idempotently bring the preview online: install deps if missing, then start
 * the framework's dev server unless one is already running. The create/resume
 * path snapshots *after* `npm install`, so on the common path this skips the
 * install and only spawns the dev server — which `createBlank` never does, so
 * without this the preview domain 502s forever.
 */
function resolvePort(port?: number | null): number {
    return typeof port === 'number' && Number.isInteger(port) && port > 0 && port <= 65_535
        ? port
        : DEFAULT_PORT;
}

function inferPortFromDevScript(devScript: string): number | null {
    const explicitPort = /(?:--listen|-l)\s+(?:tcp:\/\/[^:]+:)?(\d{2,5})\b/.exec(devScript)?.[1];
    const localhostPort = /(?:localhost|0\.0\.0\.0|127\.0\.0\.1):(\d{2,5})\b/.exec(devScript)?.[1];
    const rawPort = explicitPort ?? localhostPort;
    if (!rawPort) return null;
    const port = Number.parseInt(rawPort, 10);
    return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : null;
}

function parseMajorVersion(version: string | undefined): number | null {
    const raw = version?.replace(/^[^\d]*/, '');
    if (!raw) return null;
    const major = Number.parseInt(raw.split('.')[0] ?? '', 10);
    return Number.isInteger(major) ? major : null;
}

export async function setup(
    sandboxId: string,
    options: SandboxSetupOptions = {},
    retryOnGone = true,
): Promise<{ success: boolean; previewUrl: string }> {
    const sandbox = await withSandbox(sandboxId, (sandbox) => Promise.resolve(sandbox));
    try {
        let port = resolvePort(options.port);
        console.log(`[setup] begin sandboxId=${sandboxId}`);

        // 1. Deps — skip when node_modules is already present (resumed snapshot).
        const nm = await (
            await runShell(sandbox, 'test -d node_modules && echo yes || echo no')
        ).stdout();
        const needsLegacyNextUpgrade = await hasLegacyNextDependency(sandbox);
        console.log(`[setup] node_modules present? ${nm.trim()}`);
        if (!nm.includes('yes') || needsLegacyNextUpgrade) {
            console.log('[setup] running dependency install…');
            await runShell(sandbox, INSTALL_COMMAND);
            console.log('[setup] dependency install complete');
        }

        // 2. Pick the dev command from package.json. Next.js needs the explicit
        //    host flag; anything else (e.g. static-HTML `serve`) self-binds.
        const requestedDevCommand = options.devCommand?.trim();
        let devCommand =
            requestedDevCommand && requestedDevCommand.length > 0
                ? requestedDevCommand
                : NEXT_DEV_COMMAND;
        try {
            const pkgRaw = await (await runShell(sandbox, 'cat package.json')).stdout();
            const pkg = JSON.parse(pkgRaw) as {
                scripts?: { dev?: string };
                dependencies?: { next?: string };
                devDependencies?: { next?: string };
            };
            const devScript = pkg.scripts?.dev ?? '';
            const nextMajor = parseMajorVersion(
                pkg.dependencies?.next ?? pkg.devDependencies?.next,
            );
            if (
                devScript.includes('next') &&
                nextMajor != null &&
                nextMajor < 15 &&
                devCommand.includes('--turbopack')
            ) {
                devCommand = COMPAT_NEXT_DEV_COMMAND;
            }
            if (!options.devCommand && devScript && !devScript.includes('next')) {
                devCommand = 'npm run dev';
            }
            if (!options.port && devScript) {
                port = inferPortFromDevScript(devScript) ?? port;
            }
        } catch (err) {
            // Unreadable/missing package.json → fall back to the Next.js command.
            // Log so a non-Next project that got the wrong dev command is visible.
            console.warn(
                '[sandbox.setup] could not read package.json; defaulting to Next dev',
                err,
            );
        }

        // 3. Spawn detached only when nothing is serving yet — duplicate dev
        //    servers fight over the same build output and 404 preview assets.
        //    Redirect output to a log file so a crash-on-boot is diagnosable: the
        //    SDK discards a detached command's stdout/stderr, so without this a
        //    failed `next dev` left the preview 502ing forever with no signal.
        const DEV_LOG = '/tmp/weblab-dev.log';
        console.log(`[setup] devCommand=${devCommand}`);
        const alreadyRunning = await isDevServerRunning(sandbox);
        console.log(`[setup] devServerRunning(before spawn)=${alreadyRunning}`);
        if (!alreadyRunning) {
            await sandbox.runCommand({
                cmd: 'bash',
                args: ['-lc', `${devCommand} > ${DEV_LOG} 2>&1`],
                cwd: PROJECT_ROOT,
                detached: true,
            });
            console.log(`[setup] spawned dev server (detached) → ${DEV_LOG}`);
        }

        // 4. Wait until the dev server actually BINDS the port (HTTP responds) —
        //    not just until the process appears. The preview domain returns
        //    `502 SANDBOX_NOT_LISTENING` until something listens on the project port,
        //    and a first-compile cold start can take 30-90s. Probe via node (always
        //    present in a Next sandbox; curl may not be).
        const probeCmd =
            `node -e 'const http=require("http");` +
            `http.get("http://127.0.0.1:${port}",r=>{console.log(r.statusCode);process.exit(0)})` +
            `.on("error",()=>{console.log("000");process.exit(0)})'`;
        const deadline = Date.now() + 90_000;
        let listening = false;
        let probes = 0;
        while (Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            const code = (await (await runShell(sandbox, probeCmd)).stdout()).trim();
            probes += 1;
            if (probes % 3 === 0) {
                console.log(`[setup] port ${port} probe #${probes} → ${code}`);
            }
            // Any HTTP status means the port is bound; "000" = connection refused
            // (still compiling, or the process crashed).
            if (code && code !== '000' && /^\d{3}$/.test(code)) {
                listening = true;
                break;
            }
        }

        // Always capture the dev server's own output for diagnosis (missing dep,
        // port already in use, build/runtime error) instead of an opaque 502.
        const logTail = await (
            await runShell(sandbox, `tail -n 40 ${DEV_LOG} 2>/dev/null || echo "(no dev log)"`)
        ).stdout();
        console.log(`[setup] listening=${listening}; dev log tail:\n${logTail}`);

        if (!listening) {
            // Thrown → the browser provider logs it + re-arms a retry.
            throw new Error(
                `Dev server failed to bind port ${port} within 90s. ` +
                    `Command: \`${devCommand}\`. Recent output:\n${logTail}`,
            );
        }

        return { success: true, previewUrl: sandbox.domain(port) };
    } catch (err) {
        if (!retryOnGone || !isGoneSandboxError(err)) throw err;
        evictSandbox(sandboxId);
        return setup(sandboxId, options, false);
    }
}
