import { describe, expect, mock, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ArticleBody } from '../src/components/article-body';
import { PostList } from '../src/components/post-list';
import { SAMPLE_CONTENT } from '../src/lib/content';

// Route rendering in this test uses fixtures, not a live Next/Sanity server.
void mock.module('../src/lib/server-content', () => ({
    getSiteContent: () => Promise.resolve(SAMPLE_CONTENT),
    isSampleMode: () => true,
}));

const { default: HomePage } = await import('../src/app/(site)/page');
const { default: BlogPage } = await import('../src/app/(site)/blog/page');
const { default: PostPage } = await import('../src/app/(site)/blog/[slug]/page');
const { default: RootLayout } = await import('../src/app/(site)/layout');

describe('pilot pages with example content', () => {
    test('shows the homepage and explicitly labels the example mode', async () => {
        const html = renderToStaticMarkup(<RootLayout>{await HomePage()}</RootLayout>);
        expect(html).toContain(SAMPLE_CONTENT.home.title);
        expect(html).toContain('Sanity är inte anslutet.');
        expect(html).toContain(`href="/blog/${SAMPLE_CONTENT.posts[0].slug}"`);
    });

    test('filters the blog by category and handles an empty result', async () => {
        const html = renderToStaticMarkup(
            await BlogPage({ searchParams: Promise.resolve({ category: 'Design' }) }),
        );
        expect(html).toContain(SAMPLE_CONTENT.posts[0].title);
        expect(html).not.toContain(SAMPLE_CONTENT.posts[1].title);
        expect(html).toContain('aria-current="page"');
        const empty = renderToStaticMarkup(
            await BlogPage({ searchParams: Promise.resolve({ category: 'Okänd' }) }),
        );
        expect(empty).toContain('Inga publicerade inlägg');
    });

    test('renders a post and returns not-found for a missing slug', async () => {
        const html = renderToStaticMarkup(
            await PostPage({ params: Promise.resolve({ slug: SAMPLE_CONTENT.posts[0].slug }) }),
        );
        expect(html).toContain(SAMPLE_CONTENT.posts[0].title);
        expect(html).toContain('<strong>');
        expect(html).toContain('<em>');
        let failure: unknown;
        try {
            await PostPage({ params: Promise.resolve({ slug: 'saknas' }) });
        } catch (error: unknown) {
            failure = error;
        }
        expect(failure).toBeInstanceOf(Error);
        expect(String(failure)).toContain('NEXT_HTTP_ERROR_FALLBACK;404');
    });

    test('escapes CMS text, while retaining the supported rich-text marks', () => {
        const post = structuredClone(SAMPLE_CONTENT.posts[0]);
        post.title = '<script>alert(1)</script>';
        post.body[0].children[0].text = '<script>alert(2)</script>';
        const html = renderToStaticMarkup(
            <>
                <PostList posts={[post]} />
                <ArticleBody blocks={post.body} />
            </>,
        );
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;');
        expect(html).toContain('<strong>');
    });
});
