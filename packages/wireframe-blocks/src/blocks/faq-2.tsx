import { Eyebrow } from './_ui';

export interface FaqItem {
    question: string;
    answer: string;
}

export interface Faq2Content {
    eyebrow?: string;
    heading: string;
    items: FaqItem[];
}

export default function Faq2({ content }: { content: Faq2Content }) {
    return (
        <section className="bg-background py-16 lg:py-24" aria-labelledby="faq2-heading">
            <div className="mx-auto max-w-3xl px-6">
                <div className="flex flex-col items-center gap-3 text-center">
                    {content.eyebrow ? <Eyebrow>{content.eyebrow}</Eyebrow> : null}
                    <h2
                        id="faq2-heading"
                        className="text-foreground text-3xl font-semibold tracking-tight md:text-4xl"
                    >
                        {content.heading}
                    </h2>
                </div>
                <div className="divide-border border-border mt-10 divide-y border-t">
                    {content.items.map((item, i) => (
                        <details key={i} className="group py-5">
                            <summary className="text-foreground flex cursor-pointer items-center justify-between gap-4 text-base font-medium marker:content-['']">
                                {item.question}
                                <span className="text-muted-foreground transition-transform group-open:rotate-45">
                                    +
                                </span>
                            </summary>
                            <p className="text-muted-foreground mt-3 text-sm leading-relaxed text-pretty">
                                {item.answer}
                            </p>
                        </details>
                    ))}
                </div>
            </div>
        </section>
    );
}
