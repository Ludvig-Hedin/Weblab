import { describe, expect, test } from 'bun:test';
import { getAstFromContent, getContentFromAst, isLocalMiddlewareFile, prepareLocalMiddleware, stripLocalMiddleware, traverse } from '../src';

const source = `export async function proxy(request) { if (request.cookies.get('session')) return allow(request); return deny(request); }
export const config = { matcher: ['/((?!_next/static|_next/image|images|fonts|videos|brand/|og/).*)'] };`;
const parse = (content: string) => getAstFromContent(content)!;
const legacyPrefix = '/((?!weblab-preload-script\\.js$|weblab-ix-runtime\\.js$|';
const configSource = (matchers: string[]) => `export const config = {matcher: ${JSON.stringify(matchers)}};`;
const previewAssets = [
    '/weblab-preload-script.js', '/weblab-ix-runtime.js',
    '/_weblab/interactions.json', '/_weblab/interactions-initial.css',
];
function patterns(ast: ReturnType<typeof parse>) {
    const values: string[] = [];
    traverse(ast, { StringLiteral(path) { if (path.node.value.startsWith('/((')) values.push(path.node.value); } });
    return values;
}

describe('private preview middleware asset exceptions', () => {
    test('recognizes every default Next source extension without selecting nested modules', () => {
        for (const file of ['proxy.js', 'middleware.ts', 'src/proxy.tsx', 'src/middleware.jsx']) expect(isLocalMiddlewareFile(file)).toBe(true);
        expect(isLocalMiddlewareFile('src/lib/proxy.ts')).toBe(false);
    });
    test('excludes only four exact preview assets and preserves existing routing and auth', async () => {
        const ast = parse(source);
        const beforeFunction = JSON.stringify(ast.program.body[0]);
        prepareLocalMiddleware(ast);
        expect(JSON.stringify(ast.program.body[0])).toBe(beforeFunction);
        const matcher = new RegExp(`^${patterns(ast)[0]}$`);
        for (const asset of previewAssets) {
            expect(matcher.test(asset)).toBe(false);
            for (const route of [`${asset}/extra`, `${asset}.backup`, `/nested${asset}`]) expect(matcher.test(route)).toBe(true);
        }
        for (const route of ['/', '/us', '/login', '/studio', '/api/private', '/weblab-preload-script-backup.js',
            '/_weblab/private', '/_weblab/interactionsXjson', '/_weblab/interactions-initialXcss']) {
            expect(matcher.test(route)).toBe(true);
        }
        for (const asset of ['/images/photo.jpg', '/fonts/font.woff2', '/_next/static/file.js']) expect(matcher.test(asset)).toBe(false);
        const first = await getContentFromAst(ast, source);
        const secondAst = parse(first);
        prepareLocalMiddleware(secondAst);
        expect(await getContentFromAst(secondAst, first)).toBe(first);
        stripLocalMiddleware(secondAst, parse(source));
        expect(patterns(secondAst)).toEqual(patterns(parse(source)));
    });

    test('migrates the previous two-asset prefix idempotently and restores the original routing', () => {
        const original = '/((?!images|fonts|private/auth/).*)';
        const legacy = legacyPrefix + 'images|fonts|private/auth/).*)';
        const ast = parse(configSource([legacy]));
        prepareLocalMiddleware(ast);
        const prepared = patterns(ast);
        expect(prepared[0]).not.toBe(legacy);
        const matcher = new RegExp(`^${prepared[0]}$`);
        for (const asset of previewAssets) expect(matcher.test(asset)).toBe(false);
        for (const route of ['/images/photo.jpg', '/fonts/font.woff2', '/private/auth/token']) expect(matcher.test(route)).toBe(false);
        expect(matcher.test('/_weblab/private')).toBe(true);
        prepareLocalMiddleware(ast);
        expect(patterns(ast)).toEqual(prepared);
        stripLocalMiddleware(ast, parse(configSource([original])));
        expect(patterns(ast)).toEqual([original]);
        const oldPrepared = parse(configSource([legacy]));
        stripLocalMiddleware(oldPrepared, parse(configSource([original])));
        expect(patterns(oldPrepared)).toEqual([original]);
    });

    test('restores exact customer-owned old and new prefixes without dropping their exclusions', () => {
        const customerLegacy = legacyPrefix + 'images|fonts|private/auth/).*)';
        for (const migrate of [false, true]) {
            const baseline = parse(configSource([customerLegacy]));
            const ast = parse(configSource([customerLegacy]));
            if (migrate) prepareLocalMiddleware(ast);
            stripLocalMiddleware(ast, baseline);
            expect(patterns(ast)).toEqual([customerLegacy]);
        }
        const customerCurrent = parse(configSource(['/((?!images|fonts|private/auth/).*)']));
        prepareLocalMiddleware(customerCurrent);
        const baseline = patterns(customerCurrent);
        const ast = parse(configSource(baseline));
        prepareLocalMiddleware(ast);
        stripLocalMiddleware(ast, customerCurrent);
        expect(patterns(ast)).toEqual(baseline);
    });

    test('updates every OR rule and preserves customer-owned asset exclusions', () => {
        const ast = parse(configSource([legacyPrefix + 'images).*)', '/((?!fonts).*)']));
        prepareLocalMiddleware(ast);
        expect(patterns(ast)).toHaveLength(2);
        for (const pattern of patterns(ast)) {
            for (const asset of previewAssets) expect(new RegExp(`^${pattern}$`).test(asset)).toBe(false);
        }
        const baseline = parse(source);
        prepareLocalMiddleware(baseline);
        const unchanged = parse(source);
        prepareLocalMiddleware(unchanged);
        stripLocalMiddleware(unchanged, baseline);
        expect(patterns(unchanged)).toEqual(patterns(baseline));
    });

    test('refuses unsupported or ambiguous configs before altering any matcher', () => {
        for (const config of [
            configSource([legacyPrefix + 'images).*)', '/:path*']),
            `export const config = {matcher: ['/((?!images).*)', '/:path*']};`,
            `export const config = {matcher: '/((?!x).*)|/((?!y).*)'};`,
            `export const config = {...defaults, matcher: '/((?!images).*)'};`,
            `export const config = {matcher: '/((?!images).*)', matcher: '/((?!fonts).*)'};`,
            `export const config = {matcher};`,
            `export const config = {['matcher']: '/((?!images).*)'};`,
            `const config = {matcher: '/((?!images).*)'}; export {config};`,
            `export const config = {matcher: getMatchers()};`,
            `export const config = {matcher: '/((?!images).*)', regions: pickRegion()};`,
            `export default function middleware() {}`,
        ]) {
            const ast = parse(config);
            const before = JSON.stringify(ast);
            expect(() => prepareLocalMiddleware(ast)).toThrow();
            expect(JSON.stringify(ast)).toBe(before);
        }
    });

    test('refuses ambiguous cleanup without partially removing another entry', () => {
        const baseline = parse(`export const config = {matcher: ['/((?!images).*)', '/((?!fonts).*)']};`);
        const ast = parse(`export const config = {matcher: ['/((?!images).*)', '/((?!videos).*)']};`);
        prepareLocalMiddleware(ast);
        const before = JSON.stringify(ast);
        expect(() => stripLocalMiddleware(ast, baseline)).toThrow('Review changed middleware');
        expect(JSON.stringify(ast)).toBe(before);
    });

    test('refuses changed customer-owned prefixed rules atomically during handoff', () => {
        const baseline = parse(configSource([legacyPrefix + 'images).*)', legacyPrefix + 'fonts).*)']));
        const changed = parse(configSource([legacyPrefix + 'images).*)', legacyPrefix + 'videos).*)']));
        prepareLocalMiddleware(changed);
        const before = JSON.stringify(changed);
        expect(() => stripLocalMiddleware(changed, baseline)).toThrow('Review changed middleware');
        expect(JSON.stringify(changed)).toBe(before);

        const currentBaseline = parse(configSource(['/((?!images).*)', '/((?!fonts).*)']));
        prepareLocalMiddleware(currentBaseline);
        const removedCustomerAssets = parse(configSource(patterns(baseline)));
        const oldBefore = JSON.stringify(removedCustomerAssets);
        expect(() => stripLocalMiddleware(removedCustomerAssets, currentBaseline)).toThrow('Review changed middleware');
        expect(JSON.stringify(removedCustomerAssets)).toBe(oldBefore);
    });
});
