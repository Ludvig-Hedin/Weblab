import { Card, CardContent, CardHeader, CardTitle } from '../vendor/ui/card';
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
                <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {content.items.map((item, i) => (
                        <Card key={i}>
                            <CardHeader>
                                <span
                                    className="bg-muted mb-2 h-9 w-9 rounded-lg"
                                    aria-hidden="true"
                                />
                                <CardTitle>{item.title}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-muted-foreground text-sm leading-relaxed">
                                    {item.description}
                                </p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </section>
    );
}
