'use client';

import { Badge } from '@weblab/ui/badge';
import { Skeleton } from '@weblab/ui/skeleton';

import type { BillingInvoice } from './use-billing-details';
import { formatCurrency, formatDate } from './format';

interface BillingHistoryProps {
    invoices: BillingInvoice[];
    isLoading: boolean;
}

function StatusBadge({ status }: { status: string | null }) {
    const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';
    if (status === 'paid') {
        return (
            <Badge
                variant="outline"
                className="border-transparent bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            >
                Paid
            </Badge>
        );
    }
    return (
        <Badge variant="secondary" className="text-muted-foreground">
            {label}
        </Badge>
    );
}

export const BillingHistory = ({ invoices, isLoading }: BillingHistoryProps) => {
    return (
        <div className="space-y-3">
            <p className="text-regularPlus font-medium">Billing history</p>

            {isLoading ? (
                <div className="space-y-2">
                    {[0, 1, 2].map((i) => (
                        <Skeleton key={i} className="h-9 w-full" />
                    ))}
                </div>
            ) : invoices.length === 0 ? (
                <p className="text-small text-muted-foreground">No invoices yet.</p>
            ) : (
                <div className="divide-border-secondary divide-y">
                    {invoices.map((invoice) => (
                        <div
                            key={invoice.id}
                            className="flex items-center gap-3 py-2.5 text-small"
                        >
                            <span className="text-foreground min-w-[96px]">
                                {formatDate(invoice.created)}
                            </span>
                            <span className="text-muted-foreground min-w-[72px]">
                                {formatCurrency(invoice.amountPaid, invoice.currency)}
                            </span>
                            <StatusBadge status={invoice.status} />
                            <span className="flex-1" />
                            {invoice.hostedInvoiceUrl ? (
                                <a
                                    href={invoice.hostedInvoiceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-foreground hover:text-foreground/80 underline underline-offset-2"
                                >
                                    View
                                </a>
                            ) : (
                                <span className="text-muted-foreground/50">View</span>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
