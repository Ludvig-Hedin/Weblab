import { Eyebrow } from './_ui';

export interface FeatureGridItem {
    title: string;
    description: string;
}

export interface FeatureGrid10Content {
    eyebrow?: string;
    heading: string;
    subheading?: string;
    items: FeatureGridItem[];
}

export default function FeatureGrid10({ content }: { content: FeatureGrid10Content }) {
    return (
        <section className="bg-background py-16 lg:py-24" aria-labelledby="feature-grid-heading">
            <div className="mx-auto max-w-6xl px-6">
                <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
                    {content.eyebrow ? <Eyebrow>{content.eyebrow}</Eyebrow> : null}
                    <h2
                        id="feature-grid-heading"
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
                <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                    {content.items.map((item, i) => (
                        <div
                            key={i}
                            className="border-border flex flex-col gap-3 rounded-xl border p-6"
                        >
                            <span className="bg-muted h-9 w-9 rounded-lg" aria-hidden="true" />
                            <h3 className="text-foreground text-lg font-medium">{item.title}</h3>
                            <p className="text-muted-foreground text-sm leading-relaxed">
                                {item.description}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
