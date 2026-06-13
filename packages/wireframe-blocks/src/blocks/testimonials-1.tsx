import { AvatarDot, Eyebrow, Stars } from './_ui';

export interface Testimonial {
    quote: string;
    author: string;
    role: string;
}

export interface Testimonials1Content {
    eyebrow?: string;
    heading: string;
    testimonials: Testimonial[];
}

export default function Testimonials1({ content }: { content: Testimonials1Content }) {
    return (
        <section className="bg-background py-16 lg:py-24" aria-labelledby="testimonials1-heading">
            <div className="mx-auto max-w-6xl px-6">
                <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
                    {content.eyebrow ? <Eyebrow>{content.eyebrow}</Eyebrow> : null}
                    <h2
                        id="testimonials1-heading"
                        className="text-foreground text-3xl font-semibold tracking-tight md:text-4xl"
                    >
                        {content.heading}
                    </h2>
                </div>
                <div className="mt-12 grid gap-6 md:grid-cols-3">
                    {content.testimonials.map((item, i) => (
                        <figure
                            key={i}
                            className="border-border flex flex-col gap-4 rounded-xl border p-6"
                        >
                            <Stars />
                            <blockquote className="text-foreground text-base leading-relaxed text-pretty">
                                “{item.quote}”
                            </blockquote>
                            <figcaption className="mt-auto flex items-center gap-3">
                                <AvatarDot className="h-9 w-9" />
                                <span className="flex flex-col">
                                    <span className="text-foreground text-sm font-medium">
                                        {item.author}
                                    </span>
                                    <span className="text-muted-foreground text-sm">
                                        {item.role}
                                    </span>
                                </span>
                            </figcaption>
                        </figure>
                    ))}
                </div>
            </div>
        </section>
    );
}
