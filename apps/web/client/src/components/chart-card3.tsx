'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import type { ChartConfig } from '@/components/ui/chart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { cn } from '@/lib/utils';

interface ChartCard3Props {
    title?: string;
    description?: string;
    className?: string;
}

const chartData = [
    { month: 'Jan', value: 186 },
    { month: 'Feb', value: 305 },
    { month: 'Mar', value: 237 },
    { month: 'Apr', value: 273 },
    { month: 'May', value: 209 },
    { month: 'Jun', value: 214 },
];

const chartConfig = {
    value: {
        label: 'Sales',
        color: 'var(--chart-1)',
    },
} satisfies ChartConfig;

const ChartCard3 = ({
    title = 'Monthly Sales',
    description = 'Sales performance by month',
    className,
}: ChartCard3Props) => {
    return (
        <Card className={cn('w-full max-w-2xl', className)}>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
                <ChartContainer config={chartConfig} className="h-64 w-full">
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3" vertical={false} />
                        <XAxis
                            dataKey="month"
                            axisLine={false}
                            tickLine={false}
                            tickMargin={8}
                            fontSize={12}
                        />
                        <YAxis axisLine={false} tickLine={false} tickMargin={8} fontSize={12} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ChartContainer>
            </CardContent>
        </Card>
    );
};

export { ChartCard3 };
