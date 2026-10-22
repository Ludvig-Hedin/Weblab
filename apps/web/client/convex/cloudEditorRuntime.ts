'use node';

import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { Sandbox } from '@vercel/sandbox';
import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { internalAction } from './_generated/server';
import { cloudPath, cloudScope, MAX_CLOUD_ASSET_BYTES } from './lib/cloudEditor';
import { importSourcePath, MAX_IMPORT_ASSET_BYTES } from './lib/cloudImportManifest';
import { assertImportedNextPins, IMPORTED_BUN_ARCHIVE_SHA256, type ImportedNextPolicy } from './lib/cloudImportedNextProfile';
import { CLOUD_PREVIEW_GATEWAY_SCRIPT } from './lib/cloudPreviewGateway';

type Scope = { projectId: Id<'projects'>; branchId: Id<'branches'> };
type RuntimeFile = Doc<'cloudEditorFiles'> & { url: string | null };
type RuntimeInput = { state: Doc<'cloudEditorStates'>; files: RuntimeFile[]; policy: ImportedNextPolicy | null };
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
const hashFile = async p => { const hash = createHash('sha256'); for await (const chunk of require('node:fs').createReadStream(p)) hash.update(chunk); return hash.digest('hex'); };
const { files, previous } = JSON.parse(process.argv[1]);
const stat = async p => { try { return await fs.lstat(p); } catch (e) { if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return null; throw e; } };
const safe = async p => {
  if (typeof p !== 'string' || !p || p.startsWith('/') || p.includes(String.fromCharCode(92)) || p.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Unsafe source path');
  let at = root;
  for (const part of p.split('/')) {
    at = path.join(at, part);
    const s = await stat(at);
    if (s && s.isSymbolicLink()) throw new Error('Symlink in source tree');
  }
};
(async () => {
  const rootStat = await fs.lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Unsafe root');
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
      if (!s || !s.isFile() || s.size !== f.bytes || await hashFile(absolute) !== f.hash) changed.push(f.path);
    }
  }
  process.stdout.write(JSON.stringify(changed));
})().catch(() => { process.exitCode = 1; });
`;

/** Source metadata is server-derived and passed as JSON argv. Never execute source here. */
const VERIFY_FILES = `
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = '/vercel/sandbox';
(async () => {
  const rootStat = await fs.lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Unsafe root');
  for (const file of JSON.parse(process.argv[1])) {
    const p = file.path;
    if (typeof p !== 'string' || !p || p.startsWith('/') || p.includes(String.fromCharCode(92)) || p.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Unsafe path');
    let at = root;
    for (const part of p.split('/')) {
      at = path.join(at, part);
      const stat = await fs.lstat(at);
      if (stat.isSymbolicLink()) throw new Error('Symlink in source');
    }
    const stat = await fs.lstat(at);
    if (file.kind === 'directory') { if (!stat.isDirectory()) throw new Error('Invalid directory'); continue; }
    if (!stat.isFile() || stat.size !== file.bytes) throw new Error('Source size mismatch');
    const hash = createHash('sha256');
    for await (const chunk of require('node:fs').createReadStream(at)) hash.update(chunk);
    if (hash.digest('hex') !== file.hash) throw new Error('Source hash mismatch');
  }
})().catch(() => { process.exitCode = 1; });
`;

// Only these official archive URLs and checksums can ever be selected.
const BUN_RELEASES = {
    '1.3.10': { url: 'https://github.com/oven-sh/bun/releases/download/bun-v1.3.10/bun-linux-x64.zip',
        sha256: 'f57bc0187e39623de716ba3a389fda5486b2d7be7131a980ba54dc7b733d2e08' },
    '1.3.11': { url: 'https://github.com/oven-sh/bun/releases/download/bun-v1.3.11/bun-linux-x64.zip',
        sha256: IMPORTED_BUN_ARCHIVE_SHA256 },
} as const;
const INSTALL_BUN = `
const fs = require('node:fs/promises');
const { createHash } = require('node:crypto');
(async () => {
  if (process.arch !== 'x64' || process.platform !== 'linux') throw new Error('Unsupported runtime');
  const { url, sha256 } = JSON.parse(process.argv[1]);
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok || !response.body) throw new Error('Download failed');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 128 * 1024 * 1024) throw new Error('Download too large');
    chunks.push(chunk);
  }
  const archive = Buffer.concat(chunks);
  if (createHash('sha256').update(archive).digest('hex') !== sha256) throw new Error('Checksum mismatch');
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

export async function bunExecutable(sandbox: Sandbox, signal: AbortSignal, imported = false): Promise<string> {
    const version = imported ? '1.3.11' : '1.3.10';
    const available = await command(sandbox, signal, 'node', [
        '-e',
        "const { spawnSync } = require('node:child_process'); const r = spawnSync('bun', ['--version']); process.stdout.write(r.status === 0 && r.stdout.toString().trim() === process.argv[1] ? 'yes' : 'no');",
        version,
    ]);
    if ((await available.stdout({ signal })).trim() === 'yes') return 'bun';
    await command(sandbox, signal, 'node', ['-e', INSTALL_BUN, JSON.stringify(BUN_RELEASES[version])]);
    await command(sandbox, signal, 'unzip', ['-q', '-o', `${BUN_HOME}/bun.zip`, '-d', BUN_HOME]);
    const installed = await command(sandbox, signal, BUN_PATH, ['--version']);
    if ((await installed.stdout({ signal })).trim() !== version) throw new Error('Bun version mismatch');
    return BUN_PATH;
}

export async function boundedBody(response: Response, expectedBytes: number, maxBytes = MAX_CLOUD_ASSET_BYTES, signal?: AbortSignal): Promise<Buffer> {
    if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 0 || expectedBytes > maxBytes || !response.ok || !response.body) {
        await response.body?.cancel();
        throw new Error('Source download failed');
    }
    const reader = response.body.getReader();
    const content = Buffer.alloc(expectedBytes);
    let bytes = 0;
    const abort = () => { void reader.cancel().catch(() => undefined); };
    signal?.addEventListener('abort', abort, { once: true });
    try {
        while (true) {
            signal?.throwIfAborted();
            const part = await reader.read();
            signal?.throwIfAborted();
            if (part.done) break;
            if (part.value.byteLength > expectedBytes - bytes) throw new Error('Source download too large');
            content.set(part.value, bytes);
            bytes += part.value.byteLength;
        }
    } finally {
        signal?.removeEventListener('abort', abort);
        await reader.cancel();
    }
    if (bytes !== expectedBytes) throw new Error('Source download incomplete');
    return content;
}

async function sourceBytes(file: RuntimeFile, signal: AbortSignal, imported = false): Promise<Buffer> {
    let content: Buffer;
    if (file.text !== undefined) content = Buffer.from(file.text, 'utf8');
    else {
        // This URL comes exclusively from ctx.storage.getUrl in the internal query.
        if (!file.storageId || !file.url || new URL(file.url).protocol !== 'https:')
            throw new Error('Source unavailable');
        content = await boundedBody(
            await fetch(file.url, { signal, redirect: 'error' }),
            file.bytes,
            imported ? MAX_IMPORT_ASSET_BYTES : MAX_CLOUD_ASSET_BYTES,
            signal,
        );
    }
    if (content.byteLength !== file.bytes || digest(content) !== file.hash)
        throw new Error('Source checksum mismatch');
    return content;
}

export async function materialize(
    sandbox: Sandbox,
    files: RuntimeFile[],
    previous: string[],
    signal: AbortSignal,
    imported = false,
): Promise<void> {
    const validatePath = imported ? importSourcePath : cloudPath;
    for (const path of previous) validatePath(path);
    for (const file of files) validatePath(file.path);
    const plan = await command(sandbox, signal, 'node', [
        '-e',
        PLAN_FILES,
        JSON.stringify({
            files: files.map(({ path, kind, hash, bytes }) => ({ path, kind, hash, bytes })),
            previous,
        }),
    ]);
    const changed: unknown = JSON.parse(await plan.stdout({ signal }));
    if (!Array.isArray(changed) || changed.some((path) => typeof path !== 'string'))
        throw new Error('Invalid materialization plan');
    const changedPaths = new Set<string>(changed);
    if (changedPaths.size !== changed.length || changed.some(path => !files.some(file => file.kind === 'file' && file.path === path)))
        throw new Error('Invalid materialization plan');
    const directories = new Set<string>();
    for (const file of files) {
        if (file.kind === 'directory') directories.add(`${ROOT}/${file.path}`);
        const parent = file.path.split('/').slice(0, -1).join('/');
        if (parent) directories.add(`${ROOT}/${parent}`);
    }
    if (directories.size) await command(sandbox, signal, 'mkdir', ['-p', '--', ...directories]);
    // SDK tar/gzip encoding makes additional copies. Keep decoded small-file
    // batches bounded, and send large files individually and sequentially.
    let batch: Array<{ path: string; content: Buffer }> = [];
    let batchBytes = 0;
    const flush = async () => {
        if (!batch.length) return;
        await sandbox.writeFiles(batch, { signal });
        batch = []; batchBytes = 0;
    };
    for (const file of files) {
        if (file.kind !== 'file' || !changedPaths.has(file.path)) continue;
        if (batchBytes + file.bytes > 1024 * 1024) await flush();
        const content = await sourceBytes(file, signal, imported);
        if (file.bytes > 1024 * 1024) await sandbox.writeFiles([{ path: `${ROOT}/${file.path}`, content }], { signal });
        else { batch.push({ path: `${ROOT}/${file.path}`, content }); batchBytes += content.byteLength; }
    }
    await flush();

}

export function runtimePolicy(input: RuntimeInput): ImportedNextPolicy | null {
    if (input.state.profile === 'imported-next-v1') {
        if (!input.policy || !input.state.preparationId) throw new Error('Prepared runtime policy missing');
        assertImportedNextPins(input.files, input.policy);
        return input.policy;
    }
    if (input.state.profile !== undefined && input.state.profile !== 'starter-v1') throw new Error('Unsupported runtime profile');
    if (input.policy) throw new Error('Unexpected runtime policy');
    return null;
}

export function runtimeDependencyHash(files: RuntimeFile[], policy: ImportedNextPolicy | null): string {
    if (policy) return digest(JSON.stringify({ profile: 'imported-next-v1', profileVersion: 1, preparationVersion: 1,
        policyHash: policy.policyHash, node: policy.node, bun: policy.bun, archive: policy.bunArchiveSha256, pins: policy.pinnedFiles }));
    return digest(JSON.stringify(files.filter(file => ['package.json', 'bun.lock', 'bun.lockb', 'bunfig.toml', '.npmrc'].includes(file.path))
        .map(file => [file.path, file.hash]).sort()) + ':bun1.3.10:node24:ignore-scripts');
}

export async function verifyFiles(sandbox: Sandbox, files: RuntimeFile[], signal: AbortSignal): Promise<void> {
    await command(sandbox, signal, 'node', ['-e', VERIFY_FILES, JSON.stringify(files.map(({ path, kind, hash, bytes }) => ({ path, kind, hash, bytes })))]);
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
                if (digest(await boundedBody(response, preload.bytes, MAX_CLOUD_ASSET_BYTES, probeSignal)) === preload.hash)
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
            const policy = runtimePolicy(input);
            const imported = policy !== null;
            const assertLease = async () => {
                signal.throwIfAborted();
                const current = await ctx.runQuery(inputRef, scope);
                if (
                    !current ||
                    current.state.leaseToken !== token ||
                    (current.state.leaseUntil ?? 0) <= Date.now()
                )
                    throw new Error('Lease changed');
                const currentPolicy = runtimePolicy(current);
                if (current.state.profile !== input.state.profile || current.state.preparationId !== input.state.preparationId ||
                    currentPolicy?.policyHash !== policy?.policyHash) throw new Error('Runtime policy changed');
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
            let dependencyHash = runtimeDependencyHash(input.files, policy);
            let revision = input.state.revision;
            let paths = input.files.map((file) => file.path);
            await assertLease();
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
                imported,
            );
            if (created) {
                message =
                    'The project dependencies could not be installed. Check package.json and try again.';
                const bun = await bunExecutable(sandbox, signal, imported);
                await assertLease();
                const locked = input.files.some(
                    (file) => file.path === 'bun.lock' || file.path === 'bun.lockb',
                );
                if (imported && !locked) throw new Error('Prepared lock missing');
                await command(sandbox, signal, bun, [
                    'install',
                    '--ignore-scripts',
                    '--no-progress',
                    ...(locked ? ['--frozen-lockfile'] : []),
                ]);
                if (imported) await verifyFiles(sandbox, input.files, signal);
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
                        ...(imported ? [] : ['--turbopack']),
                        '--hostname',
                        '127.0.0.1',
                        '--port',
                        '3001',
                    ],
                    cwd: ROOT,
                    detached: true,
                    signal,
                    env: {
                        // Next must fail on missing tooling, never run an unfrozen install.
                        ...(imported ? { CI: '1' } : {}),
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
            if (imported) {
                await verifyFiles(sandbox, input.files, signal);
                await assertLease();
            }
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
