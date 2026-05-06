import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { ArrowLeft } from 'lucide-react';
import { MDXRemote } from 'next-mdx-remote/rsc';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';

import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

import type { BlogPostMeta } from '@/lib/blog';
import { WebsiteLayout } from '@/app/_components/website-layout';
import { TableOfContents } from '@/app/blog/_components/table-of-contents';
import { getAllPosts, getPostBySlug, getRelatedPosts } from '@/lib/blog';
import { ExternalRoutes, Routes } from '@/utils/constants';

interface Props {
    params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export async function generateStaticParams() {
    return getAllPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const post = getPostBySlug(slug);
    if (!post) return {};
    const coverImageUrl = new URL(post.frontmatter.coverImage, `https://${APP_DOMAIN}`).toString();
    return {
        title: `${post.frontmatter.title} | ${APP_NAME} Blog`,
        description: post.frontmatter.description,
        openGraph: {
            title: post.frontmatter.title,
            description: post.frontmatter.description,
            type: 'article',
            url: `https://${APP_DOMAIN}/blog/${slug}`,
            siteName: APP_NAME,
            publishedTime: post.frontmatter.date,
            authors: [post.frontmatter.author],
            images: [{ url: coverImageUrl }],
        },
        alternates: { canonical: `https://${APP_DOMAIN}/blog/${slug}` },
    };
}

function RelatedPostCard({ post }: { post: BlogPostMeta }) {
    return (
        <Link
            href={`/blog/${post.slug}`}
            className="group bg-foreground-primary/[0.03] hover:bg-foreground-primary/[0.05] flex flex-col overflow-hidden rounded-lg transition-colors"
        >
            <div className="aspect-[16/9] w-full overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={post.frontmatter.coverImage}
                    alt={post.frontmatter.title}
                    className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.02]"
                />
            </div>
            <div className="flex flex-1 flex-col p-4">
                <p className="text-foreground-tertiary mb-1.5 text-xs">
                    {format(parseISO(post.frontmatter.date), 'MMM d, yyyy')}
                    <span className="mx-1.5">·</span>
                    {post.frontmatter.category}
                </p>
                <h3 className="text-foreground-primary mb-1.5 text-sm leading-snug font-normal tracking-tight">
                    {post.frontmatter.title}
                </h3>
                <p className="text-foreground-secondary mb-4 line-clamp-2 text-xs leading-snug">
                    {post.frontmatter.description}
                </p>
                <div className="mt-auto flex items-center gap-2 text-xs">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={post.frontmatter.authorImage}
                        alt={post.frontmatter.author}
                        className="border-foreground-primary/10 h-4 w-4 rounded-full border object-cover"
                    />
                    <span className="text-foreground-secondary">{post.frontmatter.author}</span>
                    <span className="text-foreground-tertiary">·</span>
                    <span className="text-foreground-tertiary">{post.readingTime} min read</span>
                </div>
            </div>
        </Link>
    );
}

export default async function BlogPostPage({ params }: Props) {
    const { slug } = await params;
    const post = getPostBySlug(slug);
    if (!post) notFound();

    const related = getRelatedPosts(slug, 3);

    return (
        <WebsiteLayout showFooter>
            <main className="mx-auto w-full max-w-6xl px-4 pt-28 pb-20 md:px-8 md:pt-32">
                {/* Back link */}
                <Link
                    href="/blog"
                    className="text-foreground-tertiary hover:text-foreground-secondary mb-8 inline-flex items-center gap-1 text-sm transition-colors"
                >
                    <ArrowLeft className="size-4" /> Back to Blog
                </Link>

                {/* Post header — compact, left-aligned */}
                <div className="mx-auto mb-10 max-w-3xl">
                    <p className="text-foreground-tertiary mb-3 text-xs font-medium tracking-widest uppercase">
                        {format(parseISO(post.frontmatter.date), 'MMM d, yyyy')}
                        <span className="mx-2">·</span>
                        {post.frontmatter.category}
                    </p>
                    <h1 className="text-foreground-primary mb-5 text-3xl leading-tight font-light tracking-tight text-pretty md:text-4xl lg:text-5xl">
                        {post.frontmatter.title}
                    </h1>
                    <p className="text-foreground-secondary mb-6 text-base md:text-lg">
                        {post.frontmatter.description}
                    </p>
                    <div className="flex items-center gap-2 text-sm">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={post.frontmatter.authorImage}
                            alt={post.frontmatter.author}
                            className="border-foreground-primary/10 h-6 w-6 rounded-full border object-cover"
                        />
                        <span className="text-foreground-secondary">{post.frontmatter.author}</span>
                        <span className="text-foreground-tertiary">·</span>
                        <span className="text-foreground-tertiary">
                            {post.readingTime} min read
                        </span>
                    </div>
                </div>

                {/* Cover image */}
                <div className="mx-auto mb-12 aspect-[16/9] w-full max-w-5xl overflow-hidden rounded-lg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={post.frontmatter.coverImage}
                        alt={`Cover for ${post.frontmatter.title}`}
                        className="h-full w-full object-cover object-center"
                    />
                </div>

                {/* Content + TOC */}
                <div className="mx-auto flex max-w-5xl items-start gap-16">
                    <article className="prose prose-invert prose-headings:font-light prose-headings:text-foreground-primary prose-h2:scroll-mt-28 prose-h3:scroll-mt-28 prose-p:text-foreground-secondary prose-p:leading-relaxed prose-a:text-foreground-primary prose-a:underline-offset-2 prose-strong:text-foreground-primary prose-code:text-foreground-primary prose-code:bg-foreground-primary/5 prose-code:rounded prose-code:px-1 prose-code:text-sm prose-pre:bg-foreground-primary/5 prose-pre:border prose-pre:border-foreground-primary/10 prose-blockquote:border-foreground-primary/30 prose-blockquote:text-foreground-secondary prose-hr:border-foreground-primary/10 prose-li:text-foreground-secondary max-w-none min-w-0 flex-1">
                        <MDXRemote
                            source={post.content}
                            options={{
                                mdxOptions: {
                                    remarkPlugins: [remarkGfm],
                                    rehypePlugins: [
                                        rehypeSlug,
                                        [rehypeAutolinkHeadings, { behavior: 'wrap' }] as [
                                            typeof rehypeAutolinkHeadings,
                                            Record<string, unknown>,
                                        ],
                                    ],
                                },
                            }}
                        />
                    </article>

                    <aside className="sticky top-28 hidden w-52 flex-shrink-0 xl:block">
                        <TableOfContents toc={post.toc} />
                    </aside>
                </div>

                {/* Related posts */}
                {related.length > 0 && (
                    <section className="border-foreground-primary/10 mt-20 border-t pt-12">
                        <p className="text-foreground-tertiary mb-2 text-xs font-medium tracking-widest uppercase">
                            More posts
                        </p>
                        <h2 className="text-foreground-primary mb-6 text-2xl font-light md:text-3xl">
                            Keep reading
                        </h2>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                            {related.map((rel) => (
                                <RelatedPostCard key={rel.slug} post={rel} />
                            ))}
                        </div>
                    </section>
                )}
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
