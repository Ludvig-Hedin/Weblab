import type { Metadata } from 'next';

import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

import { buildPageMetadata } from '@/lib/seo-metadata';
import { breadcrumbSchema } from '../../seo';

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Features', path: '/features' },
    { name: 'Prototype', path: '/features/prototype' },
]);

export async function generateMetadata(): Promise<Metadata> {
    return buildPageMetadata({
        pageKey: 'featuresPrototype',
        path: '/features/prototype',
        keywords: [
            'AI prototype generator',
            'rapid prototyping tool',
            'functional prototype',
            'interactive prototype',
            'React prototype generator',
            'AI prototyping',
            'functional mockup',
            'working prototype',
            'product validation',
            'user testing prototype',
            'stakeholder demo',
            'MVP prototype',
            'Figma prototype alternative',
            'beyond static mockups',
            'clickable prototype',
            'design to prototype',
            'prototype to production',
            'rapid product iteration',
        ],
    });
}

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
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbsJsonLd) }}
            />
            {children}
        </>
    );
}
