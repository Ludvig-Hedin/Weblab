/* eslint-disable @typescript-eslint/await-thenable -- Bun rejection matchers must settle before each refusal assertion completes. */
import { describe, expect, it } from 'bun:test';

import {
    EditorAttributes,
    WEBLAB_INTERACTIONS_PUBLIC_SRC,
    WEBLAB_PRELOAD_SCRIPT_SRC,
} from '@weblab/constants';

import type { ProjectPreparationText } from './project-preparation';
import { t, traverse } from './packages';
import { getAstFromContent } from './parse';
import { planNextProjectPreparation } from './project-preparation';

const assets = [
    {
        path: 'public/weblab-preload-script.js',
        text: '// Weblab stale domId lookup blocked:\nvoid 0;',
    },
    { path: 'public/weblab-ix-runtime.js', text: 'void 0;' },
];
const layoutPath = 'src/app/layout.tsx';
const layout = `import './globals.css';
import { Providers } from './providers';
export const metadata = { title: 'Customer site' };
// Preserve the authored layout comment.
export default function RootLayout({ children }: { children: React.ReactNode }) {
    return <html lang="sv"><body className={styles.body} data-customer="kept"><Providers>{children}</Providers></body></html>;
}`;
function source(extra: ProjectPreparationText[] = [], content = layout) {
    return [{ path: layoutPath, text: content }, ...extra];
}
function plan(
    files = source(),
    overrides: Partial<Parameters<typeof planNextProjectPreparation>[0]> = {},
) {
    return planNextProjectPreparation({ files, layoutPath, assets, ...overrides });
}
function ids(content: string): string[] {
    const ast = getAstFromContent(content)!;
    const result: string[] = [];
    traverse(ast, {
        JSXAttribute(path) {
            if (
                t.isJSXIdentifier(path.node.name, { name: EditorAttributes.DATA_WEBLAB_ID }) &&
                t.isStringLiteral(path.node.value)
            )
                result.push(path.node.value.value);
        },
    });
    return result;
}
function apply(files: ProjectPreparationText[], prepared: Awaited<ReturnType<typeof plan>>) {
    const output = new Map(files.map((file) => [file.path, file.text]));
    for (const file of prepared.files) {
        expect(file.original).toBe(output.get(file.path) ?? null);
        output.set(file.path, file.updated);
    }
    return [...output].map(([path, text]) => ({ path, text }));
}
function scriptSources(content: string): string[] {
    const ast = getAstFromContent(content)!;
    const result: string[] = [];
    traverse(ast, {
        JSXOpeningElement(path) {
            if (!t.isJSXIdentifier(path.node.name, { name: 'Script' })) return;
            const src = path.node.attributes.find(
                (attribute) =>
                    t.isJSXAttribute(attribute) &&
                    t.isJSXIdentifier(attribute.name, { name: 'src' }),
            );
            if (t.isJSXAttribute(src) && t.isStringLiteral(src.value)) result.push(src.value.value);
        },
    });
    return result;
}

describe('pure Next source preparation', () => {
    it('preserves layout/providers/comments/CSS expressions and instruments nested components without changing inputs', async () => {
        const files = source([
            {
                path: 'src/components/sections/hero.tsx',
                text: `import styles from './hero.module.css';
// Hero comment must survive.
export function Hero() { return <section className={styles.hero} style={{ '--tone': theme.tone }} data-customer="hero"><p data-oid="existing-hero">Real customer text</p></section>; }`,
            },
            {
                path: 'src/components/repeated.tsx',
                text: `export function Card() { return <article><p>Same component source</p></article>; }
export function Cards() { return <main><Card /><Card />{items.map(item => <span key={item.id}>{item.title}</span>)}</main>; }`,
            },
            { path: 'src/app/globals.css', text: '.body { display: grid; }' },
            { path: 'package.json', text: '{ "name": "customer" }' },
        ]);
        const before = structuredClone(files);
        const result = await plan(files);
        expect(files).toEqual(before);
        const hero = result.files.find((file) => file.path.endsWith('hero.tsx'))!;
        expect(hero.updated).toContain('Hero comment must survive.');
        expect(hero.updated).toContain('className={styles.hero}');
        expect(hero.updated).toContain('theme.tone');
        expect(hero.updated).toContain('data-customer="hero"');
        expect(ids(hero.updated)).toContain('existing-hero');
        expect(hero.addedOids).toHaveLength(1);
        expect(hero.bootstrapChanges).toBe(false);
        const root = result.files.find((file) => file.path === layoutPath)!;
        for (const text of [
            'Customer site',
            'Preserve the authored layout comment.',
            'Providers',
            'lang="sv"',
            'className={styles.body}',
            'data-customer="kept"',
        ])
            expect(root.updated).toContain(text);
        expect(scriptSources(root.updated).sort()).toEqual([
            '/weblab-ix-runtime.js',
            '/weblab-preload-script.js',
        ]);
        expect(root.bootstrapChanges).toBe(true);
        const allIds = result.files.flatMap((file) =>
            file.path.startsWith('public/') ? [] : ids(file.updated),
        );
        expect(new Set(allIds).size).toBe(allIds.length);
        expect(
            result.files.some((file) => file.path.endsWith('.css') || file.path === 'package.json'),
        ).toBe(false);
        // IDs identify source JSX nodes; this does not claim unique rendered
        // identities or editable data bindings for map/repeated instances.
        expect(result.files.find((file) => file.path.endsWith('repeated.tsx'))?.updated).toContain(
            'item.title',
        );
    });

    it('is a byte-stable no-op after applying the first plan and preserves existing bootstrap IDs', async () => {
        const original = source([
            {
                path: 'src/components/label.tsx',
                text: 'export const Label = () => <p data-oid="stable-label">Hello</p>;',
            },
        ]);
        const prepared = await plan(original);
        const applied = apply(original, prepared);
        expect((await plan(applied)).files).toEqual([]);
        expect(applied.find((file) => file.path.endsWith('label.tsx'))?.text).toBe(
            original[1]?.text,
        );
        expect(
            prepared.files
                .filter((file) => file.original === null)
                .map((file) => file.path)
                .sort(),
        ).toEqual(assets.map((asset) => asset.path).sort());
    });

    it('ignores JSON, text, public, private, generated and test sources instead of parsing them', async () => {
        const ignored = [
            'package.json',
            'bun.lock',
            '.env.example',
            'notes.txt',
            'public/script.js',
            '.git/hook.ts',
            '.agents/task.tsx',
            '.next/server.ts',
            'node_modules/library.tsx',
            'dist/app.tsx',
            'build/app.tsx',
            'out/app.tsx',
            'coverage/app.tsx',
            'tests/page.tsx',
            '__tests__/page.tsx',
            'src/card.test.tsx',
            'src/card.spec.ts',
            'src/card.stories.jsx',
            'next-env.d.ts',
        ].map((path) => ({ path, text: 'not valid JS or TS, intentionally ignored' }));
        const result = await plan(source(ignored));
        expect(
            result.files.every(
                (file) =>
                    file.path === layoutPath || assets.some((asset) => asset.path === file.path),
            ),
        ).toBe(true);
    });

    it('rejects duplicate, dynamic, missing and spread-overridden preexisting IDs using AST inventory', async () => {
        for (const jsx of [
            '<p data-oid="" />',
            '<p data-oid="   " />',
            '<p data-oid />',
            '<p data-oid={id} />',
            '<p data-oid={"literal-expression"} />',
            '<p data-oid="one" data-oid="two" />',
            '<><p data-oid="same" /><p data-oid="same" /></>',
            '<p data-oid="stable" {...props} />',
            '<p {...{ "data-oid": "spread-id" }} />',
        ]) {
            const files = source([
                { path: 'src/component.tsx', text: `export const Component = () => ${jsx};` },
            ]);
            const before = structuredClone(files);
            await expect(plan(files)).rejects.toThrow();
            expect(files).toEqual(before);
        }
        await expect(
            plan(
                source([
                    { path: 'src/a.tsx', text: 'export const A = () => <p data-oid="same" />;' },
                    { path: 'src/b.tsx', text: 'export const B = () => <div data-oid="same" />;' },
                ]),
            ),
        ).rejects.toThrow('Duplicate element ID across files');
    });

    it('does not mistake comments and source strings for JSX IDs', async () => {
        const result = await plan(
            source([
                {
                    path: 'src/example.tsx',
                    text: `// data-oid="same"
const example = 'data-oid="same"';
export const Example = () => <p data-oid="same">Example</p>;`,
                },
            ]),
        );
        expect(result.files.some((file) => file.path === 'src/example.tsx')).toBe(false);
    });

    it('deduplicates only known bootstrap tags and localizes trusted CDN URLs', async () => {
        const duplicates = `import Script from 'next/script';
export default function Layout({ children }) { return <html><body>{children}
<Script src="${WEBLAB_PRELOAD_SCRIPT_SRC}" id="weblab-preload-script" />
<Script src="${WEBLAB_PRELOAD_SCRIPT_SRC}" id="weblab-preload-script" />
<Script src="/weblab-ix-runtime.js" id="weblab-ix-runtime" />
</body></html>; }`;
        const original = source([], duplicates);
        const first = await plan(original);
        const root = first.files.find((file) => file.path === layoutPath)!;
        expect(scriptSources(root.updated).sort()).toEqual([
            '/weblab-ix-runtime.js',
            '/weblab-preload-script.js',
        ]);
        expect((await plan(apply(original, first))).files).toEqual([]);
    });

    it('refuses conflicting Script bindings, bootstrap URLs/settings and duplicate tags with authored IDs', async () => {
        for (const content of [
            'const Script = OtherComponent; export default () => <html><body /></html>;',
            'export default () => <html><body><Script id="weblab-preload-script" src="https://unrelated.test/custom.js" /></body></html>;',
            'import Script from "next/script"; export default () => <html><body><Script id="weblab-preload-script" src="/weblab-preload-script.js" strategy="beforeInteractive" /></body></html>;',
            'import Script from "next/script"; export default () => <html><body><Script id="weblab-preload-script" src="/weblab-preload-script.js" data-oid="owned1" /><Script id="weblab-preload-script" src="/weblab-preload-script.js" data-oid="owned2" /></body></html>;',
        ])
            await expect(plan(source([], content))).rejects.toThrow();
    });

    it('rejects parameter and local Script shadows before bootstrap insertion or normalization', async () => {
        for (const imported of ['', "import Script from 'next/script';"]) {
            for (const authoredScripts of [
                '',
                '<Script id="weblab-preload-script" src="/weblab-preload-script.js" />',
            ]) {
                for (const [parameters, local] of [
                    ['Script', ''],
                    ['', 'const Script = OtherComponent;'],
                ]) {
                    const content = `${imported} export default function Layout(${parameters}) {
                        ${local} return <html><body>${authoredScripts}</body></html>;
                    }`;
                    const files = source([], content),
                        before = structuredClone(files);
                    await expect(plan(files)).rejects.toThrow(
                        'shadows the bootstrap Script binding',
                    );
                    expect(files).toEqual(before);
                }
            }
        }
    });

    it('refuses type-only Script imports before insertion or accepting existing local bootstrap tags', async () => {
        const localScripts = `<Script id="weblab-preload-script" src="/weblab-preload-script.js" type="module" strategy="afterInteractive" />
            <Script id="weblab-ix-runtime" src="/weblab-ix-runtime.js" type="module" strategy="afterInteractive" data-interactions-src="${WEBLAB_INTERACTIONS_PUBLIC_SRC}" />`;
        for (const imported of [
            "import type Script from 'next/script';",
            "import type { default as Script } from 'next/script';",
            "import { type default as Script } from 'next/script';",
        ]) {
            for (const scripts of ['', localScripts]) {
                const files = source(
                    [],
                    `${imported} export default function Layout() { return <html><body>${scripts}</body></html>; }`,
                );
                const before = structuredClone(files);
                await expect(plan(files)).rejects.toThrow('requires a runtime value import');
                expect(files).toEqual(before);
            }
        }
    });

    it('accepts only existing canonical root layouts with one html/body pair', async () => {
        for (const path of [
            'pages/_app.tsx',
            'app/nested/layout.tsx',
            '/app/layout.tsx',
            'app/../app/layout.tsx',
        ]) {
            await expect(plan([{ path, text: layout }], { layoutPath: path })).rejects.toThrow();
        }
        await expect(
            plan([{ path: 'src/component.tsx', text: 'export const X = () => <p />;' }]),
        ).rejects.toThrow();
        await expect(
            plan(source([], 'export default () => <main>Missing html/body</main>;')),
        ).rejects.toThrow();
        await expect(
            plan(source([], 'export default () => <html><body /><body /></html>;')),
        ).rejects.toThrow();
        expect(
            (
                await plan(
                    [
                        {
                            path: 'app/layout.jsx',
                            text: 'export default () => <html><body /></html>;',
                        },
                    ],
                    { layoutPath: 'app/layout.jsx' },
                )
            ).files.length,
        ).toBeGreaterThan(0);
    });

    it('refuses reserved asset collisions, missing/untrusted assets and a stale preload marker', async () => {
        await expect(
            plan(source([{ path: assets[0]!.path, text: 'authored unrelated script' }])),
        ).rejects.toThrow('Reserved bootstrap asset conflicts');
        await expect(
            plan(source([{ path: 'public', text: 'file, not directory' }])),
        ).rejects.toThrow();
        await expect(
            plan(source([{ path: `${assets[0]!.path}/nested.txt`, text: 'directory conflict' }])),
        ).rejects.toThrow();
        for (const replacement of [
            assets.slice(0, 1),
            [assets[0]!, assets[0]!],
            [{ path: 'public/unknown.js', text: 'void 0;' }, assets[1]!],
            [{ ...assets[0]!, text: 'old bundle' }, assets[1]!],
        ]) {
            await expect(plan(source(), { assets: replacement })).rejects.toThrow();
        }
        const result = await plan(source(assets));
        expect(result.files.some((file) => file.path.startsWith('public/'))).toBe(false);
    });

    it('bounds eligible source count, individual UTF-8 bytes and aggregate UTF-8 bytes before parsing', async () => {
        const tooMany = Array.from({ length: 500 }, (_, index) => ({
            path: `src/file-${index}.ts`,
            text: 'export const value = 1;',
        }));
        await expect(plan(source(tooMany))).rejects.toThrow('too large');
        await expect(
            plan(source([{ path: 'src/large.ts', text: `//${'å'.repeat(250_000)}` }])),
        ).rejects.toThrow('source review limits');
        const aggregate = Array.from({ length: 20 }, (_, index) => ({
            path: `src/file-${index}.ts`,
            text: `//${'a'.repeat(499_998)}`,
        }));
        await expect(plan(source(aggregate))).rejects.toThrow('source review limits');
    });
});
