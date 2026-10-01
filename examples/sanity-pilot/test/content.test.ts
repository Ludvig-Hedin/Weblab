import { describe, expect, test } from 'bun:test';

import type { ContentConfig } from '../src/lib/content';
import { configFromEnvironment, loadContent, SAMPLE_CONTENT } from '../src/lib/content';

const sanityConfig: ContentConfig = {
    mode: 'sanity',
    projectId: 'abc12345',
    dataset: 'production',
};

function fetchMock(
    handler: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>,
): typeof fetch {
    return Object.assign(handler, { preconnect: () => undefined });
}

function responseWith(result: unknown): typeof fetch {
    return fetchMock(async () => Response.json({ result }));
}

async function expectInvalidContent(content: unknown): Promise<void> {
    let caught: unknown;
    try {
        await loadContent(sanityConfig, responseWith(content));
    } catch (error: unknown) {
        caught = error;
    }
    if (!(caught instanceof Error)) {
        throw new Error('Expected content loading to reject with an Error.');
    }
    expect(caught.message).toContain('fel format');
}

describe('content configuration', () => {
    test('uses sample content only for the default or explicit sample mode', () => {
        expect(configFromEnvironment({})).toEqual({ mode: 'sample' });
        expect(configFromEnvironment({ SANITY_CONTENT_MODE: 'sample' })).toEqual({
            mode: 'sample',
        });
        for (const mode of ['', 'preview', 'SANITY']) {
            expect(() => configFromEnvironment({ SANITY_CONTENT_MODE: mode })).toThrow(
                'SANITY_CONTENT_MODE',
            );
        }
    });

    test('validates Sanity identifiers and keeps an optional server read token', () => {
        const env = {
            SANITY_CONTENT_MODE: 'sanity',
            SANITY_PROJECT_ID: 'abc12345',
            SANITY_DATASET: 'pilot-content',
        };
        expect(configFromEnvironment(env)).toEqual({
            mode: 'sanity',
            projectId: 'abc12345',
            dataset: 'pilot-content',
        });
        expect(configFromEnvironment({ ...env, SANITY_READ_TOKEN: 'private-token' })).toEqual({
            mode: 'sanity',
            projectId: 'abc12345',
            dataset: 'pilot-content',
            token: 'private-token',
        });
        for (const projectId of [undefined, '', 'host.example', 'ABC123', 'a/b']) {
            expect(() => configFromEnvironment({ ...env, SANITY_PROJECT_ID: projectId })).toThrow(
                'SANITY_PROJECT_ID',
            );
        }
        for (const dataset of [undefined, '', '../private', 'a?query=x', 'Name']) {
            expect(() => configFromEnvironment({ ...env, SANITY_DATASET: dataset })).toThrow(
                'SANITY_DATASET',
            );
        }
    });
});

describe('content loading', () => {
    test('sample mode does not make a network request', async () => {
        let requests = 0;
        const fetcher = fetchMock(async () => {
            requests += 1;
            throw new Error('Unexpected request');
        });
        expect(await loadContent({ mode: 'sample' }, fetcher)).toEqual(SAMPLE_CONTENT);
        expect(requests).toBe(0);
        expect(SAMPLE_CONTENT.posts).toHaveLength(2);
    });

    test('requests published content directly with no cache and optional authorization', async () => {
        for (const token of [undefined, 'private-token']) {
            const fetcher = fetchMock(async (input, options) => {
                const url = new URL(
                    input instanceof Request
                        ? input.url
                        : input instanceof URL
                          ? input.href
                          : input,
                );
                expect(url.origin).toBe('https://abc12345.api.sanity.io');
                expect(url.pathname).toBe('/v2025-02-19/data/query/production');
                expect(url.searchParams.get('perspective')).toBe('published');
                const query = url.searchParams.get('query');
                expect(query).toContain('pilotHome');
                expect(query).toContain('_id == "pilot-home"');
                expect(query).toContain('pilotPost');
                expect(query).toContain('order(publishedAt desc)[0...50]');
                expect(query).toContain('slug.current');
                expect(query).toContain('mainImage.asset->url');
                expect(options?.method).toBe('GET');
                expect(options?.cache).toBe('no-store');
                expect(options?.signal).toBeInstanceOf(AbortSignal);
                expect(new Headers(options?.headers).get('authorization')).toBe(
                    token ? `Bearer ${token}` : null,
                );
                return Response.json({ result: SAMPLE_CONTENT });
            });
            expect(await loadContent({ ...sanityConfig, token }, fetcher)).toEqual(SAMPLE_CONTENT);
        }
    });

    test('never falls back to samples or exposes server details after a failure', async () => {
        const secret = 'private-token';
        const fetchers: (typeof fetch)[] = [
            fetchMock(async () => {
                throw new Error(`Network details ${secret}`);
            }),
            fetchMock(async () => new Response(`Server details ${secret}`, { status: 403 })),
            fetchMock(async () => new Response('invalid json')),
        ];
        for (const fetcher of fetchers) {
            try {
                await loadContent({ ...sanityConfig, token: secret }, fetcher);
                throw new Error('Expected loading to fail');
            } catch (error: unknown) {
                expect(error).toBeInstanceOf(Error);
                expect(String(error)).toContain('Sanity');
                expect(String(error)).not.toContain(secret);
                expect(String(error)).not.toContain('Server details');
                expect(String(error)).not.toContain('Network details');
            }
        }
    });

    test('rejects missing homepage, malformed arrays, text blocks and marks', async () => {
        const malformed: unknown[] = [
            null,
            { ...SAMPLE_CONTENT, home: null },
            { ...SAMPLE_CONTENT, home: { title: ' ', intro: 'Text' } },
            { ...SAMPLE_CONTENT, posts: {} },
            { ...SAMPLE_CONTENT, posts: [{ ...SAMPLE_CONTENT.posts[0], body: {} }] },
            {
                ...SAMPLE_CONTENT,
                posts: [{ ...SAMPLE_CONTENT.posts[0], body: [{ _key: 'x', _type: 'image' }] }],
            },
            {
                ...SAMPLE_CONTENT,
                posts: [
                    {
                        ...SAMPLE_CONTENT.posts[0],
                        body: [
                            {
                                _key: 'x',
                                _type: 'block',
                                style: 'normal',
                                children: [
                                    { _key: 'span', _type: 'span', text: 'Text', marks: ['link'] },
                                ],
                            },
                        ],
                    },
                ],
            },
        ];
        for (const content of malformed) {
            await expectInvalidContent(content);
        }
    });

    test('rejects unsafe and duplicate slugs, drafts and versions', async () => {
        for (const slug of [
            '../secret',
            'Uppercase',
            'two--hyphens',
            'with/slash',
            'trailing-',
            '',
        ]) {
            const content = { ...SAMPLE_CONTENT, posts: [{ ...SAMPLE_CONTENT.posts[0], slug }] };
            await expectInvalidContent(content);
        }
        const duplicate = {
            ...SAMPLE_CONTENT,
            posts: [SAMPLE_CONTENT.posts[0], SAMPLE_CONTENT.posts[0]],
        };
        await expectInvalidContent(duplicate);
        for (const _id of ['drafts.article', 'versions.release.article']) {
            const content = { ...SAMPLE_CONTENT, posts: [{ ...SAMPLE_CONTENT.posts[0], _id }] };
            await expectInvalidContent(content);
        }
    });

    test('rejects empty bodies, unsupported lists/annotations and impossible dates', async () => {
        const post = SAMPLE_CONTENT.posts[0];
        for (const change of [
            { body: [] },
            { body: [{ ...post.body[0], listItem: 'bullet' }] },
            { body: [{ ...post.body[0], markDefs: [{ _key: 'link', _type: 'link' }] }] },
            { publishedAt: '2026-02-30T12:00:00Z' },
        ]) {
            await expectInvalidContent({ ...SAMPLE_CONTENT, posts: [{ ...post, ...change }] });
        }
    });

    test('accepts Sanity CDN images and rejects unsafe images or missing alt text', async () => {
        const validImage = {
            url: 'https://cdn.sanity.io/images/abc12345/production/example.jpg',
            alt: 'En skiss',
        };
        const content = {
            ...SAMPLE_CONTENT,
            posts: [{ ...SAMPLE_CONTENT.posts[0], image: validImage }],
        };
        expect((await loadContent(sanityConfig, responseWith(content))).posts[0]?.image).toEqual(
            validImage,
        );
        for (const image of [
            { ...validImage, url: 'http://cdn.sanity.io/image.jpg' },
            { ...validImage, url: 'https://example.com/image.jpg' },
            { ...validImage, url: 'https://cdn.sanity.io.evil.example/image.jpg' },
            { ...validImage, alt: '' },
        ]) {
            await expectInvalidContent({ ...content, posts: [{ ...content.posts[0], image }] });
        }
    });
});
