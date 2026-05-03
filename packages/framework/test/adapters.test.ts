import { describe, expect, test } from 'bun:test';

import { RouterType } from '@weblab/models';

import type { ProjectFile } from '../src';
import {
    astroAdapter,
    DEFAULT_FRAMEWORK_ADAPTER,
    getFrameworkAdapter,
    isFrameworkReady,
    listFrameworkAdapters,
    listReadyFrameworkAdapters,
    nextjsAdapter,
    remixAdapter,
    staticHtmlAdapter,
    tanstackStartAdapter,
    viteReactAdapter,
} from '../src';

function packageJson(
    deps: Record<string, string>,
    devDeps: Record<string, string> = {},
): ProjectFile {
    return {
        path: 'package.json',
        content: JSON.stringify({ dependencies: deps, devDependencies: devDeps }),
    };
}

describe('registry', () => {
    test('default adapter is Next.js', () => {
        expect(DEFAULT_FRAMEWORK_ADAPTER.id).toBe('nextjs');
    });

    test('getFrameworkAdapter falls back to Next.js for unknown ids', () => {
        expect(getFrameworkAdapter('does-not-exist').id).toBe('nextjs');
        expect(getFrameworkAdapter(null).id).toBe('nextjs');
        expect(getFrameworkAdapter(undefined).id).toBe('nextjs');
    });

    test('all six adapters registered in expected order', () => {
        const ids = listFrameworkAdapters().map((a) => a.id);
        expect(ids).toEqual([
            'nextjs',
            'vite-react',
            'remix',
            'astro',
            'tanstack-start',
            'static-html',
        ]);
    });

    test('isFrameworkReady is true only for Next.js (until other templates land)', () => {
        const ready = listReadyFrameworkAdapters();
        expect(ready.map((a) => a.id)).toEqual(['nextjs']);
        expect(isFrameworkReady(nextjsAdapter)).toBe(true);
        expect(isFrameworkReady(viteReactAdapter)).toBe(false);
    });
});

describe('nextjsAdapter.validate', () => {
    test('rejects when package.json is missing', async () => {
        const result = await nextjsAdapter.validate([]);
        expect(result.isValid).toBe(false);
    });

    test('rejects when next is missing', async () => {
        const result = await nextjsAdapter.validate([packageJson({ react: '19' })]);
        expect(result.isValid).toBe(false);
        if (!result.isValid) expect(result.error).toContain('Next.js');
    });

    test('rejects when react is missing', async () => {
        const result = await nextjsAdapter.validate([
            packageJson({ next: '15', tailwindcss: '3' }),
        ]);
        expect(result.isValid).toBe(false);
    });

    test('rejects when tailwind is missing', async () => {
        const result = await nextjsAdapter.validate([packageJson({ next: '15', react: '19' })]);
        expect(result.isValid).toBe(false);
        if (!result.isValid) expect(result.error).toContain('Tailwind');
    });

    test('rejects when neither app/ nor pages/ is present', async () => {
        const result = await nextjsAdapter.validate([
            packageJson({ next: '15', react: '19', tailwindcss: '3' }),
        ]);
        expect(result.isValid).toBe(false);
    });

    test('accepts App Router projects', async () => {
        const result = await nextjsAdapter.validate([
            packageJson({ next: '15', react: '19', tailwindcss: '3' }),
            { path: 'app/layout.tsx', content: 'export default function L() { return null }' },
        ]);
        expect(result.isValid).toBe(true);
        if (result.isValid) expect(result.routerType).toBe(RouterType.APP);
    });

    test('accepts Pages Router projects', async () => {
        const result = await nextjsAdapter.validate([
            packageJson({ next: '15', react: '19', tailwindcss: '3' }),
            { path: 'pages/index.tsx', content: 'export default function P() { return null }' },
        ]);
        expect(result.isValid).toBe(true);
        if (result.isValid) expect(result.routerType).toBe(RouterType.PAGES);
    });
});

describe('viteReactAdapter.validate', () => {
    test('rejects without vite', async () => {
        const result = await viteReactAdapter.validate([
            packageJson({ react: '19' }),
            { path: 'index.html', content: '<!doctype html>' },
        ]);
        expect(result.isValid).toBe(false);
    });

    test('rejects without index.html', async () => {
        const result = await viteReactAdapter.validate([packageJson({ vite: '5', react: '19' })]);
        expect(result.isValid).toBe(false);
        if (!result.isValid) expect(result.error).toContain('index.html');
    });

    test('accepts vite + react + index.html', async () => {
        const result = await viteReactAdapter.validate([
            packageJson({ vite: '5', react: '19' }),
            { path: 'index.html', content: '<!doctype html>' },
        ]);
        expect(result.isValid).toBe(true);
    });

    test('warns when tailwind is missing', async () => {
        const result = await viteReactAdapter.validate([
            packageJson({ vite: '5', react: '19' }),
            { path: 'index.html', content: '<!doctype html>' },
        ]);
        expect(result.isValid).toBe(true);
        if (result.isValid) {
            expect(result.warnings ?? []).toContainEqual(expect.stringContaining('Tailwind'));
        }
    });
});

describe('remixAdapter.validate', () => {
    test('accepts @remix-run projects with app/', async () => {
        const result = await remixAdapter.validate([
            packageJson({ '@remix-run/react': '2', react: '18' }),
            { path: 'app/root.tsx', content: '' },
        ]);
        expect(result.isValid).toBe(true);
    });

    test('accepts react-router v7 projects with app/', async () => {
        const result = await remixAdapter.validate([
            packageJson({ 'react-router': '^7.0.0', react: '19' }),
            { path: 'app/root.tsx', content: '' },
        ]);
        expect(result.isValid).toBe(true);
    });

    test('rejects react-router v6', async () => {
        const result = await remixAdapter.validate([
            packageJson({ 'react-router': '^6.0.0', react: '18' }),
            { path: 'app/root.tsx', content: '' },
        ]);
        expect(result.isValid).toBe(false);
    });

    test('rejects without app/ directory', async () => {
        const result = await remixAdapter.validate([
            packageJson({ '@remix-run/react': '2', react: '18' }),
        ]);
        expect(result.isValid).toBe(false);
    });
});

describe('astroAdapter.validate', () => {
    test('accepts astro + src/', async () => {
        const result = await astroAdapter.validate([
            packageJson({ astro: '4' }),
            { path: 'src/pages/index.astro', content: '' },
        ]);
        expect(result.isValid).toBe(true);
    });

    test('rejects without astro dep', async () => {
        const result = await astroAdapter.validate([
            packageJson({ react: '19' }),
            { path: 'src/pages/index.tsx', content: '' },
        ]);
        expect(result.isValid).toBe(false);
    });

    test('warns when no .astro files exist', async () => {
        const result = await astroAdapter.validate([
            packageJson({ astro: '4' }),
            { path: 'src/main.tsx', content: '' },
        ]);
        expect(result.isValid).toBe(true);
        if (result.isValid) {
            expect(result.warnings ?? []).toContainEqual(expect.stringContaining('.astro'));
        }
    });
});

describe('tanstackStartAdapter.validate', () => {
    test('accepts @tanstack/start with src/routes/', async () => {
        const result = await tanstackStartAdapter.validate([
            packageJson({ '@tanstack/start': '1', react: '19' }),
            { path: 'src/routes/__root.tsx', content: '' },
        ]);
        expect(result.isValid).toBe(true);
    });

    test('rejects without @tanstack/start', async () => {
        const result = await tanstackStartAdapter.validate([
            packageJson({ react: '19' }),
            { path: 'src/routes/index.tsx', content: '' },
        ]);
        expect(result.isValid).toBe(false);
    });

    test('rejects without routes directory', async () => {
        const result = await tanstackStartAdapter.validate([
            packageJson({ '@tanstack/start': '1', react: '19' }),
        ]);
        expect(result.isValid).toBe(false);
    });
});

describe('staticHtmlAdapter.validate', () => {
    test('accepts a folder with just an index.html', async () => {
        const result = await staticHtmlAdapter.validate([
            { path: 'index.html', content: '<!doctype html><h1>hi</h1>' },
            { path: 'styles.css', content: 'body{}' },
        ]);
        expect(result.isValid).toBe(true);
    });

    test('rejects without index.html', async () => {
        const result = await staticHtmlAdapter.validate([
            { path: 'page.html', content: '<!doctype html>' },
        ]);
        expect(result.isValid).toBe(false);
        if (!result.isValid) expect(result.error).toContain('index.html');
    });

    test('does NOT require a package.json', async () => {
        const result = await staticHtmlAdapter.validate([
            { path: 'index.html', content: '<!doctype html>' },
        ]);
        expect(result.isValid).toBe(true);
    });
});
