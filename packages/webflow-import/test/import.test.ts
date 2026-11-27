import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';

import { convertWebflowExport, importWebflowExport } from '../src';

const fixture = fileURLToPath(new URL('./fixtures/site/', import.meta.url));
const result = () => importWebflowExport(fixture);
const textFile = (files: Awaited<ReturnType<typeof result>>['files'], path: string) => {
    const content = files.find((file) => file.path === path)?.content;
    if (typeof content !== 'string') throw new Error(`Expected a text file at ${path}`);
    return content;
};

test('converts page markup, preserving IX2 start styles and SVG names', async () => {
    const { files } = await result();
    const page = textFile(files, 'app/page.tsx');
    expect(page).toContain('className="hero"');
    expect(page).toContain('data-w-id="intro"');
    expect(page).toContain('"opacity":"0"');
    expect(page).toContain('"--accent":"red"');
    expect(page).toContain('viewBox="0 0 10 10"');
    expect(page).toContain('strokeWidth="2"');
    expect(page).toContain('fillRule="evenodd"');
    expect(page).toContain('xlinkHref="/images/hero.svg#shape"');
    expect(page).toContain('htmlFor="email"');
    expect(page).toContain('required />');
    expect(page).toContain('defaultValue="Company"');
    expect(page).toContain('{/* Hero */}');
    expect(page).toContain('{"Hello & {world}"}');
});

test('extracts shared navigation and footer and keeps page-specific document attributes', async () => {
    const { files } = await result();
    const layout = textFile(files, 'app/layout.tsx');
    expect(layout).toContain('className="w-nav"');
    expect(layout).toContain('<footer>');
    expect(textFile(files, 'app/page.tsx')).not.toContain('className="w-nav"');
    expect(textFile(files, 'app/work/page.tsx')).not.toContain('<footer>');
    expect(layout).toContain('"data-wf-page":"home"');
    expect(layout).toContain('"data-wf-page":"work"');
    expect(layout).toContain('"data-wf-site":"site"');
    expect(layout).toContain('homepage');
    expect(layout).toContain('next/script');
    expect(layout.indexOf('jquery-3.5.1.min.js')).toBeLessThan(layout.indexOf('/js/webflow.js'));
    expect(layout.match(/src="\/js\/webflow.js"/g)).toHaveLength(1);
    expect(layout).toContain('crossOrigin="anonymous"');
    expect(layout.indexOf('/css/normalize.css')).toBeLessThan(layout.indexOf('/css/webflow.css'));
    expect(textFile(files, 'app/detail_project/page.tsx')).toContain('CMS template');
});

test('rewrites folder links, SEO images and asset references and reports forms and missing assets', async () => {
    const { files, report, frames } = await result();
    const page = textFile(files, 'app/page.tsx');
    expect(page).toContain('"title":"Home & Studio"');
    expect(page).toContain(
        '"openGraph":{"title":"Studio","images":[{"url":"/images/hero.svg","alt":"A red square"}]}',
    );
    expect(page).toContain('src="/images/hero.svg"');
    expect(page).toContain('srcSet="/images/hero.svg 1x, /images/missing.svg 2x"');
    expect(textFile(files, 'app/work/page.tsx')).toContain('href="/?q=1#intro"');
    expect(files.find((file) => file.path === 'public/fonts/local.woff2')?.content).toEqual(
        new Uint8Array(await readFile(`${fixture}/fonts/local.woff2`)),
    );
    expect(report.forms).toEqual([{ page: '/', id: 'contact', name: null, action: null }]);
    expect(report.missingAssets).toEqual([{ source: 'index.html', path: 'images/missing.svg' }]);
    expect(JSON.parse(textFile(files, 'weblab-import-report.json'))).toEqual(report);
    expect(frames).toEqual([
        { width: 991, direction: 'down' },
        { width: 767, direction: 'down' },
        { width: 479, direction: 'down' },
        { width: 1280, direction: 'up' },
        { width: 1440, direction: 'up' },
        { width: 1920, direction: 'up' },
    ]);
});

test('uses next/font for supported families and leaves unsupported WebFont calls intact', async () => {
    const { files } = await result();
    const layout = textFile(files, 'app/layout.tsx');
    const css = textFile(files, 'public/css/studio.webflow.css');
    expect(layout).toContain('import { Inter } from "next/font/google"');
    expect(layout).not.toContain('WebFont.load');
    expect(css).toContain('var(--webflow-font-0, "Inter"), Local, sans-serif');
    const unsupported = convertWebflowExport([
        {
            path: 'index.html',
            content:
                '<script>WebFont.load({google:{families:["Some Other Font:400"]}});</script><main>Home</main>',
        },
    ]);
    expect(textFile(unsupported.files, 'app/layout.tsx')).toContain('WebFont.load');
    expect(unsupported.report.warnings.join(' ')).toContain('Some Other Font');
});

test('extracts nested shared chrome without changing its wrapper or page-specific content', () => {
    const { files } = convertWebflowExport(
        ['index', 'work'].map((name) => ({
            path: name + '.html',
            content: `<div class="site-wrapper"><nav>Menu</nav><main>${name}</main><footer>Studio</footer></div>`,
        })),
    );
    const layout = textFile(files, 'app/layout.tsx');
    expect(layout).toContain('className="site-wrapper"');
    expect(layout).toContain('<nav>');
    expect(layout).toContain('<footer>');
    expect(textFile(files, 'app/page.tsx')).not.toContain('site-wrapper');
    expect(textFile(files, 'app/work/page.tsx')).toContain('{"work"}');
});

test('leaves different navigation in each page', () => {
    const { files } = convertWebflowExport(
        ['index', 'work'].map((name) => ({
            path: name + '.html',
            content: `<nav><a href="${name}.html" aria-current="page">${name}</a></nav><main>Content</main>`,
        })),
    );
    expect(textFile(files, 'app/layout.tsx')).not.toContain('<nav>');
    expect(textFile(files, 'app/page.tsx')).toContain('<nav>');
    expect(textFile(files, 'app/work/page.tsx')).toContain('href="/work" aria-current="page"');
});

test('generated modules are valid TSX with React numeric props and CSS custom properties', async () => {
    const { files } = convertWebflowExport([
        {
            path: 'index.html',
            content:
                '<div tabindex="0" style="--accent: red" data-w-id="enter"><textarea rows="4">Text</textarea></div>',
        },
    ]);
    const page = textFile(files, 'app/page.tsx');
    expect(page).toContain('tabIndex={0}');
    expect(page).toContain('rows={4}');
    expect(page).toContain('style={{"--accent":"red"} as CSSProperties}');
    for (const file of files.filter(({ path }) => /\.tsx?$/.test(path))) {
        expect(() =>
            new Bun.Transpiler({ loader: 'tsx' }).transformSync(textFile(files, file.path)),
        ).not.toThrow();
    }
});

describe('unsupported exports', () => {
    test.each([
        ['ecommerce', '<div class="w-commerce-commercecartwrapper"></div>'],
        ['memberships', '<div class="w-users-userformpagewrap"></div>'],
        ['localization', '<link rel="alternate" hreflang="sv" href="/sv/">'],
    ] as const)('refuses %s with a report and no runnable code', (feature, content) => {
        const { files, report } = convertWebflowExport([{ path: 'index.html', content }]);
        expect(report.refused).toHaveLength(1);
        expect(report.refused[0]?.feature).toBe(feature);
        expect(report.refused[0]?.source).toBe('index.html');
        expect(report.refused[0]?.reason.length).toBeGreaterThan(0);
        expect(files.map((file) => file.path)).toEqual(['weblab-import-report.json']);
    });

    test('refuses colliding routes', () => {
        const { report } = convertWebflowExport([
            { path: 'work.html', content: '<p>One</p>' },
            { path: 'work/index.html', content: '<p>Two</p>' },
        ]);
        expect(report.refused[0]?.reason).toContain(
            'Both work.html and work/index.html map to /work',
        );
    });

    test('rejects paths outside the export before emitting code', () => {
        const { report } = convertWebflowExport([
            { path: '../index.html', content: '<p>Home</p>' },
        ]);
        expect(report.refused[0]?.feature).toBe('invalid-export');
    });

    test('accepts an export where only some pages include a single Webflow locale ID', () => {
        const { report } = convertWebflowExport([
            { path: 'index.html', content: '<html lang="en" data-wf-locale="primary"><p>Home</p>' },
            { path: 'work.html', content: '<html lang="en"><p>Work</p>' },
        ]);
        expect(report.refused).toEqual([]);
    });
});

test('converts the full fixture deterministically', async () => {
    const { files, frames } = await result();
    const snapshot = {
        files: files.map(({ path, content }) => [
            path,
            typeof content === 'string' ? content : Array.from(content),
        ]),
        frames,
    };
    expect(JSON.stringify(snapshot, null, 2)).toMatchSnapshot();
});
