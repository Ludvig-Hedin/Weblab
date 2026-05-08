import type { Metadata } from 'next';

import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

export const metadata: Metadata = {
    title: 'AI Prototype Generator | Create Functional React Prototypes | ${APP_NAME}',
    description: `${APP_NAME} generates functional React prototypes with real interactions — not static mockups. From idea to interactive prototype in minutes. Perfect for rapid prototyping and product validation.`,
    keywords: [
        // Primary keywords
        'AI prototype generator',
        'rapid prototyping tool',
        'functional prototype',
        'interactive prototype',
        // Specific features
        'React prototype generator',
        'AI prototyping',
        'functional mockup',
        'working prototype',
        // Use cases
        'product validation',
        'user testing prototype',
        'stakeholder demo',
        'MVP prototype',
        // Comparisons
        'Figma prototype alternative',
        'beyond static mockups',
        'clickable prototype',
        // Workflow
        'design to prototype',
        'prototype to production',
        'rapid product iteration',
    ],
    openGraph: {
        title: 'AI Prototype Generator | ${APP_NAME}',
        description:
            'Create functional React prototypes with real interactions in minutes. Not static mockups — working applications.',
        type: 'website',
        url: `https://${APP_DOMAIN}/features/prototype`,
        siteName: APP_NAME,
        images: [
            {
                url: '/og-image.png',
                width: 1200,
                height: 630,
                alt: `${APP_NAME} prototype generator preview`,
            },
        ],
    },
    /* twitter: {
        card: 'summary_large_image',
        title: 'AI Prototype Generator | ${APP_NAME}',
        description:
            'Create functional React prototypes with real interactions in minutes. Not static mockups — working applications.',
        images: ['/favicon.ico'],
    }, */
    alternates: {
        canonical: `https://${APP_DOMAIN}/features/prototype`,
    },
    robots: {
        index: true,
        follow: true,
        googleBot: {
            index: true,
            follow: true,
            'max-video-preview': -1,
            'max-image-preview': 'large',
            'max-snippet': -1,
        },
    },
};

// JSON-LD structured data
const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: `${APP_NAME} AI Prototype Generator`,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web',
    description: `${APP_NAME} generates functional React prototypes with real interactions. Perfect for rapid prototyping, product validation, and user testing.`,
    url: `https://${APP_DOMAIN}/features/prototype`,
    featureList: [
        'AI-powered prototype generation',
        'Functional React prototypes with real interactions',
        'Working forms, navigation, data visualization',
        'Production-ready code output',
        'Version history and rollback',
        'Team sharing and collaboration',
    ],
    offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        description: 'Free tier available',
    },
};

export default function PrototypeFeaturesLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            {children}
        </>
    );
}
