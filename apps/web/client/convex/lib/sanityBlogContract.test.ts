import { describe, expect, test } from 'bun:test';
import { BLOG_PROFILE, SANITY_BLOG_MAX_BYTES, applyBlogOperations, applyBlogStructuralOperation, blogEditableTextKeys, blogSummary, newBlogDocument, parseBlogDocument, parseBlogOperations, sanitizeSanityCoordinates, type BlogOperation } from './sanityBlogContract';

export function blogFixture() {
    return {
        _id: 'article-1', _rev: 'rev-one', _type: 'blogPost', _createdAt: '2026-10-01T12:00:00Z',
        title: 'Ett exempelinlägg', slug: { _type: 'slug', current: 'ett-exempelinlagg', custom: true },
        excerpt: 'Nyheter', publishedAt: '2026-10-01T12:00:00Z', author: 'Anna', categories: ['Nyheter', 'Tips'],
        content: [
            { _key: 'paragraph', _type: 'block', style: 'h3', listItem: 'bullet', level: 2,
                children: [{ _key: 'span-one', _type: 'span', text: 'Läs mer', marks: ['strong', 'link-one'], extra: { keep: true } }],
                markDefs: [{ _key: 'link-one', _type: 'link', href: 'https://example.com/article', custom: 'keep' }], custom: { original: true } },
            { _key: 'image-one', _type: 'image', asset: { _type: 'reference', _ref: 'image-abc-800x600-jpg', weak: true },
                alt: 'Cykel', caption: 'På väg', crop: { left: 0.1 }, hotspot: { x: 0.5, y: 0.3 } },
            { _key: 'custom-one', _type: 'customEmbed', opaque: { future: [1, 2] } },
        ],
        heroImage: { _type: 'image', asset: { _type: 'reference', _ref: 'image-hero-800x600-jpg' }, alt: 'Hero', hotspot: { x: 0.3 } },
        seo: { _type: 'seo', metaTitle: 'Custom', noIndex: true, custom: { future: true } },
        unknownMetadata: { source: { nested: [true, 42] } },
    };
}
function apply(operations: BlogOperation[], fixture: unknown = blogFixture()): Record<string, unknown> {
    return parseBlogDocument(applyBlogOperations(JSON.stringify(fixture), JSON.stringify(operations)));
}
describe('real Sanity blog schema contract', () => {
    test('explicit scalar and categories edits preserve all source metadata', () => {
        const original = blogFixture();
        const edited = apply([
            { kind: 'set', field: 'title', value: 'Ny titel' },
            { kind: 'set', field: 'slug', value: 'ny-titel' },
            { kind: 'set', field: 'excerpt', value: 'En ingress' },
            { kind: 'set', field: 'author', value: 'Bo' },
            { kind: 'set', field: 'publishedAt', value: '2026-10-02T10:00:00+02:00' },
            { kind: 'categories', value: ['Tips'] },
        ]);
        expect(edited).toEqual({ ...original, title: 'Ny titel', slug: { ...original.slug, current: 'ny-titel' }, excerpt: 'En ingress', author: 'Bo', publishedAt: '2026-10-02T10:00:00+02:00', categories: ['Tips'] });
        expect(original.title).toBe('Ett exempelinlägg');
    });
    test('span, link and inline image text edits preserve formatting, assets and unknown siblings', () => {
        const original = blogFixture();
        const edited = apply([
            { kind: 'span', blockKey: 'paragraph', spanKey: 'span-one', text: 'Uppdaterad text' },
            { kind: 'link', blockKey: 'paragraph', markKey: 'link-one', href: 'mailto:hello@example.com' },
            { kind: 'imageText', blockKey: 'image-one', field: 'alt', value: 'Ny bildtext' },
            { kind: 'imageText', blockKey: 'image-one', field: 'caption', value: 'Nytt foto' },
        ]);
        const expected = structuredClone(original);
        expected.content[0]!.children![0]!.text = 'Uppdaterad text';
        expected.content[0]!.markDefs![0]!.href = 'mailto:hello@example.com';
        expected.content[1]!.alt = 'Ny bildtext';
        expected.content[1]!.caption = 'Nytt foto';
        expect(edited).toEqual(expected);
    });
    test('does not invent pilot body/category fields or flatten unknown content', () => {
        expect(BLOG_PROFILE).toBe('sanity-blog-v1');
        const fixture = blogFixture();
        const parsed = parseBlogDocument(JSON.stringify(fixture));
        expect(parsed).toEqual(fixture);
        expect(parsed.body).toBeUndefined();
        expect(parsed.category).toBeUndefined();
        expect(blogSummary(JSON.stringify(fixture))).toEqual({ documentId: 'article-1', title: fixture.title, slug: fixture.slug.current, excerpt: 'Nyheter', publishedAt: fixture.publishedAt });
    });
    test('new local documents have one editable stable paragraph and no remote revision', () => {
        const id = 'weblab-124a71b3-9040-4bc1-a036-92d7cde2a6bb';
        const json = newBlogDocument(id, 'Nytt inlägg', 'nytt-inlagg', '2026-10-02T12:00:00Z');
        expect(parseBlogDocument(json)._rev).toBeUndefined();
        expect(parseBlogDocument(applyBlogOperations(json, JSON.stringify([{ kind: 'span', blockKey: 'block-new', spanKey: 'span-new', text: 'Första stycket' }]))).content).toMatchObject([{ children: [{ text: 'Första stycket' }] }]);
        expect(() => newBlogDocument('other', 'Title', 'title', '2026-10-02T12:00:00Z')).toThrow('UUID');
    });
    test('refuses draft, version, missing or invalid source identity/revision', () => {
        for (const _id of ['drafts.article-1', 'versions.release.article-1', '../other', '']) expect(() => parseBlogDocument(JSON.stringify({ ...blogFixture(), _id }))).toThrow();
        for (const _rev of [null, '', 'bad.rev', 'a'.repeat(129), undefined]) expect(() => parseBlogDocument(JSON.stringify({ ...blogFixture(), _rev }))).toThrow();
        expect(() => parseBlogDocument(JSON.stringify({ ...blogFixture(), _type: 'pilotPost' }))).toThrow();
    });
    test('only explicit operations can change source content, never identities or whole JSON', () => {
        for (const operation of [
            { kind: 'set', field: '_rev', value: 'new' }, { kind: 'set', field: 'body', value: 'bad' },
            { kind: 'set', field: 'category', value: 'bad' }, { kind: 'set', field: 'title', value: 'Title', _id: 'other' },
            { kind: 'replace', document: blogFixture() }, { kind: 'imageText', blockKey: 'image-one', field: 'asset', value: 'bad' },
        ]) expect(() => parseBlogOperations(JSON.stringify([operation]))).toThrow();
        expect(() => parseBlogOperations('[]')).toThrow();
    });
    test('validates title, slug, excerpt and actual datetime before editing', () => {
        for (const [field, value] of [['title', '  '], ['slug', 'å/Invalid'], ['slug', 'a'.repeat(97)], ['excerpt', 'x'.repeat(281)], ['publishedAt', '2026-02-30T12:00:00Z'], ['publishedAt', '2026-10-02'], ['publishedAt', '2026-10-02T24:00:00Z']]) {
            expect(() => parseBlogOperations(JSON.stringify([{ kind: 'set', field, value }]))).toThrow();
        }
        expect(() => parseBlogDocument(JSON.stringify({ ...blogFixture(), author: { _ref: 'author-one' } }))).toThrow();
        expect(() => parseBlogDocument(JSON.stringify({ ...blogFixture(), categories: [{ _ref: 'category-one' }] }))).toThrow();
    });
    test('preserves existing encoded Unicode paths through unrelated edits', () => {
        for (const current of ['r%C3%B6rmokare-i-stockholm', 'ro%cc%88rmokare', '%f0%9f%90%a3-vi-firar-pasken-och-bjuder-pa-nagot-extra']) {
            const original = blogFixture();
            original.slug.current = current;
            const edited = apply([{ kind: 'set', field: 'title', value: 'Ny titel' }, { kind: 'span', blockKey: 'paragraph', spanKey: 'span-one', text: 'Ny text' }], original);
            expect(edited.slug).toEqual(original.slug);
            expect(blogSummary(JSON.stringify(original)).slug).toBe(current);
            expect(() => parseBlogOperations(JSON.stringify([{ kind: 'set', field: 'slug', value: current }]))).toThrow();
            expect(() => newBlogDocument('weblab-124a71b3-9040-4bc1-a036-92d7cde2a6bb', 'Title', current, '2026-10-02T12:00:00Z')).toThrow();
        }
    });
    test('encoded source slugs reject delimiters, traversal, controls and malformed UTF-8', () => {
        for (const current of ['bad%2fpath', 'bad%5Cpath', '%2E%2E', 'bad%3fquery', 'bad%23fragment', 'bad%00control', 'bad%20space', 'bad%25escape', 'bad%2bplus', 'bad%24dollar', '%c3', '%zz', 'bad%e2%80%aeformat']) {
            expect(() => parseBlogDocument(JSON.stringify({ ...blogFixture(), slug: { _type: 'slug', current } }))).toThrow();
        }
    });
    test('allows schema link protocols and refuses executable, relative and credential links', () => {
        for (const href of ['https://example.com', 'http://example.com/a?q=1', 'mailto:hello@example.com', 'tel:+468123456']) {
            expect(apply([{ kind: 'link', blockKey: 'paragraph', markKey: 'link-one', href }]).content).toBeDefined();
        }
        for (const href of ['javascript:alert(1)', 'data:text/html,hi', '/relative', '//example.com', 'ftp://example.com', 'https://user:secret@example.com', 'https://example.com/\nfoo', 'mailto:']) {
            expect(() => parseBlogOperations(JSON.stringify([{ kind: 'link', blockKey: 'paragraph', markKey: 'link-one', href }]))).toThrow();
        }
    });
    test('requires unique present stable keys in edited content structures', () => {
        const operation: BlogOperation = { kind: 'span', blockKey: 'paragraph', spanKey: 'span-one', text: 'Changed' };
        const blockDuplicate = blogFixture();
        blockDuplicate.content.push(blockDuplicate.content[0]!);
        expect(() => apply([operation], blockDuplicate)).toThrow('unique');
        const spanDuplicate = blogFixture();
        spanDuplicate.content[0]!.children!.push(spanDuplicate.content[0]!.children![0]!);
        expect(() => apply([operation], spanDuplicate)).toThrow('unique');
        const markDuplicate = blogFixture();
        markDuplicate.content[0]!.markDefs!.push(markDuplicate.content[0]!.markDefs![0]!);
        expect(() => apply([operation], markDuplicate)).toThrow('unique');
        expect(() => apply([{ ...operation, spanKey: 'missing' }])).toThrow('missing');
        expect(() => apply([{ ...operation, blockKey: 'missing' }])).toThrow('missing');
    });
    test('unknown blocks, styles, inline objects and annotations stay read-only', () => {
        expect(() => apply([{ kind: 'span', blockKey: 'custom-one', spanKey: 'span-one', text: 'Changed' }])).toThrow('read-only');
        for (const change of [{ style: 'h1' }, { children: [{ _key: 'span-one', _type: 'customInline' }] }, { markDefs: [{ _key: 'link-one', _type: 'customAnnotation', href: 'https://example.com' }] }]) {
            const fixture = blogFixture();
            Object.assign(fixture.content[0]!, change);
            expect(parseBlogDocument(JSON.stringify(fixture)).content).toEqual(fixture.content);
            expect(() => apply([{ kind: 'span', blockKey: 'paragraph', spanKey: 'span-one', text: 'Changed' }], fixture)).toThrow('read-only');
        }
    });
    test('bounds JSON in UTF-8 bytes and rejects oversized resulting documents', () => {
        expect(() => parseBlogDocument(JSON.stringify({ ...blogFixture(), unknownMetadata: 'å'.repeat(SANITY_BLOG_MAX_BYTES / 2) }))).toThrow('too large');
        const fixture = { ...blogFixture(), padding: 'x'.repeat(SANITY_BLOG_MAX_BYTES - JSON.stringify(blogFixture()).length - 80) };
        expect(() => apply([{ kind: 'set', field: 'title', value: 'x'.repeat(10_000) }], fixture)).toThrow('too large');
        expect(() => parseBlogOperations('[invalid')).toThrow('JSON');
    });
    test('appends one stable paragraph after unknown blocks and supports subsequent text and formatting', () => {
        const original = blogFixture();
        const blockKey = '04cd2ae5-0854-46e5-a2d8-f9d3198c926b';
        const spanKey = '12df7be5-0901-4ae9-aed0-a4dab4620d28';
        const appended = apply([{ kind: 'appendText', blockKey, spanKey }]);
        expect(appended).toEqual({ ...original, content: [...original.content, { _type: 'block', _key: blockKey, style: 'normal', markDefs: [], children: [{ _type: 'span', _key: spanKey, text: '', marks: [] }] }] });
        const edited = apply([
            { kind: 'appendText', blockKey, spanKey },
            { kind: 'span', blockKey, spanKey, text: 'New paragraph' },
            { kind: 'blockStyle', blockKey, style: 'h2' },
            { kind: 'decorator', blockKey, spanKey, decorator: 'strong', enabled: true },
            { kind: 'decorator', blockKey, spanKey, decorator: 'em', enabled: true },
        ]);
        expect(edited.content).toEqual([...original.content, { _type: 'block', _key: blockKey, style: 'h2', markDefs: [], children: [{ _type: 'span', _key: spanKey, text: 'New paragraph', marks: ['strong', 'em'] }] }]);
        expect(blogEditableTextKeys(edited).has(blockKey)).toBe(true);
    });
    test('styles and decorators preserve lists, link annotations, span data and document metadata', () => {
        const original = blogFixture();
        const edited = apply([
            { kind: 'blockStyle', blockKey: 'paragraph', style: 'blockquote' },
            { kind: 'decorator', blockKey: 'paragraph', spanKey: 'span-one', decorator: 'strong', enabled: false },
            { kind: 'decorator', blockKey: 'paragraph', spanKey: 'span-one', decorator: 'em', enabled: true },
            { kind: 'decorator', blockKey: 'paragraph', spanKey: 'span-one', decorator: 'em', enabled: true },
        ]);
        const expected = structuredClone(original);
        expected.content[0]!.style = 'blockquote';
        expected.content[0]!.children![0]!.marks = ['link-one', 'em'];
        expect(edited).toEqual(expected);
    });
    test('reserved decorator annotation keys are refused without modifying their annotations or spans', () => {
        for (const reserved of ['strong', 'em']) {
            const doc = parseBlogDocument(JSON.stringify(blogFixture()));
            const block = (doc.content as Record<string, unknown>[])[0]!;
            block.markDefs = [{ _key: reserved, _type: 'link', href: 'https://example.com', custom: true }];
            (block.children as Record<string, unknown>[])[0]!.marks = [reserved];
            const before = structuredClone(doc);
            for (const decorator of ['strong', 'em']) {
                expect(() => applyBlogStructuralOperation(doc, { kind: 'decorator', blockKey: 'paragraph', spanKey: 'span-one', decorator, enabled: false })).toThrow('Reserved');
                expect(doc).toEqual(before);
            }
            expect(() => applyBlogStructuralOperation(doc, { kind: 'blockStyle', blockKey: 'paragraph', style: 'h4' })).not.toThrow();
        }
    });
    test('append supports only absent, null or keyed-array content and refuses duplicate keys', () => {
        for (const content of [undefined, null, []]) {
            const original = { ...blogFixture(), content };
            const edited = apply([{ kind: 'appendText', blockKey: 'new-block', spanKey: 'new-span' }], original);
            expect((edited.content as unknown[]).length).toBe(1);
        }
        for (const content of [{}, '', [null], [{ _type: 'custom' }], [{ _key: 'bad key' }], [{ _key: 'duplicate' }, { _key: 'duplicate' }]]) {
            expect(() => apply([{ kind: 'appendText', blockKey: 'new-block', spanKey: 'new-span' }], { ...blogFixture(), content })).toThrow();
        }
        expect(() => apply([{ kind: 'appendText', blockKey: 'custom-one', spanKey: 'new-span' }])).toThrow('unique');
        for (const operation of [
            { kind: 'appendText', blockKey: 'bad key', spanKey: 'span' },
            { kind: 'appendText', blockKey: 'new', spanKey: 'span', text: 'Injected' },
            { kind: 'blockStyle', blockKey: 'paragraph', style: 'h1' },
            { kind: 'blockStyle', blockKey: 'paragraph', style: 'normal', level: 0 },
            { kind: 'decorator', blockKey: 'paragraph', spanKey: 'span-one', decorator: 'link-one', enabled: false },
            { kind: 'decorator', blockKey: 'paragraph', spanKey: 'span-one', decorator: 'strong', enabled: 'true' },
        ]) {
            expect(() => parseBlogOperations(JSON.stringify([operation]))).toThrow();
            expect(() => applyBlogStructuralOperation(parseBlogDocument(JSON.stringify(blogFixture())), operation)).toThrow();
        }
    });
    test('structural formatting refuses duplicate keys and unsupported target shapes while keeping unknown siblings', () => {
        const operations: BlogOperation[] = [
            { kind: 'blockStyle', blockKey: 'paragraph', style: 'normal' },
            { kind: 'decorator', blockKey: 'paragraph', spanKey: 'span-one', decorator: 'strong', enabled: false },
        ];
        for (const operation of operations) {
            const duplicate = blogFixture(); duplicate.content.push(duplicate.content[0]!);
            expect(() => apply([operation], duplicate)).toThrow('unique');
            for (const change of [{ style: 'h1' }, { listItem: 'check' }, { children: [{ _key: 'span-one', _type: 'customInline' }] }, { markDefs: [{ _key: 'annotation', _type: 'custom' }] }]) {
                const fixture = blogFixture(); Object.assign(fixture.content[0]!, change);
                expect(() => apply([operation], fixture)).toThrow('read-only');
            }
        }
        const duplicateSpan = blogFixture(); duplicateSpan.content[0]!.children!.push(duplicateSpan.content[0]!.children![0]!);
        expect(() => apply([operations[1]!], duplicateSpan)).toThrow('unique');
    });
    test('coordinates cannot inject hostnames, paths or queries', () => {
        expect(sanitizeSanityCoordinates('abc123', 'production')).toEqual({ projectId: 'abc123', dataset: 'production' });
        for (const project of ['abc.api.sanity.io', 'https://abc', 'ABC', 'abc@evil']) {
            expect(() => sanitizeSanityCoordinates(project, 'production')).toThrow();
        }
        for (const dataset of ['../private', 'production?query=x', '', '_private']) expect(() => sanitizeSanityCoordinates('abc123', dataset)).toThrow();
    });
});
