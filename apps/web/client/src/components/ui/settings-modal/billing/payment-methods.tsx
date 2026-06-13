'use client';

import { useState } from 'react';
import { api } from '@convex/_generated/api';
import { useAction } from 'convex/react';
import { useTranslations } from 'next-intl';

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

import { useConfirm } from '@/components/ui/confirm-dialog';
import type { BillingPaymentMethod } from './use-billing-details';
import { formatCardBrand, formatCardExpiry } from './format';

interface PaymentMethodsProps {
    paymentMethods: BillingPaymentMethod[];
    isLoading: boolean;
    refresh: () => void | Promise<void>;
}

export const PaymentMethods = ({ paymentMethods, isLoading, refresh }: PaymentMethodsProps) => {
    const t = useTranslations('settings.billing.payment');
    const setDefaultPaymentMethod = useAction(api.subscriptionActions.setDefaultPaymentMethod);
    const deletePaymentMethod = useAction(api.subscriptionActions.deletePaymentMethod);
    const addPaymentMethod = useAction(api.subscriptionActions.addPaymentMethod);

    const [busyId, setBusyId] = useState<string | null>(null);
    const [isAdding, setIsAdding] = useState(false);
    const { confirm, dialog: confirmDialog } = useConfirm();

    const handleSetDefault = async (id: string) => {
        setBusyId(id);
        try {
            await setDefaultPaymentMethod({ paymentMethodId: id });
            toast.success(t('toastDefaultSuccess'));
            await refresh();
        } catch (error) {
            console.error('Failed to set default payment method:', error);
            toast.error(t('toastDefaultFailed'));
        } finally {
            setBusyId(null);
        }
    };

    const handleDelete = async (id: string) => {
        const ok = await confirm({
            title: t('removeConfirmTitle'),
            description: t('removeConfirmDesc'),
            confirmLabel: t('remove'),
            destructive: true,
        });
        if (!ok) return;
        setBusyId(id);
        try {
            await deletePaymentMethod({ paymentMethodId: id });
            toast.success(t('toastRemoveSuccess'));
            await refresh();
        } catch (error) {
            console.error('Failed to delete payment method:', error);
            if (String(error).includes('CANNOT_DELETE_DEFAULT')) {
                toast.error(t('toastRemoveDefaultError'));
            } else {
                toast.error(t('toastRemoveFailed'));
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
            toast.error(t('toastAddFailed'));
        } finally {
            setIsAdding(false);
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <p className="text-regularPlus font-medium">{t('title')}</p>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleAddNew()}
                    disabled={isAdding}
                >
                    {isAdding ? t('opening') : t('addNew')}
                </Button>
            </div>

            {isLoading ? (
                <div className="space-y-2">
                    {[0, 1].map((i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                    ))}
                </div>
            ) : paymentMethods.length === 0 ? (
                <p className="text-small text-muted-foreground">{t('noPaymentMethods')}</p>
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
                                    {t('expires')} {formatCardExpiry(pm.expMonth, pm.expYear)}
                                </p>
                            </div>
                            {pm.isDefault && (
                                <Badge variant="secondary" className="text-muted-foreground">
                                    {t('defaultBadge')}
                                </Badge>
                            )}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        disabled={busyId === pm.id}
                                        aria-label={t('optionsLabel')}
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
                                            {t('setAsDefault')}
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem
                                        onClick={() => void handleDelete(pm.id)}
                                        className="group text-destructive hover:text-destructive cursor-pointer"
                                    >
                                        <Icons.Trash className="text-destructive group-hover:text-destructive mr-2 h-4 w-4" />
                                        {t('remove')}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    ))}
                </div>
            )}
            {confirmDialog}
        </div>
    );
};
