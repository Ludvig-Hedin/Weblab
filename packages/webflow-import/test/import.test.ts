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

test('keeps WebFont for an external stylesheet that uses original family names', () => {
    const { files } = convertWebflowExport([
        {
            path: 'index.html',
            content: `<link rel="stylesheet" href="//cdn.example.com/site.css">
            <script src="https://cdn.example.com/webfont.js"></script>
            <script>WebFont.load({google:{families:["Montserrat:400,600"]}});</script>
            <main>Home</main>`,
        },
    ]);
    const layout = textFile(files, 'app/layout.tsx');
    expect(layout).toContain('src="https://cdn.example.com/webfont.js"');
    expect(layout).toContain('WebFont.load');
    expect(layout).not.toContain('next/font/google');
});

test('keeps a position-dependent script inside its embed', () => {
    const { files } = convertWebflowExport([
        {
            path: 'index.html',
            content: `<div class="w-embed"><script>document.currentScript.parentElement.classList.add("ready")</script></div>`,
        },
    ]);
    const page = textFile(files, 'app/page.tsx');
    expect(page).toContain('<div className="w-embed"><script');
    expect(page).toContain('document.currentScript.parentElement');
    expect(textFile(files, 'app/layout.tsx')).not.toContain('document.currentScript');
});

test('opts an async embed script out of React hoisting without dropping async', () => {
    const { files } = convertWebflowExport([
        {
            path: 'index.html',
            content: '<div class="w-embed"><script src="js/embed.js" async></script></div>',
        },
        {
            path: 'js/embed.js',
            content: 'document.currentScript.parentElement.classList.add("ready")',
        },
    ]);
    expect(textFile(files, 'app/page.tsx')).toContain(
        '<script src="/js/embed.js" async itemProp=""',
    );
});

test('shares navigation only when its inline CSS resolves to the same assets', () => {
    const nav = '<nav style="background-image:url(bg.png)">Home</nav><main>Content</main>';
    const { files } = convertWebflowExport([
        { path: 'index.html', content: nav },
        { path: 'sub/work.html', content: nav },
        { path: 'bg.png', content: new Uint8Array([1]) },
        { path: 'sub/bg.png', content: new Uint8Array([2]) },
    ]);
    expect(textFile(files, 'app/page.tsx')).toContain('url(/bg.png)');
    expect(textFile(files, 'app/sub/work/page.tsx')).toContain('url(/sub/bg.png)');
    expect(textFile(files, 'app/layout.tsx')).not.toContain('<nav');
});

test('keeps a newline between inline navigation links on the page that has it', () => {
    const { files } = convertWebflowExport([
        { path: 'index.html', content: '<nav><a>A</a>\n<a>B</a></nav>' },
        { path: 'about.html', content: '<nav><a>A</a><a>B</a></nav>' },
    ]);
    expect(textFile(files, 'app/page.tsx')).toContain('</a>{"\\n"}<a>');
    expect(textFile(files, 'app/about/page.tsx')).toContain('</a><a>');
    expect(textFile(files, 'app/layout.tsx')).not.toContain('<nav>');
});

test('uses the exported root 404 design and document styles for missing routes', () => {
    const { files } = convertWebflowExport([
        { path: 'index.html', content: '<body class="home"><h1>Home</h1>' },
        {
            path: '404.html',
            content:
                '<html data-wf-page="gone"><link rel="stylesheet" href="css/gone.css"><body class="gone"><h1>Gone</h1>',
        },
        { path: 'css/gone.css', content: '.gone {color:red}' },
    ]);
    expect(textFile(files, 'app/not-found.tsx')).toContain('export { default } from "./404/page"');
    expect(textFile(files, 'app/404/page.tsx')).toContain('{"Gone"}');
    const layout = textFile(files, 'app/layout.tsx');
    expect(layout).toContain('layouts.get(path) ?? layouts.get("/404")');
    expect(layout).toContain('"data-wf-page":"gone"');
    expect(layout).toContain('className="gone"');
    expect(layout).toContain('href="/css/gone.css"');
});

test('generates a page viewport with custom mobile layout settings', () => {
    const { files } = convertWebflowExport([
        { path: 'index.html', content: '<main>Home</main>' },
        {
            path: 'fixed.html',
            content: '<meta name="viewport" content="width=960"><main>Fixed</main>',
        },
        {
            path: 'work.html',
            content:
                '<meta name="viewport" content="width=960, initial-scale=0.5, maximum-scale=3, user-scalable=no, viewport-fit=cover"><main>Work</main>',
        },
    ]);
    expect(textFile(files, 'app/work/page.tsx')).toContain(
        'export const viewport: Viewport = {"width":960,"initialScale":0.5,"maximumScale":3,"userScalable":false,"viewportFit":"cover"}',
    );
    expect(textFile(files, 'app/page.tsx')).not.toContain('export const viewport');
    expect(textFile(files, 'app/fixed/page.tsx')).toContain(
        'export const viewport: Viewport = {"width":960,"initialScale":undefined}',
    );
    expect(textFile(files, 'app/layout.tsx')).not.toContain('name="viewport"');
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
