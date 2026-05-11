import type { Metadata } from 'next';

import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

import { breadcrumbSchema } from '../../seo';

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Compare', path: '/compare' },
    { name: 'vs Framer', path: '/compare/framer' },
]);

const description = `${APP_NAME} vs Framer: ${APP_NAME} connects to your existing React codebase and ships pull requests. Framer is a design-first site builder with AI layout generation and built-in hosting. Compare features, code ownership, and workflows.`;

export const metadata: Metadata = {
    title: `${APP_NAME} vs Framer — React Codebase Editor vs Design-First Site Builder | ${APP_NAME}`,
    description,
    keywords: [
        'weblab vs framer',
        'framer alternative for developers',
        'framer vs react visual editor',
        'framer vs weblab',
        'react editor design system',
        'framer code ownership',
    ],
    alternates: {
        canonical: `https://${APP_DOMAIN}/compare/framer`,
    },
    openGraph: {
        url: `https://${APP_DOMAIN}/compare/framer`,
        type: 'article',
        siteName: APP_NAME,
        title: `${APP_NAME} vs Framer`,
        description,
        images: [
            {
                url: '/og-image.png',
                width: 1200,
                height: 630,
                alt: `${APP_NAME} vs Framer`,
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: `${APP_NAME} vs Framer`,
        description,
        images: [
            {
                url: '/og-image.png',
                width: 1200,
                height: 630,
                alt: `${APP_NAME} vs Framer`,
            },
        ],
    },
};

export default function CompareFramerLayout({ children }: { children: React.ReactNode }) {
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
