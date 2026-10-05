'use node';

import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { Sandbox } from '@vercel/sandbox';
import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { internalAction } from './_generated/server';
import { cloudPath, cloudScope, MAX_CLOUD_ASSET_BYTES } from './lib/cloudEditor';
import { CLOUD_PREVIEW_GATEWAY_SCRIPT } from './lib/cloudPreviewGateway';

type Scope = { projectId: Id<'projects'>; branchId: Id<'branches'> };
type RuntimeFile = Doc<'cloudEditorFiles'> & { url: string | null };
type RuntimeInput = { state: Doc<'cloudEditorStates'>; files: RuntimeFile[] };
const reserveRef = makeFunctionReference<
    'mutation',
    Scope & { token: string; requestGeneration: number },
    boolean
>('cloudEditor:_reserveRuntime');
const releaseRef = makeFunctionReference<'mutation', { token?: string; sandboxId?: string }, null>(
    'cloudEditor:_releaseRuntimeSlot',
);
const authorizedRef = makeFunctionReference<
    'query',
    Scope & { requestGeneration: number; token?: string },
    boolean
>('cloudEditor:_previewStartAuthorized');
const inputRef = makeFunctionReference<'query', Scope, RuntimeInput | null>(
    'cloudEditor:_runtimeInput',
);
const leaseRef = makeFunctionReference<
    'mutation',
    Scope & { token: string },
    { reuse: boolean; generation: number } | null
>('cloudEditor:_lease');
const readyRef = makeFunctionReference<
    'mutation',
    Scope & {
        token: string;
        revision: number;
        sandboxId: string;
        previewUrl: string;
        requestGeneration?: number;
        expiresAt: number;
        previewToken: string;
        paths: string[];
        dependencyHash: string;
    },
    boolean
>('cloudEditor:_runtimeReady');
const sealRef = makeFunctionReference<
    'mutation',
    Scope & { token: string; revision: number; text: string; hash: string },
    number
>('cloudEditor:_sealDependencies');
const failedRef = makeFunctionReference<
    'mutation',
    Scope & { token: string; message: string; requestGeneration?: number },
    null
>('cloudEditor:_runtimeFailed');

const ROOT = '/vercel/sandbox';
const PORT = 3000;
const VM_LIFETIME_MS = 15 * 60_000;
const WORKER_LIFETIME_MS = 200_000; // Shorter than the four-minute DB lease.
const BUN_HOME = '/tmp/weblab-cloud-tools';
const BUN_PATH = `${BUN_HOME}/bun-linux-x64/bun`;

/** Constant server-authored program. All source paths arrive as JSON argv, never shell code. */
const PLAN_FILES = `
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = '/vercel/sandbox';
const { files, previous } = JSON.parse(process.argv[1]);
const stat = async p => { try { return await fs.lstat(p); } catch (e) { if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return null; throw e; } };
const safe = async p => {
  let at = root;
  for (const part of p.split('/')) {
    at = path.join(at, part);
    const s = await stat(at);
    if (s && s.isSymbolicLink()) throw new Error('Symlink in source tree');
  }
};
(async () => {
  for (const p of [...previous, ...files.map(f => f.path)]) await safe(p);
  const desired = new Set(files.map(f => f.path));
  const parents = new Set();
  for (const f of files) {
    const parts = f.path.split('/');
    for (let i = 1; i < parts.length; i++) parents.add(parts.slice(0, i).join('/'));
  }
  const removed = previous.filter(p => !desired.has(p)).sort((a, b) => b.split('/').length - a.split('/').length);
  for (const p of removed) {
    const absolute = path.join(root, p), s = await stat(absolute);
    if (!s) continue;
    if (s.isDirectory()) {
      if (parents.has(p)) continue;
      try { await fs.rmdir(absolute); } catch (e) { if (e.code !== 'ENOTEMPTY') throw e; }
    } else if (s.isFile()) await fs.unlink(absolute);
    else throw new Error('Unsupported source entry');
  }
  const changed = [];
  for (const f of files) {
    const absolute = path.join(root, f.path), s = await stat(absolute);
    if (f.kind === 'directory') {
      if (s && s.isFile() && previous.includes(f.path)) await fs.unlink(absolute);
      else if (s && !s.isDirectory()) throw new Error('Unsupported source directory');
    } else {
      if (s && s.isDirectory() && previous.includes(f.path)) await fs.rmdir(absolute);
      else if (s && !s.isFile()) throw new Error('Unsupported source file');
      if (!s || !s.isFile() || createHash('sha256').update(await fs.readFile(absolute)).digest('hex') !== f.hash) changed.push(f.path);
    }
  }
  process.stdout.write(JSON.stringify(changed));
})().catch(() => { process.exitCode = 1; });
`;

// Same official, checksum-pinned Linux build used by desktop runtime staging.
// The VM receives no Vercel or Convex credentials in commands or environment.
const INSTALL_BUN = `
const fs = require('node:fs/promises');
const { createHash } = require('node:crypto');
(async () => {
  if (process.arch !== 'x64' || process.platform !== 'linux') throw new Error('Unsupported runtime');
  const response = await fetch('https://github.com/oven-sh/bun/releases/download/bun-v1.3.10/bun-linux-x64.zip', { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('Download failed');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 128 * 1024 * 1024) throw new Error('Download too large');
    chunks.push(chunk);
  }
  const archive = Buffer.concat(chunks);
  if (createHash('sha256').update(archive).digest('hex') !== 'f57bc0187e39623de716ba3a389fda5486b2d7be7131a980ba54dc7b733d2e08') throw new Error('Checksum mismatch');
  await fs.mkdir('/tmp/weblab-cloud-tools', { recursive: true });
  await fs.writeFile('/tmp/weblab-cloud-tools/bun.zip', archive);
})().catch(() => { process.exitCode = 1; });
`;

function digest(content: Buffer | string): string {
    return createHash('sha256').update(content).digest('hex');
}

async function command(sandbox: Sandbox, signal: AbortSignal, cmd: string, args: string[]) {
    const result = await sandbox.runCommand({
        cmd,
        args,
        cwd: ROOT,
        signal,
        env: { NEXT_TELEMETRY_DISABLED: '1', NODE_OPTIONS: '--max-old-space-size=2048' },
    });
    if (result.exitCode !== 0) throw new Error('Cloud command failed');
    return result;
}

async function bunExecutable(sandbox: Sandbox, signal: AbortSignal): Promise<string> {
    const available = await command(sandbox, signal, 'node', [
        '-e',
        "const { spawnSync } = require('node:child_process'); const r = spawnSync('bun', ['--version']); process.stdout.write(r.status === 0 && r.stdout.toString().trim() === '1.3.10' ? 'yes' : 'no');",
    ]);
    if ((await available.stdout({ signal })).trim() === 'yes') return 'bun';
    await command(sandbox, signal, 'node', ['-e', INSTALL_BUN]);
    await command(sandbox, signal, 'unzip', ['-q', '-o', `${BUN_HOME}/bun.zip`, '-d', BUN_HOME]);
    await command(sandbox, signal, BUN_PATH, ['--version']);
    return BUN_PATH;
}

async function boundedBody(response: Response, expectedBytes: number): Promise<Buffer> {
    if (!response.ok || !response.body) throw new Error('Source download failed');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
        while (true) {
            const part = await reader.read();
            if (part.done) break;
            bytes += part.value.byteLength;
            if (bytes > expectedBytes || bytes > MAX_CLOUD_ASSET_BYTES)
                throw new Error('Source download too large');
            chunks.push(part.value);
        }
    } finally {
        await reader.cancel();
    }
    if (bytes !== expectedBytes) throw new Error('Source download incomplete');
    return Buffer.concat(chunks);
}

async function sourceBytes(file: RuntimeFile, signal: AbortSignal): Promise<Buffer> {
    let content: Buffer;
    if (file.text !== undefined) content = Buffer.from(file.text, 'utf8');
    else {
        // This URL comes exclusively from ctx.storage.getUrl in the internal query.
        if (!file.storageId || !file.url || new URL(file.url).protocol !== 'https:')
            throw new Error('Source unavailable');
        content = await boundedBody(
            await fetch(file.url, { signal, redirect: 'error' }),
            file.bytes,
        );
    }
    if (content.byteLength !== file.bytes || digest(content) !== file.hash)
        throw new Error('Source checksum mismatch');
    return content;
}

async function materialize(
    sandbox: Sandbox,
    files: RuntimeFile[],
    previous: string[],
    signal: AbortSignal,
): Promise<void> {
    for (const path of previous) cloudPath(path);
    for (const file of files) cloudPath(file.path);
    const plan = await command(sandbox, signal, 'node', [
        '-e',
        PLAN_FILES,
        JSON.stringify({
            files: files.map(({ path, kind, hash }) => ({ path, kind, hash })),
            previous,
        }),
    ]);
    const changed: unknown = JSON.parse(await plan.stdout({ signal }));
    if (!Array.isArray(changed) || changed.some((path) => typeof path !== 'string'))
        throw new Error('Invalid materialization plan');
    const changedPaths = new Set<string>(changed);
    const directories = new Set<string>();
    for (const file of files) {
        if (file.kind === 'directory') directories.add(`${ROOT}/${file.path}`);
        const parent = file.path.split('/').slice(0, -1).join('/');
        if (parent) directories.add(`${ROOT}/${parent}`);
    }
    if (directories.size) await command(sandbox, signal, 'mkdir', ['-p', '--', ...directories]);
    // Keep each request small while writing only changed sources for fast HMR.
    for (const file of files) {
        if (file.kind !== 'file' || !changedPaths.has(file.path)) continue;
        await sandbox.writeFiles(
            [{ path: `${ROOT}/${file.path}`, content: await sourceBytes(file, signal) }],
            { signal },
        );
    }
}

async function waitForPreview(
    sandbox: Sandbox,
    files: RuntimeFile[],
    previewToken: string,
    signal: AbortSignal,
): Promise<string> {
    const previewUrl = sandbox.domain(PORT);
    const preload = files.find((file) => file.path === 'public/weblab-preload-script.js');
    if (!preload) throw new Error('Editor bootstrap missing');
    const deadline = Date.now() + 70_000;
    while (Date.now() < deadline) {
        signal.throwIfAborted();
        try {
            const probeSignal = AbortSignal.any([signal, AbortSignal.timeout(8_000)]);
            const page = await fetch(previewUrl, {
                headers: { 'x-weblab-preview-control': previewToken },
                signal: probeSignal,
                redirect: 'error',
                cache: 'no-store',
            });
            await page.body?.cancel();
            if (page.ok) {
                const response = await fetch(new URL('/weblab-preload-script.js', previewUrl), {
                    headers: { 'x-weblab-preview-control': previewToken },
                    signal: probeSignal,
                    redirect: 'error',
                    cache: 'no-store',
                });
                if (digest(await boundedBody(response, preload.bytes)) === preload.hash)
                    return previewUrl;
            }
        } catch {
            // Next may be compiling. Never expose SDK or response diagnostics.
        }
        await new Promise((resolve) => setTimeout(resolve, 800));
    }
    throw new Error('Preview did not become ready');
}

export const sync = internalAction({
    args: {
        ...cloudScope,
        allowCreate: v.optional(v.boolean()),
        requestGeneration: v.optional(v.number()),
    },
    handler: async (ctx, args): Promise<null> => {
        const { allowCreate = false, requestGeneration, ...scope } = args;
        if (
            allowCreate &&
            (requestGeneration === undefined ||
                !(await ctx.runQuery(authorizedRef, { ...scope, requestGeneration })))
        )
            return null;
        if (!allowCreate) {
            const current = await ctx.runQuery(inputRef, scope);
            if (
                !current ||
                current.state.status !== 'ready' ||
                !current.state.sandboxId ||
                (current.state.expiresAt ?? 0) <= Date.now() + 60_000
            )
                return null;
        }
        const token = randomUUID();
        const lease = await ctx.runMutation(leaseRef, { ...scope, token });
        if (!lease) return null;
        const signal = AbortSignal.timeout(WORKER_LIFETIME_MS);
        let sandbox: Sandbox | undefined;
        let created = false;
        let adopted = false;
        let message = 'The cloud preview could not start. Try again.';
        try {
            const input = await ctx.runQuery(inputRef, scope);
            if (!input || input.state.leaseToken !== token) return null;
            const assertLease = async () => {
                signal.throwIfAborted();
                const current = await ctx.runQuery(inputRef, scope);
                if (
                    !current ||
                    current.state.leaseToken !== token ||
                    (current.state.leaseUntil ?? 0) <= Date.now()
                )
                    throw new Error('Lease changed');
                if (
                    allowCreate &&
                    (requestGeneration === undefined ||
                        !(await ctx.runQuery(authorizedRef, {
                            ...scope,
                            requestGeneration,
                            token,
                        })))
                )
                    throw new Error('Preview start authorization changed');
            };
            const {
                VERCEL_TOKEN: vercelToken,
                VERCEL_TEAM_ID: teamId,
                VERCEL_PROJECT_ID: projectId,
            } = process.env;
            if (!vercelToken || !teamId || !projectId) {
                message = 'Cloud previews are not configured yet.';
                throw new Error('Missing runtime credentials');
            }
            const editorOrigin = process.env.WEBLAB_EDITOR_ORIGIN;
            if (!editorOrigin || new URL(editorOrigin).protocol !== 'https:')
                throw new Error('Editor origin missing');
            const credentials = { token: vercelToken, teamId, projectId };
            let previewToken = input.state.previewToken ?? '';
            const manifest = input.files.find(
                (file) => file.path === 'package.json' && file.kind === 'file',
            );
            if (!manifest) throw new Error('Project manifest missing');
            const dependencyFiles = input.files.filter((file) =>
                ['package.json', 'bun.lock', 'bun.lockb', 'bunfig.toml', '.npmrc'].includes(
                    file.path,
                ),
            );
            let dependencyHash = digest(
                JSON.stringify(dependencyFiles.map((file) => [file.path, file.hash]).sort()) +
                    ':bun1.3.10:node24:ignore-scripts',
            );
            let revision = input.state.revision;
            let paths = input.files.map((file) => file.path);
            if (
                lease.reuse &&
                input.state.previewGatewayVersion === 2 &&
                input.state.sandboxId &&
                input.state.dependencyHash === dependencyHash
            ) {
                try {
                    const existing = await Sandbox.get({
                        ...credentials,
                        sandboxId: input.state.sandboxId,
                        signal,
                    });
                    if (existing.status === 'running') sandbox = existing;
                } catch {
                    signal.throwIfAborted();
                }
            }
            await assertLease();
            if (!sandbox) {
                if (!allowCreate) {
                    message =
                        'The preview has stopped. Your files are saved. Start the preview to continue.';
                    throw new Error('Explicit preview start required');
                }
                message =
                    'Cloud preview capacity is busy. Your files are saved. Try again shortly.';
                if (requestGeneration === undefined)
                    throw new Error('Missing preview start request');
                if (
                    input.state.previewStartRequest?.kind === 'content' &&
                    !input.files.some(
                        (file) =>
                            file.kind === 'file' &&
                            ['bun.lock', 'bun.lockb'].includes(file.path) &&
                            file.bytes > 0,
                    )
                )
                    throw new Error('Builder preparation required');
                if (!(await ctx.runMutation(reserveRef, { ...scope, token, requestGeneration })))
                    throw new Error('No runtime capacity');
                await assertLease();
                previewToken = randomBytes(32).toString('hex');
                sandbox = await Sandbox.create({
                    ...credentials,
                    runtime: 'node24',
                    ports: [PORT],
                    timeout: VM_LIFETIME_MS,
                    resources: { vcpus: 2 },
                    signal,
                });
                created = true;
            }
            await assertLease();
            message = 'The saved files could not be loaded into the preview. Try again.';
            await materialize(
                sandbox,
                input.files,
                created ? [] : (input.state.materializedPaths ?? []),
                signal,
            );
            if (created) {
                message =
                    'The project dependencies could not be installed. Check package.json and try again.';
                const bun = await bunExecutable(sandbox, signal);
                await assertLease();
                const locked = input.files.some(
                    (file) => file.path === 'bun.lock' || file.path === 'bun.lockb',
                );
                await command(sandbox, signal, bun, [
                    'install',
                    '--ignore-scripts',
                    '--no-progress',
                    ...(locked ? ['--frozen-lockfile'] : []),
                ]);
                if (!locked) {
                    if (input.state.previewStartRequest?.kind === 'content')
                        throw new Error('Builder preparation required');
                    const result = await command(sandbox, signal, 'node', [
                        '-e',
                        "process.stdout.write(require('node:fs').readFileSync('bun.lock','utf8'))",
                    ]);
                    const text = await result.stdout({ signal });
                    const hash = digest(text);
                    revision = await ctx.runMutation(sealRef, {
                        ...scope,
                        token,
                        revision,
                        text,
                        hash,
                    });
                    dependencyHash = digest(
                        JSON.stringify(
                            [
                                ...dependencyFiles.map((file) => [file.path, file.hash]),
                                ['bun.lock', hash],
                            ].sort(),
                        ) + ':bun1.3.10:node24:ignore-scripts',
                    );
                    paths = [...paths, 'bun.lock'];
                }
                await assertLease();
                message = 'The site could not start. Check the project source and try again.';
                const server = await sandbox.runCommand({
                    cmd: 'node',
                    args: [
                        'node_modules/next/dist/bin/next',
                        'dev',
                        '--turbopack',
                        '--hostname',
                        '127.0.0.1',
                        '--port',
                        '3001',
                    ],
                    cwd: ROOT,
                    detached: true,
                    signal,
                    env: {
                        NEXT_TELEMETRY_DISABLED: '1',
                        NODE_OPTIONS: '--max-old-space-size=2048',
                        WEBLAB_PREVIEW_HOST: new URL(sandbox.domain(PORT)).hostname,
                    },
                });
                if (server.exitCode !== null) throw new Error('Preview process stopped');
                await sandbox.writeFiles(
                    [
                        {
                            path: '/tmp/weblab-preview-gateway.cjs',
                            content: Buffer.from(CLOUD_PREVIEW_GATEWAY_SCRIPT),
                        },
                    ],
                    { signal },
                );
                const gateway = await sandbox.runCommand({
                    cmd: 'node',
                    args: ['/tmp/weblab-preview-gateway.cjs'],
                    cwd: '/tmp',
                    detached: true,
                    signal,
                    env: {
                        WEBLAB_CONVEX_URL: process.env.CONVEX_CLOUD_URL!,
                        WEBLAB_PREVIEW_PROJECT_ID: scope.projectId,
                        WEBLAB_PREVIEW_BRANCH_ID: scope.branchId,
                        WEBLAB_PREVIEW_SANDBOX_ID: sandbox.sandboxId,
                        WEBLAB_PREVIEW_VERIFIER: createHmac('sha256', previewToken).update('weblab-preview-verifier-v1').digest('hex'),
                        WEBLAB_PREVIEW_CAPABILITY: previewToken,
                        WEBLAB_PREVIEW_EXPIRES_AT: String(
                            sandbox.createdAt.getTime() + sandbox.timeout,
                        ),
                        WEBLAB_EDITOR_ORIGIN: new URL(editorOrigin).origin,
                    },
                });
                if (gateway.exitCode !== null) throw new Error('Preview gateway stopped');
            }
            message = 'The preview did not become ready. Check the project source and try again.';
            const previewUrl = await waitForPreview(sandbox, input.files, previewToken, signal);
            await assertLease();
            adopted = await ctx.runMutation(readyRef, {
                ...scope,
                token,
                revision,
                sandboxId: sandbox.sandboxId,
                previewUrl,
                expiresAt: sandbox.createdAt.getTime() + sandbox.timeout,
                paths,
                dependencyHash,
                previewToken,
                ...(allowCreate ? { requestGeneration } : {}),
            });
            if (!adopted) throw new Error('Preview adoption rejected');
            if (created && input.state.sandboxId && input.state.sandboxId !== sandbox.sandboxId) {
                const current = await ctx.runQuery(inputRef, scope);
                if (current?.state.sandboxId === sandbox.sandboxId) {
                    try {
                        const previous = await Sandbox.get({
                            ...credentials,
                            sandboxId: input.state.sandboxId,
                            signal: AbortSignal.timeout(10_000),
                        });
                        await previous.stop({ signal: AbortSignal.timeout(10_000) });
                        await ctx.runMutation(releaseRef, { sandboxId: input.state.sandboxId });
                    } catch {
                        /* Exact superseded runtime also has a bounded expiry. */
                    }
                }
            }
        } catch {
            await ctx.runMutation(failedRef, {
                ...scope,
                token,
                message,
                ...(allowCreate ? { requestGeneration } : {}),
            });
        } finally {
            // Only a VM created here and positively confirmed unadopted can be stopped.
            // An ambiguous DB/network failure must leave it to its short timeout.
            if (created && sandbox && !adopted) {
                try {
                    const current = await ctx.runQuery(inputRef, scope);
                    if (
                        current?.state.sandboxId !== sandbox.sandboxId &&
                        current?.state.leaseToken !== token
                    ) {
                        await sandbox.stop({ signal: AbortSignal.timeout(10_000) });
                        await ctx.runMutation(releaseRef, { token });
                    }
                } catch {
                    /* VM has a fixed 15-minute expiration. */
                }
            }
        }
        return null;
    },
});
