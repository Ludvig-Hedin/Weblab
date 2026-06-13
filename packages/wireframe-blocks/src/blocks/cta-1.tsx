import { ArrowRight } from 'lucide-react';

import { Button } from '../vendor/ui/button';
import { Eyebrow } from './_ui';

export interface Cta1Content {
    eyebrow?: string;
    heading: string;
    subheading: string;
    primaryCtaLabel: string;
    secondaryCtaLabel?: string;
}

export default function Cta1({ content }: { content: Cta1Content }) {
    return (
        <section className="bg-background py-16 lg:py-24" aria-labelledby="cta1-heading">
            <div className="mx-auto max-w-5xl px-6">
                <div className="border-border bg-secondary flex flex-col items-center gap-6 rounded-2xl border px-8 py-14 text-center">
                    {content.eyebrow ? <Eyebrow>{content.eyebrow}</Eyebrow> : null}
                    <h2
                        id="cta1-heading"
                        className="text-foreground max-w-2xl text-3xl font-semibold tracking-tight text-balance md:text-4xl"
                    >
                        {content.heading}
                    </h2>
                    <p className="text-muted-foreground max-w-xl text-lg leading-relaxed text-pretty">
                        {content.subheading}
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                        <Button size="lg" asChild>
                            <a href="#">{content.primaryCtaLabel}</a>
                        </Button>
                        {content.secondaryCtaLabel ? (
                            <Button size="lg" variant="ghost" asChild>
                                <a href="#">
                                    {content.secondaryCtaLabel} <ArrowRight />
                                </a>
                            </Button>
                        ) : null}
                    </div>
                </div>
            </div>
        </section>
    );
}
