import type { ReaddirEntry } from '@codesandbox/sdk';
import { RouterType } from '@weblab/models';
import { describe, expect, mock, test } from 'bun:test';
import {
    extractSchemaMarkupFromContent,
    scanAppDirectory,
    updatePageMetadataInSandbox,
    updatePageSchemaMarkupInSandbox,
} from '../../src/components/store/editor/pages/helper';

interface MockSandboxManager {
    readDir: (dir: string) => Promise<ReaddirEntry[]>;
    readFile: (path: string) => Promise<string | Uint8Array>;
    writeFile?: (path: string, content: string | Uint8Array) => Promise<void>;
    fileExists?: (path: string) => Promise<boolean>;
    getRouterConfig?: () => Promise<{ type: RouterType; basePath: string } | null>;
    routerConfig: { type: RouterType; basePath: string } | null;
}

const pageFile = { name: 'page.tsx', type: 'file', isSymlink: false, isDirectory: false };

describe('scanAppDirectory', () => {
    test('renders Home as a root-level sibling of top-level pages and folders', async () => {
        const mockSandboxManager: MockSandboxManager = {
            readDir: mock((dir: string) => {
                switch (dir) {
                    case 'app':
                        return Promise.resolve([
                            pageFile,
                            { name: 'about', type: 'directory', isSymlink: false, isDirectory: true },
                            { name: 'blog', type: 'directory', isSymlink: false, isDirectory: true },
                        ]);
                    case 'app/about':
                        return Promise.resolve([pageFile]);
                    case 'app/blog':
                        return Promise.resolve([
                            pageFile,
                            { name: 'post', type: 'directory', isSymlink: false, isDirectory: true },
                        ]);
                    case 'app/blog/post':
                        return Promise.resolve([pageFile]);
                    default:
                        return Promise.resolve([]);
                }
            }),
            readFile: mock(() =>
                Promise.resolve('export default function Page() { return <div>Test</div>; }'),
            ),
            routerConfig: { type: RouterType.APP, basePath: 'app' },
        };

        const result = await scanAppDirectory(mockSandboxManager as any, 'app');

        expect(result).toHaveLength(3);
        expect(result[0]).toMatchObject({
            kind: 'page',
            name: 'Home',
            path: '/',
        });
        expect(result[1]).toMatchObject({
            kind: 'page',
            name: 'about',
            path: '/about',
        });
        expect(result[2]).toMatchObject({
            kind: 'folder',
            name: 'blog',
            path: '/blog',
        });
        expect(result[2]?.children).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ kind: 'page', path: '/blog' }),
                expect.objectContaining({ kind: 'page', path: '/blog/post' }),
            ]),
        );
    });

    test('keeps empty route folders in the tree', async () => {
        const mockSandboxManager: MockSandboxManager = {
            readDir: mock((dir: string) => {
                switch (dir) {
                    case 'app':
                        return Promise.resolve([
                            pageFile,
                            { name: 'docs', type: 'directory', isSymlink: false, isDirectory: true },
                        ]);
                    case 'app/docs':
                        return Promise.resolve([]);
                    default:
                        return Promise.resolve([]);
                }
            }),
            readFile: mock(() =>
                Promise.resolve('export default function Page() { return <div>Test</div>; }'),
            ),
            routerConfig: { type: RouterType.APP, basePath: 'app' },
        };

        const result = await scanAppDirectory(mockSandboxManager as any, 'app');

        expect(result).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ kind: 'page', path: '/' }),
                expect.objectContaining({ kind: 'folder', path: '/docs' }),
            ]),
        );
    });
});

describe('updatePageMetadataInSandbox', () => {
    test('writes robots boolean metadata for search indexing', async () => {
        let writtenPath = '';
        let writtenContent = '';

        const mockSandboxManager: MockSandboxManager = {
            readDir: mock(() => Promise.resolve([])),
            readFile: mock((path: string) => {
                if (path === 'app/page.tsx') {
                    return Promise.resolve('export default function Page() { return <div>Test</div>; }');
                }
                throw new Error(`Unexpected read: ${path}`);
            }),
            writeFile: mock((path: string, content: string | Uint8Array) => {
                writtenPath = path;
                writtenContent = typeof content === 'string' ? content : Buffer.from(content).toString('utf8');
                return Promise.resolve();
            }),
            fileExists: mock((path: string) => Promise.resolve(path === 'app/page.tsx')),
            getRouterConfig: mock(() => Promise.resolve({ type: RouterType.APP, basePath: 'app' })),
            routerConfig: { type: RouterType.APP, basePath: 'app' },
        };

        await updatePageMetadataInSandbox(mockSandboxManager as any, '/', {
            title: 'Home',
            robots: {
                index: false,
                follow: true,
            },
        });

        expect(writtenPath).toBe('app/page.tsx');
        expect(writtenContent).toContain('robots');
        expect(writtenContent).toContain('index: false');
        expect(writtenContent).toContain('follow: true');
    });

    test('writes alternates.canonical for canonical URL', async () => {
        let writtenContent = '';

        const mockSandboxManager: MockSandboxManager = {
            readDir: mock(() => Promise.resolve([])),
            readFile: mock((path: string) => {
                if (path === 'app/page.tsx') {
                    return Promise.resolve(
                        'export default function Page() { return <div>Test</div>; }',
                    );
                }
                throw new Error(`Unexpected read: ${path}`);
            }),
            writeFile: mock((_path: string, content: string | Uint8Array) => {
                writtenContent =
                    typeof content === 'string' ? content : Buffer.from(content).toString('utf8');
                return Promise.resolve();
            }),
            fileExists: mock((path: string) => Promise.resolve(path === 'app/page.tsx')),
            getRouterConfig: mock(() =>
                Promise.resolve({ type: RouterType.APP, basePath: 'app' }),
            ),
            routerConfig: { type: RouterType.APP, basePath: 'app' },
        };

        await updatePageMetadataInSandbox(mockSandboxManager as any, '/', {
            title: 'Home',
            alternates: {
                canonical: 'https://example.com/',
            },
        });

        expect(writtenContent).toContain('alternates');
        expect(writtenContent).toContain('canonical:');
        expect(writtenContent).toContain('https://example.com/');
    });
});

describe('updatePageSchemaMarkupInSandbox', () => {
    const initialPageContent = `export default function Page() {\n  return <main>Hello</main>;\n}\n`;

    const buildMockSandbox = (
        initial: string,
    ): { sandbox: MockSandboxManager; getWritten: () => string } => {
        let current = initial;
        return {
            getWritten: () => current,
            sandbox: {
                readDir: mock(() => Promise.resolve([])),
                readFile: mock((path: string) => {
                    if (path === 'app/page.tsx') {
                        return Promise.resolve(current);
                    }
                    throw new Error(`Unexpected read: ${path}`);
                }),
                writeFile: mock((path: string, content: string | Uint8Array) => {
                    if (path !== 'app/page.tsx') {
                        throw new Error(`Unexpected write: ${path}`);
                    }
                    current =
                        typeof content === 'string'
                            ? content
                            : Buffer.from(content).toString('utf8');
                    return Promise.resolve();
                }),
                fileExists: mock((path: string) => Promise.resolve(path === 'app/page.tsx')),
                getRouterConfig: mock(() =>
                    Promise.resolve({ type: RouterType.APP, basePath: 'app' }),
                ),
                routerConfig: { type: RouterType.APP, basePath: 'app' },
            },
        };
    };

    test('round-trips JSON-LD as <script type="application/ld+json"> in the page JSX', async () => {
        const json = '{"@context":"https://schema.org","@type":"WebPage","name":"About"}';
        const { sandbox, getWritten } = buildMockSandbox(initialPageContent);

        await updatePageSchemaMarkupInSandbox(sandbox as any, '/', json);

        const written = getWritten();
        expect(written).toContain('type="application/ld+json"');
        expect(written).toContain('dangerouslySetInnerHTML');
        expect(written).toContain('@context');

        const extracted = await extractSchemaMarkupFromContent(written);
        expect(extracted).toBe(json);
    });

    test('removes the script when passed an empty string', async () => {
        const json = '{"@type":"WebPage"}';
        const { sandbox, getWritten } = buildMockSandbox(initialPageContent);

        await updatePageSchemaMarkupInSandbox(sandbox as any, '/', json);
        expect(getWritten()).toContain('application/ld+json');

        await updatePageSchemaMarkupInSandbox(sandbox as any, '/', '');
        const cleared = getWritten();
        expect(cleared).not.toContain('application/ld+json');
        expect(await extractSchemaMarkupFromContent(cleared)).toBeUndefined();
    });

    test('replaces an existing JSON-LD script without duplicating it', async () => {
        const first = '{"@type":"WebPage","name":"first"}';
        const second = '{"@type":"WebPage","name":"second"}';
        const { sandbox, getWritten } = buildMockSandbox(initialPageContent);

        await updatePageSchemaMarkupInSandbox(sandbox as any, '/', first);
        await updatePageSchemaMarkupInSandbox(sandbox as any, '/', second);
        const written = getWritten();

        // Exactly one ld+json script should remain.
        const occurrences = written.split('application/ld+json').length - 1;
        expect(occurrences).toBe(1);
        expect(written).toContain('second');
        expect(written).not.toContain('first');
    });
});
