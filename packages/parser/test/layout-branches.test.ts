import { describe, expect, test } from 'bun:test';
import {
    DEPRECATED_PRELOAD_SCRIPT_SRCS,
    WEBLAB_DEV_IX_RUNTIME_SRC,
    WEBLAB_DEV_PRELOAD_SCRIPT_SRC,
    WEBLAB_IX_RUNTIME_SRC,
    WEBLAB_PRELOAD_SCRIPT_SRC,
} from '@weblab/constants';
import {
    injectPreloadScript,
    injectWeblabBootstrapScripts,
    removeAllIxRuntimeScripts,
    removeAllPreloadScripts,
    removeDeprecatedIxRuntimeScripts,
    removeDeprecatedPreloadScripts,
    scanForIxRuntimeScript,
    scanForPreloadScript,
} from '../src/code-edit/layout';
import { getAstFromContent, getContentFromAst } from '../src/parse';
import { t, traverse, type T } from '../src/packages';

function parse(source: string): T.File {
    const ast = getAstFromContent(source);
    if (!ast) throw new Error('Could not parse layout fixture.');
    return ast;
}

function assertEveryBodyHasBridges(ast: T.File, count: number): void {
    let bodies = 0;
    traverse(ast, {
        JSXElement(path) {
            if (!t.isJSXIdentifier(path.node.openingElement.name, { name: 'body' })) return;
            bodies++;
            for (const src of [WEBLAB_PRELOAD_SCRIPT_SRC, WEBLAB_IX_RUNTIME_SRC]) {
                const scripts = path.node.children.filter((child) => t.isJSXElement(child) &&
                    child.openingElement.attributes.some((attribute) => t.isJSXAttribute(attribute) &&
                        t.isJSXIdentifier(attribute.name, { name: 'src' }) &&
                        t.isStringLiteral(attribute.value, { value: src })));
                expect(scripts).toHaveLength(1);
            }
        },
    });
    expect(bodies).toBe(count);
    expect(scanForPreloadScript(ast)).toEqual({ scriptCount: count, deprecatedScriptCount: 0, injectedCorrectly: true });
    expect(scanForIxRuntimeScript(ast)).toEqual({ scriptCount: count, deprecatedScriptCount: 0, injectedCorrectly: true });
}

const branches = `'use client';
export default function RootLayout({ children, login, studio }) {
    if (login) return <html lang="en"><body data-route="login">{children}</body></html>;
    if (studio) return <html lang="en"><body data-route="studio">{children}</body></html>;
    return <html lang="sv"><body data-route="public"><main>{children}</main></body></html>;
}`;

describe('layout document branches', () => {
    test('instruments every alternate document return and preserves directives and branches', async () => {
        const ast = parse(branches);
        injectWeblabBootstrapScripts(ast);
        assertEveryBodyHasBridges(ast, 3);
        expect(ast.program.directives[0]?.value.value).toBe('use client');
        const output = await getContentFromAst(ast, branches);
        expect(output).toContain('if (login)');
        expect(output).toContain('if (studio)');
        expect(output).toContain('data-route="public"');
        expect(ast.program.body.filter((node) => t.isImportDeclaration(node) && node.source.value === 'next/script')).toHaveLength(1);
    });

    test('repeated preparation after serialization adds no tags, imports or source churn', async () => {
        const ast = parse(branches);
        injectWeblabBootstrapScripts(ast);
        const first = await getContentFromAst(ast, branches);
        const reparsed = parse(first);
        injectWeblabBootstrapScripts(reparsed);
        assertEveryBodyHasBridges(reparsed, 3);
        expect(await getContentFromAst(reparsed, first)).toBe(first);
    });

    test('one prepared branch does not hide missing bridges in later branches', () => {
        const ast = parse(`import Script from 'next/script';
export default function Layout({ alternate }) {
    if (alternate) return <html><body><Script src="${WEBLAB_PRELOAD_SCRIPT_SRC}" /></body></html>;
    return <html><body /></html>;
}`);
        expect(scanForPreloadScript(ast).injectedCorrectly).toBe(false);
        injectWeblabBootstrapScripts(ast);
        assertEveryBodyHasBridges(ast, 2);
    });

    test('creates a body for each html branch that lacks one', async () => {
        const source = `export default function Layout({ alternate }) {
    if (alternate) return <html lang="sv"><head /></html>;
    return <html lang="en"><body data-route="public" /></html>;
}`;
        const ast = parse(source);
        injectWeblabBootstrapScripts(ast);
        assertEveryBodyHasBridges(ast, 2);
        let documents = 0;
        traverse(ast, { JSXElement(path) {
            if (!t.isJSXIdentifier(path.node.openingElement.name, { name: 'html' })) return;
            documents++;
            expect(path.node.children.filter((child) => t.isJSXElement(child) &&
                t.isJSXIdentifier(child.openingElement.name, { name: 'body' }))).toHaveLength(1);
        } });
        expect(documents).toBe(2);
        const first = await getContentFromAst(ast, source);
        injectWeblabBootstrapScripts(ast);
        expect(await getContentFromAst(ast, first)).toBe(first);
    });

    test('deduplicates per body, relocates a misplaced bridge and preserves foreign scripts', () => {
        const ast = parse(`import Script from 'next/script';
export default function Layout({ alternate }) {
    if (alternate) return <html><body>
        <Script src="${WEBLAB_PRELOAD_SCRIPT_SRC}" />
        <Script src="${WEBLAB_PRELOAD_SCRIPT_SRC}" />
    </body></html>;
    return <html><head><Script src="${WEBLAB_PRELOAD_SCRIPT_SRC}" /></head><body>
        <Script src="${DEPRECATED_PRELOAD_SCRIPT_SRCS[0]}" />
        <Script src="https://example.com/analytics.js" id="analytics" />
        <script type="application/ld+json">{'{}'}</script>
    </body></html>;
}`);
        injectWeblabBootstrapScripts(ast);
        assertEveryBodyHasBridges(ast, 2);
        let analytics = 0;
        let jsonLd = 0;
        traverse(ast, { JSXOpeningElement(path) {
            for (const attribute of path.node.attributes) {
                if (!t.isJSXAttribute(attribute) || !t.isStringLiteral(attribute.value)) continue;
                if (attribute.value.value === 'https://example.com/analytics.js') analytics++;
                if (attribute.value.value === 'application/ld+json') jsonLd++;
            }
        } });
        expect(analytics).toBe(1);
        expect(jsonLd).toBe(1);
    });

    test('reuses an imported next/script alias without another import', async () => {
        const source = `import NextScript from 'next/script';
import Script from './customer-script';
export default function Layout() { return <html><body><Script src="/customer.js" /></body></html>; }`;
        const ast = parse(source);
        injectWeblabBootstrapScripts(ast);
        assertEveryBodyHasBridges(ast, 1);
        const output = await getContentFromAst(ast, source);
        expect(output.match(/from ['"]next\/script['"]/g)).toHaveLength(1);
        expect(output).toContain('<NextScript');
        expect(output).toContain('<Script src="/customer.js"');
    });

    test('keeps a valid existing bridge and its custom attributes', async () => {
        const source = `import Script from 'next/script';
export default function Layout() { return <html><body><Script src="${WEBLAB_PRELOAD_SCRIPT_SRC}" nonce="customer-nonce" /></body></html>; }`;
        const ast = parse(source);
        injectWeblabBootstrapScripts(ast);
        assertEveryBodyHasBridges(ast, 1);
        expect(await getContentFromAst(ast, source)).toContain('nonce="customer-nonce"');
    });

    test('preserves local bridge URLs and custom attributes across every body on repeated preparation', async () => {
        const source = `import NextScript from 'next/script';
export default function Layout({ alternate }) {
    if (alternate) return <html><body>
        <NextScript src="${WEBLAB_DEV_PRELOAD_SCRIPT_SRC}" id="weblab-preload-script" nonce="local-nonce" />
        <NextScript src="${WEBLAB_DEV_IX_RUNTIME_SRC}" id="weblab-ix-runtime" />
    </body></html>;
    return <html><body>
        <NextScript src="${WEBLAB_DEV_PRELOAD_SCRIPT_SRC}" id="weblab-preload-script" />
        <NextScript src="${WEBLAB_DEV_IX_RUNTIME_SRC}" id="weblab-ix-runtime" />
    </body></html>;
}`;
        const ast = parse(source);
        const tags: T.JSXElement[] = [];
        traverse(ast, { JSXElement(path) {
            if (t.isJSXIdentifier(path.node.openingElement.name, { name: 'NextScript' })) tags.push(path.node);
        } });
        injectWeblabBootstrapScripts(ast);
        expect(scanForPreloadScript(ast)).toEqual({ scriptCount: 2, deprecatedScriptCount: 0, injectedCorrectly: true });
        expect(scanForIxRuntimeScript(ast)).toEqual({ scriptCount: 2, deprecatedScriptCount: 0, injectedCorrectly: true });
        const retained = new Set<T.JSXElement>();
        traverse(ast, { JSXElement(path) { retained.add(path.node); } });
        for (const tag of tags) {
            expect(retained.has(tag)).toBe(true);
            expect(tag.openingElement.attributes.some((attribute) => t.isJSXAttribute(attribute) &&
                t.isJSXIdentifier(attribute.name, { name: 'src' }) && t.isStringLiteral(attribute.value) &&
                [WEBLAB_DEV_PRELOAD_SCRIPT_SRC, WEBLAB_DEV_IX_RUNTIME_SRC].includes(attribute.value.value))).toBe(true);
        }
        const first = await getContentFromAst(ast, source);
        const reparsed = parse(first);
        injectWeblabBootstrapScripts(reparsed);
        expect(await getContentFromAst(reparsed, first)).toBe(first);
        expect(first).toContain('nonce="local-nonce"');
    });

    for (const [label, source] of [
        ['foreign Script binding', `import Script from './customer-script'; export default () => <html><body /></html>;`],
        ['type-only default import', `import type Script from 'next/script'; export default () => <html><body /></html>;`],
        ['type-only named import', `import type { default as Script } from 'next/script'; export default () => <html><body /></html>;`],
        ['inline type-only import', `import { type default as Script } from 'next/script'; export default () => <html><body /></html>;`],
        ['shadowed alias', `import NextScript from 'next/script'; export default function Layout(NextScript) { return <html><body /></html>; }`],
        ['future wrapped body binding', `export default function Layout(Script) { return <main />; }`],
        ['future wrapped arrow binding', `export default (Script) => <main />;`],
        ['future wrapped alias binding', `import NextScript from 'next/script'; export default function Layout(NextScript) { return <main />; }`],
        ['future html body binding', `export default function Layout(Script) { return <html><head /></html>; }`],
        ['foreign reserved source', `export default () => <html><body><Script id="weblab-ix-runtime" src="/customer.js" /></body></html>;`],
        ['unknown reserved source', `export default () => <html><body><Script id="weblab-ix-runtime" src={customerSrc} /></body></html>;`],
        ['foreign known-source component', `import Customer from './customer-script'; export default () => <html><body><Customer src="${WEBLAB_PRELOAD_SCRIPT_SRC}" /></body></html>;`],
        ['ambiguous spread', `export default () => <html><body><Script src="${WEBLAB_PRELOAD_SCRIPT_SRC}" {...settings} /></body></html>;`],
        ['duplicate callbacks', `import Script from 'next/script'; export default () => <html><body><Script src="${WEBLAB_PRELOAD_SCRIPT_SRC}" onLoad={ready} /><Script src="${WEBLAB_PRELOAD_SCRIPT_SRC}" /></body></html>;`],
        ['hidden current source', `export default () => <html><body><Script src="/customer.js" src="${WEBLAB_IX_RUNTIME_SRC}" /></body></html>;`],
        ['hidden local source', `export default () => <html><body><Script src="/customer.js" src="${WEBLAB_DEV_PRELOAD_SCRIPT_SRC}" /></body></html>;`],
        ['hidden deprecated source', `export default () => <html><body><Script src="/customer.js" src="${DEPRECATED_PRELOAD_SCRIPT_SRCS[0]}" /></body></html>;`],
        ['conflicting deprecated execution attributes', `export default () => <html><body><Script src="${DEPRECATED_PRELOAD_SCRIPT_SRCS[0]}" type="module" type="text/javascript" /></body></html>;`],
        ['hidden reserved id', `export default () => <html><body><Script src="/customer.js" id="customer" id="weblab-ix-runtime" /></body></html>;`],
        ['duplicate local id', `export default () => <html><body><Script src="${WEBLAB_DEV_PRELOAD_SCRIPT_SRC}" id="customer" id="weblab-preload-script" /></body></html>;`],
    ]) {
        test(`rejects ${label} before changing the AST`, () => {
            const ast = parse(source!);
            const before = JSON.stringify(ast);
            expect(() => injectWeblabBootstrapScripts(ast)).toThrow();
            expect(JSON.stringify(ast)).toBe(before);
        });
    }

    test('preload-only injection refuses a future shadowed body before changing the AST', () => {
        const ast = parse('export default function Layout(Script) { return <main />; }');
        const before = JSON.stringify(ast);
        expect(() => injectPreloadScript(ast)).toThrow();
        expect(JSON.stringify(ast)).toBe(before);
    });

    for (const remove of [removeDeprecatedPreloadScripts, removeDeprecatedIxRuntimeScripts,
        removeAllPreloadScripts, removeAllIxRuntimeScripts]) {
        test(`${remove.name} remains a no-op with a foreign Script binding and no matching source`, () => {
            const ast = parse(`import Script from './customer-script';
export default function Layout(Script) { return <html><body><Script src="/customer.js" /></body></html>; }`);
            const before = JSON.stringify(ast);
            expect(() => remove(ast)).not.toThrow();
            expect(JSON.stringify(ast)).toBe(before);
        });
    }

    test('removal ignores unrelated bootstrap conflicts and insertion scope bindings', () => {
        const ast = parse(`import NextScript from 'next/script';
import Script from './customer-script';
export default function Layout(NextScript) { return <html><body>
    <Script src="/customer.js" id="weblab-preload-script" />
</body></html>; }
const runtime = <><NextScript src="${WEBLAB_IX_RUNTIME_SRC}" /></>;`);
        removeAllIxRuntimeScripts(ast);
        expect(scanForIxRuntimeScript(ast).scriptCount).toBe(0);
        expect(scanForPreloadScript(ast).scriptCount).toBe(0);
        let customer = 0;
        traverse(ast, { JSXElement(path) {
            if (t.isJSXIdentifier(path.node.openingElement.name, { name: 'Script' })) customer++;
        } });
        expect(customer).toBe(1);
    });

    for (const [label, expression] of [
        ['initializer', `<Script src="SOURCE" />`],
        ['conditional operand', `enabled ? <Script src="SOURCE" /> : null`],
    ]) {
        test(`refuses bootstrap injection from a ${label} without altering valid source`, async () => {
            const source = `import Script from 'next/script';
const preload = ${expression!.replace('SOURCE', WEBLAB_PRELOAD_SCRIPT_SRC)};
export default () => <html><body>{preload}</body></html>;`;
            for (const inject of [injectPreloadScript, injectWeblabBootstrapScripts]) {
                const ast = parse(source);
                const before = JSON.stringify(ast);
                const generatedBefore = await getContentFromAst(ast, source);
                expect(() => inject(ast)).toThrow();
                expect(JSON.stringify(ast)).toBe(before);
                const generatedAfter = await getContentFromAst(ast, source);
                expect(generatedAfter).toBe(generatedBefore);
                expect(parse(generatedAfter)).toBeDefined();
            }
        });

        test(`refuses bootstrap removal from a ${label} before removing safe earlier siblings`, async () => {
            for (const [remove, src] of [
                [removeAllPreloadScripts, WEBLAB_PRELOAD_SCRIPT_SRC],
                [removeAllIxRuntimeScripts, WEBLAB_IX_RUNTIME_SRC],
                [removeDeprecatedPreloadScripts, DEPRECATED_PRELOAD_SCRIPT_SRCS[0]!],
            ] as const) {
                const source = `import Script from 'next/script';
const safe = <><Script src="${src}" /></>;
const bootstrap = ${expression!.replace('SOURCE', src)};
export default () => <html><body>{safe}{bootstrap}</body></html>;`;
                const ast = parse(source);
                const before = JSON.stringify(ast);
                expect(() => remove(ast)).toThrow();
                expect(JSON.stringify(ast)).toBe(before);
                expect(parse(await getContentFromAst(ast, source))).toBeDefined();
            }
        });
    }

    test('relocates head and fragment child scripts while keeping generated JSX valid', async () => {
        const source = `import Script from 'next/script';
export default () => <html><head><Script src="${WEBLAB_PRELOAD_SCRIPT_SRC}" /></head><body>
    <><Script src="${WEBLAB_IX_RUNTIME_SRC}" /><main /></>
</body></html>;`;
        const ast = parse(source);
        injectWeblabBootstrapScripts(ast);
        assertEveryBodyHasBridges(ast, 1);
        const generated = await getContentFromAst(ast, source);
        const reparsed = parse(generated);
        assertEveryBodyHasBridges(reparsed, 1);
        injectWeblabBootstrapScripts(reparsed);
        expect(await getContentFromAst(reparsed, generated)).toBe(generated);
        removeAllPreloadScripts(reparsed);
        removeAllIxRuntimeScripts(reparsed);
        const removed = parse(await getContentFromAst(reparsed, generated));
        expect(scanForPreloadScript(removed).scriptCount).toBe(0);
        expect(scanForIxRuntimeScript(removed).scriptCount).toBe(0);
    });

    test('preload-only injection also covers every body', () => {
        const ast = parse(branches);
        injectPreloadScript(ast);
        expect(scanForPreloadScript(ast)).toEqual({ scriptCount: 3, deprecatedScriptCount: 0, injectedCorrectly: true });
        expect(scanForIxRuntimeScript(ast).scriptCount).toBe(0);
    });
});
