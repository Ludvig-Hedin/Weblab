'use client';

import type { PromoBanner as PromoBannerConfig } from '@/lib/promo-banners';
import { PromoBanner } from '@/app/_components/promo-banner';
import { Section } from '../section';

const PREVIEW_BANNER: PromoBannerConfig = {
    id: 'design-system-preview',
    enabled: true,
    messageKey: 'pro60FirstMonth.message',
    ctaKey: 'pro60FirstMonth.cta',
    action: {
        type: 'stripe-checkout',
        plan: 'pro-monthly',
        promotionCode: 'PROMO60',
    },
    dismissible: true,
};

export function PromoBannerDemo() {
    return (
        <Section
            title="Promo banner"
            tag="promo-banner"
            id="promo-banner"
            filePath="apps/web/client/src/app/_components/promo-banner/index.tsx"
        >
            <div className="space-y-3">
                <p className="text-foreground-tertiary text-xs">
                    Sticky announcement bar rendered above the TopBar on marketing pages. Config
                    lives in{' '}
                    <code className="text-foreground-secondary">src/lib/promo-banners.ts</code>.
                    Visibility is driven by <code>enabled</code> + the <code>startsAt</code>/
                    <code>endsAt</code> window. Dismissals persist in localStorage per banner ID.
                </p>
                {/* Wrap in a relative container so the banner's `sticky top-0`
                    sits at the top of this preview box instead of the viewport. */}
                <div className="border-border relative overflow-hidden rounded-md border">
                    <PromoBanner bannerOverride={PREVIEW_BANNER} forceShow />
                    <div className="text-foreground-tertiary p-6 text-xs">
                        Banner preview — clicking the CTA in production hits the
                        <code className="text-foreground-secondary"> startPromoCheckout </code>
                        mutation and redirects to Stripe with the promo code pre-applied.
                    </div>
                </div>
            </div>
        </Section>
    );
}
