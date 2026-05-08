import type { Metadata } from 'next';

import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

import { breadcrumbSchema } from '../../seo';

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Compare', path: '/compare' },
    { name: 'vs Emergent', path: '/compare/emergent' },
]);

const description = `${APP_NAME} vs Emergent: ${APP_NAME} visually edits your existing React codebase and ships pull requests. Emergent generates full-stack apps from natural language using a multi-agent system. Compare code ownership, design system support, and team workflows.`;

export const metadata: Metadata = {
    title: `${APP_NAME} vs Emergent — React Codebase Editor vs Multi-Agent App Builder`,
    description,
    keywords: [
        'weblab vs emergent',
        'emergent ai alternative',
        'emergent vs visual editor react',
        'react codebase vs ai app builder',
        'emergent sh comparison',
        'vibe coding vs visual editor',
    ],
    alternates: {
        canonical: `https://${APP_DOMAIN}/compare/emergent`,
    },
    openGraph: {
        url: `https://${APP_DOMAIN}/compare/emergent`,
        type: 'article',
        siteName: APP_NAME,
        title: `${APP_NAME} vs Emergent`,
        description,
        images: [
            {
                url: '/og-image.png',
                width: 1200,
                height: 630,
                alt: `${APP_NAME} vs Emergent`,
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: `${APP_NAME} vs Emergent`,
        description,
        images: [
            {
                url: '/og-image.png',
                width: 1200,
                height: 630,
                alt: `${APP_NAME} vs Emergent`,
            },
        ],
    },
};

export default function CompareEmergentLayout({ children }: { children: React.ReactNode }) {
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
