'use client';

import { useMemo, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';

import { Button } from '@weblab/ui/button';

/**
 * Admin AI usage dashboard.
 *
 * Surfaces the data Convex collects in `aiUsageEvents`:
 *   - Total spend / cache-hit ratio / avg TTF over a window
 *   - Per-model breakdown (cost, request count, tokens)
 *   - Recent request log
 *
 * Access is gated server-side by `aiUsageEvents.aggregateAdmin` and
 * `aiUsageEvents.listAdmin`, both of which check the caller's email
 * against `WEBLAB_ADMIN_EMAILS`. Non-admins get an empty state — we
 * don't even render the route shell when access fails.
 */

const WINDOWS: { label: string; days: number }[] = [
    { label: '24h', days: 1 },
    { label: '7 days', days: 7 },
    { label: '30 days', days: 30 },
    { label: '90 days', days: 90 },
];

function formatUsd(n: number): string {
    if (n === 0) return '$0';
    if (n < 0.01) return `$${n.toFixed(4)}`;
    if (n < 1) return `$${n.toFixed(3)}`;
    return `$${n.toFixed(2)}`;
}

function formatTokens(n: number): string {
    if (n < 1000) return n.toString();
    if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
    return `${(n / 1_000_000).toFixed(2)}M`;
}

export default function AdminUsagePage() {
    const [days, setDays] = useState(7);
    const since = useMemo(() => Date.now() - days * 24 * 60 * 60 * 1000, [days]);

    const aggregate = useQuery(api.aiUsageEvents.aggregateAdmin, { since });
    const recent = useQuery(api.aiUsageEvents.listAdmin, { since, limit: 100 });

    if (aggregate === undefined) {
        return <div className="text-foreground-tertiary p-8">Loading AI usage…</div>;
    }

    return (
        <div className="mx-auto max-w-7xl space-y-6 p-8">
            <header className="flex items-end justify-between">
                <div>
                    <h1 className="text-2xl font-medium">AI Usage</h1>
                    <p className="text-foreground-tertiary text-sm">
                        Per-request cost, token, and cache telemetry from the chat pipeline.
                    </p>
                </div>
                <div className="flex gap-1">
                    {WINDOWS.map((w) => (
                        <Button
                            key={w.label}
                            variant={days === w.days ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setDays(w.days)}
                        >
                            {w.label}
                        </Button>
                    ))}
                </div>
            </header>

            <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatCard label="Total spend" value={formatUsd(aggregate.totalCostUsd)} />
                <StatCard label="Requests" value={aggregate.requestCount.toString()} />
                <StatCard
                    label="Cache hit ratio"
                    value={
                        aggregate.cacheHitRatio === null
                            ? '—'
                            : `${(aggregate.cacheHitRatio * 100).toFixed(1)}%`
                    }
                />
                <StatCard
                    label="Avg TTF"
                    value={
                        aggregate.avgTtfMs === null ? '—' : `${Math.round(aggregate.avgTtfMs)}ms`
                    }
                />
                <StatCard label="Input tokens" value={formatTokens(aggregate.inputTokens)} />
                <StatCard label="Output tokens" value={formatTokens(aggregate.outputTokens)} />
                <StatCard label="Cache read" value={formatTokens(aggregate.cacheReadTokens)} />
                <StatCard
                    label="Errors"
                    value={aggregate.errorCount.toString()}
                    tone={aggregate.errorCount > 0 ? 'warn' : 'default'}
                />
            </section>

            <section>
                <h2 className="mb-2 text-lg font-medium">By model</h2>
                <div className="border-border-secondary overflow-hidden rounded-md border">
                    <table className="w-full text-sm">
                        <thead className="bg-background-secondary text-foreground-tertiary">
                            <tr>
                                <th className="px-3 py-2 text-left font-normal">Model</th>
                                <th className="px-3 py-2 text-right font-normal">Requests</th>
                                <th className="px-3 py-2 text-right font-normal">Input</th>
                                <th className="px-3 py-2 text-right font-normal">Output</th>
                                <th className="px-3 py-2 text-right font-normal">Spend</th>
                            </tr>
                        </thead>
                        <tbody>
                            {aggregate.byModel.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={5}
                                        className="text-foreground-tertiary px-3 py-6 text-center"
                                    >
                                        No usage in window.
                                    </td>
                                </tr>
                            ) : (
                                aggregate.byModel.map((row) => (
                                    <tr
                                        key={row.model}
                                        className="border-border-secondary border-t"
                                    >
                                        <td className="px-3 py-2 font-mono text-xs">{row.model}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            {row.count}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            {formatTokens(row.inTok)}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            {formatTokens(row.outTok)}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            {formatUsd(row.cost)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <section>
                <h2 className="mb-2 text-lg font-medium">Recent requests</h2>
                <div className="border-border-secondary overflow-hidden rounded-md border">
                    <table className="w-full text-xs">
                        <thead className="bg-background-secondary text-foreground-tertiary">
                            <tr>
                                <th className="px-3 py-2 text-left font-normal">When</th>
                                <th className="px-3 py-2 text-left font-normal">Model</th>
                                <th className="px-3 py-2 text-left font-normal">Type</th>
                                <th className="px-3 py-2 text-right font-normal">Tokens</th>
                                <th className="px-3 py-2 text-right font-normal">Cache R</th>
                                <th className="px-3 py-2 text-right font-normal">Cost</th>
                                <th className="px-3 py-2 text-right font-normal">TTF</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recent === undefined ? (
                                <tr>
                                    <td
                                        colSpan={7}
                                        className="text-foreground-tertiary px-3 py-6 text-center"
                                    >
                                        Loading…
                                    </td>
                                </tr>
                            ) : recent.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={7}
                                        className="text-foreground-tertiary px-3 py-6 text-center"
                                    >
                                        No usage in window.
                                    </td>
                                </tr>
                            ) : (
                                recent.map((e) => (
                                    <tr key={e._id} className="border-border-secondary border-t">
                                        <td className="text-foreground-tertiary px-3 py-2 tabular-nums">
                                            {new Date(e.createdAt).toLocaleString()}
                                        </td>
                                        <td className="px-3 py-2 font-mono">{e.model}</td>
                                        <td className="px-3 py-2">{e.chatType}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            {formatTokens(e.inputTokens)} /{' '}
                                            {formatTokens(e.outputTokens)}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            {formatTokens(e.cacheReadTokens)}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            {formatUsd(e.estimatedCostUsd)}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            {e.ttfMs ? `${e.ttfMs}ms` : '—'}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}

function StatCard({
    label,
    value,
    tone = 'default',
}: {
    label: string;
    value: string;
    tone?: 'default' | 'warn';
}) {
    return (
        <div
            className={`border-border-secondary rounded-md border p-3 ${
                tone === 'warn' ? 'bg-yellow-500/5' : 'bg-background-secondary/40'
            }`}
        >
            <div className="text-foreground-tertiary text-xs">{label}</div>
            <div className="text-foreground-primary mt-1 text-xl font-medium tabular-nums">
                {value}
            </div>
        </div>
    );
}
