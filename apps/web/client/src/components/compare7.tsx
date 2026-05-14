'use client';

import { type ReactNode } from 'react';

import { Reveal } from '@/components/motion/reveal';
import { cn } from '@/lib/utils';

interface Compare7Row {
    feature: string;
    primary: string;
    secondary: string;
    primaryIcon?: ReactNode;
}

interface Compare7Props {
    eyebrow?: string;
    heading: string;
    description?: string;
    featureColumnLabel?: string;
    primaryLabel: string;
    secondaryLabel: string;
    rows: Compare7Row[];
    className?: string;
}

/**
 * Weblab-themed comparison table. Two columns: "you" (primary, highlighted)
 * vs "them" (secondary, muted). Single shared border, primary column gets a
 * subtle background tint. Monospace feature labels for typographic interest.
 */
const Compare7 = ({
    eyebrow,
    heading,
    description,
    featureColumnLabel = 'Feature',
    primaryLabel,
    secondaryLabel,
    rows,
    className,
}: Compare7Props) => {
    return (
        <section className={cn(className)}>
            <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 md:px-8 md:py-32">
                <div className="mb-12 max-w-3xl">
                    {eyebrow ? (
                        <Reveal as="p" delay={0} y={12} className="heading-style-h6 text-foreground-secondary mb-4">
                            {eyebrow}
                        </Reveal>
                    ) : null}
                    <Reveal as="h2" delay={0.1} y={16} className="heading-style-h3 text-foreground-primary mb-4 text-balance">
                        {heading}
                    </Reveal>
                    {description ? (
                        <Reveal as="p" delay={0.2} y={12} className="text-foreground-secondary text-regularPlus text-balance">
                            {description}
                        </Reveal>
                    ) : null}
                </div>
                <Reveal delay={0.3} y={20}>
                    <div className="border-foreground-primary/10 overflow-hidden rounded-lg border">
                        <table className="w-full border-collapse text-left">
                            <thead>
                                <tr className="border-foreground-primary/10 border-b">
                                    <th className="text-foreground-tertiary text-small px-5 py-4 font-normal">
                                        {featureColumnLabel}
                                    </th>
                                    <th className="text-foreground-primary text-regular bg-foreground-primary/5 px-5 py-4 font-normal">
                                        <span className="inline-flex items-center gap-2">
                                            <span className="bg-foreground-primary h-1.5 w-1.5 rounded-full" />
                                            {primaryLabel}
                                        </span>
                                    </th>
                                    <th className="text-foreground-tertiary text-regular px-5 py-4 font-normal">
                                        {secondaryLabel}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row, i) => (
                                    <tr
                                        key={i}
                                        className={
                                            i !== rows.length - 1
                                                ? 'border-foreground-primary/10 border-b'
                                                : ''
                                        }
                                    >
                                        <td className="text-foreground-secondary px-5 py-4 font-mono text-small">
                                            {row.feature}
                                        </td>
                                        <td className="text-foreground-primary text-regular bg-foreground-primary/5 px-5 py-4">
                                            <span className="inline-flex items-center gap-2">
                                                {row.primaryIcon}
                                                <span>{row.primary}</span>
                                            </span>
                                        </td>
                                        <td className="text-foreground-tertiary text-regular px-5 py-4">
                                            {row.secondary}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Reveal>
            </div>
        </section>
    );
};

export { Compare7 };
export type { Compare7Props, Compare7Row };
