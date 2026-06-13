import { Eyebrow } from './_ui';

export interface StatItem {
    value: string;
    label: string;
}

export interface Stats2Content {
    eyebrow?: string;
    heading?: string;
    stats: StatItem[];
}

export default function Stats2({ content }: { content: Stats2Content }) {
    return (
        <section className="bg-background py-16 lg:py-24" aria-label="Key metrics">
            <div className="mx-auto max-w-6xl px-6">
                {content.heading ? (
                    <div className="mx-auto mb-12 flex max-w-2xl flex-col items-center gap-3 text-center">
                        {content.eyebrow ? <Eyebrow>{content.eyebrow}</Eyebrow> : null}
                        <h2 className="text-foreground text-3xl font-semibold tracking-tight md:text-4xl">
                            {content.heading}
                        </h2>
                    </div>
                ) : null}
                <dl className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
                    {content.stats.map((stat, i) => (
                        <div key={i} className="border-border flex flex-col gap-2 border-l pl-5">
                            <dt className="text-muted-foreground order-2 text-sm">{stat.label}</dt>
                            <dd className="text-foreground order-1 text-4xl font-semibold tracking-tight">
                                {stat.value}
                            </dd>
                        </div>
                    ))}
                </dl>
            </div>
        </section>
    );
}
