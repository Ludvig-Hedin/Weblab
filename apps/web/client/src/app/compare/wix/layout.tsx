import type { Metadata } from 'next';

import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

import { breadcrumbSchema } from '../../seo';

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Compare', path: '/compare' },
    { name: 'vs Wix', path: '/compare/wix' },
]);

const description = `${APP_NAME} vs Wix: ${APP_NAME} edits your React codebase visually and ships code you own. Wix is a drag-and-drop website builder for small businesses with no code ownership. Compare who each tool is really built for.`;

export const metadata: Metadata = {
    title: `${APP_NAME} vs Wix — React Codebase Editor vs Small Business Website Builder | ${APP_NAME}`,
    description,
    keywords: [
        'weblab vs wix',
        'wix alternative for developers',
        'wix vs react editor',
        'developer website builder vs wix',
        'wix harmony comparison',
        'react visual editor wix alternative',
    ],
    alternates: {
        canonical: `https://${APP_DOMAIN}/compare/wix`,
    },
    openGraph: {
        url: `https://${APP_DOMAIN}/compare/wix`,
        type: 'article',
        siteName: APP_NAME,
        title: `${APP_NAME} vs Wix`,
        description,
        images: [
            {
                url: '/og-image.png',
                width: 1200,
                height: 630,
                alt: `${APP_NAME} vs Wix`,
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: `${APP_NAME} vs Wix`,
        description,
        images: [
            {
                url: '/og-image.png',
                width: 1200,
                height: 630,
                alt: `${APP_NAME} vs Wix`,
            },
        ],
    },
};

export default function CompareWixLayout({ children }: { children: React.ReactNode }) {
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
