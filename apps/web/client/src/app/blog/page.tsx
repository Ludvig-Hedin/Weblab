import type { Metadata } from 'next';
import Link from 'next/link';
import { format, isValid, parseISO } from 'date-fns';

import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

import type { BlogPostMeta } from '@/lib/blog';
import { ChangelogGrid } from '@/app/_components/changelog-grid';
import { WebsiteLayout } from '@/app/_components/website-layout';
import { getAllPosts } from '@/lib/blog';
import { ExternalRoutes, Routes } from '@/utils/constants';

export const metadata: Metadata = {
    title: `Blog | ${APP_NAME}`,
    description: `News, product updates, and insights from the ${APP_NAME} team.`,
    openGraph: {
        title: `Blog | ${APP_NAME}`,
        description: `News, product updates, and insights from the ${APP_NAME} team.`,
        type: 'website',
        url: `https://${APP_DOMAIN}/blog`,
        siteName: APP_NAME,
    },
    alternates: { canonical: `https://${APP_DOMAIN}/blog` },
};

function formatPostDate(date: string): string {
    const parsed = parseISO(date);
    return isValid(parsed) ? format(parsed, 'MMM d, yyyy') : 'Unknown date';
}

function PostCard({ post, featured = false }: { post: BlogPostMeta; featured?: boolean }) {
    const { slug, frontmatter, readingTime } = post;
    return (
        <Link
            href={`/blog/${slug}`}
            className="group bg-foreground-primary/[0.05] hover:bg-foreground-primary/[0.08] relative flex flex-col overflow-hidden rounded-xl transition-colors"
        >
            <div className="aspect-[16/9] w-full overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={frontmatter.coverImage}
                    alt={frontmatter.title}
                    className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.02]"
                />
            </div>
            <div className="flex flex-1 flex-col p-4">
                <p className="text-foreground-tertiary mb-1 text-xs">
                    {formatPostDate(frontmatter.date)}
                    <span className="mx-1.5">·</span>
                    {frontmatter.category}
                </p>
                <h2
                    className={
                        featured
                            ? 'text-foreground-primary mb-2 text-xl leading-snug font-normal tracking-tight md:text-2xl'
                            : 'text-foreground-primary mb-2 text-sm leading-snug font-normal tracking-tight'
                    }
                >
                    {frontmatter.title}
                </h2>
                <p className="text-foreground-secondary mb-3 line-clamp-2 text-xs leading-relaxed">
                    {frontmatter.description}
                </p>
                <div className="mt-auto flex items-center gap-2 text-xs">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={frontmatter.authorImage}
                        alt={frontmatter.author}
                        className="border-foreground-primary/10 h-4 w-4 rounded-full border object-cover"
                    />
                    <span className="text-foreground-secondary">{frontmatter.author}</span>
                    <span className="text-foreground-tertiary">·</span>
                    <span className="text-foreground-tertiary">{readingTime} min read</span>
                </div>
            </div>
            {/* Overlay border — renders above image and all content */}
            <div className="ring-foreground-primary/10 pointer-events-none absolute inset-0 rounded-xl ring-1" />
        </Link>
    );
}

export default function BlogPage() {
    const posts = getAllPosts();
    const [featured, ...rest] = posts;

    return (
        <WebsiteLayout showFooter>
            <main className="mx-auto w-full max-w-6xl px-4 pt-28 pb-20 md:px-8 md:pt-32">
                <header className="mb-8">
                    <p className="text-foreground-tertiary mb-1.5 text-xs font-medium tracking-widest uppercase">
                        Resources
                    </p>
                    <h1 className="text-foreground-primary text-3xl font-light tracking-tight md:text-4xl">
                        Blog
                    </h1>
                </header>

                {posts.length === 0 ? (
                    <p className="text-foreground-secondary text-sm">
                        No posts yet. Check back soon.
                    </p>
                ) : (
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                        {featured && (
                            <div className="w-full lg:w-[calc(70.8%-0.375rem)] lg:shrink-0">
                                <PostCard post={featured} featured />
                            </div>
                        )}
                        {rest.length > 0 && (
                            <div className="flex w-full flex-col gap-3 lg:w-[calc(29.2%-0.375rem)]">
                                {rest.map((post) => (
                                    <PostCard key={post.slug} post={post} />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div className="-mx-4 mt-16 md:-mx-8">
                    <ChangelogGrid limit={4} />
                </div>
            </main>

            {/* CTA Section */}
            <section className="border-foreground-primary/10 border-t">
                <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-24 text-center md:px-8">
                    <p className="text-foreground-tertiary mb-3 text-xs font-medium tracking-widest uppercase">
                        Get started
                    </p>
                    <h2 className="text-foreground-primary mb-8 text-4xl font-light tracking-tight text-balance md:text-5xl">
                        Start building with {APP_NAME}
                    </h2>
                    <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                        <Link
                            href={Routes.DOWNLOAD}
                            className="bg-foreground-primary text-background-primary inline-flex h-10 items-center justify-center rounded-lg px-6 text-sm font-medium transition-opacity hover:opacity-90"
                        >
                            Download
                        </Link>
                        <a
                            href={ExternalRoutes.CONTACT}
                            className="border-foreground-primary/20 text-foreground-secondary hover:border-foreground-primary/40 hover:text-foreground-primary inline-flex h-10 items-center justify-center rounded-lg border px-6 text-sm transition-colors"
                        >
                            Contact us
                        </a>
                    </div>
                </div>
            </section>
        </WebsiteLayout>
    );
}
