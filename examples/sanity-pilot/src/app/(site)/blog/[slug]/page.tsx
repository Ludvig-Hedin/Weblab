import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ArticleBody } from '../../../../components/article-body';
import copy from '../../../../lib/copy.json';
import { getSiteContent } from '../../../../lib/server-content';

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const { posts } = await getSiteContent();
    const post = posts.find((item) => item.slug === slug);
    if (!post) notFound();

    return (
        <main className="mx-auto max-w-3xl px-6 py-12 md:py-16">
            <Link href="/blog" className="text-accent underline">
                {copy.backToBlog}
            </Link>
            <article className="mt-10">
                <p className="text-muted text-sm">{post.category}</p>
                <h1 className="mt-4 text-4xl leading-tight font-medium tracking-tight md:text-5xl">
                    {post.title}
                </h1>
                <p className="text-muted mt-6 text-xl leading-relaxed">{post.excerpt}</p>
                {post.image && (
                    <img src={post.image.url} alt={post.image.alt} className="mt-8 w-full" />
                )}
                <div className="mt-10">
                    <ArticleBody blocks={post.body} />
                </div>
            </article>
        </main>
    );
}
