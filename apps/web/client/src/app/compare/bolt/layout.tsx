import type { Metadata } from 'next';

import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

import { breadcrumbSchema } from '../../seo';

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Compare', path: '/compare' },
    { name: 'vs Bolt', path: '/compare/bolt' },
]);

const description = `${APP_NAME} vs Bolt: ${APP_NAME} is a visual editor that works with your real React components. Bolt is an in-browser AI agent that builds full-stack apps from chat. Compare workflows, output, and team fit.`;

export const metadata: Metadata = {
    title: `${APP_NAME} vs Bolt — Visual Canvas vs Chat-First AI Builder | ${APP_NAME}`,
    description,
    keywords: [
        'weblab vs bolt',
        'bolt alternative',
        'bolt.new alternative',
        'visual editor for react vs bolt',
        'ai builder comparison',
    ],
    alternates: {
        canonical: `https://${APP_DOMAIN}/compare/bolt`,
    },
    openGraph: {
        url: `https://${APP_DOMAIN}/compare/bolt`,
        type: 'article',
        siteName: APP_NAME,
        title: `${APP_NAME} vs Bolt`,
        description,
        images: [
            {
                url: '/og-image.png',
                width: 1200,
                height: 630,
                alt: `${APP_NAME} vs Bolt`,
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: `${APP_NAME} vs Bolt`,
        description,
        images: [
            {
                url: '/og-image.png',
                width: 1200,
                height: 630,
                alt: `${APP_NAME} vs Bolt`,
            },
        ],
    },
};

export default function CompareBoltLayout({ children }: { children: React.ReactNode }) {
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
