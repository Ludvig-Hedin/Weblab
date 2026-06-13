import { ArrowRight, Check } from 'lucide-react';

import { Button } from '../vendor/ui/button';
import { Eyebrow, Media } from './_ui';

export interface Feature1Content {
    eyebrow?: string;
    heading: string;
    subheading: string;
    bullets: string[];
    ctaLabel?: string;
}

export default function Feature1({ content }: { content: Feature1Content }) {
    return (
        <section className="bg-background py-16 lg:py-24" aria-labelledby="feature1-heading">
            <div className="mx-auto flex max-w-6xl flex-col items-center gap-12 px-6 lg:flex-row lg:gap-16">
                <div className="w-full flex-1 lg:order-2">
                    <Media ratio="aspect-[4/3]" />
                </div>
                <div className="flex flex-1 flex-col items-start gap-5 lg:order-1">
                    {content.eyebrow ? <Eyebrow>{content.eyebrow}</Eyebrow> : null}
                    <h2
                        id="feature1-heading"
                        className="text-foreground text-3xl font-semibold tracking-tight md:text-4xl"
                    >
                        {content.heading}
                    </h2>
                    <p className="text-muted-foreground text-lg leading-relaxed text-pretty">
                        {content.subheading}
                    </p>
                    <ul className="flex flex-col gap-3 pt-2">
                        {content.bullets.map((bullet, i) => (
                            <li key={i} className="text-foreground flex items-start gap-3">
                                <Check className="text-foreground mt-0.5 h-5 w-5 shrink-0" />
                                <span className="text-base leading-relaxed">{bullet}</span>
                            </li>
                        ))}
                    </ul>
                    {content.ctaLabel ? (
                        <Button variant="link" className="px-0" asChild>
                            <a href="#">
                                {content.ctaLabel} <ArrowRight />
                            </a>
                        </Button>
                    ) : null}
                </div>
            </div>
        </section>
    );
}
