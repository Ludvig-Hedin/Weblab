import { describe, expect, it, mock } from 'bun:test';

// ZenFS cannot load under bun test, so back the base class with a Map.
mock.module('./fs', () => ({
    FileSystem: class {
        private files = new Map<string, string | Uint8Array>();
        protected get initialized() {
            return true;
        }
        async initialize() {}
        private key(path: string) {
            return path.replace(/^\/+/, '');
        }
        async writeFile(path: string, content: string | Uint8Array) {
            this.files.set(this.key(path), content);
        }
        async readFile(path: string) {
            const content = this.files.get(this.key(path));
            if (content === undefined) throw new Error(`ENOENT ${path}`);
            return content;
        }
        async fileExists(path: string) {
            return this.files.has(this.key(path));
        }
        async deleteFile(path: string) {
            this.files.delete(this.key(path));
        }
        async createDirectory() {}
        async listAll() {
            return [...this.files.keys()].map((path) => ({ path: `/${path}`, type: 'file' }));
        }
    },
}));

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
