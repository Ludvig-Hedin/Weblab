import { describe, expect, it, mock, spyOn } from 'bun:test';

import type { DurableSourceChange } from './durable-source';
import { MemoryFileSystem } from './test-memory-fs';

// ZenFS cannot load under Bun. Both filesystem test files share this exact
// constructor because Bun caches CodeFileSystem across module mock updates.
mock.module('./fs', () => ({ FileSystem: MemoryFileSystem }));

const { CodeFileSystem } = await import('./code-fs');
const { FileSystem } = await import('./fs');
const page = (text: string) =>
    `export default function Page() { return <main data-oid="main"><h1 data-oid="title">${text}</h1></main>; }`;

async function source(project = `durable-${Math.random().toString(36).slice(2)}`) {
    const fs = new CodeFileSystem(project, 'main', { durableCloud: true });
    await fs.initialize();
    fs.setDurableRecoveryHandler(() => async () => {});
    await fs.hydrateDurableSnapshot([
        { path: 'app/page.tsx', content: page('Before') },
        { path: 'public/image.bin', content: new Uint8Array([0, 255, 8]) },
    ]);
    return fs;
}

describe('durable cloud source', () => {
    it('submits normalized image bytes and exact owner source in one durable commit', async () => {
        const fs = await source();
        const submitted: DurableSourceChange[][] = [];
        fs.setDurableCommitHandler(async changes => { submitted.push(changes); });
        const candidate = page('Exact image owner');
        const path = `public/weblab-upload-${'a'.repeat(64)}.webp`;
        const bytes = new Uint8Array([1, 2, 3, 4]);
        try {
            await fs.writeCloudImageFiles('app/page.tsx', candidate, { path, bytes });
            expect(submitted).toHaveLength(1);
            expect(submitted[0]).toEqual([{ path: 'app/page.tsx', content: candidate }, { path, content: bytes }]);
            expect(await fs.readFile('app/page.tsx')).toBe(candidate);
            await expect(fs.writeCloudImageFiles('missing.tsx', candidate, { path, bytes })).rejects.toThrow('existing cloud text owner');
            expect(submitted).toHaveLength(1);
        } finally { await fs.cleanup(); }
    });

    it('persists approved text bytes exactly and rejects stale baselines before remote submission', async () => {
        const fs = await source();
        const submitted: DurableSourceChange[][] = [];
        fs.setDurableCommitHandler(async changes => { submitted.push(changes); });
        const original = page('Before');
        const candidate = original.replace('>Before<', '>{"After\\nline"}<');
        try {
            await fs.writeCloudTextFile('app/page.tsx', candidate, original);
            expect(await fs.readFile('app/page.tsx')).toBe(candidate);
            expect(submitted).toEqual([[{ path: 'app/page.tsx', content: candidate }]]);
            await expect(fs.writeCloudTextFile('app/page.tsx', original, original)).rejects.toThrow('changed before saving');
            await expect(fs.writeCloudTextFile('public/image.bin', 'replacement')).rejects.toThrow('existing cloud text file');
            expect(submitted).toHaveLength(1);
            expect(await fs.readFile('app/page.tsx')).toBe(candidate);
        } finally { await fs.cleanup(); }
    });

    it('rechecks cancellation after waiting for the source write lock without invalidating the ready tree', async () => {
        const fs = await source();
        let enter!: () => void, release!: () => void;
        const entered = new Promise<void>((resolve) => {
            enter = resolve;
        });
        const waiting = new Promise<void>((resolve) => {
            release = resolve;
        });
        fs.setDurableCommitHandler(async () => {
            enter();
            await waiting;
        });
        const writing = fs.writeFile('notes.txt', 'Current accepted work');
        await entered;
        const abort = new AbortController();
        const hydration = fs
            .hydrateDurableSnapshot(
                [{ path: 'app/page.tsx', content: page('Stale queued snapshot') }],
                abort.signal,
            )
            .catch((error: unknown) => error);
        abort.abort(new Error('Session changed'));
        release();
        try {
            await writing;
            expect(await hydration).toMatchObject({ message: 'Session changed' });
            expect(await fs.readFile('app/page.tsx')).toBe(page('Before'));
            expect(await fs.readFile('notes.txt')).toBe('Current accepted work');
            expect(await fs.fileExists('public/image.bin')).toBe(true);
            expect((await fs.getJsxElementMetadata('title'))?.code).toContain('Before');
            fs.setDurableCommitHandler(async () => {});
            await fs.writeFile('after-cancel.txt', 'The previous tree is still ready');
        } finally {
            release();
            await fs.cleanup();
        }
    });

    it('refuses an already canceled hydration without touching the current source', async () => {
        const fs = await source();
        fs.setDurableCommitHandler(async () => {});
        const abort = new AbortController();
        abort.abort(new Error('Session changed'));
        await expect(
            fs.hydrateDurableSnapshot(
                [{ path: 'app/page.tsx', content: page('Stale') }],
                abort.signal,
            ),
        ).rejects.toThrow('Session changed');
        expect(await fs.readFile('app/page.tsx')).toBe(page('Before'));
        await fs.writeFile('notes.txt', 'Still current');
        await fs.cleanup();
    });

    it.each(['read', 'write', 'index'] as const)(
        'stops canceled hydration after a pending %s and requires a fresh snapshot',
        async (boundary) => {
            const fs = await source();
            fs.setDurableCommitHandler(async () => {});
            const abort = new AbortController();
            let entered!: () => void, release!: () => void;
            const started = new Promise<void>((resolve) => {
                entered = resolve;
            });
            const waiting = new Promise<void>((resolve) => {
                release = resolve;
            });
            let paused = false;
            const pause = async () => {
                if (!paused) {
                    paused = true;
                    entered();
                    await waiting;
                }
            };
            const base = MemoryFileSystem.prototype;
            const indexes = fs as unknown as {
                reindexLocalFile: (path: string, content: string) => Promise<void>;
            };
            const originalRead = base.readDirectory,
                originalWrite = base.writeFile,
                originalIndex = indexes.reindexLocalFile;
            const spy =
                boundary === 'read'
                    ? spyOn(base, 'readDirectory').mockImplementation(async function (
                          this: MemoryFileSystem,
                          path,
                      ) {
                          await pause();
                          return originalRead.call(this, path);
                      })
                    : boundary === 'write'
                      ? spyOn(base, 'writeFile').mockImplementation(async function (
                            this: MemoryFileSystem,
                            path,
                            content,
                        ) {
                            await pause();
                            return originalWrite.call(this, path, content);
                        })
                      : spyOn(indexes, 'reindexLocalFile').mockImplementation(async function (
                            this: typeof indexes,
                            path,
                            content,
                        ) {
                            await pause();
                            return originalIndex.call(this, path, content);
                        });
            try {
                const stale =
                    'export default function Page() { return <h1 data-oid="stale-title">Stale</h1>; }';
                const hydration = fs
                    .hydrateDurableSnapshot(
                        [
                            { path: 'app/page.tsx', content: stale },
                            { path: 'zz-never.txt', content: 'Later file' },
                        ],
                        abort.signal,
                    )
                    .catch((error: unknown) => error);
                await started;
                abort.abort(new Error('Session changed'));
                release();
                expect(await hydration).toMatchObject({ message: 'Session changed' });
                // The admitted directory read recursively lists its own children.
                if (boundary === 'read') {
                    expect(spy.mock.calls.filter((call) => call[0] === '/')).toHaveLength(1);
                    expect(await fs.readFile('app/page.tsx')).toBe(page('Before'));
                    expect(await fs.fileExists('public/image.bin')).toBe(true);
                } else expect(spy).toHaveBeenCalledTimes(1);
                expect(await fs.getJsxElementMetadata('stale-title')).toBeUndefined();
                await expect(fs.writeFile('notes.txt', 'Unsafe until reloaded')).rejects.toThrow(
                    'not ready',
                );
                spy.mockRestore();
                await fs.hydrateDurableSnapshot([
                    { path: 'app/page.tsx', content: page('Current session') },
                ]);
                expect(await fs.readFile('app/page.tsx')).toBe(page('Current session'));
                expect(await fs.fileExists('zz-never.txt')).toBe(false);
                await fs.writeFile('notes.txt', 'Current');
            } finally {
                release();
                spy.mockRestore();
                await fs.cleanup();
            }
        },
    );

    it('preserves raw multi-file bytes when later parser preparation fails, without sending', async () => {
        const fs = await source();
        const raw = 'export const New = () => <p>Uninstrumented</p>;';
        const binary = new Uint8Array([0, 7, 255]);
        let captured: DurableSourceChange[] = [];
        let preserved = false;
        fs.setDurableRecoveryHandler((changes) => {
            captured = changes;
            return async () => {
                preserved = true;
            };
        });
        const commit = mock(async () => {});
        fs.setDurableCommitHandler(commit);
        const parser = spyOn(
            fs as unknown as { processJsxFile: (path: string, content: string) => Promise<string> },
            'processJsxFile',
        );
        parser.mockImplementation(async (path, content) => {
            if (path === 'app/broken.tsx') throw new Error('Parser failed');
            return content + '\n// prepared mutation';
        });
        try {
            await expect(
                fs.writeFiles([
                    { path: 'app/new.tsx', content: raw },
                    { path: 'public/image.bin', content: binary },
                    { path: 'app/broken.tsx', content: '<broken' },
                ]),
            ).rejects.toThrow('Parser failed');
            binary[1] = 99;
            expect(captured).toEqual([
                { path: 'app/new.tsx', content: raw },
                { path: 'public/image.bin', content: new Uint8Array([0, 7, 255]) },
                { path: 'app/broken.tsx', content: '<broken' },
            ]);
            expect(preserved).toBe(true);
            expect(commit).not.toHaveBeenCalled();
            expect(await fs.readFile('app/page.tsx')).toBe(page('Before'));
        } finally {
            parser.mockRestore();
            await fs.cleanup();
        }
    });

    it('preserves the proposal when index loading fails before parsing', async () => {
        const fs = await source();
        let recovered: DurableSourceChange[] = [];
        fs.setDurableRecoveryHandler((changes) => async () => {
            recovered = changes;
        });
        const commit = mock(async () => {});
        fs.setDurableCommitHandler(commit);
        const index = spyOn(
            fs as unknown as { loadIndex: () => Promise<object> },
            'loadIndex',
        ).mockRejectedValue(new Error('Index unavailable'));
        try {
            await expect(fs.writeFile('notes.txt', 'Keep this')).rejects.toThrow(
                'Index unavailable',
            );
            expect(recovered).toEqual([{ path: 'notes.txt', content: 'Keep this' }]);
            expect(commit).not.toHaveBeenCalled();
        } finally {
            index.mockRestore();
            await fs.cleanup();
        }
    });

    it('hydrates exact source and binary data without remote echo or source instrumentation', async () => {
        const fs = await source();
        const commit = mock(async (_changes: DurableSourceChange[]) => {});
        fs.setDurableCommitHandler(commit);
        const raw = 'export const Title = () => <h1>Hello</h1>;';
        await fs.hydrateDurableSnapshot([
            { path: 'app/page.tsx', content: raw },
            { path: 'empty', content: null, directory: true },
        ]);
        expect(await fs.readFile('app/page.tsx')).toBe(raw);
        expect(await fs.fileExists('public/image.bin')).toBe(false);
        expect(commit).not.toHaveBeenCalled();
        expect((await fs.readDirectory('/')).some((entry) => entry.path === 'empty')).toBe(true);
    });

    it('keeps old bytes and metadata visible until one atomic commit acknowledges all files', async () => {
        const fs = await source();
        let release!: () => void;
        let entered!: () => void;
        const pending = new Promise<void>((resolve) => {
            release = resolve;
        });
        const started = new Promise<void>((resolve) => {
            entered = resolve;
        });
        const commit = mock(async (_changes: DurableSourceChange[]) => {
            entered();
            await pending;
        });
        fs.setDurableCommitHandler(commit);
        const writing = fs.writeFiles([
            { path: 'app/page.tsx', content: page('After') },
            { path: 'public/image.bin', content: new Uint8Array([0, 2, 255]) },
        ]);
        await started;
        expect(await fs.readFile('app/page.tsx')).toBe(page('Before'));
        expect((await fs.getJsxElementMetadata('title'))?.code).toContain('Before');
        expect(commit).toHaveBeenCalledTimes(1);
        const submitted = commit.mock.calls[0]![0];
        expect(submitted.find((change) => change.path === 'public/image.bin')?.content).toEqual(
            new Uint8Array([0, 2, 255]),
        );
        release();
        await writing;
        const submittedPage = submitted.find((change) => change.path === 'app/page.tsx')?.content;
        if (submittedPage === null || submittedPage === undefined)
            throw new Error('Expected submitted page bytes');
        expect(await fs.readFile('app/page.tsx')).toBe(submittedPage);
        expect((await fs.getJsxElementMetadata('title'))?.code).toContain('After');
    });

    it('a rejected transport save preserves all source and indexes without creating ephemeral recovery', async () => {
        const fs = await source();
        fs.setDurableCommitHandler(async () => {
            throw new Error('Revision conflict');
        });
        await expect(
            fs.writeFiles([
                { path: 'app/page.tsx', content: page('Attempt') },
                { path: 'public/image.bin', content: new Uint8Array([0, 7, 255]) },
            ]),
        ).rejects.toThrow('Revision conflict');
        expect(await fs.readFile('app/page.tsx')).toBe(page('Before'));
        expect(await fs.readFile('public/image.bin')).toEqual(new Uint8Array([0, 255, 8]));
        expect((await fs.getJsxElementMetadata('title'))?.code).toContain('Before');
        expect((await fs.listAll()).some((entry) => entry.path.includes('/recovery/'))).toBe(false);
    });

    it('persists final instrumented JSX, and keeps ordinary .weblab data durable', async () => {
        const fs = await source();
        const commit = mock(async (_changes: DurableSourceChange[]) => {});
        fs.setDurableCommitHandler(commit);
        await fs.createFile('app/new.tsx', 'export const New = () => <p>New</p>;');
        const persisted = commit.mock.calls[0]![0].find(
            (change) => change.path === 'app/new.tsx',
        )!.content;
        if (persisted === null) throw new Error('Expected newly created page bytes');
        expect(persisted).toContain('data-oid');
        expect(await fs.readFile('app/new.tsx')).toBe(persisted);
        await fs.writeFile('.weblab/interactions.json', '{"saved":true}');
        expect(
            commit.mock.calls[1]![0].some((change) => change.path === '.weblab/interactions.json'),
        ).toBe(true);
        await fs.writeFile('.weblab/cache/tmp.json', '{}');
        expect(commit).toHaveBeenCalledTimes(2);
    });

    it('commits empty directories and directory copy/move/delete atomically with binary bytes', async () => {
        const fs = await source();
        const commit = mock(async (_changes: DurableSourceChange[]) => {});
        fs.setDurableCommitHandler(commit);
        await fs.createDirectory('app/new-page');
        expect(commit.mock.calls[0]![0]).toContainEqual({
            path: 'app/new-page',
            content: null,
            directory: true,
        });
        await fs.copyDirectory('public', 'assets');
        expect(commit).toHaveBeenCalledTimes(2);
        expect(await fs.readFile('assets/image.bin')).toEqual(new Uint8Array([0, 255, 8]));
        await fs.moveDirectory('assets', 'media');
        expect(commit).toHaveBeenCalledTimes(3);
        expect(commit.mock.calls[2]![0]).toContainEqual({
            path: 'assets/image.bin',
            content: null,
        });
        expect(await fs.fileExists('assets/image.bin')).toBe(false);
        expect(await fs.readFile('media/image.bin')).toEqual(new Uint8Array([0, 255, 8]));
        await fs.deleteDirectory('media');
        expect(commit).toHaveBeenCalledTimes(4);
        expect(await fs.fileExists('media/image.bin')).toBe(false);
    });

    it('failed directory move has no partial source or index change', async () => {
        const fs = await source();
        fs.setDurableCommitHandler(async () => {
            throw new Error('Offline');
        });
        await expect(fs.moveDirectory('app', 'src/app')).rejects.toThrow('Offline');
        expect(await fs.readFile('app/page.tsx')).toBe(page('Before'));
        expect(await fs.fileExists('src/app/page.tsx')).toBe(false);
        expect((await fs.getJsxElementMetadata('title'))?.path).toBe('app/page.tsx');
    });

    it('file move/delete each commit once, keeping source identity across a move', async () => {
        const fs = await source();
        const commit = mock(async (_changes: DurableSourceChange[]) => {});
        fs.setDurableCommitHandler(commit);
        await fs.moveFile('app/page.tsx', 'app/moved.tsx');
        expect(commit).toHaveBeenCalledTimes(1);
        expect(await fs.readFile('app/moved.tsx')).toBe(page('Before'));
        expect((await fs.getJsxElementMetadata('title'))?.path).toBe('app/moved.tsx');
        await fs.deleteFile('app/moved.tsx');
        expect(commit).toHaveBeenCalledTimes(2);
        expect(await fs.fileExists('app/moved.tsx')).toBe(false);
    });

    it('distinguishes a durable save from failed cache refresh and blocks edits until hydration', async () => {
        const fs = await source();
        const commit = mock(async (_changes: DurableSourceChange[]) => {});
        const cacheError = mock((_error: Error) => {});
        fs.setDurableCommitHandler(commit);
        fs.setDurableCacheErrorHandler(cacheError);
        const originalWrite = FileSystem.prototype.writeFile;
        const write = spyOn(FileSystem.prototype, 'writeFile').mockImplementation(async function (
            this: InstanceType<typeof FileSystem>,
            path: string,
            content: string | Uint8Array,
        ) {
            if (path === 'public/image.bin') throw new Error('Cache quota');
            return originalWrite.call(this, path, content);
        });
        try {
            const failure = await fs
                .writeFile('public/image.bin', new Uint8Array([0, 9]))
                .catch((error: unknown) => error);
            expect(failure).toMatchObject({ committed: true, name: 'DurableCacheError' });
            expect(cacheError).toHaveBeenCalledTimes(1);
            if (!(failure instanceof Error))
                throw new Error('Expected cache failure to be an Error');
            expect(cacheError.mock.calls[0]![0]).toBe(failure);
            await expect(fs.writeFile('note.txt', 'Later')).rejects.toThrow('Reload');
            expect(commit).toHaveBeenCalledTimes(1);
        } finally {
            write.mockRestore();
        }
        await fs.hydrateDurableSnapshot([
            { path: 'public/image.bin', content: new Uint8Array([0, 9]) },
        ]);
        await fs.writeFile('note.txt', 'Later');
        expect(commit).toHaveBeenCalledTimes(2);
    });

    for (const kind of ['file', 'directory'] as const) {
        it(`gives a copied JSX ${kind} its own IDs before saving and after hydration`, async () => {
            const project = `copy-${kind}-${Math.random().toString(36).slice(2)}`;
            const fs = await source(project);
            fs.setDurableCommitHandler(async () => {});
            const copyPath = kind === 'file' ? 'app/copied.tsx' : 'copied/page.tsx';
            if (kind === 'file') await fs.copyFile('app/page.tsx', copyPath);
            else await fs.copyDirectory('app', 'copied');
            const copied = await fs.readFile(copyPath);
            if (typeof copied !== 'string') throw new Error('Expected JSX source');
            const ids = [...copied.matchAll(/data-oid="([^"]+)"/g)].map((match) => match[1]!);
            expect(ids).toHaveLength(2);
            expect(ids).not.toContain('title');
            expect(ids).not.toContain('main');
            expect(await fs.readFile('app/page.tsx')).toBe(page('Before'));
            expect((await fs.getJsxElementMetadata('title'))?.path).toBe('app/page.tsx');
            for (const id of ids) expect((await fs.getJsxElementMetadata(id))?.path).toBe(copyPath);
            await fs.cleanup();
            const reopened = new CodeFileSystem(project, 'main', { durableCloud: true });
            await reopened.initialize();
            reopened.setDurableRecoveryHandler(() => async () => {});
            await reopened.hydrateDurableSnapshot([
                { path: 'app/page.tsx', content: page('Before') },
                { path: copyPath, content: copied },
            ]);
            expect((await reopened.getJsxElementMetadata('title'))?.path).toBe('app/page.tsx');
            for (const id of ids)
                expect((await reopened.getJsxElementMetadata(id))?.path).toBe(copyPath);
            await reopened.cleanup();
        });
    }

    it('copies over an existing JSX file with fresh IDs and preserves its bytes and indexes on rejection', async () => {
        const fs = await source();
        const target =
            'export default function Target() { return <h1 data-oid="existing-title">Existing</h1>; }';
        await fs.hydrateDurableSnapshot([
            { path: 'app/page.tsx', content: page('Before') },
            { path: 'app/target.tsx', content: target },
        ]);
        const rejected = mock(async (_changes: DurableSourceChange[]) => {
            throw new Error('Persistence rejected');
        });
        fs.setDurableCommitHandler(rejected);
        await expect(
            fs.copyFile('app/page.tsx', 'app/target.tsx', { overwrite: true }),
        ).rejects.toThrow('Persistence rejected');
        expect(rejected).toHaveBeenCalledTimes(1);
        expect(await fs.readFile('app/target.tsx')).toBe(target);
        expect((await fs.getJsxElementMetadata('existing-title'))?.path).toBe('app/target.tsx');
        expect((await fs.getJsxElementMetadata('title'))?.path).toBe('app/page.tsx');

        const accepted = mock(async (_changes: DurableSourceChange[]) => {});
        fs.setDurableCommitHandler(accepted);
        await fs.copyFile('app/page.tsx', 'app/target.tsx', { overwrite: true });
        expect(accepted).toHaveBeenCalledTimes(1);
        expect(accepted.mock.calls[0]![0]).toHaveLength(1);
        const copied = await fs.readFile('app/target.tsx');
        if (typeof copied !== 'string') throw new Error('Expected JSX source');
        const ids = [...copied.matchAll(/data-oid="([^"]+)"/g)].map((match) => match[1]!);
        expect(ids).toHaveLength(2);
        expect(ids).not.toContain('title');
        expect(ids).not.toContain('main');
        expect(ids).not.toContain('existing-title');
        expect(await fs.getJsxElementMetadata('existing-title')).toBeUndefined();
        expect(await fs.readFile('app/page.tsx')).toBe(page('Before'));
        expect((await fs.getJsxElementMetadata('title'))?.path).toBe('app/page.tsx');
        for (const id of ids)
            expect((await fs.getJsxElementMetadata(id))?.path).toBe('app/target.tsx');
        await fs.cleanup();
    });

    it.each([false, true])(
        'repairs duplicate IDs with either hydration order (source first: %s)',
        async (sourceFirst) => {
            const fs = await source();
            const files = [
                { path: 'app/target.tsx', content: page('Before') },
                { path: 'app/page.tsx', content: page('Before') },
            ];
            await fs.hydrateDurableSnapshot(sourceFirst ? files.toReversed() : files);
            const commit = mock(async (_changes: DurableSourceChange[]) => {});
            fs.setDurableCommitHandler(commit);
            await fs.copyFile('app/page.tsx', 'app/target.tsx', { overwrite: true });
            expect(commit).toHaveBeenCalledTimes(1);
            const copied = await fs.readFile('app/target.tsx');
            expect(copied).not.toContain('data-oid="title"');
            expect(copied).not.toContain('data-oid="main"');
            expect(await fs.readFile('app/page.tsx')).toBe(page('Before'));
            expect((await fs.getJsxElementMetadata('title'))?.path).toBe('app/page.tsx');
            await fs.cleanup();
        },
    );

    it('fences a delayed acknowledgement across cleanup and reopening the same source scope', async () => {
        const project = `reopen-${Math.random().toString(36).slice(2)}`;
        const first = await source(project);
        let acknowledge!: () => void;
        let entered!: () => void;
        const pending = new Promise<void>((resolve) => {
            acknowledge = resolve;
        });
        const started = new Promise<void>((resolve) => {
            entered = resolve;
        });
        const committed = mock(async (_changes: DurableSourceChange[]) => {
            entered();
            await pending;
        });
        first.setDurableCommitHandler(committed);
        const writing = first
            .writeFile('app/page.tsx', page('Old accepted write'))
            .catch((error: unknown) => error);
        await started;
        const closing = first.cleanup();
        await expect(first.writeFile('after-close.txt', 'No')).rejects.toThrow('closed');

        const reopened = new CodeFileSystem(project, 'main', { durableCloud: true });
        await reopened.initialize();
        reopened.setDurableRecoveryHandler(() => async () => {});
        reopened.setDurableCommitHandler(async () => {});
        let hydrated = false;
        const hydration = reopened
            .hydrateDurableSnapshot([{ path: 'app/page.tsx', content: page('Newest revision') }])
            .then(() => {
                hydrated = true;
            });
        await Promise.resolve();
        expect(hydrated).toBe(false);
        acknowledge();
        expect(await writing).toMatchObject({ committed: true, name: 'DurableCacheError' });
        await closing;
        await hydration;
        expect(committed).toHaveBeenCalledTimes(1);
        expect(await reopened.readFile('app/page.tsx')).toBe(page('Newest revision'));
        expect((await reopened.getJsxElementMetadata('title'))?.code).toContain('Newest revision');
        await reopened.cleanup();
    });

    it('keeps runtime scripts local when saving a durable Next layout', async () => {
        const fs = await source();
        const commit = mock(async (_changes: DurableSourceChange[]) => {});
        fs.setDurableCommitHandler(commit);
        await fs.writeFile(
            'app/layout.tsx',
            `export default function Layout({children}) {
            return <html><body>{children}<script src="/weblab-preload-script.js"/><script src="/weblab-ix-runtime.js"/></body></html>;
        }`,
        );
        const written = commit.mock.calls[0]![0].find(
            (change) => change.path === 'app/layout.tsx',
        )!.content;
        expect(written).toContain('/weblab-preload-script.js');
        expect(written).toContain('/weblab-ix-runtime.js');
        expect(written).not.toContain('https://');
    });

    it('rejects invalid paths, overlapping moves and overwrites before calling remote', async () => {
        const fs = await source();
        const commit = mock(async (_changes: DurableSourceChange[]) => {});
        fs.setDurableCommitHandler(commit);
        await expect(fs.writeFile('../escape', 'x')).rejects.toThrow('Invalid');
        await expect(fs.moveDirectory('app', 'app/nested')).rejects.toThrow('overlap');
        await expect(fs.copyFile('app/page.tsx', 'public/image.bin')).rejects.toThrow('exists');
        expect(commit).not.toHaveBeenCalled();
    });
});
