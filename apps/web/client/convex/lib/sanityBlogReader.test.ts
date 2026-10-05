import { describe, expect, test } from 'bun:test';
import { SANITY_BLOG_MAX_BYTES } from './sanityBlogContract';
import { SanityBlogReader, type SanityBlogFetch } from './sanityBlogReader';

function document(_id = 'article-1') {
    return { _id, _rev: 'rev-one', _type: 'blogPost', title: 'Title', slug: { _type: 'slug', current: 'title' }, publishedAt: '2026-10-01T12:00:00Z', excerpt: 'Excerpt', content: [], custom: { original: true } };
}
function fixture(result: unknown, status = 200) {
    const calls: { url: URL; options: Parameters<SanityBlogFetch>[1] }[] = [];
    const hosts: string[] = [];
    const reader = new SanityBlogReader({ projectId: 'abc123', dataset: 'production' }, {
        resolveHost: async (hostname) => { hosts.push(hostname); return [{ address: '8.8.8.8', family: 4 }]; },
        fetch: async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify({ result }), { status }); },
    });
    return { reader, calls, hosts };
}
describe('published-only GET Sanity blog reader', () => {
    test('bounded deterministic list uses fixed host, GET projection, no token and manual redirects', async () => {
        const documents = Array.from({ length: 20 }, (_, index) => document(`article-${String(index).padStart(2, '0')}`));
        const { reader, calls, hosts } = fixture(documents);
        const first = await reader.list();
        expect(first.items).toHaveLength(20);
        expect(first.cursor).toBe('article-19');
        await reader.list();
        expect(hosts).toEqual(['abc123.api.sanity.io', 'abc123.api.sanity.io']);
        const request = calls[0]!;
        expect(request.url.origin).toBe('https://abc123.api.sanity.io');
        expect(request.url.pathname).toBe('/v2025-02-19/data/query/production');
        expect(request.url.searchParams.get('query')).toContain('order(_id asc)[0...20]{_id,_type,_rev,title,slug,excerpt,publishedAt}');
        expect(request.url.searchParams.get('query')).toContain('path("drafts.**")');
        expect(request.url.searchParams.get('query')).toContain('path("versions.**")');
        expect(request.url.searchParams.get('perspective')).toBe('published');
        expect(request.options.method).toBe('GET');
        expect(request.options.redirect).toBe('manual');
        expect(request.options.headers).toEqual({ Accept: 'application/json' });
        expect(request.options.body).toBeUndefined();
        expect(request.options.signal).toBeInstanceOf(AbortSignal);
        expect(request.options.dispatcher).toBeDefined();
        expect(Object.keys(first.items[0]!)).toEqual(['documentId', 'title', 'slug', 'excerpt', 'publishedAt']);
    });
    test('cursor is a validated parameter and short pages end pagination', async () => {
        const { reader, calls } = fixture([document('article-2')]);
        expect((await reader.list('article-1')).cursor).toBeNull();
        expect(calls[0]!.url.searchParams.get('$after')).toBe('"article-1"');
        await expect(reader.list('drafts.article-1')).rejects.toThrow('published');
        await expect(reader.list('x"] | *')).rejects.toThrow('published');
        expect(calls).toHaveLength(1);
        expect((await fixture([]).reader.list()).items).toEqual([]);
    });
    test('refuses unbounded, out-of-order, repeated or cursor-stale pages', async () => {
        for (const result of [Array.from({ length: 21 }, (_, index) => document(`article-${index}`)), [document('article-2'), document('article-1')], [document(), document()], {}, null]) {
            await expect(fixture(result).reader.list()).rejects.toThrow('REMOTE_FAILED');
        }
        await expect(fixture([document('article-1')]).reader.list('article-1')).rejects.toThrow('order');
    });
    test('rejects draft/version/types/invalid revisions even if provider ignores filters', async () => {
        for (const bad of [document('drafts.article-1'), document('versions.release.article-1'), { ...document(), _type: 'pilotPost' }, { ...document(), _rev: '' }, { ...document(), _rev: undefined }]) {
            await expect(fixture([bad]).reader.list()).rejects.toThrow('published');
        }
    });
    test('detail returns the unchanged raw published document with metadata', async () => {
        const original = document();
        const { reader, calls } = fixture(original);
        expect(JSON.parse(await reader.get('article-1'))).toEqual(original);
        expect(calls[0]!.url.searchParams.get('query')).toContain('_id == $id');
        expect(calls[0]!.url.searchParams.get('query')).toEndWith('[0]');
        expect(calls[0]!.url.searchParams.get('$id')).toBe('"article-1"');
        expect(calls[0]!.url.searchParams.get('perspective')).toBe('published');
        expect(calls[0]!.options.method).toBe('GET');
    });
    test('detail identity is exact and existing published revision is mandatory', async () => {
        for (const bad of [document('other'), [document()], { ...document(), _rev: undefined }, { ...document('weblab-124a71b3-9040-4bc1-a036-92d7cde2a6bb'), _rev: undefined }]) {
            await expect(fixture(bad).reader.get('article-1')).rejects.toThrow('published');
        }
        await expect(fixture(null).reader.get('article-1')).rejects.toThrow('NOT_FOUND');
        const { reader, calls } = fixture(document());
        await expect(reader.get('versions.release.article-1')).rejects.toThrow('published');
        await expect(reader.get('drafts.article-1')).rejects.toThrow('published');
        expect(calls).toHaveLength(0);
    });
    test('private, mapped, empty or mixed DNS replies prevent any request', async () => {
        let requests = 0;
        for (const addresses of [[], [{ address: '127.0.0.1', family: 4 }], [{ address: '10.0.0.5', family: 4 }], [{ address: '::ffff:127.0.0.1', family: 6 }], [{ address: '8.8.8.8', family: 4 }, { address: '192.168.1.2', family: 4 }], [{ address: '8.8.8.8', family: 0 }]]) {
            const reader = new SanityBlogReader({ projectId: 'abc123', dataset: 'production' }, { resolveHost: async () => addresses, fetch: async () => { requests++; return new Response('{}'); } });
            await expect(reader.list()).rejects.toThrow('unsupported network');
        }
        expect(requests).toBe(0);
    });
    test('redirects/provider denial and transport failures redact source response details', async () => {
        for (const status of [301, 302, 401, 403, 500]) {
            const { reader } = fixture({ message: 'SECRET_FROM_PROVIDER' }, status);
            await expect(reader.list()).rejects.toThrow('Sanity did not return public blog content');
        }
        const reader = new SanityBlogReader({ projectId: 'abc123', dataset: 'production' }, {
            resolveHost: async () => [{ address: '8.8.8.8', family: 4 }],
            fetch: async () => { throw new Error('REMOTE_FAILED: SECRET_FROM_TRANSPORT'); },
        });
        try { await reader.list(); throw new Error('Expected failure'); } catch (error) {
            expect((error as Error).message).toBe('REMOTE_FAILED: Sanity blog content could not be read.');
        }
    });
    test('detail document stays within 256 KiB even when response envelope fits', async () => {
        await expect(fixture({ ...document(), extra: 'x'.repeat(SANITY_BLOG_MAX_BYTES) }).reader.get('article-1')).rejects.toThrow('published');
        await expect(fixture({ ...document(), extra: 'å'.repeat(SANITY_BLOG_MAX_BYTES / 2) }).reader.get('article-1')).rejects.toThrow('published');
    });
    test('bounded stream cancels oversized bodies and rejects oversized content-length', async () => {
        let canceled = false;
        const reader = new SanityBlogReader({ projectId: 'abc123', dataset: 'production' }, {
            resolveHost: async () => [{ address: '8.8.8.8', family: 4 }],
            fetch: async () => new Response(new ReadableStream<Uint8Array>({
                start(controller) { controller.enqueue(new Uint8Array(600 * 1024)); },
                cancel() { canceled = true; },
            })),
        });
        await expect(reader.list()).rejects.toThrow('too large');
        expect(canceled).toBe(true);
        const declared = new SanityBlogReader({ projectId: 'abc123', dataset: 'production' }, {
            resolveHost: async () => [{ address: '8.8.8.8', family: 4 }],
            fetch: async () => new Response('{}', { headers: { 'content-length': '900000' } }),
        });
        await expect(declared.list()).rejects.toThrow('too large');
    });
    test('invalid JSON and invalid UTF-8 are rejected without echoing source bytes', async () => {
        for (const body of ['SECRET_BAD_JSON', new Uint8Array([0xff])]) {
            const reader = new SanityBlogReader({ projectId: 'abc123', dataset: 'production' }, {
                resolveHost: async () => [{ address: '8.8.8.8', family: 4 }], fetch: async () => new Response(body),
            });
            await expect(reader.list()).rejects.toThrow('Sanity blog content could not be read');
        }
    });
});
