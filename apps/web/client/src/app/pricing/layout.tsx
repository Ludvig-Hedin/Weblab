import type { Metadata } from 'next';

import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

import { breadcrumbSchema } from '../seo';

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Pricing', path: '/pricing' },
]);

const description = `${APP_NAME} pricing — start free, scale with your team. Visual editor for React with AI constrained to your design system. Free tier available, transparent paid plans for growing teams.`;

export const metadata: Metadata = {
    title: `Pricing | ${APP_NAME} — Visual Editor for React`,
    description,
    keywords: [
        'Weblab pricing',
        'visual editor pricing',
        'AI design tool pricing',
        'cursor for designers price',
        'react visual editor cost',
    ],
    alternates: {
        canonical: `https://${APP_DOMAIN}/pricing`,
    },
    openGraph: {
        url: `https://${APP_DOMAIN}/pricing`,
        type: 'website',
        siteName: APP_NAME,
        title: `Pricing | ${APP_NAME}`,
        description,
        images: [
            {
                url: '/og-image.png',
                width: 1200,
                height: 630,
                alt: `${APP_NAME} pricing`,
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: `Pricing | ${APP_NAME}`,
        description,
        images: [
            {
                url: '/og-image.png',
                width: 1200,
                height: 630,
                alt: `${APP_NAME} pricing`,
            },
        ],
    },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbsJsonLd) }}
            />
            {children}
        </>
    );
}
