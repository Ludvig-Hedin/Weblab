import type { ReaddirEntry } from '@codesandbox/sdk';
import { RouterType } from '@weblab/models';
import { describe, expect, mock, test } from 'bun:test';
import { scanAppDirectory, updatePageMetadataInSandbox } from '../../src/components/store/editor/pages/helper';

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
});
