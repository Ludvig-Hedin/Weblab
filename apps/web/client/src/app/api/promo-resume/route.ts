import { NextResponse, type NextRequest } from 'next/server';

import { getBannerById } from '@/lib/promo-banners';
import { api } from '@/trpc/server';
import { Routes } from '@/utils/constants';

/**
 * Post-login resume endpoint for the promo banner flow.
 *
 * The banner CTA on `WebsiteLayout` redirects logged-out users to
 *   `/login?returnUrl=/api/promo-resume?banner=<bannerId>`
 * After auth succeeds, `login/verify` forwards the user here. We look up the
 * banner, mint a Stripe Checkout session via the same tRPC mutation the
 * banner button uses, and 303-redirect to Stripe.
 *
 * On any failure (banner expired, user already subscribed, Stripe issue) we
 * fall back to `/pricing` so the user still lands somewhere actionable.
 */
export async function GET(req: NextRequest) {
    const origin = req.nextUrl.origin;
    const fallback = new URL(Routes.PRICING ?? '/pricing', origin);

    const bannerId = req.nextUrl.searchParams.get('banner');
    if (!bannerId) {
        return NextResponse.redirect(fallback);
    }

    const banner = getBannerById(bannerId);
    if (!banner || !banner.enabled || banner.action.type !== 'stripe-checkout') {
        return NextResponse.redirect(fallback);
    }

    const now = new Date();
    if (
        (banner.startsAt && new Date(banner.startsAt) > now) ||
        (banner.endsAt && new Date(banner.endsAt) < now)
    ) {
        return NextResponse.redirect(fallback);
    }

    try {
        const result = await api.subscription.startPromoCheckout({
            plan: banner.action.plan,
            promotionCode: banner.action.promotionCode,
        });
        if ('redirectUrl' in result && result.redirectUrl) {
            return NextResponse.redirect(result.redirectUrl, { status: 303 });
        }
    } catch (error) {
        console.error('[promo-resume] startPromoCheckout failed', error);
    }

    return NextResponse.redirect(fallback);
}
