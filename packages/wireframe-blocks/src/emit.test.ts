import { describe, expect, test } from 'bun:test';

import type { EmitPage } from './emit/build-emit';
import { buildEmitFiles, emitPageFile, normalizeSlug, pagePathForSlug } from './emit/build-emit';
import { BLOCKS_META, getBlockMeta } from './meta';

function defaultsFor(id: string): unknown {
    return getBlockMeta(id)?.defaultContent ?? {};
}

const samplePages: EmitPage[] = [
    {
        slug: 'home',
        title: 'Home',
        sections: [
            { blockId: 'lp-navbar-1', content: defaultsFor('lp-navbar-1') },
            { blockId: 'hero-1', content: defaultsFor('hero-1') },
            { blockId: 'cta-1', content: defaultsFor('cta-1') },
            { blockId: 'footer-1', content: defaultsFor('footer-1') },
        ],
    },
    {
        slug: 'pricing',
        title: 'Pricing',
        sections: [
            { blockId: 'lp-navbar-1', content: defaultsFor('lp-navbar-1') },
            { blockId: 'pricing-2', content: defaultsFor('pricing-2') },
            { blockId: 'footer-1', content: defaultsFor('footer-1') },
        ],
    },
];

describe('slug helpers', () => {
    test('normalizeSlug maps home/index to the index route', () => {
        expect(normalizeSlug('home')).toBe('');
        expect(normalizeSlug('index')).toBe('');
        expect(normalizeSlug('/About Us/')).toBe('about-us');
        expect(normalizeSlug('Blog/Post')).toBe('blog/post');
    });

    test('pagePathForSlug dedupes collisions', () => {
        const taken = new Set<string>();
        expect(pagePathForSlug('home', taken)).toBe('src/app/page.tsx');
        expect(pagePathForSlug('about', taken)).toBe('src/app/about/page.tsx');
        // duplicate "about" must not overwrite the first
        expect(pagePathForSlug('about', taken)).toBe('src/app/about-2/page.tsx');
        // a second home collides with the index route
        expect(pagePathForSlug('home', taken)).toBe('src/app/page-2/page.tsx');
    });
});

describe('emitPageFile', () => {
    test('imports each used block once and renders content', () => {
        const src = emitPageFile(samplePages[0]!);
        expect(src).toContain("from '@/components/wireframe-blocks/hero-1'");
        expect(src).toContain('export default function Page()');
        // content is inlined as a JS object literal
        expect(src).toContain('content={');
        // one import per distinct block (navbar used once here)
        const navImports = src.match(/wireframe-blocks\/lp-navbar-1'/g) ?? [];
        expect(navImports.length).toBe(1);
    });

    test('empty page still emits a valid main', () => {
        const src = emitPageFile({ slug: 'blank', title: 'Blank', sections: [] });
        expect(src).toContain('<main');
        expect(src).not.toContain('undefined');
    });
});

describe('buildEmitFiles', () => {
    test('produces a bootable file set: a page per page, shared _ui, every used block', () => {
        const files = buildEmitFiles(samplePages);
        const paths = new Set(files.map((f) => f.path));

        expect(paths.has('src/app/page.tsx')).toBe(true);
        expect(paths.has('src/app/pricing/page.tsx')).toBe(true);
        expect(paths.has('src/components/wireframe-blocks/_ui.tsx')).toBe(true);

        // every block referenced by any page file has an emitted source file
        const pageFiles = files.filter(
            (f) => f.path.endsWith('/page.tsx') || f.path === 'src/app/page.tsx',
        );
        for (const pf of pageFiles) {
            const refs = [
                ...pf.content.matchAll(/@\/components\/wireframe-blocks\/([a-z0-9-]+)'/g),
            ];
            for (const m of refs) {
                const id = m[1]!;
                expect(paths.has(`src/components/wireframe-blocks/${id}.tsx`)).toBe(true);
            }
        }
    });

    test('applies style guide globals when provided', () => {
        const files = buildEmitFiles(samplePages, { globalsCss: ':root{--x:1}' });
        const globals = files.find((f) => f.path === 'src/app/globals.css');
        expect(globals?.content).toContain('--x:1');
    });

    test('emitted block sources are self-contained (no external component deps)', () => {
        const files = buildEmitFiles(samplePages);
        const blockFiles = files.filter((f) =>
            f.path.startsWith('src/components/wireframe-blocks/'),
        );
        expect(blockFiles.length).toBeGreaterThan(0);
        for (const bf of blockFiles) {
            // blocks may only import React + sibling ./_ui — nothing that needs
            // an extra npm dependency in the emitted project.
            expect(bf.content).not.toContain('@/components/ui/');
            expect(bf.content).not.toContain('@weblab/');
            expect(bf.content).not.toContain('lucide-react');
            expect(bf.content).not.toContain('next/image');
        }
    });

    test('all 15 curated blocks have emit sources', () => {
        const allPages: EmitPage[] = [
            {
                slug: 'kitchen-sink',
                title: 'All',
                sections: BLOCKS_META.map((m) => ({ blockId: m.id, content: m.defaultContent })),
            },
        ];
        const files = buildEmitFiles(allPages);
        const paths = new Set(files.map((f) => f.path));
        for (const meta of BLOCKS_META) {
            expect(paths.has(`src/components/wireframe-blocks/${meta.id}.tsx`)).toBe(true);
        }
    });
});
