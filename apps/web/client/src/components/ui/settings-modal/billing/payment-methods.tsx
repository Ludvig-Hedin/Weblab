'use client';

import { useState } from 'react';
import { api } from '@convex/_generated/api';
import { useAction } from 'convex/react';

import { Badge } from '@weblab/ui/badge';
import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { Skeleton } from '@weblab/ui/skeleton';
import { toast } from '@weblab/ui/sonner';

import type { BillingPaymentMethod } from './use-billing-details';
import { formatCardBrand, formatCardExpiry } from './format';

interface PaymentMethodsProps {
    paymentMethods: BillingPaymentMethod[];
    isLoading: boolean;
    refresh: () => void | Promise<void>;
}

export const PaymentMethods = ({ paymentMethods, isLoading, refresh }: PaymentMethodsProps) => {
    const setDefaultPaymentMethod = useAction(api.subscriptionActions.setDefaultPaymentMethod);
    const deletePaymentMethod = useAction(api.subscriptionActions.deletePaymentMethod);
    const addPaymentMethod = useAction(api.subscriptionActions.addPaymentMethod);

    const [busyId, setBusyId] = useState<string | null>(null);
    const [isAdding, setIsAdding] = useState(false);

    const handleSetDefault = async (id: string) => {
        setBusyId(id);
        try {
            await setDefaultPaymentMethod({ paymentMethodId: id });
            toast.success('Default payment method updated');
            await refresh();
        } catch (error) {
            console.error('Failed to set default payment method:', error);
            toast.error('Failed to update default payment method');
        } finally {
            setBusyId(null);
        }
    };

    const handleDelete = async (id: string) => {
        setBusyId(id);
        try {
            await deletePaymentMethod({ paymentMethodId: id });
            toast.success('Payment method removed');
            await refresh();
        } catch (error) {
            console.error('Failed to delete payment method:', error);
            if (String(error).includes('CANNOT_DELETE_DEFAULT')) {
                toast.error('Set another card as default before removing this one.');
            } else {
                toast.error('Failed to remove payment method');
            }
        } finally {
            setBusyId(null);
        }
    };

    const handleAddNew = async () => {
        setIsAdding(true);
        try {
            const session = await addPaymentMethod({});
            if (session?.url) {
                window.open(session.url, '_blank');
            }
        } catch (error) {
            console.error('Failed to open add-card flow:', error);
            toast.error('Failed to open the add-card flow');
        } finally {
            setIsAdding(false);
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <p className="text-regularPlus font-medium">Payment methods</p>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleAddNew()}
                    disabled={isAdding}
                >
                    {isAdding ? 'Opening...' : 'Add new'}
                </Button>
            </div>

            {isLoading ? (
                <div className="space-y-2">
                    {[0, 1].map((i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                    ))}
                </div>
            ) : paymentMethods.length === 0 ? (
                <p className="text-small text-muted-foreground">No payment methods saved.</p>
            ) : (
                <div className="divide-border-secondary divide-y">
                    {paymentMethods.map((pm) => (
                        <div key={pm.id} className="flex items-center gap-3 py-3">
                            <Icons.CreditCard className="text-muted-foreground h-5 w-5 shrink-0" />
                            <div className="min-w-0 flex-1">
                                <p className="text-small text-foreground flex items-center gap-2">
                                    <span>{formatCardBrand(pm.brand)}</span>
                                    <span className="text-muted-foreground">
                                        •••• {pm.last4}
                                    </span>
                                </p>
                                <p className="text-mini text-muted-foreground">
                                    Expires {formatCardExpiry(pm.expMonth, pm.expYear)}
                                </p>
                            </div>
                            {pm.isDefault && (
                                <Badge variant="secondary" className="text-muted-foreground">
                                    Default
                                </Badge>
                            )}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        disabled={busyId === pm.id}
                                        aria-label="Payment method options"
                                    >
                                        <Icons.DotsVertical className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44">
                                    {!pm.isDefault && (
                                        <DropdownMenuItem
                                            onClick={() => void handleSetDefault(pm.id)}
                                            className="cursor-pointer"
                                        >
                                            <Icons.Check className="mr-2 h-4 w-4" />
                                            Set as default
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem
                                        onClick={() => void handleDelete(pm.id)}
                                        className="group text-destructive hover:text-destructive cursor-pointer"
                                    >
                                        <Icons.Trash className="text-destructive group-hover:text-destructive mr-2 h-4 w-4" />
                                        Remove
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
