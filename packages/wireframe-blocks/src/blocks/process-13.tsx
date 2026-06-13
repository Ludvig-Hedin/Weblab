import { Eyebrow } from './_ui';

export interface ProcessStep {
    title: string;
    description: string;
}

export interface Process13Content {
    eyebrow?: string;
    heading: string;
    subheading?: string;
    steps: ProcessStep[];
}

export default function Process13({ content }: { content: Process13Content }) {
    return (
        <section className="bg-background py-16 lg:py-24" aria-labelledby="process13-heading">
            <div className="mx-auto max-w-6xl px-6">
                <div className="flex max-w-2xl flex-col gap-4">
                    {content.eyebrow ? <Eyebrow>{content.eyebrow}</Eyebrow> : null}
                    <h2
                        id="process13-heading"
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
                <ol className="mt-12 grid gap-8 md:grid-cols-3">
                    {content.steps.map((step, i) => (
                        <li key={i} className="border-border flex flex-col gap-3 border-t pt-5">
                            <span className="text-muted-foreground text-sm font-semibold">
                                {String(i + 1).padStart(2, '0')}
                            </span>
                            <h3 className="text-foreground text-lg font-medium">{step.title}</h3>
                            <p className="text-muted-foreground text-sm leading-relaxed">
                                {step.description}
                            </p>
                        </li>
                    ))}
                </ol>
            </div>
        </section>
    );
}
