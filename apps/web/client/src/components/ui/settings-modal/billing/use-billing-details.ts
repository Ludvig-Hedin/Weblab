'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useAction } from 'convex/react';

import { useHasAuthCookie } from '@/hooks/use-has-auth-cookie';

// Client mirror of the shapes returned by `subscriptionActions.getBillingDetails`.
// The action is a Convex `'use node'` module so its internal interfaces can't be
// imported client-side; these are structurally identical.
export interface BillingPaymentMethod {
    id: string;
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    isDefault: boolean;
}

export interface BillingInvoice {
    id: string;
    number: string | null;
    created: number;
    amountPaid: number;
    currency: string;
    status: string | null;
    hostedInvoiceUrl: string | null;
    invoicePdf: string | null;
}

export interface BillingCustomerInfo {
    name: string | null;
    email: string | null;
    address: {
        line1: string | null;
        line2: string | null;
        city: string | null;
        state: string | null;
        postalCode: string | null;
        country: string | null;
    } | null;
}

export interface BillingDetails {
    customer: BillingCustomerInfo | null;
    paymentMethods: BillingPaymentMethod[];
    invoices: BillingInvoice[];
}

/**
 * Imperatively fetch the caller's Stripe-backed billing details (cards,
 * invoices, address). Unlike `subscriptions.get`/`usage.get` (reactive Convex
 * queries), this calls a Node action, so it's fetched on mount and re-fetched
 * via `refresh()` after any write. Returns `data: null` when the caller has no
 * Stripe customer yet (free user) — distinct from `isLoading`.
 */
export const useBillingDetails = ({ enabled = true }: { enabled?: boolean } = {}) => {
    const hasAuthCookie = useHasAuthCookie();
    const getBillingDetails = useAction(api.subscriptionActions.getBillingDetails);
    const [data, setData] = useState<BillingDetails | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // The action is async + imperative; guard against setState after unmount.
    const mountedRef = useRef(true);

    const refresh = useCallback(async () => {
        if (!enabled || hasAuthCookie !== true) {
            if (mountedRef.current) setIsLoading(false);
            return;
        }
        if (mountedRef.current) {
            setIsLoading(true);
            setError(null);
        }
        try {
            const result = await getBillingDetails({});
            if (mountedRef.current) setData(result ?? null);
        } catch (err) {
            console.error('Failed to load billing details:', err);
            if (mountedRef.current) setError('Failed to load billing details');
        } finally {
            if (mountedRef.current) setIsLoading(false);
        }
    }, [enabled, hasAuthCookie, getBillingDetails]);

    useEffect(() => {
        mountedRef.current = true;
        void refresh();
        return () => {
            mountedRef.current = false;
        };
    }, [refresh]);

    return { data, isLoading, error, refresh };
};
