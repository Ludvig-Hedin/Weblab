import { describe, expect, it } from 'bun:test';

import { isStripeCheckoutUrl } from './helpers';

/**
 * F-479 — `GET /api/promo-resume`.
 * The 303 redirect target is mint output of `startPromoCheckout`, but it
 * still funnels through `NextResponse.redirect` which trusts whatever URL we
 * pass. `isStripeCheckoutUrl` is the only barrier between a future
 * unintentional open-redirect regression and shipping it to prod, so the
 * guard is worth its own focused test.
 */
describe('isStripeCheckoutUrl', () => {
    it('accepts canonical Stripe Checkout URLs', () => {
        expect(isStripeCheckoutUrl('https://checkout.stripe.com/c/cs_test_abc')).toBe(true);
        expect(isStripeCheckoutUrl('https://billing.stripe.com/p/session/test_123')).toBe(true);
    });

    it('case-folds the hostname', () => {
        expect(isStripeCheckoutUrl('https://Checkout.Stripe.COM/c/cs_test_abc')).toBe(true);
    });

    it('rejects http (no plaintext redirects to Stripe)', () => {
        expect(isStripeCheckoutUrl('http://checkout.stripe.com/c/cs_test_abc')).toBe(false);
    });

    it('rejects any other host, including look-alike domains', () => {
        for (const evil of [
            'https://stripe.com.evil.tld/c/cs_test_abc',
            'https://checkout.stripe.com.evil.tld/c/cs_test_abc',
            'https://attacker.example/c/cs_test_abc',
            'https://weblab.build/anything',
        ]) {
            expect(isStripeCheckoutUrl(evil)).toBe(false);
        }
    });

    it('rejects non-https protocols', () => {
        for (const evil of [
            'javascript:alert(1)',
            'data:text/html,<script>alert(1)</script>',
            'ftp://checkout.stripe.com/c/cs_test_abc',
            'file:///etc/passwd',
        ]) {
            expect(isStripeCheckoutUrl(evil)).toBe(false);
        }
    });

    it('rejects malformed URLs', () => {
        for (const garbage of ['', '   ', 'not-a-url', '://', 'https://']) {
            expect(isStripeCheckoutUrl(garbage)).toBe(false);
        }
    });
});
