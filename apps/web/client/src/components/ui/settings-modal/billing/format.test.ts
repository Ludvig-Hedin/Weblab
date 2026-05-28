import { describe, expect, it } from 'bun:test';

import { formatCardBrand, formatCardExpiry, formatCurrency, formatDate } from './format';

describe('formatCurrency', () => {
    it('scales 2-decimal currencies from minor units', () => {
        expect(formatCurrency(1000, 'usd')).toBe('$10.00');
        expect(formatCurrency(2599, 'usd')).toBe('$25.99');
    });

    it('handles zero-decimal currencies without scaling by 100', () => {
        // JPY has no minor unit: 1000 minor units == ¥1,000, not ¥10.
        const jpy = formatCurrency(1000, 'jpy');
        expect(jpy).toContain('1,000');
        expect(jpy).not.toContain('.');
    });

    it('uppercases lowercase currency codes', () => {
        expect(formatCurrency(500, 'eur')).toBe(formatCurrency(500, 'EUR'));
    });

    it('falls back to a plain 2-decimal number for invalid currency codes', () => {
        expect(formatCurrency(1234, 'not-a-currency')).toBe('12.34');
    });

    it('defaults a missing currency to usd', () => {
        expect(formatCurrency(1000, '')).toBe('$10.00');
    });
});

describe('formatDate', () => {
    it('formats an epoch-ms timestamp as a short US date', () => {
        // Construct in local time at noon so the rendered day never shifts by tz.
        const ms = new Date(2026, 5, 10, 12, 0, 0).getTime();
        expect(formatDate(ms)).toBe('Jun 10, 2026');
    });
});

describe('formatCardBrand', () => {
    it('capitalizes a single-word brand', () => {
        expect(formatCardBrand('visa')).toBe('Visa');
        expect(formatCardBrand('mastercard')).toBe('Mastercard');
    });

    it('splits and capitalizes underscore/hyphen separated brands', () => {
        expect(formatCardBrand('american_express')).toBe('American Express');
        expect(formatCardBrand('diners-club')).toBe('Diners Club');
    });

    it('falls back to "Card" for empty or whitespace input', () => {
        expect(formatCardBrand('')).toBe('Card');
        expect(formatCardBrand('___')).toBe('Card');
    });
});

describe('formatCardExpiry', () => {
    it('zero-pads the month and uses the last two year digits', () => {
        expect(formatCardExpiry(6, 2026)).toBe('06/26');
        expect(formatCardExpiry(12, 2030)).toBe('12/30');
        expect(formatCardExpiry(1, 2005)).toBe('01/05');
    });
});
