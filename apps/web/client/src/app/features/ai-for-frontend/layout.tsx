import type { Metadata } from 'next';

import { buildPageMetadata } from '@/lib/seo-metadata';
import { breadcrumbSchema } from '../../seo';

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Features', path: '/features' },
    { name: 'AI for Frontend', path: '/features/ai-for-frontend' },
]);

export async function generateMetadata(): Promise<Metadata> {
    return buildPageMetadata({
        pageKey: 'featuresAiFrontend',
        path: '/features/ai-for-frontend',
        keywords: [
            'AI for frontend',
            'AI frontend development',
            'AI frontend tools',
            'frontend AI assistant',
            'AI code generator',
            'visual AI editor',
            'AI UI builder',
            'AI component builder',
            'React AI tools',
            'Vue AI tools',
            'Angular AI tools',
            'Next.js AI tools',
            'design system AI',
            'AI design system constraints',
            'component library AI',
            'Tailwind AI',
            'shadcn AI',
            'Material UI AI',
            'AI to PR workflow',
            'AI code review',
            'visual to code AI',
            'design to code AI',
            'AI brand drift solution',
            'constrained AI code generation',
            'production-ready AI code',
        ],
    });
}

// JSON-LD structured data for AI discovery
const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Weblab',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web',
    description:
        'Weblab is an AI-powered visual editor for frontend development. It connects to your existing React, Vue, or Angular codebase and constrains AI to your real components and design system. Changes become pull requests engineers can merge directly.',
    url: 'https://weblab.build/features/ai-for-frontend',
    offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        description: 'Free tier available',
    },
    featureList: [
        'AI constrained to your design system',
        'Works with React, Vue, Angular, Next.js, Svelte',
        'Supports Tailwind, CSS Modules, styled-components',
        'Compatible with shadcn/ui, Material UI, Chakra UI, Mantine, Radix UI',
        'Changes become mergeable pull requests',
        'Visual canvas interface for designers',
        'No coding required for designers',
        'Real-time collaboration',
        'Open source',
    ],
};

export default function AiForFrontendLayout({ children }: { children: React.ReactNode }) {
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
