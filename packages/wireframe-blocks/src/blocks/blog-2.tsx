import { Avatar, AvatarFallback } from '../vendor/ui/avatar';
import { Card, CardContent } from '../vendor/ui/card';
import { Eyebrow, Media } from './_ui';

export interface BlogPost {
    title: string;
    excerpt: string;
    category: string;
    author: string;
    date: string;
}

export interface Blog2Content {
    eyebrow?: string;
    heading: string;
    subheading?: string;
    posts: BlogPost[];
}

export default function Blog2({ content }: { content: Blog2Content }) {
    return (
        <section className="bg-background py-16 lg:py-24" aria-labelledby="blog2-heading">
            <div className="mx-auto max-w-6xl px-6">
                <div className="flex max-w-2xl flex-col gap-3">
                    {content.eyebrow ? <Eyebrow>{content.eyebrow}</Eyebrow> : null}
                    <h2
                        id="blog2-heading"
                        className="text-foreground text-3xl font-semibold tracking-tight md:text-4xl"
                    >
                        {content.heading}
                    </h2>
                    {content.subheading ? (
                        <p className="text-muted-foreground text-lg leading-relaxed text-pretty">
                            {content.subheading}
                        </p>
                    ) : null}
                </div>
                <div className="mt-12 grid gap-6 md:grid-cols-3">
                    {content.posts.map((post, i) => (
                        <Card key={i} className="overflow-hidden pt-0">
                            <Media ratio="aspect-[16/10]" className="rounded-none border-0" />
                            <CardContent className="flex flex-col gap-3">
                                <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                                    {post.category}
                                </span>
                                <h3 className="text-foreground text-lg leading-snug font-medium">
                                    {post.title}
                                </h3>
                                <p className="text-muted-foreground text-sm leading-relaxed">
                                    {post.excerpt}
                                </p>
                                <div className="mt-2 flex items-center gap-2.5">
                                    <Avatar className="h-7 w-7">
                                        <AvatarFallback />
                                    </Avatar>
                                    <span className="text-muted-foreground text-sm">
                                        {post.author} · {post.date}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </section>
    );
}
