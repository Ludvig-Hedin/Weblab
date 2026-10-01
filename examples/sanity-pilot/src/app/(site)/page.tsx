import Link from 'next/link';

import { PostList } from '../../components/post-list';
import copy from '../../lib/copy.json';
import { getSiteContent } from '../../lib/server-content';

export default async function HomePage() {
    const { home, posts } = await getSiteContent();

    return (
        <main className="mx-auto max-w-5xl px-6 pb-16">
            <section className="max-w-3xl py-16 md:py-24">
                <h1 className="text-4xl leading-tight font-medium tracking-tight md:text-6xl">
                    {home.title}
                </h1>
                <p className="text-muted mt-6 max-w-xl text-xl leading-relaxed">{home.intro}</p>
                <Link href="/blog" className="text-accent mt-8 inline-block underline">
                    {copy.allPosts}
                </Link>
            </section>
            <section aria-labelledby="latest-posts">
                <h2 id="latest-posts" className="border-line border-b pb-5 text-xl font-medium">
                    {copy.latestPosts}
                </h2>
                <PostList posts={posts.slice(0, 2)} />
            </section>
        </main>
    );
}
