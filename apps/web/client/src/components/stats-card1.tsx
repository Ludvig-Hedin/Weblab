import { TrendingDown, TrendingUp } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StatsCard1Props {
    title?: string;
    value?: string;
    change?: number;
    changeLabel?: string;
    className?: string;
}

const StatsCard1 = ({
    title = 'Total Revenue',
    value = '$45,231.89',
    change = 20.1,
    changeLabel = 'from last month',
    className,
}: StatsCard1Props) => {
    const isPositive = change >= 0;

    return (
        <Card className={cn('w-full max-w-xs', className)}>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    {title}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="text-3xl font-bold">{value}</div>
                <div className="mt-1 flex items-center gap-1 text-sm">
                    {isPositive ? (
                        <TrendingUp className="size-4 text-green-500" />
                    ) : (
                        <TrendingDown className="text-destructive size-4" />
                    )}
                    <span className={isPositive ? 'text-green-500' : 'text-destructive'}>
                        {isPositive ? '+' : ''}
                        {change}%
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">{changeLabel}</span>
                </div>
            </CardContent>
        </Card>
    );
};

export { StatsCard1 };
