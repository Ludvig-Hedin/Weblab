import { describe, expect, test } from 'bun:test';
import { discoverProjectStylesheet } from './project-stylesheet-source';

const document = '<html><body>{children}</body></html>';
const layout = (css = './globals.css', returned = document) =>
    `import ${JSON.stringify(css)}; export default function Layout({ children }) { return ${returned}; }`;
const discover = (files: Record<string, string>, paths: readonly string[] = Object.keys(files)) =>
    discoverProjectStylesheet(async (path) => {
        if (!(path in files)) throw new Error('missing');
        return files[path]!;
    }, paths);

describe('source-owned App Router stylesheet discovery', () => {
    test('resolves the locale document relative import and parses authored imports', async () => {
        const result = await discover({
            'src/app/[locale]/layout.tsx': layout('../globals.css'),
            'src/app/globals.css': '@import "tailwindcss"; @import "../styles/tokens.css";',
        });
        expect(result).toMatchObject({ path: 'src/app/globals.css', hasTailwindImport: true, hasImportedStylesheets: true });
    });

    test('all separate document roots must share the same exact stylesheet', async () => {
        const files = {
            'src/app/(site)/layout.tsx': layout('../globals.css'),
            'src/app/(studio)/layout.tsx': layout('../globals.css'),
            'src/app/globals.css': '@import "tailwindcss";',
        };
        expect((await discover(files))?.path).toBe('src/app/globals.css');
        expect(await discover({ ...files, 'src/app/(studio)/layout.tsx': layout('./globals.css'), 'src/app/(studio)/globals.css': files['src/app/globals.css'] })).toBeNull();
        expect(await discover({ ...files, 'src/app/(studio)/layout.tsx': `export default function Studio() { return ${document}; }` })).toBeNull();
    });

    test('accepts every complete conditional document branch', async () => {
        expect(await discover({
            'app/layout.jsx': `import './globals.css'; export default function Layout({ children }) { if (privateView) return ${document}; return ${document}; }`,
            'app/globals.css': '@import "tailwindcss";',
        })).not.toBeNull();
        expect(await discover({ 'app/layout.tsx': layout('./globals.css', '<html><body /></html>'), 'app/globals.css': '@import "tailwindcss";' })).not.toBeNull();
    });

    test('accepts ordinary nested layouts only below a complete document root', async () => {
        const files = {
            'app/layout.tsx': layout(),
            'app/account/layout.tsx': 'export default function Account({children}) { return <main>{children}</main>; }',
            'app/account/page.tsx': 'export default function Page() { return <p>Account</p>; }',
            'app/globals.css': '@import "tailwindcss";',
        };
        expect(await discover(files)).not.toBeNull();
        const { 'app/layout.tsx': _root, ...rootless } = files;
        expect(await discover(rootless)).toBeNull();
    });

    test('refuses uncovered sibling routes rather than inferring success from one group', async () => {
        expect(await discover({
            'app/(site)/layout.tsx': layout(),
            'app/(site)/globals.css': '@import "tailwindcss";',
            'app/(studio)/page.tsx': 'export default function Page() { return <main />; }',
        })).toBeNull();
    });

    for (const [name, root] of [
        ['missing body', layout('./globals.css', '<html><main>{children}</main></html>')],
        ['body outside html', layout('./globals.css', '<body>{children}</body>')],
        ['nested html', layout('./globals.css', '<html><body><html><body /></html></body></html>')],
        ['alternate non-document', `import './globals.css'; export default function Layout({children}) { if (privateView) return <main />; return ${document}; }`],
        ['implicit fallthrough', `import './globals.css'; export default function Layout({children}) { if (privateView) return ${document}; }`],
        ['unrelated helper document', `import './globals.css'; function Other() { return ${document}; } export default function Layout() { return <main />; }`],
    ]) {
        test(`refuses ${name}`, async () => {
            expect(await discover({ 'app/layout.tsx': root!, 'app/globals.css': '@import "tailwindcss";' })).toBeNull();
        });
    }

    test('refuses duplicate extensions, overlapping roots and mixed app locations', async () => {
        const files = { 'app/layout.tsx': layout(), 'app/globals.css': '@import "tailwindcss";' };
        const alternatives: Array<Record<string, string>> = [
            { 'app/layout.jsx': layout() },
            { 'app/nested/layout.tsx': layout('../globals.css') },
            { 'src/app/layout.tsx': layout('../../app/globals.css') },
        ];
        for (const extra of alternatives) expect(await discover({ ...files, ...extra })).toBeNull();
    });

    for (const specifier of ['../../../escape.css', '@/app/globals.css', 'https://example.com/global.css', './theme.module.css', './globals.css?raw']) {
        test(`refuses unsupported entry ${specifier}`, async () => {
            expect(await discover({ 'app/layout.tsx': layout(specifier), 'app/globals.css': '@import "tailwindcss";' })).toBeNull();
        });
    }

    test('refuses missing, multiple, non-side-effect or malformed CSS entries', async () => {
        for (const source of [
            layout('./missing.css'),
            `import './other.css'; ${layout()}`,
            layout().replace('import "./globals.css"', 'import styles from "./globals.css"'),
        ]) expect(await discover({ 'app/layout.tsx': source, 'app/globals.css': '@import "tailwindcss";' })).toBeNull();
        expect(await discover({ 'app/layout.tsx': layout(), 'app/globals.css': 'body {' })).toBeNull();
    });

    for (const load of [
        'import("./theme.css")',
        'require("./theme.css")',
        'import(`./theme.css`)',
        'require("./theme.scss?inline")',
        'import(themePath)',
        'require(themePath)',
        'import(`./${theme}.css`)',
    ]) {
        test(`refuses an additional unmodeled load: ${load}`, async () => {
            const files = { 'app/layout.tsx': `${load}; ${layout()}`, 'app/globals.css': '@import "tailwindcss";' };
            expect(await discover(files)).toBeNull();
            expect(await discoverProjectStylesheet(async (path) => files[path as keyof typeof files] ?? '')).toBeNull();
        });
    }

    test('also refuses unmodeled CSS loads in nested layouts', async () => {
        expect(await discover({
            'app/layout.tsx': layout(),
            'app/account/layout.tsx': 'import("./theme.css"); export default function Account({children}) { return <main>{children}</main>; }',
            'app/globals.css': '@import "tailwindcss";',
        })).toBeNull();
    });

    test('does not confuse known JavaScript loads or comments with dynamic CSS', async () => {
        expect(await discover({
            'app/layout.tsx': `import("./client.js"); require("./server.js"); /* import("./theme.css") */ ${layout()}`,
            'app/globals.css': '@import "tailwindcss";',
        })).not.toBeNull();
    });

    test('parses Tailwind source scanning without trusting comments or theme-only imports', async () => {
        const files = { 'app/layout.tsx': layout(), 'app/globals.css': '/* @import "tailwindcss"; */ @import "tailwindcss/theme.css";' };
        expect((await discover(files))?.hasTailwindImport).toBe(false);
        files['app/globals.css'] = '@import "tailwindcss" source(none);';
        expect((await discover(files))?.hasDisabledSourceScanning).toBe(true);
        files['app/globals.css'] = '@import "tailwindcss"; /* source(none) */';
        expect((await discover(files))?.hasDisabledSourceScanning).toBe(false);
    });

    test('refuses an empty, missing or over-limit explicit inventory', async () => {
        expect(await discover({}, [])).toBeNull();
        expect(await discover({}, ['app/layout.tsx'])).toBeNull();
        expect(await discover({}, Array.from({ length: 501 }, (_, index) => `app/group${index}/layout.tsx`))).toBeNull();
    });

    test('legacy probing stays bounded without an explicit source inventory', async () => {
        const reads: string[] = [];
        expect(await discoverProjectStylesheet(async (path) => { reads.push(path); throw new Error('missing'); })).toBeNull();
        expect(reads).toEqual(['src/app/layout.tsx', 'app/layout.tsx', 'src/app/(site)/layout.tsx', 'app/(site)/layout.tsx']);
    });
});
