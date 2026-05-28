'use client';

import { useEffect, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useAction } from 'convex/react';

import { Button } from '@weblab/ui/button';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@weblab/ui/dialog';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@weblab/ui/select';
import { toast } from '@weblab/ui/sonner';

import type { BillingCustomerInfo } from './use-billing-details';

// Curated common-country list (ISO 3166-1 alpha-2). The current value is
// injected if missing so an existing address never loses its country.
const COUNTRIES: Array<{ code: string; name: string }> = [
    { code: 'US', name: 'United States' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'CA', name: 'Canada' },
    { code: 'AU', name: 'Australia' },
    { code: 'SE', name: 'Sweden' },
    { code: 'NO', name: 'Norway' },
    { code: 'DK', name: 'Denmark' },
    { code: 'FI', name: 'Finland' },
    { code: 'DE', name: 'Germany' },
    { code: 'FR', name: 'France' },
    { code: 'ES', name: 'Spain' },
    { code: 'IT', name: 'Italy' },
    { code: 'NL', name: 'Netherlands' },
    { code: 'BE', name: 'Belgium' },
    { code: 'IE', name: 'Ireland' },
    { code: 'CH', name: 'Switzerland' },
    { code: 'AT', name: 'Austria' },
    { code: 'PT', name: 'Portugal' },
    { code: 'PL', name: 'Poland' },
    { code: 'JP', name: 'Japan' },
    { code: 'SG', name: 'Singapore' },
    { code: 'IN', name: 'India' },
    { code: 'BR', name: 'Brazil' },
    { code: 'MX', name: 'Mexico' },
    { code: 'NZ', name: 'New Zealand' },
];

interface BillingInfoEditDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    customer: BillingCustomerInfo | null;
    onSaved: () => void | Promise<void>;
}

export const BillingInfoEditDialog = ({
    open,
    onOpenChange,
    customer,
    onSaved,
}: BillingInfoEditDialogProps) => {
    const updateBillingInfo = useAction(api.subscriptionActions.updateBillingInfo);

    const [name, setName] = useState('');
    const [line1, setLine1] = useState('');
    const [line2, setLine2] = useState('');
    const [city, setCity] = useState('');
    const [state, setState] = useState('');
    const [postalCode, setPostalCode] = useState('');
    const [country, setCountry] = useState('US');
    const [isSaving, setIsSaving] = useState(false);

    // Seed the form from the current customer each time the dialog opens.
    useEffect(() => {
        if (!open) return;
        setName(customer?.name ?? '');
        setLine1(customer?.address?.line1 ?? '');
        setLine2(customer?.address?.line2 ?? '');
        setCity(customer?.address?.city ?? '');
        setState(customer?.address?.state ?? '');
        setPostalCode(customer?.address?.postalCode ?? '');
        setCountry(customer?.address?.country ?? 'US');
    }, [open, customer]);

    const countries = (() => {
        if (country && !COUNTRIES.some((c) => c.code === country)) {
            return [{ code: country, name: country }, ...COUNTRIES];
        }
        return COUNTRIES;
    })();

    const canSave = line1.trim() && city.trim() && postalCode.trim() && country.trim();

    const handleSave = async () => {
        if (!canSave || isSaving) return;
        setIsSaving(true);
        try {
            await updateBillingInfo({
                name: name.trim() || undefined,
                address: {
                    line1: line1.trim(),
                    line2: line2.trim() || undefined,
                    city: city.trim(),
                    state: state.trim() || undefined,
                    postalCode: postalCode.trim(),
                    country,
                },
            });
            toast.success('Billing information updated');
            await onSaved();
            onOpenChange(false);
        } catch (error) {
            console.error('Failed to update billing information:', error);
            toast.error('Failed to update billing information');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Edit billing information</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="billing-name">Name</Label>
                        <Input
                            id="billing-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Full name"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="billing-line1">Address line 1</Label>
                        <Input
                            id="billing-line1"
                            value={line1}
                            onChange={(e) => setLine1(e.target.value)}
                            placeholder="Street address"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="billing-line2">Address line 2</Label>
                        <Input
                            id="billing-line2"
                            value={line2}
                            onChange={(e) => setLine2(e.target.value)}
                            placeholder="Apartment, suite, etc. (optional)"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="billing-city">City</Label>
                            <Input
                                id="billing-city"
                                value={city}
                                onChange={(e) => setCity(e.target.value)}
                                placeholder="City"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="billing-state">State / Province</Label>
                            <Input
                                id="billing-state"
                                value={state}
                                onChange={(e) => setState(e.target.value)}
                                placeholder="Optional"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="billing-postal">Postal code</Label>
                            <Input
                                id="billing-postal"
                                value={postalCode}
                                onChange={(e) => setPostalCode(e.target.value)}
                                placeholder="ZIP / Postal"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="billing-country">Country</Label>
                            <Select value={country} onValueChange={setCountry}>
                                <SelectTrigger id="billing-country">
                                    <SelectValue placeholder="Select country" />
                                </SelectTrigger>
                                <SelectContent>
                                    {countries.map((c) => (
                                        <SelectItem key={c.code} value={c.code}>
                                            {c.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={() => void handleSave()} disabled={!canSave || isSaving}>
                        {isSaving ? 'Saving...' : 'Save'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
