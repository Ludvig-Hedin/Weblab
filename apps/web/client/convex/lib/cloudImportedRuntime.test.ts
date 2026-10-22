import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { Sandbox } from '@vercel/sandbox';
import { boundedBody, bunExecutable, materialize, runtimeDependencyHash, runtimePolicy, verifyFiles } from '../cloudEditorRuntime';
import type { Doc, Id } from '../_generated/dataModel';
import { validateImportedNextProfile } from './cloudImportedNextProfile';

type File = Parameters<typeof materialize>[1][number];
const signal = () => AbortSignal.timeout(5_000);
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
function text(path: string, text: string): File {
    return { _id: `cloudEditorFiles:${path}` as Id<'cloudEditorFiles'>, _creationTime: 1,
        projectId: 'projects:one' as Id<'projects'>, branchId: 'branches:one' as Id<'branches'>,
        path, text, kind: 'file', bytes: Buffer.byteLength(text), hash: hash(text), url: null };
}
function policyFixture() {
    const pkg = { name: 'site', packageManager: 'bun@1.3.11', dependencies: { next: '16.3.1' }, scripts: { dev: 'next dev', build: 'next build --webpack' } };
    const lock = { lockfileVersion: 1, configVersion: 1, workspaces: { '': { name: 'site', dependencies: pkg.dependencies } },
        packages: { next: ['next@16.3.1', '', {}, `sha512-${Buffer.alloc(64, 7).toString('base64')}`] } };
    const files = [text('package.json', JSON.stringify(pkg)), text('bun.lock', JSON.stringify(lock)), text('next.config.ts', 'export default {};'),
        text('tsconfig.json', '{}'), text('public/weblab-preload-script.js', '// editor'), text('public/weblab-ix-runtime.js', '// interactions'),
        text('src/app/layout.tsx', 'export default function Layout({children}) { return <html><body>{children}</body></html>; }'),
        text('src/app/page.tsx', 'export default function Page() { return <p>Hi</p>; }')];
    return { files, policy: validateImportedNextProfile(files), state: { profile: 'imported-next-v1', preparationId: 'cloudEditorImportPreparations:one' } as Doc<'cloudEditorStates'> };
}

// Execute the actual server-authored VM programs against a synthetic filesystem.
// No processes, provider requests or customer code execute in these fixtures.
function vmFixture() {
    type Entry = { kind: 'file' | 'directory' | 'symlink'; content?: Buffer };
    const disk = new Map<string, Entry>([['/vercel/sandbox', { kind: 'directory' }]]);
    const writes: Array<Array<{ path: string; bytes: number }>> = [];
    const readPaths: string[] = [];
    const stat = async (at: string) => {
        const entry = disk.get(at);
        if (!entry) throw Object.assign(new Error('Missing'), { code: 'ENOENT' });
        return { isFile: () => entry.kind === 'file', isDirectory: () => entry.kind === 'directory', isSymbolicLink: () => entry.kind === 'symlink', size: entry.content?.length ?? 0 };
    };
    const mkdir = (at: string) => {
        const parts = at.split('/').filter(Boolean);
        for (let i = 1; i <= parts.length; i++) {
            const parent = `/${parts.slice(0, i).join('/')}`;
            if (!disk.has(parent)) disk.set(parent, { kind: 'directory' });
        }
    };
    const fs = { lstat: stat, unlink: async (at: string) => { disk.delete(at); }, rmdir: async (at: string) => { disk.delete(at); } };
    const sandbox = {
        runCommand: async ({ cmd, args }: { cmd: string; args: string[] }) => {
            let output = '';
            if (cmd === 'mkdir') { for (const at of args.slice(2)) mkdir(at); return { exitCode: 0, stdout: async () => '' }; }
            const process = { argv: ['node', args[2]], exitCode: 0, stdout: { write: (value: string) => { output += value; } } };
            await runInNewContext(args[1]!, { process, require: (name: string) => {
                if (name === 'node:fs/promises') return fs;
                if (name === 'node:path') return path;
                if (name === 'node:crypto') return { createHash };
                if (name === 'node:fs') return { createReadStream: async function* (at: string) {
                    readPaths.push(at);
                    const content = disk.get(at)?.content;
                    if (!content) throw new Error('Missing content');
                    for (let offset = 0; offset < content.length; offset += 64 * 1024) yield content.subarray(offset, offset + 64 * 1024);
                } };
                throw new Error(`Unexpected module ${name}`);
            } });
            return { exitCode: process.exitCode, stdout: async () => output };
        },
        writeFiles: async (files: Array<{ path: string; content: Buffer }>) => {
            writes.push(files.map(file => ({ path: file.path, bytes: file.content.length })));
            for (const file of files) disk.set(file.path, { kind: 'file', content: file.content });
        },
    } as unknown as Sandbox;
    return { sandbox, disk, writes, readPaths, mkdir };
}
const spies: Array<ReturnType<typeof spyOn>> = [];
afterEach(() => { for (const spy of spies.splice(0)) spy.mockRestore(); });

describe('prepared runtime transport and VM verification', () => {
    it('materializes a 22.7MB media file once, batches small files and saves text without uploading media again', async () => {
        const f = vmFixture();
        const media = Buffer.alloc(22_700_000, 11);
        const file = { ...text('public/movie.mp4', ''), text: undefined, storageId: '_storage:one' as Id<'_storage'>,
            bytes: media.length, hash: hash(media), url: 'https://storage.example/owned' };
        let downloads = 0;
        spies.push(spyOn(globalThis, 'fetch').mockImplementation(async () => {
            downloads++;
            let offset = 0;
            return new Response(new ReadableStream({ pull(controller) {
                if (offset === media.length) { controller.close(); return; }
                const next = Math.min(offset + 512 * 1024, media.length);
                controller.enqueue(media.subarray(offset, next)); offset = next;
            } }));
        }));
        const files = [text('src/page.tsx', 'Hello'), text('.env.example', 'PUBLIC_URL='), file];
        await materialize(f.sandbox, files, [], signal(), true);
        expect(f.writes.map(batch => batch.length)).toEqual([2, 1]);
        expect(f.writes[1]![0]!.bytes).toBe(22_700_000);
        await verifyFiles(f.sandbox, files, signal());
        const edited = [text('src/page.tsx', 'Saved'), files[1]!, file];
        await materialize(f.sandbox, edited, files.map(file => file.path), signal(), true);
        expect(downloads).toBe(1);
        expect(f.writes.at(-1)).toEqual([{ path: '/vercel/sandbox/src/page.tsx', bytes: 5 }]);
        await verifyFiles(f.sandbox, edited, signal());
    });
    it('detects VM corruption and symlinks instead of adopting different bytes', async () => {
        const f = vmFixture(), files = [text('public/data.txt', 'exact')];
        await materialize(f.sandbox, files, [], signal(), true);
        f.disk.set('/vercel/sandbox/public/data.txt', { kind: 'file', content: Buffer.from('wrong') });
        await expect(verifyFiles(f.sandbox, files, signal())).rejects.toThrow('Cloud command failed');
        f.disk.set('/vercel/sandbox/public', { kind: 'symlink' });
        await expect(materialize(f.sandbox, files, [], signal(), true)).rejects.toThrow('Cloud command failed');
        await expect(verifyFiles(f.sandbox, files, signal())).rejects.toThrow('Cloud command failed');
    });
    it('rejects unsafe paths before any VM write', async () => {
        const f = vmFixture();
        await expect(materialize(f.sandbox, [text('../escape.txt', 'unsafe')], [], signal(), true)).rejects.toThrow();
        await expect(materialize(f.sandbox, [text('.env.local', 'secret')], [], signal(), true)).rejects.toThrow();
        expect(f.writes).toEqual([]);
    });
    it('rejects streamed overflow, truncation, excessive declared length and an aborted read', async () => {
        let canceled = false;
        const overflow = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(9)); }, cancel() { canceled = true; } }));
        await expect(boundedBody(overflow, 8, 32, signal())).rejects.toThrow('too large');
        expect(canceled).toBe(true);
        await expect(boundedBody(new Response('short'), 6, 32, signal())).rejects.toThrow('incomplete');
        await expect(boundedBody(new Response('x'), 33, 32, signal())).rejects.toThrow('failed');
        const controller = new AbortController();
        const pending = boundedBody(new Response(new ReadableStream()), 1, 32, controller.signal);
        controller.abort();
        await expect(pending).rejects.toThrow();
    });
    it('rejects a mismatched downloaded hash before writing that asset', async () => {
        const f = vmFixture();
        spies.push(spyOn(globalThis, 'fetch').mockResolvedValue(new Response('wrong')));
        const file = { ...text('public/movie.mp4', 'exact'), text: undefined, storageId: '_storage:one' as Id<'_storage'>, url: 'https://storage.example/owned' };
        await expect(materialize(f.sandbox, [file], [], signal(), true)).rejects.toThrow('checksum mismatch');
        expect(f.writes).toEqual([]);
    });
});

describe('prepared runtime selection', () => {
    it('requires current receipt pins and retains dependency identity across ordinary text saves', () => {
        const input = policyFixture();
        expect(runtimePolicy(input)).toEqual(input.policy);
        const before = runtimeDependencyHash(input.files, input.policy);
        const edited = { ...input, files: input.files.map(file => file.path.endsWith('/page.tsx') ? text(file.path, 'export default function Page() { return <p>Saved</p>; }') : file) };
        expect(runtimePolicy(edited)).toEqual(input.policy);
        expect(runtimeDependencyHash(edited.files, input.policy)).toBe(before);
        expect(() => runtimePolicy({ ...input, policy: null })).toThrow();
        const changed = { ...input, files: input.files.map(file => file.path === 'next.config.ts' ? text(file.path, 'export default { output: "export" };') : file) };
        expect(() => runtimePolicy(changed)).toThrow();
        expect(() => runtimePolicy({ ...input, state: { ...input.state, profile: 'imported-source-v1' } })).toThrow();
    });
    it('checks the installed executable version and refuses a wrong extracted version', async () => {
        const calls: Array<{ cmd: string; args: string[] }> = [];
        const sandbox = { runCommand: async (request: { cmd: string; args: string[] }) => {
            calls.push(request);
            const value = request.cmd.endsWith('/bun') ? '1.3.10' : request.args[1]?.includes('spawnSync') ? 'no' : '';
            return { exitCode: 0, stdout: async () => value };
        } } as unknown as Sandbox;
        await expect(bunExecutable(sandbox, signal(), true)).rejects.toThrow('Bun version mismatch');
        const archive = calls.find(call => call.args[1]?.includes('Checksum mismatch'));
        expect(JSON.parse(archive!.args[2]!)).toEqual({
            url: 'https://github.com/oven-sh/bun/releases/download/bun-v1.3.11/bun-linux-x64.zip',
            sha256: '8611ba935af886f05a6f38740a15160326c15e5d5d07adef966130b4493607ed',
        });
        expect(calls.some(call => call.cmd === 'unzip')).toBe(true);
    });
});
