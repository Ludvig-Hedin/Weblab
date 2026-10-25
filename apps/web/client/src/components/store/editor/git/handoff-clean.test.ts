import { describe, expect, test } from 'bun:test';

import type { T } from '@weblab/parser';
import { WEBLAB_DEV_PRELOAD_SCRIPT_PATH } from '@weblab/constants';
import {
    addOidsToAst,
    getAstFromContent,
    getContentFromAst,
    getRenderedJsxText,
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

const NESTED = `export default function Page() {
    return (
        <main className="old">
            {items.map(item => (
                <section key={item.id}>
                    <Card
                        label={item.label}
                    />
                </section>
            ))}
            {enabled ? (
                <>
                    <Widget icon={
                        <span>
                            Icon
                        </span>
                    } />
                </>
            ) : null}
        </main>
    )
}
`;

function renderedText(source: string): string[] {
    const values: string[] = [];
    traverse(getAstFromContent(source)!, {
        JSXText(path) {
            const value = getRenderedJsxText(path.node.value);
            if (value !== '') values.push(value);
        },
    });
    return values;
}

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

    test('bootstrap import insertion preserves a comment before root metadata', async () => {
        const original = LAYOUT.replace('export default function', '/** Root metadata stays private. */\nexport const metadata = { title: "Page" }\n\nexport default function');
        const updated = await prepare(original, undefined, true);
        expect(cleanHandoffFiles([{ path: 'app/layout.tsx', original, updated }])).toEqual([]);
    });

    test('JSX block comment indentation is preparation, while changed comment content survives', async () => {
        const original = `const Page = () => (
    <main>
        {/*
          * Keep the label visible.
          * Keep its description below.
          */}
        <h1>Title</h1>
    </main>
);
`;
        expect(cleanHandoffFiles([{ path: 'page.tsx', original, updated: await prepare(original) }])).toEqual([]);
        const changed = original.replace('Keep the label visible.', 'Change the label content.');
        const [file] = cleanHandoffFiles([{ path: 'page.tsx', original, updated: await prepare(changed) }]);
        expect(file?.updated).toContain('Change the label content.');
        expect(file?.updated).not.toContain('data-oid');
    });

    test('preparation inside maps, conditionals, fragments and JSX props produces no patch', async () => {
        const updated = await prepare(NESTED);
        expect(cleanHandoffFiles([{ path: 'page.tsx', original: NESTED, updated }])).toEqual([]);
    });

    test('blank JSX lines inside an expression are not replayed as designer edits', () => {
        const original = 'const Page = () => <main>{items.map(item => <div>\n    <Card />\n</div>)}</main>;';
        const updated = 'const Page = () => <main data-oid="main">{items.map(item => <div data-oid="row">\n    <Card data-oid="card" />\n    \n</div>)}</main>;';
        expect(cleanHandoffFiles([{ path: 'page.tsx', original, updated }])).toEqual([]);
    });

    test('a real class edit alongside nested preparation preserves the original formatting', async () => {
        const updated = await prepare(NESTED, setClassName('main', 'new'));
        const [file] = cleanHandoffFiles([{ path: 'page.tsx', original: NESTED, updated }]);
        expect(file?.reformatted).toBe(false);
        expect(file?.updated).toBe(NESTED.replace('className="old"', 'className="new"'));
    });

    const CODE = `// Keep this comment
import Link from 'next/link'
const label = 'Hello';
const onClick = () => 1;
export default function Page() { return <><main onClick={onClick}>{label}</main>Tail</> }
`;
    test.each([
        ['constant', "'Hello'", "'Welcome'"],
        ['import', "'next/link'", "'other/link'"],
        ['handler', '() => 1', '() => 2'],
        ['fragment text', 'Tail', 'Changed tail'],
        ['comment', 'Keep this comment', 'Keep the changed comment'],
    ])('%s edits survive when element attributes and children are unchanged', async (_kind, before, after) => {
        const updated = await prepare(CODE.replace(before, after));
        const [file] = cleanHandoffFiles([{ path: 'page.tsx', original: CODE, updated }]);
        expect(file?.reformatted).toBe(true);
        expect(file?.updated).toContain(after);
        expect(file?.updated).not.toContain('data-oid');
    });

    test.each([
        ['<p>Hello <strong>world</strong> tail</p>', '<p>Hello<strong>world</strong> tail</p>'],
        ['<p>Hello <strong>world</strong> tail</p>', '<p>Hello <strong>world</strong>tail</p>'],
        ['<p><b>A</b> <b>B</b></p>', '<p><b>A</b><b>B</b></p>'],
        ['<p>Hello <strong>world</strong></p>', '<p>Goodbye <strong>world</strong></p>'],
    ])('preserves meaningful inline spaces: %s', async (before, after) => {
        const original = `const Page = () => ${before};`;
        const changed = `const Page = () => ${after};`;
        const updated = await prepare(changed);
        const [file] = cleanHandoffFiles([{ path: 'page.tsx', original, updated }]);
        expect(file).toBeDefined();
        expect(renderedText(file!.updated!)).toEqual(renderedText(changed));
        expect(file?.updated).not.toContain('data-oid');
        if (after.includes('Goodbye')) expect(file?.updated).toBe(changed);
    });

    test('encoded angle brackets, ampersands and braces remain text during preparation and replay', async () => {
        const encoded = '&lt;tag&gt; &amp; &#123;value&#125;';
        const original = 'const Page = () => <p>Old</p>;';
        const changed = original.replace('Old', encoded);
        expect(cleanHandoffFiles([{ path: 'page.tsx', original: changed, updated: await prepare(changed) }])).toEqual([]);
        const [file] = cleanHandoffFiles([{ path: 'page.tsx', original, updated: await prepare(changed) }]);
        expect(file?.reformatted).toBe(false);
        expect(file?.updated).toBe(changed);
        expect(renderedText(file!.updated!)).toEqual(['<tag> & {value}']);
    });

    test.each([
        ['&lt;span /&gt;', '<span />'],
        ['&#123;name&#125;', '{name}'],
    ])('keeps the difference between literal text and JSX syntax: %s', async (before, after) => {
        const original = `const Page = () => <p>${before}</p>;`;
        const changed = original.replace(before, after);
        const [file] = cleanHandoffFiles([{ path: 'page.tsx', original, updated: await prepare(changed) }]);
        expect(file).toBeDefined();
        expect(file?.updated).toContain(after);
        expect(renderedText(file!.updated!)).toEqual([]);
        expect(file?.updated).not.toContain('data-oid');
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


describe('aliased bootstrap cleanup', () => {
    test('removes injected aliased scripts while retaining the authored import and bytes', () => {
        const original = `import NextScript from 'next/script';
export default function Layout({ children }) { return <html><body>{children}</body></html>; }`;
        const updated = original.replace('<html>', '<html data-oid="root">').replace('{children}</body>', `{children}<NextScript src="/weblab-preload-script.js" id="weblab-preload-script" /><NextScript src="/weblab-ix-runtime.js" id="weblab-ix-runtime" /></body>`);
        expect(cleanHandoffFiles([{ path: 'app/layout.tsx', original, updated }])).toEqual([]);
    });

    test('preserves a foreign component with a reserved ID', () => {
        const original = `import Script from './customer-script';
export default function Page() { return <Script id="weblab-preload-script" />; }`;
        const updated = original.replace('id="weblab-preload-script"', 'id="weblab-preload-script" data-oid="authored"');
        expect(cleanHandoffFiles([{ path: 'app/page.tsx', original, updated }])).toEqual([]);
    });
});


describe('changed bootstrap source and execution settings', () => {
    for (const name of ['Script', 'NextScript']) {
        const original = `import ${name} from 'next/script';
export default function Layout({children}) { return <html><body>{children}</body></html>; }`;
        const prepared = original.replace('<html>', '<html data-oid="root">').replace('</body>',
            `<${name} src="/weblab-preload-script.js" id="weblab-preload-script" strategy="afterInteractive" type="module" /></body>`);
        test(`cleans the unchanged ${name} bootstrap baseline`, () => {
            expect(cleanHandoffFiles([{ path: 'app/layout.tsx', original, updated: prepared }])).toEqual([]);
        });
        for (const [label, before, after] of [
            ['source', '/weblab-preload-script.js', '/customer-script.js'],
            ['strategy', 'afterInteractive', 'beforeInteractive'],
            ['type', 'type="module"', 'type="text/javascript"'],
        ]) {
            test(`refuses a changed ${name} bootstrap ${label} instead of erasing it`, () => {
                const updated = prepared.replace(before!, after!);
                expect(() => cleanHandoffFiles([{ path: 'app/layout.tsx', original, updated }]))
                    .toThrow('Review changed bootstrap scripts before handoff.');
            });
        }
    }
});
