import { Button } from '../vendor/ui/button';
import { Eyebrow, Media } from './_ui';

export interface Split2Content {
    eyebrow?: string;
    heading: string;
    subheading: string;
    ctaLabel?: string;
    imageSide: 'left' | 'right';
}

export default function Split2({ content }: { content: Split2Content }) {
    const mediaRight = content.imageSide === 'right';
    return (
        <section className="bg-background py-16 lg:py-24" aria-labelledby="split2-heading">
            <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 lg:grid-cols-2 lg:gap-16">
                <div
                    className={`flex flex-col items-start gap-5 ${mediaRight ? '' : 'lg:order-2'}`}
                >
                    {content.eyebrow ? <Eyebrow>{content.eyebrow}</Eyebrow> : null}
                    <h2
                        id="split2-heading"
                        className="text-foreground text-3xl font-semibold tracking-tight md:text-4xl"
                    >
                        {content.heading}
                    </h2>
                    <p className="text-muted-foreground text-lg leading-relaxed text-pretty">
                        {content.subheading}
                    </p>
                    {content.ctaLabel ? (
                        <Button asChild>
                            <a href="#">{content.ctaLabel}</a>
                        </Button>
                    ) : null}
                </div>
                <div className={mediaRight ? '' : 'lg:order-1'}>
                    <Media ratio="aspect-[5/4]" />
                </div>
            </div>
        </section>
    );
}
