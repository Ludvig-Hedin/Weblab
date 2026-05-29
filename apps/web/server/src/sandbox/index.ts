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
): Promise<{ success: boolean }> {
    const sandbox = await getSandbox(sandboxId);
    await sandbox.fs.writeFile(path, content, 'utf8');
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
    const sandbox = await getSandbox(sandboxId);
    await sandbox.fs.mkdir(path, { recursive: true });
    return { success: true };
}

export async function fileDelete(
    sandboxId: string,
    path: string,
    recursive?: boolean,
): Promise<{ success: boolean }> {
    const sandbox = await getSandbox(sandboxId);
    await sandbox.fs.rm(path, { recursive: recursive ?? false, force: true });
    return { success: true };
}

export async function commandRun(
    sandboxId: string,
    command: string,
): Promise<{ output: string; exitCode: number }> {
    const sandbox = await getSandbox(sandboxId);
    const [cmd, ...args] = command.trim().split(/\s+/);
    const result = await sandbox.runCommand(cmd ?? '', args);
    const output = await result.stdout();
    return { output, exitCode: result.exitCode };
}

/** `npm install` then spawn the dev server (detached) so the preview serves. */
export async function setup(sandboxId: string): Promise<{ success: boolean; previewUrl: string }> {
    const sandbox = await getSandbox(sandboxId);
    await sandbox.runCommand({ cmd: 'npm', args: ['install'] });
    await sandbox.runCommand({
        cmd: 'npm',
        args: ['run', 'dev', '--', '--turbopack', '--hostname', '0.0.0.0'],
        detached: true,
    });
    return { success: true, previewUrl: sandbox.domain(DEFAULT_PORT) };
}
