'use client';

import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis } from 'recharts';

import type { ChartConfig } from '@weblab/ui/chart';
import {
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
    ChartTooltip,
    ChartTooltipContent,
} from '@weblab/ui/chart';

import { Section } from '../section';

const config = {
    sessions: { label: 'Sessions', color: 'var(--primary)' },
    edits: { label: 'Edits', color: 'var(--background-brand)' },
} satisfies ChartConfig;

const data = [
    { day: 'Mon', sessions: 186, edits: 80 },
    { day: 'Tue', sessions: 305, edits: 200 },
    { day: 'Wed', sessions: 237, edits: 120 },
    { day: 'Thu', sessions: 273, edits: 190 },
    { day: 'Fri', sessions: 209, edits: 130 },
    { day: 'Sat', sessions: 144, edits: 70 },
    { day: 'Sun', sessions: 162, edits: 90 },
];

export function ChartDemo() {
    return (
        <Section
            title="Chart"
            tag="data"
            inspectId="chart"
            filePath="packages/ui/src/components/chart.tsx"
            id="chart"
        >
            <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-2">
                    <p className="text-foreground-tertiary text-xs">Bar</p>
                    <ChartContainer config={config} className="h-56 w-full">
                        <BarChart data={data}>
                            <CartesianGrid vertical={false} />
                            <XAxis dataKey="day" tickLine={false} axisLine={false} />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <ChartLegend content={<ChartLegendContent />} />
                            <Bar dataKey="sessions" fill="var(--color-sessions)" radius={4} />
                            <Bar dataKey="edits" fill="var(--color-edits)" radius={4} />
                        </BarChart>
                    </ChartContainer>
                </div>
                <div className="space-y-2">
                    <p className="text-foreground-tertiary text-xs">Line</p>
                    <ChartContainer config={config} className="h-56 w-full">
                        <LineChart data={data}>
                            <CartesianGrid vertical={false} />
                            <XAxis dataKey="day" tickLine={false} axisLine={false} />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <Line
                                type="monotone"
                                dataKey="sessions"
                                stroke="var(--color-sessions)"
                                strokeWidth={2}
                                dot={false}
                            />
                            <Line
                                type="monotone"
                                dataKey="edits"
                                stroke="var(--color-edits)"
                                strokeWidth={2}
                                dot={false}
                            />
                        </LineChart>
                    </ChartContainer>
                </div>
            </div>
        </Section>
    );
}
