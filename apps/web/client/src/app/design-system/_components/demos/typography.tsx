'use client';

import { useState } from 'react';

import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import type { TypographyRowData } from './data';
import { useOverrides } from '../overrides-context';
import { Section } from '../section';
import { BODY_SCALE_RULES, TYPOGRAPHY_ROWS, typoVars, WEBSITE_TYPOGRAPHY } from './data';

export function TypographyDemo() {
    const { overrides, setToken, resetTokens } = useOverrides();
    const [expandedRow, setExpandedRow] = useState<string | null>(null);

    const editedCount = TYPOGRAPHY_ROWS.filter((r) =>
        typoVars(r.label).some((k) => overrides[k]),
    ).length;

    return (
        <div id="typography">
            <Section
                title="App type scale"
                tag="typography"
                filePath="packages/ui/src/globals.css"
                editedCount={editedCount}
                controls={<p className="text-foreground-tertiary text-xs">Click a row to edit</p>}
            >
                <div className="border-border overflow-hidden rounded-xl border">
                    {TYPOGRAPHY_ROWS.map((row) => {
                        const isExpanded = expandedRow === row.label;
                        const isEdited = typoVars(row.label).some((k) => overrides[k]);
                        const currentSize = overrides[`--font-size-${row.label}`]
                            ? parseFloat(overrides[`--font-size-${row.label}`]!)
                            : row.sizeDefault;
                        const currentWeight =
                            overrides[`--font-weight-${row.label}`] ?? String(row.weightDefault);
                        return (
                            <div
                                key={row.label}
                                className={cn(
                                    'border-border border-b last:border-b-0',
                                    isEdited && 'border-l-2 border-l-amber-400/60',
                                )}
                            >
                                <button
                                    onClick={() => setExpandedRow(isExpanded ? null : row.label)}
                                    className="hover:bg-foreground/4 group flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors"
                                >
                                    <span className={cn('text-foreground flex-1', row.className)}>
                                        The quick brown fox
                                    </span>
                                    <div className="flex shrink-0 items-center gap-3">
                                        <div className="text-right opacity-0 transition-opacity group-hover:opacity-100">
                                            <span className="text-foreground-tertiary font-mono text-[10px]">
                                                {currentSize}rem / {currentWeight}
                                            </span>
                                        </div>
                                        <span
                                            className={cn(
                                                'text-foreground-tertiary w-24 font-mono text-[10px]',
                                                isEdited && 'text-amber-400',
                                            )}
                                        >
                                            text-{row.label}
                                        </span>
                                        <Icons.ChevronDown
                                            className={cn(
                                                'text-foreground-tertiary h-3 w-3 transition-transform',
                                                isExpanded && 'rotate-180',
                                            )}
                                        />
                                    </div>
                                </button>
                                {isExpanded && (
                                    <TypographyEditor
                                        row={row}
                                        overrides={overrides}
                                        onChange={setToken}
                                        onResetRow={(label) => resetTokens(typoVars(label))}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
            </Section>

            <Section
                title="Heading styles (landing / marketing)"
                tag="typography"
                filePath="apps/web/client/src/styles/globals.css"
                controls={
                    <p className="text-foreground-tertiary text-xs">
                        Tag-agnostic — apply{' '}
                        <code className="font-mono">heading-style-h*</code> to any element
                    </p>
                }
            >
                <div className="border-border divide-border divide-y overflow-hidden rounded-xl border">
                    {WEBSITE_TYPOGRAPHY.map((row) => (
                        <div
                            key={row.label}
                            className="hover:bg-foreground/4 group flex items-baseline justify-between gap-4 px-4 py-3 transition-colors"
                        >
                            <span className={cn('text-foreground flex-1 truncate', row.className)}>
                                Design visually
                            </span>
                            <div className="flex shrink-0 items-center gap-4 text-right">
                                <span className="text-foreground-tertiary font-mono text-[10px] opacity-0 transition-opacity group-hover:opacity-100">
                                    {row.size} / {row.note}
                                </span>
                                <span className="text-foreground-tertiary w-36 font-mono text-[10px]">
                                    {row.label}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </Section>

            <Section
                title="Body scale rules"
                tag="typography"
                controls={
                    <p className="text-foreground-tertiary text-xs">
                        Use the <code className="font-mono">text-*</code> tokens — never raw
                        Tailwind sizes
                    </p>
                }
            >
                <div className="border-border overflow-hidden rounded-xl border">
                    <div className="text-foreground-tertiary bg-foreground/[0.03] grid grid-cols-[1fr_1.4fr_1fr] gap-4 px-4 py-2 font-mono text-[10px] tracking-wider uppercase">
                        <span>Use case</span>
                        <span>Use this</span>
                        <span>Avoid</span>
                    </div>
                    {BODY_SCALE_RULES.map((row) => (
                        <div
                            key={row.use}
                            className="border-border grid grid-cols-[1fr_1.4fr_1fr] gap-4 border-t px-4 py-3"
                        >
                            <span className="text-foreground text-small">{row.use}</span>
                            <code className="text-foreground font-mono text-[12px]">
                                {row.useThis}
                            </code>
                            <code className="text-foreground-tertiary decoration-foreground-tertiary/40 font-mono text-[12px] line-through">
                                {row.avoid}
                            </code>
                        </div>
                    ))}
                </div>
                <ul className="text-foreground-secondary text-small mt-4 ml-4 list-disc space-y-1">
                    <li>
                        Never pair a <code className="font-mono">-plus</code> token with{' '}
                        <code className="font-mono">font-medium</code> — the{' '}
                        <code className="font-mono">-plus</code> already implies medium.
                    </li>
                    <li>
                        Color stays separate from scale:{' '}
                        <code className="font-mono">text-foreground-secondary text-regular</code> ✓
                        — not <code className="font-mono">text-muted-foreground text-sm</code> ✗.
                    </li>
                    <li>
                        Landing headings use{' '}
                        <code className="font-mono">heading-style-h1…h6</code>. Raw{' '}
                        <code className="font-mono">text-4xl font-light leading-[…]</code> is no
                        longer allowed.
                    </li>
                    <li>
                        <code className="font-mono">text-title1/2/3</code> are editor-only — landing
                        reaches for <code className="font-mono">heading-style-h*</code> instead.
                    </li>
                </ul>
            </Section>

            <Section title="Font weights" tag="typography">
                <div className="flex flex-wrap gap-6">
                    {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => (
                        <div key={w}>
                            <p className="text-foreground text-base" style={{ fontWeight: w }}>
                                Weblab
                            </p>
                            <p className="text-foreground-tertiary mt-0.5 font-mono text-[10px]">
                                {w}
                            </p>
                        </div>
                    ))}
                </div>
            </Section>
        </div>
    );
}

function TypographyEditor({
    row,
    overrides,
    onChange,
    onResetRow,
}: {
    row: TypographyRowData;
    overrides: Record<string, string>;
    onChange: (cssVar: string, value: string) => void;
    onResetRow: (label: string) => void;
}) {
    const sizeVar = `--font-size-${row.label}`;
    const weightVar = `--font-weight-${row.label}`;
    const leadingVar = `--font-leading-${row.label}`;
    const trackingVar = `--font-tracking-${row.label}`;
    const rawSize = overrides[sizeVar];
    const currentSize = rawSize ? parseFloat(rawSize) : row.sizeDefault;
    const currentWeight = overrides[weightVar] ?? String(row.weightDefault);
    const currentLeading = overrides[leadingVar] ?? row.leadingDefault;
    const rawTracking = overrides[trackingVar];
    const currentTracking = rawTracking ? parseFloat(rawTracking) : row.trackingDefault;
    const isEdited = [sizeVar, weightVar, leadingVar, trackingVar].some(
        (k) => overrides[k] !== undefined,
    );

    return (
        <div className="bg-foreground/[0.03] border-border border-t px-4 py-4">
            <div className="flex flex-wrap items-end gap-5">
                <div className="space-y-1.5">
                    <p className="text-foreground-tertiary text-[10px] font-medium">Font size</p>
                    <div className="flex items-center gap-1.5">
                        <input
                            type="number"
                            step={0.0625}
                            min={0.25}
                            max={6}
                            value={currentSize}
                            onChange={(e) => onChange(sizeVar, `${e.target.value}rem`)}
                            className="bg-background border-border text-foreground focus:border-foreground/40 w-16 rounded-md border px-2 py-1.5 font-mono text-xs transition-colors outline-none"
                        />
                        <span className="text-foreground-tertiary text-xs">rem</span>
                        <span className="text-foreground-tertiary text-[10px] opacity-50">
                            {Math.round(currentSize * 16)}px
                        </span>
                    </div>
                </div>
                <div className="space-y-1.5">
                    <p className="text-foreground-tertiary text-[10px] font-medium">Weight</p>
                    <select
                        value={currentWeight}
                        onChange={(e) => onChange(weightVar, e.target.value)}
                        className="bg-background border-border text-foreground focus:border-foreground/40 rounded-md border px-2 py-1.5 text-xs transition-colors outline-none"
                    >
                        {[
                            ['100', 'Thin'],
                            ['200', 'Extralight'],
                            ['300', 'Light'],
                            ['400', 'Regular'],
                            ['500', 'Medium'],
                            ['600', 'Semibold'],
                            ['700', 'Bold'],
                            ['800', 'Extrabold'],
                            ['900', 'Black'],
                        ].map(([val, name]) => (
                            <option key={val} value={val}>
                                {val} — {name}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="space-y-1.5">
                    <p className="text-foreground-tertiary text-[10px] font-medium">Line height</p>
                    <input
                        type="text"
                        value={currentLeading}
                        onChange={(e) => onChange(leadingVar, e.target.value)}
                        className="bg-background border-border text-foreground focus:border-foreground/40 w-24 rounded-md border px-2 py-1.5 font-mono text-xs transition-colors outline-none"
                        placeholder="1.4rem"
                    />
                </div>
                <div className="space-y-1.5">
                    <p className="text-foreground-tertiary text-[10px] font-medium">
                        Letter spacing
                    </p>
                    <div className="flex items-center gap-1.5">
                        <input
                            type="number"
                            step={0.001}
                            min={-0.1}
                            max={0.2}
                            value={currentTracking}
                            onChange={(e) => onChange(trackingVar, `${e.target.value}rem`)}
                            className="bg-background border-border text-foreground focus:border-foreground/40 w-16 rounded-md border px-2 py-1.5 font-mono text-xs transition-colors outline-none"
                        />
                        <span className="text-foreground-tertiary text-xs">rem</span>
                    </div>
                </div>
                {isEdited && (
                    <button
                        onClick={() => onResetRow(row.label)}
                        className="text-foreground-tertiary hover:text-foreground self-end pb-2 text-xs transition-colors"
                    >
                        reset
                    </button>
                )}
            </div>
        </div>
    );
}
