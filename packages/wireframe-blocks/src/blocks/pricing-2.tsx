import { Check } from 'lucide-react';

import { Button } from '../vendor/ui/button';
import { Card, CardContent, CardHeader } from '../vendor/ui/card';
import { Eyebrow } from './_ui';

export interface PricingPlan {
    name: string;
    price: string;
    period?: string;
    description?: string;
    features: string[];
    ctaLabel: string;
    highlighted?: boolean;
}

export interface Pricing2Content {
    eyebrow?: string;
    heading: string;
    subheading?: string;
    plans: PricingPlan[];
}

export default function Pricing2({ content }: { content: Pricing2Content }) {
    return (
        <section className="bg-background py-16 lg:py-24" aria-labelledby="pricing2-heading">
            <div className="mx-auto max-w-6xl px-6">
                <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
                    {content.eyebrow ? <Eyebrow>{content.eyebrow}</Eyebrow> : null}
                    <h2
                        id="pricing2-heading"
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
                <div className="mt-12 grid gap-6 md:grid-cols-3">
                    {content.plans.map((plan, i) => (
                        <Card
                            key={i}
                            className={plan.highlighted ? 'border-foreground shadow-sm' : ''}
                        >
                            <CardHeader>
                                <h3 className="text-foreground text-lg font-medium">{plan.name}</h3>
                                {plan.description ? (
                                    <p className="text-muted-foreground text-sm">
                                        {plan.description}
                                    </p>
                                ) : null}
                                <p className="flex items-baseline gap-1 pt-2">
                                    <span className="text-foreground text-4xl font-semibold tracking-tight">
                                        {plan.price}
                                    </span>
                                    {plan.period ? (
                                        <span className="text-muted-foreground text-sm">
                                            {plan.period}
                                        </span>
                                    ) : null}
                                </p>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-6">
                                <Button
                                    variant={plan.highlighted ? 'default' : 'secondary'}
                                    className="w-full"
                                    asChild
                                >
                                    <a href="#">{plan.ctaLabel}</a>
                                </Button>
                                <ul className="flex flex-col gap-3">
                                    {plan.features.map((feature, j) => (
                                        <li
                                            key={j}
                                            className="text-muted-foreground flex items-start gap-2.5 text-sm"
                                        >
                                            <Check className="text-foreground mt-0.5 h-4 w-4 shrink-0" />
                                            <span>{feature}</span>
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </section>
    );
}
