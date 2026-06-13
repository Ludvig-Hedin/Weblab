import { ActionButton, Eyebrow } from './_ui';

export interface Hero6Content {
    eyebrow?: string;
    heading: string;
    subheading: string;
    primaryCtaLabel: string;
    secondaryCtaLabel?: string;
}

export default function Hero6({ content }: { content: Hero6Content }) {
    return (
        <section className="bg-background py-20 lg:py-28" aria-labelledby="hero6-heading">
            <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 text-center">
                {content.eyebrow ? <Eyebrow>{content.eyebrow}</Eyebrow> : null}
                <h1
                    id="hero6-heading"
                    className="text-foreground text-4xl leading-[1.1] font-semibold tracking-tight text-balance md:text-6xl"
                >
                    {content.heading}
                </h1>
                <p className="text-muted-foreground max-w-2xl text-lg leading-relaxed text-pretty">
                    {content.subheading}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
                    <ActionButton label={content.primaryCtaLabel} />
                    {content.secondaryCtaLabel ? (
                        <ActionButton label={content.secondaryCtaLabel} variant="ghost" />
                    ) : null}
                </div>
            </div>
        </section>
    );
}
