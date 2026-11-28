import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Page } from 'playwright';

import { renameClass, resolveClassStylesheets } from '../src/classes';

export type AliasShape = 'tsconfig-path' | 'directory-index' | 'package-entry' | 'direct-link';

// Compile the fixture independently of the class graph. Chrome executes the
// real entry module and resolves linked stylesheets and their imports itself.
export async function checkRename(page: Page, shape: AliasShape, variant: number) {
    const dir = await mkdtemp(join(tmpdir(), 'weblab-class-rename-'));
    const base = 'css/site-' + variant;
    const dep = 'theme-' + variant + '.css';
    const main = 'public/' + base + '/main.css';
    const decoy = 'public/' + base + '/decoy.css';
    const link = (path: string) => '<link rel="stylesheet" href="/' + path + '"/>';
    const module = (path: string) => 'export const sheet = ' + link(path);
    const owner = base + '/main.css';
    const unrelated = base + '/decoy.css';
    const alias = variant % 2 ? '@' : 'brand';
    const paths = { [alias + '/*']: ['./src/*'], [dep]: ['./' + decoy] };
    const layout = 'layout.tsx';
    const files: Record<string, string> = {
        [layout]:
            (shape === 'direct-link'
                ? 'const sheet=' + link(owner) + ';'
                : 'import {sheet} from "' + alias + '/shell";') +
            'document.head.append(sheet);document.body.append(<button className="a"/>);',
        'tsconfig.json': JSON.stringify({
            compilerOptions: { jsx: 'react', jsxFactory: 'h', paths },
        }),
        [main]:
            (variant % 2 ? '@import' : String.raw`@i\6dport`) +
            ' "' +
            dep +
            '";.a{color:red}@import "decoy.css";',
        ['public/' + base + '/' + dep]: '.a{color:green!important}',
        [decoy]: '.a{color:pink}',
        'shell.tsx': module(unrelated),
    };
    if (shape === 'tsconfig-path') files['src/shell.tsx'] = module(owner);
    else if (shape === 'directory-index') files['src/shell/index.tsx'] = module(owner);
    else if (shape === 'package-entry') {
        files['src/shell/package.json'] = '{"main":"./entry.js"}';
        files['src/shell/entry.tsx'] = module(owner);
        files['src/shell/index.tsx'] = module(unrelated);
    }
    async function render(snapshot: Record<string, string>) {
        for (const [path, source] of Object.entries(snapshot)) {
            await mkdir(dirname(join(dir, path)), { recursive: true });
            await writeFile(join(dir, path), source);
        }
        const build = await Bun.build({
            entrypoints: [join(dir, layout)],
            target: 'browser',
            tsconfig: join(dir, 'tsconfig.json'),
        });
        assert.ok(build.success, build.logs.map((log) => log.message).join('\n'));
        const js = await build.outputs[0]!.text();
        const html =
            '<!doctype html><body><script>window.h=(tag,attrs)=>Object.assign(document.createElement(tag),attrs)</script><script src="/entry.js"></script>';
        await page.route('https://fixture.test/**', async (route) => {
            const path = new URL(route.request().url()).pathname;
            const content =
                path === '/' ? html : path === '/entry.js' ? js : snapshot['public' + path];
            await route.fulfill({
                status: content === undefined ? 404 : 200,
                contentType:
                    path === '/'
                        ? 'text/html'
                        : path === '/entry.js'
                          ? 'text/javascript'
                          : 'text/css',
                body: content ?? '',
            });
        });
        try {
            await page.goto('https://fixture.test/');
            return await page.evaluate(() => {
                const loaded: Record<string, string[]> = {};
                function read(sheet: CSSStyleSheet) {
                    const path = 'public' + new URL(sheet.href!).pathname;
                    if (loaded[path]) return;
                    loaded[path] = [];
                    for (const rule of sheet.cssRules) {
                        if (rule instanceof CSSStyleRule) loaded[path].push(rule.selectorText);
                        if (rule instanceof CSSImportRule && rule.styleSheet) read(rule.styleSheet);
                    }
                }
                for (const sheet of document.styleSheets) read(sheet);
                return { loaded, color: getComputedStyle(document.querySelector('button')!).color };
            });
        } finally {
            await page.unrouteAll({ behavior: 'wait' });
        }
    }
    try {
        const before = await render(files);
        assert.equal(before.color, 'rgb(0, 128, 0)');
        const graph = resolveClassStylesheets(files, [layout], {}, { paths });
        const plan = renameClass(files[main]!, files, 'a', 'action', main, graph);
        const touched = Object.keys(files)
            .filter((path) => path.endsWith('.css') && plan.files[path] !== files[path])
            .sort();
        assert.deepEqual(touched, Object.keys(before.loaded).sort());
        const after = await render(plan.files);
        assert.deepEqual(Object.keys(after.loaded).sort(), touched);
        for (const path of touched) assert.deepEqual(after.loaded[path], ['.action']);
        assert.equal(after.color, before.color);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}
