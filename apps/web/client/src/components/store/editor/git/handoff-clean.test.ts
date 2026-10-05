import { describe, expect, test } from 'bun:test';

import type { T } from '@weblab/parser';
import { WEBLAB_DEV_PRELOAD_SCRIPT_PATH } from '@weblab/constants';
import {
    addOidsToAst,
    getAstFromContent,
    getContentFromAst,
    injectWeblabBootstrapScripts,
    t,
    traverse,
} from '@weblab/parser';

import { cleanHandoffFiles } from './handoff-clean';

const PAGE = `import Link from 'next/link'

export default function Home() {
    return (
        <main className='min-h-screen   bg-white'>
            <h1 className="text-xl font-bold">
                Hello world
            </h1>
            <p className="text-gray-600">Welcome</p>
            <Link href='/about'>About</Link>
        </main>
    )
}
`;

const LAYOUT = `import './globals.css'

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body className="antialiased">{children}</body>
        </html>
    )
}
`;

/** Mimics local preparation plus an editor write: oids + Babel reprint. */
async function prepare(source: string, edit?: (ast: T.File) => void, layout = false): Promise<string> {
    const ast = getAstFromContent(source)!;
    if (layout) injectWeblabBootstrapScripts(ast);
    addOidsToAst(ast, new Set());
    edit?.(ast);
    return getContentFromAst(ast, source);
}

function setClassName(tag: string, value: string) {
    return (ast: T.File) => {
        traverse(ast, {
            JSXOpeningElement(path) {
                if (!t.isJSXIdentifier(path.node.name, { name: tag })) return;
                for (const attr of path.node.attributes) {
                    if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name, { name: 'className' })) {
                        attr.value = t.stringLiteral(value);
                    }
                }
            },
        });
    };
}

describe('clean Git handoff', () => {
    test('a className edit changes only that attribute in the original source', async () => {
        const updated = await prepare(PAGE, setClassName('h1', 'text-2xl font-bold lg:text-4xl'));
        expect(updated).toContain('data-oid');
        const [file] = cleanHandoffFiles([{ path: 'app/page.tsx', original: PAGE, updated }]);
        expect(file?.reformatted).toBe(false);
        expect(file?.updated).toBe(
            PAGE.replace('className="text-xl font-bold"', 'className="text-2xl font-bold lg:text-4xl"'),
        );
    });

    test('a text edit keeps the surrounding indentation', async () => {
        const updated = await prepare(PAGE, (ast) => {
            traverse(ast, {
                JSXText(path) {
                    if (path.node.value.includes('Hello world')) {
                        // Fresh node, as the editor's text write does: no stale extra.raw.
                        path.replaceWith(t.jsxText('Hello designers'));
                        path.skip();
                    }
                },
            });
        });
        const [file] = cleanHandoffFiles([{ path: 'app/page.tsx', original: PAGE, updated }]);
        expect(file?.reformatted).toBe(false);
        expect(file?.updated).toBe(PAGE.replace('Hello world', 'Hello designers'));
    });

    test('preparation-only changes and editor assets are not handed off', async () => {
        const layout = await prepare(LAYOUT, undefined, true);
        const page = await prepare(PAGE);
        expect(layout).toContain('weblab-preload-script');
        const files = cleanHandoffFiles([
            { path: 'app/layout.tsx', original: LAYOUT, updated: layout },
            { path: 'app/page.tsx', original: PAGE, updated: page },
            { path: WEBLAB_DEV_PRELOAD_SCRIPT_PATH, original: null, updated: 'console.log(1)' },
        ]);
        expect(files).toEqual([]);
    });

    test('a structure change falls back to cleaned source without editor traces', async () => {
        const updated = await prepare(PAGE, (ast) => {
            traverse(ast, {
                JSXElement(path) {
                    if (t.isJSXIdentifier(path.node.openingElement.name, { name: 'main' })) {
                        path.node.children.push(
                            t.jsxElement(
                                t.jsxOpeningElement(t.jsxIdentifier('footer'), []),
                                t.jsxClosingElement(t.jsxIdentifier('footer')),
                                [t.jsxText('New')],
                            ),
                        );
                    }
                },
            });
        });
        const [file] = cleanHandoffFiles([{ path: 'app/page.tsx', original: PAGE, updated }]);
        expect(file?.reformatted).toBe(true);
        expect(file?.updated).toContain('<footer>New</footer>');
        expect(file?.updated).not.toContain('data-oid');
    });
});
