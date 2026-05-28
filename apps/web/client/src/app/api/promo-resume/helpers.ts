/**
 * Allowlist of hosts the promo-resume route is willing to 303 the user to.
 *
 * `subscriptionActions.startPromoCheckout` today returns a Stripe Checkout
 * URL, but the redirect target is server-trusted output that flows straight
 * into a `NextResponse.redirect`. If any future change ever surfaces a
 * user-influenced URL through that action, an unguarded redirect would
 * become an open redirect off the Weblab domain.
 *
 * Keep this guard tight: only the two Stripe-owned hostnames we actually
 * mint Checkout sessions on, https only, no port flexibility (Stripe always
 * uses 443).
 */
const STRIPE_CHECKOUT_HOSTS = new Set(['checkout.stripe.com', 'billing.stripe.com']);

export function isStripeCheckoutUrl(raw: string): boolean {
    try {
        const url = new URL(raw);
        if (url.protocol !== 'https:') return false;
        return STRIPE_CHECKOUT_HOSTS.has(url.hostname.toLowerCase());
    } catch {
        return false;
    }
}
