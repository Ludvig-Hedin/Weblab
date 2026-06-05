/**
 * Feature list — deliberately NOT three identical icon-topped cards. Groups with
 * spacing, dividers, and type hierarchy. Asymmetric: a section lead on the left,
 * the list on the right. Flat, token-only.
 */
const FEATURES = [
    {
        title: 'One workspace',
        body: 'Drafts, tasks, and review live together so nothing falls between tools.',
    },
    {
        title: 'Real-time preview',
        body: 'Every change renders instantly — what you see is what ships.',
    },
    {
        title: 'Keyboard-first',
        body: 'Move through the whole app without lifting your hands off the keys.',
    },
];

export function FeatureList() {
    return (
        <section id="features" className="mx-auto max-w-6xl px-6 py-24">
            <div className="grid gap-12 md:grid-cols-[0.8fr_1.2fr] md:gap-16">
                <div className="flex flex-col gap-3">
                    <h2 className="text-balance text-3xl font-semibold tracking-tight text-foreground">
                        Built for momentum
                    </h2>
                    <p className="text-pretty text-muted-foreground">
                        The few things that matter, done well.
                    </p>
                </div>
                <dl className="divide-y divide-border">
                    {FEATURES.map((f) => (
                        <div key={f.title} className="flex flex-col gap-1 py-5 first:pt-0 last:pb-0">
                            <dt className="text-base font-medium text-foreground">{f.title}</dt>
                            <dd className="text-pretty text-muted-foreground">{f.body}</dd>
                        </div>
                    ))}
                </dl>
            </div>
        </section>
    );
}
