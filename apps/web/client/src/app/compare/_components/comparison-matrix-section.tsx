'use client';

import React from 'react';
import Link from 'next/link';
import { Check, Minus, X } from 'lucide-react';

import { APP_NAME } from '@weblab/constants';
import { Button } from '@weblab/ui/button';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// ─── Types ────────────────────────────────────────────────────────────────────

type CellValue =
    | true // green check
    | false // muted X
    | 'partial' // yellow dash + tooltip
    | string; // plain text

interface CellConfig {
    value: CellValue;
    tooltip?: string;
}

type Cell = CellValue | CellConfig;

interface Row {
    feature: string;
    tooltip?: string; // tooltip on the feature label itself
    weblab: Cell;
    webflow: Cell;
    framer: Cell;
    lovable: Cell;
    isCategory?: boolean; // renders as a group header row
}

// ─── Cell renderer ────────────────────────────────────────────────────────────

function resolveCell(cell: Cell): CellConfig {
    if (cell !== null && typeof cell === 'object') return cell;
    return { value: cell };
}

function CellContent({ cell, highlight }: { cell: Cell; highlight?: boolean }) {
    const { value, tooltip } = resolveCell(cell);

    let inner: React.ReactNode;

    if (value === true) {
        inner = (
            <span className="inline-flex items-center justify-center">
                <Check
                    className={`h-4 w-4 ${highlight ? 'text-foreground-primary' : 'text-foreground-secondary'}`}
                    strokeWidth={2.5}
                />
            </span>
        );
    } else if (value === false) {
        inner = (
            <span className="inline-flex items-center justify-center">
                <X className="text-foreground-tertiary/40 h-4 w-4" strokeWidth={2} />
            </span>
        );
    } else if (value === 'partial') {
        inner = (
            <span className="inline-flex items-center justify-center">
                <Minus className="text-foreground-tertiary h-4 w-4" strokeWidth={2} />
            </span>
        );
    } else {
        inner = (
            <span
                className={`text-sm ${highlight ? 'text-foreground-primary' : 'text-foreground-secondary'}`}
            >
                {value}
            </span>
        );
    }

    if (tooltip) {
        return (
            <Tooltip>
                <TooltipTrigger asChild>
                    <button type="button" className="cursor-default">
                        {inner}
                    </button>
                </TooltipTrigger>
                <TooltipContent sideOffset={8} className="max-w-64 text-center">
                    {tooltip}
                </TooltipContent>
            </Tooltip>
        );
    }

    return <>{inner}</>;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const rows: Row[] = [
    // ── Editing surface ─────────────────────────────────────────────
    {
        feature: 'Editing surface',
        isCategory: true,
        weblab: '',
        webflow: '',
        framer: '',
        lovable: '',
    },

    {
        feature: 'Works with your existing React codebase',
        weblab: true,
        webflow: false,
        framer: false,
        lovable: false,
    },
    {
        feature: 'Edits your real components (not a simulation)',
        weblab: true,
        webflow: false,
        framer: false,
        lovable: false,
    },
    {
        feature: 'Infinite visual canvas',
        weblab: true,
        webflow: true,
        framer: true,
        lovable: false,
    },
    {
        feature: 'Designers can contribute without code',
        weblab: true,
        webflow: true,
        framer: true,
        lovable: false,
    },
    {
        feature: 'Real-time live preview',
        weblab: true,
        webflow: true,
        framer: true,
        lovable: true,
    },

    // ── AI ───────────────────────────────────────────────────────────
    { feature: 'AI', isCategory: true, weblab: '', webflow: '', framer: '', lovable: '' },

    {
        feature: 'AI constrained to your design system',
        weblab: true,
        webflow: false,
        framer: false,
        lovable: false,
        tooltip:
            "Weblab's AI can only use components and tokens that already exist in your codebase — no brand drift.",
    },
    {
        feature: 'AI generates UI from natural language',
        weblab: true,
        webflow: {
            value: 'partial',
            tooltip: 'Webflow has limited AI suggestions, not full generation.',
        },
        framer: true,
        lovable: true,
    },
    {
        feature: 'AI aware of your component library',
        weblab: true,
        webflow: false,
        framer: false,
        lovable: false,
    },

    // ── Output & workflow ────────────────────────────────────────────
    {
        feature: 'Output & workflow',
        isCategory: true,
        weblab: '',
        webflow: '',
        framer: '',
        lovable: '',
    },

    {
        feature: 'Output as a GitHub pull request',
        weblab: true,
        webflow: false,
        framer: false,
        lovable: {
            value: 'partial',
            tooltip:
                'Lovable can sync to a GitHub repo, but the PR is auto-created, not staged for review.',
        },
    },
    {
        feature: 'Works with your CI pipeline',
        weblab: true,
        webflow: false,
        framer: false,
        lovable: {
            value: 'partial',
            tooltip: 'Only if you export and set up your own repo and CI.',
        },
    },
    {
        feature: 'Full code ownership',
        weblab: true,
        webflow: {
            value: 'partial',
            tooltip:
                'Code export available on paid plans, but produces Webflow-specific HTML/CSS, not React.',
        },
        framer: {
            value: 'partial',
            tooltip:
                'Code export available on paid plans, produces Framer-specific React patterns.',
        },
        lovable: {
            value: 'partial',
            tooltip: 'GitHub export available, but Lovable controls the generated stack.',
        },
    },
    {
        feature: 'Integrates with existing deployment',
        weblab: true,
        webflow: false,
        framer: false,
        lovable: false,
    },

    // ── Infrastructure ───────────────────────────────────────────────
    {
        feature: 'Infrastructure & pricing',
        isCategory: true,
        weblab: '',
        webflow: '',
        framer: '',
        lovable: '',
    },

    {
        feature: 'Bring your own hosting',
        weblab: true,
        webflow: false,
        framer: false,
        lovable: false,
    },
    {
        feature: 'Open source',
        weblab: true,
        webflow: false,
        framer: false,
        lovable: false,
    },
    {
        feature: 'Pricing',
        weblab: 'Free / open source',
        webflow: 'From $23/mo',
        framer: 'From $10/mo',
        lovable: 'Usage-based',
    },
];

// ─── Column headers config ────────────────────────────────────────────────────

const COLS = [
    { key: 'weblab', label: APP_NAME, highlight: true, href: '/projects' },
    { key: 'webflow', label: 'Webflow', highlight: false, href: '/compare/webflow' },
    { key: 'framer', label: 'Framer', highlight: false, href: '/compare/framer' },
    { key: 'lovable', label: 'Lovable', highlight: false, href: '/compare/lovable' },
] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export function ComparisonMatrixSection() {
    return (
        <TooltipProvider delayDuration={200}>
            <section className="py-32">
                <div className="mx-auto max-w-6xl px-8">
                    {/* Heading */}
                    <div className="mb-16">
                        <p className="text-foreground-tertiary mb-3 text-sm tracking-wider uppercase">
                            Feature comparison
                        </p>
                        <h2 className="text-foreground-primary mb-4 text-4xl font-light md:text-5xl">
                            {APP_NAME} vs the field
                        </h2>
                        <p className="text-foreground-secondary max-w-xl text-lg">
                            Most tools generate new code from scratch. {APP_NAME} edits the codebase
                            you already have — and keeps your design system intact.
                        </p>
                    </div>

                    {/* Table */}
                    <div className="border-foreground-tertiary/20 overflow-x-auto rounded-lg border">
                        <table className="w-full min-w-[640px] table-fixed text-left">
                            {/* Column header row */}
                            <thead>
                                <tr className="border-foreground-tertiary/20 border-b">
                                    {/* Feature label cell */}
                                    <th className="text-foreground-tertiary w-[38%] px-6 py-5 text-xs font-normal tracking-wider uppercase">
                                        Feature
                                    </th>

                                    {COLS.map((col) => (
                                        <th
                                            key={col.key}
                                            className={`w-[15.5%] px-4 py-5 text-center ${
                                                col.highlight ? 'bg-foreground-primary/[0.06]' : ''
                                            }`}
                                        >
                                            <Link
                                                href={col.href}
                                                className={`text-sm font-medium hover:underline ${
                                                    col.highlight
                                                        ? 'text-foreground-primary'
                                                        : 'text-foreground-secondary'
                                                }`}
                                            >
                                                {col.label}
                                            </Link>
                                        </th>
                                    ))}
                                </tr>
                            </thead>

                            <tbody>
                                {rows.map((row, idx) => {
                                    if (row.isCategory) {
                                        return (
                                            <tr
                                                key={`cat-${idx}`}
                                                className="border-foreground-tertiary/20 border-b"
                                            >
                                                <td
                                                    colSpan={5}
                                                    className="bg-foreground-primary/[0.03] text-foreground-tertiary px-6 py-3 text-xs font-medium tracking-widest uppercase"
                                                >
                                                    {row.feature}
                                                </td>
                                            </tr>
                                        );
                                    }

                                    const cells: Record<string, Cell> = {
                                        weblab: row.weblab,
                                        webflow: row.webflow,
                                        framer: row.framer,
                                        lovable: row.lovable,
                                    };

                                    return (
                                        <tr
                                            key={`row-${idx}`}
                                            className="border-foreground-tertiary/10 border-b last:border-b-0"
                                        >
                                            {/* Feature name */}
                                            <td className="text-foreground-secondary px-6 py-4 text-sm">
                                                {row.tooltip ? (
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <button
                                                                type="button"
                                                                className="cursor-default underline decoration-dotted underline-offset-4"
                                                            >
                                                                {row.feature}
                                                            </button>
                                                        </TooltipTrigger>
                                                        <TooltipContent
                                                            sideOffset={8}
                                                            className="max-w-64"
                                                        >
                                                            {row.tooltip}
                                                        </TooltipContent>
                                                    </Tooltip>
                                                ) : (
                                                    row.feature
                                                )}
                                            </td>

                                            {/* Data cells */}
                                            {COLS.map((col) => (
                                                <td
                                                    key={col.key}
                                                    className={`px-4 py-4 text-center align-middle ${
                                                        col.highlight
                                                            ? 'bg-foreground-primary/[0.06]'
                                                            : ''
                                                    }`}
                                                >
                                                    <CellContent
                                                        cell={cells[col.key]!}
                                                        highlight={col.highlight}
                                                    />
                                                </td>
                                            ))}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Legend */}
                    <div className="text-foreground-tertiary mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
                        <span className="flex items-center gap-1.5">
                            <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> Supported
                        </span>
                        <span className="flex items-center gap-1.5">
                            <Minus className="h-3.5 w-3.5" strokeWidth={2} /> Partial — hover for
                            details
                        </span>
                        <span className="flex items-center gap-1.5">
                            <X className="h-3.5 w-3.5" strokeWidth={2} /> Not supported
                        </span>
                    </div>

                    {/* CTA row */}
                    <div className="mt-12 flex flex-wrap gap-4">
                        <Button asChild>
                            <Link href="/projects">Try {APP_NAME} free</Link>
                        </Button>
                        <Button asChild variant="secondary">
                            <Link href="/compare">All comparisons</Link>
                        </Button>
                    </div>
                </div>
            </section>
        </TooltipProvider>
    );
}
