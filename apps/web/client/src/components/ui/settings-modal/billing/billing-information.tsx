'use client';

import { useState } from 'react';

import { Button } from '@weblab/ui/button';
import { Skeleton } from '@weblab/ui/skeleton';

import type { BillingCustomerInfo } from './use-billing-details';
import { BillingInfoEditDialog } from './billing-info-edit-dialog';

interface BillingInformationProps {
    customer: BillingCustomerInfo | null;
    isLoading: boolean;
    onSaved: () => void | Promise<void>;
}

function buildAddressLines(address: BillingCustomerInfo['address']): string[] {
    if (!address) return [];
    const lines: string[] = [];
    if (address.line1) lines.push(address.line1);
    if (address.line2) lines.push(address.line2);
    const cityLine = [address.city, address.state, address.postalCode]
        .filter(Boolean)
        .join(', ');
    if (cityLine) lines.push(cityLine);
    if (address.country) lines.push(address.country);
    return lines;
}

export const BillingInformation = ({ customer, isLoading, onSaved }: BillingInformationProps) => {
    const [isEditOpen, setIsEditOpen] = useState(false);
    const addressLines = buildAddressLines(customer?.address ?? null);
    const hasAny = Boolean(customer?.name || addressLines.length > 0);

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <p className="text-regularPlus font-medium">Billing information</p>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditOpen(true)}
                    disabled={isLoading}
                >
                    Edit
                </Button>
            </div>

            {isLoading ? (
                <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-48" />
                </div>
            ) : !hasAny ? (
                <p className="text-small text-muted-foreground">
                    No billing information on file. Add it so it appears on your invoices.
                </p>
            ) : (
                <div className="space-y-3 text-small">
                    {customer?.name && (
                        <div className="space-y-0.5">
                            <p className="text-muted-foreground text-mini">Name</p>
                            <p className="text-foreground">{customer.name}</p>
                        </div>
                    )}
                    {addressLines.length > 0 && (
                        <div className="space-y-0.5">
                            <p className="text-muted-foreground text-mini">Address</p>
                            <div className="text-foreground">
                                {addressLines.map((line, i) => (
                                    <p key={i}>{line}</p>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            <BillingInfoEditDialog
                open={isEditOpen}
                onOpenChange={setIsEditOpen}
                customer={customer}
                onSaved={onSaved}
            />
        </div>
    );
};
