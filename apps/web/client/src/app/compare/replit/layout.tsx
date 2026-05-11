import type { Metadata } from 'next';

import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

import { breadcrumbSchema } from '../../seo';

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Compare', path: '/compare' },
    { name: 'vs Replit', path: '/compare/replit' },
]);

const description = `${APP_NAME} vs Replit: ${APP_NAME} is a visual canvas editor for your existing React codebase. Replit is a browser-based IDE with an AI agent that builds and deploys full-stack apps from prompts. Compare features, design system support, and code ownership.`;

export const metadata: Metadata = {
    title: `${APP_NAME} vs Replit — Visual React Editor vs Browser IDE + AI Agent | ${APP_NAME}`,
    description,
    keywords: [
        'weblab vs replit',
        'replit alternative',
        'replit vs visual editor react',
        'replit vs weblab',
        'react visual editor vs cloud ide',
        'replit design system',
    ],
    alternates: {
        canonical: `https://${APP_DOMAIN}/compare/replit`,
    },
    openGraph: {
        url: `https://${APP_DOMAIN}/compare/replit`,
        type: 'article',
        siteName: APP_NAME,
        title: `${APP_NAME} vs Replit`,
        description,
        images: [
            {
                url: '/og-image.png',
                width: 1200,
                height: 630,
                alt: `${APP_NAME} vs Replit`,
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: `${APP_NAME} vs Replit`,
        description,
        images: [
            {
                url: '/og-image.png',
                width: 1200,
                height: 630,
                alt: `${APP_NAME} vs Replit`,
            },
        ],
    },
};

export default function CompareReplitLayout({ children }: { children: React.ReactNode }) {
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
