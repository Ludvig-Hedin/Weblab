import Link from 'next/link';

import { PostList } from '../../../components/post-list';
import copy from '../../../lib/copy.json';
import { getSiteContent } from '../../../lib/server-content';

export default async function BlogPage({
    searchParams,
}: {
    searchParams: Promise<{ category?: string }>;
}) {
    const { posts } = await getSiteContent();
    const { category } = await searchParams;
    const categories = Array.from(new Set(posts.map((post) => post.category)));
    const filtered = category ? posts.filter((post) => post.category === category) : posts;

    return (
        <main className="mx-auto max-w-5xl px-6 py-16">
            <h1 className="text-4xl font-medium tracking-tight">{copy.blog}</h1>
            <nav
                aria-label={copy.categoriesLabel}
                className="border-line mt-8 flex flex-wrap gap-5 border-b pb-6"
            >
                <Link
                    href="/blog"
                    aria-current={!category ? 'page' : undefined}
                    className="underline aria-[current=page]:font-bold"
                >
                    {copy.allCategories}
                </Link>
                {categories.map((item) => (
                    <Link
                        key={item}
                        href={`/blog?category=${encodeURIComponent(item)}`}
                        aria-current={category === item ? 'page' : undefined}
                        className="underline aria-[current=page]:font-bold"
                    >
                        {item}
                    </Link>
                ))}
            </nav>
            {filtered.length > 0 ? (
                <PostList posts={filtered} />
            ) : (
                <p className="text-muted py-10">{copy.emptyPosts}</p>
            )}
        </main>
    );
}
