import { describe, expect, it, mock, spyOn } from 'bun:test';

import { MemoryFileSystem } from './test-memory-fs';

// ZenFS cannot load under Bun. Both filesystem test files share this exact
// constructor because Bun caches CodeFileSystem across module mock updates.
mock.module('./fs', () => ({ FileSystem: MemoryFileSystem }));

const { CodeFileSystem } = await import('./code-fs');

const page = (text: string) =>
    `export default function Page() {\n    return <main data-oid="main"><h1 data-oid="title">${text}</h1></main>;\n}\n`;
const other = `export function Card() {\n    return <div data-oid="card">Card</div>;\n}\n`;

async function localFs() {
    const fs = new CodeFileSystem(`p-${Math.random().toString(36).slice(2)}`, 'b', {
        localProject: true,
    });
    await fs.initialize();
    fs.setLocalWriteHandler(async () => undefined);
    await fs.replaceLocalSnapshot([
        { path: 'app/page.tsx', content: page('Hello') },
        { path: 'components/card.tsx', content: other },
    ]);
    return fs;
}

describe('local project index', () => {
    it('re-indexes only the saved file and keeps other files indexed', async () => {
        const fs = await localFs();
        await fs.writeFile('app/page.tsx', page('Changed'));

        expect((await fs.getJsxElementMetadata('title'))?.code).toContain('Changed');
        expect((await fs.getJsxElementMetadata('card'))?.path).toContain('components/card.tsx');
    });

    it('drops a removed file and an unparsable file from the index', async () => {
        const fs = await localFs();
        await fs.removeLocalFile('components/card.tsx');
        await fs.replaceLocalFile('app/page.tsx', 'export default function Page() { return <main');

        expect(await fs.getJsxElementMetadata('card')).toBeUndefined();
        expect(await fs.getJsxElementMetadata('title')).toBeUndefined();
    });
});

it('retains a disk write receipt when the local mirror fails, then recovers after refresh', async () => {
    const fs = await localFs();
    const diff = { path: 'app/page.tsx', original: page('Hello'), generated: page('Edited') };
    const diskWrite = mock(async () => undefined);
    fs.setLocalWriteHandler(diskWrite);
    const mirror = spyOn(MemoryFileSystem.prototype, 'writeFile').mockRejectedValueOnce(new Error('Mirror is full'));
    try {
        expect(await fs.writeExactStyleDiffs([diff])).toEqual({ diffs: [diff], needsReload: true });
        await expect(fs.writeExactStyleDiffs([diff])).rejects.toThrow('Reload');
        expect(diskWrite).toHaveBeenCalledTimes(1);
        await fs.replaceLocalFile(diff.path, diff.generated);
        await fs.writeExactStyleDiffs([{ ...diff, original: diff.generated, generated: diff.original }]);
        expect(await fs.readFile(diff.path)).toBe(diff.original);
    } finally { mirror.mockRestore(); await fs.cleanup(); }
});
