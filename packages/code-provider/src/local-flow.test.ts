import {
    mkdir,
    mkdtemp,
    readdir,
    readFile,
    rm,
    stat,
    writeFile,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';

import { addClassToNode, getAstFromCodeblock, getContentFromAst, t } from '@weblab/parser';

import { NodeFsProvider } from './providers/nodefs';
import { getStaticHtmlScaffoldFiles } from './scaffold-templates';

/**
 * End-to-end test of the local-first user flow:
 *   create (scaffold) → edit (restyle an element) → save → close → reopen →
 *   persists, plus guarded writes and read-only browsing.
 *
 * Runs the REAL NodeFsProvider + REAL parser + REAL static-HTML scaffold against
 * a REAL temp directory through a real-fs bridge that mirrors what
 * apps/desktop/weblab-local.js does (actual fs ops, minus Electron IPC). So this
 * exercises the true local behavior, not mocks.
 */
function installRealFsBridge(root: string) {
    const resolve = (rel: string) => join(root, rel === '' ? '.' : rel);
    const hash = (content: string) => createHash('sha256').update(content).digest('hex');
    const bridge = {
        localfs: {
            async read(_r: string, p: string) {
                try {
                    const content = await readFile(resolve(p), 'utf8');
                    return { content, sha256: hash(content) };
                } catch {
                    return { error: 'not_found', notFound: true };
                }
            },
            async writeIfUnchanged(
                _r: string,
                p: string,
                content: string,
                expectedSha256: string | null,
            ) {
                let currentHash: string | null = null;
                try {
                    currentHash = hash(await readFile(resolve(p), 'utf8'));
                } catch {
                    // Expected for a new file.
                }
                if (currentHash !== expectedSha256) {
                    return { conflict: true, hash: currentHash };
                }
                await mkdir(dirname(resolve(p)), { recursive: true });
                await writeFile(resolve(p), content);
                return { success: true, hash: hash(content) };
            },
            async list(_r: string, p: string) {
                const entries = await readdir(resolve(p), { withFileTypes: true });
                return {
                    files: entries.map((e) => ({
                        name: e.name,
                        type: e.isDirectory() ? ('directory' as const) : ('file' as const),
                        isSymlink: e.isSymbolicLink(),
                    })),
                };
            },
            async stat(_r: string, p: string) {
                try {
                    const s = await stat(resolve(p));
                    return {
                        type: s.isDirectory() ? ('directory' as const) : ('file' as const),
                        size: s.size,
                    };
                } catch {
                    return { error: 'not_found', notFound: true };
                }
            },
            async watchStart() {
                return { watchId: 'w1' };
            },
            async watchStop() {
                return { success: true };
            },
            onWatchEvent() {
                return () => undefined;
            },
        },
        localdev: {
            async start() {
                return { port: 8080, url: 'http://localhost:8080' };
            },
            async stop() {
                return { success: true };
            },
            async status() {
                return { running: false };
            },
            async gitInfo() {
                return { isRepositoryRoot: false };
            },
            async gitStatus() {
                return { changedFiles: [] };
            },
            onOutput() {
                return () => undefined;
            },
        },
    };
    (globalThis as unknown as { weblabNative?: unknown }).weblabNative = bridge;
    return bridge;
}

async function restyle(provider: NodeFsProvider, path: string, className: string): Promise<void> {
    const { content, sha256 } = await provider.readFileWithHash(path);
    const src = content.trim();
    const node = getAstFromCodeblock(src);
    if (!node) throw new Error('failed to parse element');
    addClassToNode(node, className);
    const edited = await getContentFromAst(t.file(t.program([t.expressionStatement(node)])), '');
    await provider.writeFileIfUnchanged(path, edited, sha256);
}

describe('local-first user flow (create → edit → save → reopen)', () => {
    let root: string | undefined;

    afterEach(async () => {
        delete (globalThis as unknown as { weblabNative?: unknown }).weblabNative;
        if (root) {
            await rm(root, { recursive: true, force: true });
            root = undefined;
        }
    });

    test('create a new local project (scaffold) writes the files to disk', async () => {
        root = await mkdtemp(join(tmpdir(), 'wl-flow-'));
        installRealFsBridge(root);
        const provider = new NodeFsProvider({ rootPath: root });

        for (const file of getStaticHtmlScaffoldFiles()) {
            await provider.writeFileIfUnchanged(file.path, file.content, null);
        }

        // Through the provider…
        expect((await provider.readFile({ args: { path: 'index.html' } })).file.content).toContain(
            '<main></main>',
        );
        // …and actually on disk.
        expect(await readFile(join(root, 'index.html'), 'utf8')).toContain('<main></main>');
        expect(await readFile(join(root, 'package.json'), 'utf8')).toContain('serve');
    });

    test('edit (restyle an element) is saved to disk and survives reopen', async () => {
        root = await mkdtemp(join(tmpdir(), 'wl-flow2-'));
        installRealFsBridge(root);
        const provider = new NodeFsProvider({ rootPath: root });
        await provider.writeFileIfUnchanged(
            'src/Button.tsx',
            '<button className="p-2 text-sm">Go</button>\n',
            null,
        );

        // The canvas restyle: add a class to the element + write it back.
        await restyle(provider, 'src/Button.tsx', 'bg-blue-500');

        // "Close and reopen" — a fresh provider reading the same folder on disk.
        const reopened = new NodeFsProvider({ rootPath: root });
        const after = (await reopened.readFile({ args: { path: 'src/Button.tsx' } })).file.content;
        expect(after).toContain('bg-blue-500'); // the edit was saved + persists
        expect(after).toContain('text-sm'); // existing styles preserved
    });

    test('read-only browsing works while direct file CRUD is blocked', async () => {
        root = await mkdtemp(join(tmpdir(), 'wl-flow3-'));
        installRealFsBridge(root);
        const provider = new NodeFsProvider({ rootPath: root });

        await provider.writeFileIfUnchanged('a.txt', 'x', null);
        expect(
            (await provider.listFiles({ args: { path: '.' } })).files.map((f) => f.name),
        ).toContain('a.txt');
        expect((await provider.statFile({ args: { path: 'a.txt' } })).type).toBe('file');

        await expect(
            provider.renameFile({ args: { oldPath: 'a.txt', newPath: 'sub/b.txt' } }),
        ).rejects.toThrow(/Direct local file mutations are unavailable/);
        expect((await provider.readFile({ args: { path: 'a.txt' } })).file.content).toBe('x');
    });

    test('external disk changes reject a stale editor write', async () => {
        root = await mkdtemp(join(tmpdir(), 'wl-flow-conflict-'));
        installRealFsBridge(root);
        const provider = new NodeFsProvider({ rootPath: root });
        await provider.writeFileIfUnchanged('a.txt', 'first', null);
        const original = await provider.readFileWithHash('a.txt');
        await writeFile(join(root, 'a.txt'), 'external');

        await expect(provider.writeFileIfUnchanged('a.txt', 'editor', original.sha256)).rejects.toThrow(
            /File changed on disk/,
        );
        expect(await readFile(join(root, 'a.txt'), 'utf8')).toBe('external');
    });

    test('createSession returns the local preview URL for the canvas', async () => {
        root = await mkdtemp(join(tmpdir(), 'wl-flow4-'));
        installRealFsBridge(root);
        const provider = new NodeFsProvider({ rootPath: root });
        expect((await provider.createSession({ args: { id: 'x' } })).previewUrl).toBe(
            'http://localhost:8080',
        );
    });

    test('off-desktop (no bridge) fails with a clear error', async () => {
        const provider = new NodeFsProvider({ rootPath: '/whatever' });
        await expect(provider.readFile({ args: { path: 'x' } })).rejects.toThrow(/desktop app/i);
    });
});
