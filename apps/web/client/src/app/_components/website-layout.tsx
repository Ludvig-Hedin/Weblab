'use client';

import { useLocale } from 'next-intl';

import { Footer } from './landing-page/page-footer';
import { PromoBanner } from './promo-banner';
import { TopBar } from './top-bar';

interface WebsiteLayoutProps {
    children: React.ReactNode;
    showFooter?: boolean;
}

export function WebsiteLayout({ children, showFooter = true }: WebsiteLayoutProps) {
    const locale = useLocale();
    return (
        <div className="bg-background min-h-screen">
            {/* Promo banner — sticky above the TopBar. The banner itself
                writes `--promo-banner-height` on <html> when visible so the
                fixed TopBar below can offset down. */}
            <PromoBanner locale={locale} />

            {/* Fixed TopBar that persists across page transitions. Sits
                directly below the promo banner via the CSS variable; falls
                back to `top: 0` when the banner is absent or dismissed. */}
            <div
                className="bg-background top-bar fixed left-0 z-50 h-12 w-full"
                style={{ top: 'var(--promo-banner-height, 0px)' }}
            >
                <TopBar />
            </div>

            {/* Page content */}
            <div>{children}</div>

            {/* Footer */}
            {showFooter && <Footer />}
        </div>
    );
}
