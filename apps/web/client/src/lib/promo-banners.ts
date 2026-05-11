/**
 * Promo banner config — single source of truth for the marketing announcement
 * bar rendered by `<PromoBanner />` inside `WebsiteLayout`.
 *
 * Render policy: the FIRST entry whose `enabled` is true and whose
 * `[startsAt, endsAt]` window contains "now" wins. Banners do NOT stack — keep
 * one active at a time. To roll out a new promo, flip the old one's `enabled`
 * to false (or let it expire) and add a new entry above it.
 *
 * Adding a new banner:
 *  1. Append a `PromoBanner` object below with a stable `id` (used for the
 *     localStorage dismissal key).
 *  2. Add the i18n message + CTA keys under `promoBanner.*` in every locale
 *     file in `apps/web/client/messages/*.json`.
 *  3. If `action.type === 'stripe-checkout'`, make sure a matching promotion
 *     code exists in Stripe — see the server validation in
 *     `subscription.startPromoCheckout`.
 */

export type PromoBannerAction =
    | {
          type: 'stripe-checkout';
          /** Logical plan identifier. Server maps this to a real PriceKey. */
          plan: 'pro-monthly';
          /** Stripe promotion code (the human-readable code, e.g. `PROMO60`). */
          promotionCode: string;
      }
    | {
          type: 'link';
          /** Absolute or in-app relative path. */
          href: string;
      };

export interface PromoBanner {
    /** Stable identifier. Used as the localStorage dismissal key. */
    id: string;
    /** Hard kill switch. */
    enabled: boolean;
    /** Optional start of the visibility window (ISO 8601). */
    startsAt?: string;
    /** Optional end of the visibility window (ISO 8601). */
    endsAt?: string;
    /** i18n key under the `promoBanner` namespace for the message text. */
    messageKey: string;
    /** i18n key under the `promoBanner` namespace for the CTA label. */
    ctaKey: string;
    /** What clicking the CTA does. */
    action: PromoBannerAction;
    /** When true, render a close button that persists dismissal in localStorage. */
    dismissible: boolean;
    /** Optional locale whitelist. Undefined = show in every locale. */
    locales?: string[];
}

export const PROMO_BANNERS: PromoBanner[] = [
    {
        id: 'pro-60-off-first-month-2026-05',
        enabled: true,
        endsAt: '2026-06-30T23:59:59Z',
        messageKey: 'pro60FirstMonth.message',
        ctaKey: 'pro60FirstMonth.cta',
        action: {
            type: 'stripe-checkout',
            plan: 'pro-monthly',
            promotionCode: 'PROMO60',
        },
        dismissible: true,
    },
];

export function getActiveBanner(now: Date = new Date()): PromoBanner | null {
    return (
        PROMO_BANNERS.find(
            (b) =>
                b.enabled &&
                (!b.startsAt || new Date(b.startsAt) <= now) &&
                (!b.endsAt || new Date(b.endsAt) >= now),
        ) ?? null
    );
}

export function getBannerById(id: string): PromoBanner | null {
    return PROMO_BANNERS.find((b) => b.id === id) ?? null;
}

export const PROMO_BANNER_DISMISSED_STORAGE_PREFIX = 'promo-banner-dismissed-';
