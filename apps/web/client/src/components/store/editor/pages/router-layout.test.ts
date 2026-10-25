import { describe, expect, test } from 'bun:test';
import type { ListFilesOutputFile, Provider } from '@weblab/code-provider';

import { hasAppRouterLayout } from './router-layout';

const file = (name: string, isSymlink = false): ListFilesOutputFile =>
    ({ name, type: 'file', isSymlink });
const folder = (name: string, isSymlink = false): ListFilesOutputFile =>
    ({ name, type: 'directory', isSymlink });

function fixture(tree: Record<string, ListFilesOutputFile[]>) {
    const calls: string[] = [];
    const provider: Pick<Provider, 'listFiles'> = {
        async listFiles({ args: { path } }) {
            calls.push(path);
            const files = tree[path];
            if (!files) throw new Error('Missing directory');
            return { files };
        },
    };
    return { provider, calls };
}

describe('App Router layout discovery', () => {
    test.each(['tsx', 'ts', 'jsx', 'js'])('accepts exact root layout.%s', async (extension) => {
        const { provider, calls } = fixture({ app: [file(`layout.${extension}`), folder('shop')] });
        expect(await hasAppRouterLayout(provider, 'app')).toBe(true);
        expect(calls).toEqual(['app']);
    });

    test('finds existing locale and route-group roots without a base layout', async () => {
        const { provider } = fixture({
            'src/app': [folder('[locale]'), folder('(internal)'), folder('(auth)'), folder('(studio)')],
            'src/app/[locale]': [file('layout.tsx')],
            'src/app/(internal)': [file('layout.tsx')],
            'src/app/(auth)': [file('layout.tsx')],
            'src/app/(studio)': [file('layout.tsx')],
        });
        expect(await hasAppRouterLayout(provider, 'src/app')).toBe(true);
        const group = fixture({ app: [folder('(site)')], 'app/(site)': [folder('[lang]')],
            'app/(site)/[lang]': [file('layout.jsx')] });
        expect(await hasAppRouterLayout(group.provider, 'app')).toBe(true);
    });

    test('ignores lookalike files, symlinks, private folders and unsafe names', async () => {
        const { provider, calls } = fixture({ app: [
            file('layout.test.tsx'), file('layout.tsx.bak'), file('layout.mdx'),
            file('layout.tsx', true), folder('layout.tsx', true),
            folder('_private'), folder('@parallel'), folder('.cache'), folder('node_modules'),
            folder('linked', true), folder('../outside'), folder('a/b'), folder('a\\b'),
            folder(''), folder('.'), folder('..'),
        ] });
        expect(await hasAppRouterLayout(provider, 'app')).toBe(false);
        expect(calls).toEqual(['app']);
    });

    test('a directory named layout.tsx is not itself a layout', async () => {
        const { provider } = fixture({ app: [folder('layout.tsx')], 'app/layout.tsx': [] });
        expect(await hasAppRouterLayout(provider, 'app')).toBe(false);
    });

    test.each(['components', 'lib', 'utils', 'api'])('searches valid route segment %s', async (name) => {
        const { provider } = fixture({ app: [folder(name)], [`app/${name}`]: [file('layout.tsx')] });
        expect(await hasAppRouterLayout(provider, 'app')).toBe(true);
    });

    test('a missing or unreadable child does not hide an existing sibling layout', async () => {
        const { provider } = fixture({ app: [folder('missing'), folder('(site)')],
            'app/(site)': [file('layout.tsx')] });
        expect(await hasAppRouterLayout(provider, 'app')).toBe(true);
        expect(await hasAppRouterLayout(provider, 'src/app')).toBe(false);
    });

    test('caps listings and queued directories at 128', async () => {
        const tree: Record<string, ListFilesOutputFile[]> = {
            app: Array.from({ length: 200 }, (_, i) => folder(`route${i}`)),
        };
        for (let i = 0; i < 200; i++) tree[`app/route${i}`] = [];
        tree['app/route127'] = [file('layout.tsx')];
        const { provider, calls } = fixture(tree);
        expect(await hasAppRouterLayout(provider, 'app')).toBe(false);
        expect(calls).toHaveLength(128);
        expect(calls.at(-1)).toBe('app/route126');
    });

    test('includes depth 12 but never lists depth 13', async () => {
        const tree: Record<string, ListFilesOutputFile[]> = {};
        let path = 'app';
        for (let depth = 0; depth <= 13; depth++) {
            tree[path] = [folder('nested')];
            path += '/nested';
        }
        const atDepth12 = `app${'/nested'.repeat(12)}`;
        tree[`${atDepth12}/nested`] = [file('layout.tsx')];
        const first = fixture(tree);
        expect(await hasAppRouterLayout(first.provider, 'app')).toBe(false);
        expect(first.calls).toHaveLength(13);
        tree[atDepth12] = [file('layout.tsx')];
        expect(await hasAppRouterLayout(fixture(tree).provider, 'app')).toBe(true);
    });
});
