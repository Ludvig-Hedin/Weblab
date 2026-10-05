import Link from 'next/link';

import type { Post } from '../lib/content';

export function PostList({ posts }: { posts: Post[] }) {
    return (
        <ul className="divide-line divide-y">
            {posts.map((post) => (
                <li key={post._id} className="grid gap-4 py-8 md:grid-cols-[1fr_2fr] md:gap-8">
                    <div className="text-muted flex gap-3 text-sm md:flex-col md:gap-1">
                        <span>{post.category}</span>
                        <time dateTime={post.publishedAt}>
                            {new Date(post.publishedAt).toLocaleDateString('sv-SE')}
                        </time>
                    </div>
                    <div>
                        <h3 className="text-2xl leading-tight font-medium">
                            <Link href={`/blog/${post.slug}`} className="hover:underline">
                                {post.title}
                            </Link>
                        </h3>
                        <p className="text-muted mt-3 max-w-xl leading-relaxed">{post.excerpt}</p>
                    </div>
                </li>
            ))}
        </ul>
    );
}
