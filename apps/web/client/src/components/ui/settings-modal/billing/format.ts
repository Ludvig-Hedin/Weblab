// Formatting helpers for the billing UI. Pure functions — unit-tested in
// format.test.ts.

/**
 * Format a Stripe minor-unit amount (e.g. cents) into a localized currency
 * string. Stripe amounts are integers in the currency's smallest unit; the
 * number of fraction digits varies by currency (2 for USD, 0 for JPY/KRW), so
 * we derive it from Intl and scale minor → major units accordingly.
 */
export function formatCurrency(amountMinor: number, currency: string): string {
    const code = (currency || 'usd').toUpperCase();
    let formatter: Intl.NumberFormat;
    try {
        formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: code });
    } catch {
        // Unknown/invalid currency code — fall back to a plain number so we
        // never throw inside render.
        return (amountMinor / 100).toFixed(2);
    }
    const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    const major = amountMinor / Math.pow(10, fractionDigits);
    return formatter.format(major);
}

/** Format an epoch-ms timestamp as a short, human date (e.g. "Jun 10, 2026"). */
export function formatDate(epochMs: number): string {
    return new Date(epochMs).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

/** Capitalize a Stripe card brand id ("visa" → "Visa", "american_express" → "American Express"). */
export function formatCardBrand(brand: string): string {
    if (!brand) return 'Card';
    const normalized = brand.replace(/[_-]+/g, ' ').trim();
    if (!normalized) return 'Card';
    return normalized
        .split(' ')
        .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
        .join(' ');
}

/** Two-digit month + last-two-digit year, e.g. (6, 2026) → "06/26". */
export function formatCardExpiry(expMonth: number, expYear: number): string {
    const mm = String(expMonth).padStart(2, '0');
    const yy = String(expYear % 100).padStart(2, '0');
    return `${mm}/${yy}`;
}
