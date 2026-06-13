import { ActionButton, Eyebrow, Placeholder } from './_ui';

export interface Hero1Content {
    eyebrow?: string;
    heading: string;
    subheading: string;
    primaryCtaLabel: string;
    secondaryCtaLabel?: string;
}

export default function Hero1({ content }: { content: Hero1Content }) {
    return (
        <section className="bg-background py-16 lg:py-24" aria-labelledby="hero-heading">
            <div className="mx-auto flex max-w-6xl flex-col items-center gap-12 px-6 lg:flex-row lg:gap-16">
                <div className="flex flex-1 flex-col items-start gap-6">
                    {content.eyebrow ? <Eyebrow>{content.eyebrow}</Eyebrow> : null}
                    <h1
                        id="hero-heading"
                        className="text-foreground text-4xl leading-[1.1] font-semibold tracking-tight text-balance md:text-5xl"
                    >
                        {content.heading}
                    </h1>
                    <p className="text-muted-foreground max-w-prose text-lg leading-relaxed text-pretty">
                        {content.subheading}
                    </p>
                    <div className="flex flex-wrap items-center gap-4 pt-2">
                        <ActionButton label={content.primaryCtaLabel} />
                        {content.secondaryCtaLabel ? (
                            <ActionButton label={content.secondaryCtaLabel} variant="ghost" />
                        ) : null}
                    </div>
                </div>
                <div className="w-full flex-1">
                    <Placeholder ratio="aspect-[4/3]" />
                </div>
            </div>
        </section>
    );
}
