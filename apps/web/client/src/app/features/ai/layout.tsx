import type { Metadata } from 'next';

import { buildPageMetadata } from '@/lib/seo-metadata';
import { breadcrumbSchema } from '../../seo';

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Features', path: '/features' },
    { name: 'AI Visual Editor', path: '/features/ai' },
]);

export async function generateMetadata(): Promise<Metadata> {
    return buildPageMetadata({
        pageKey: 'featuresAi',
        path: '/features/ai',
        keywords: [
            'AI visual editor',
            'AI UI builder',
            'AI design tool',
            'AI frontend development',
            'AI design system',
            'AI component builder',
            'constrained AI code',
            'brand safe AI',
            'React AI builder',
            'Next.js AI editor',
            'AI Tailwind editor',
            'AI to PR workflow',
            'visual AI coding',
            'design to code AI',
            'v0 alternative',
            'AI website builder',
            'AI prototype generator',
        ],
    });
}

// JSON-LD structured data
const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Weblab AI Visual Editor',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web',
    description:
        'Weblab is an AI-powered visual editor that builds frontend UIs using your real React, Vue, or Angular components. AI is constrained to your design system. Changes become mergeable pull requests.',
    url: 'https://weblab.build/features/ai',
    featureList: [
        'AI constrained to your design system',
        'Visual canvas with real code underneath',
        'Works with React, Vue, Angular, Next.js, Svelte',
        'Supports Tailwind, CSS Modules, styled-components',
        'Compatible with shadcn/ui, Material UI, Chakra UI',
        'Direct GitHub PR output',
        'Real-time team collaboration',
        'No coding required for designers',
    ],
    offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        description: 'Free tier available',
    },
};

export default function AiFeaturesLayout({ children }: { children: React.ReactNode }) {
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
