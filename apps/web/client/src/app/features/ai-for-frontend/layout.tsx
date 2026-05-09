import type { Metadata } from 'next';

import { breadcrumbSchema } from '../../seo';

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Features', path: '/features' },
    { name: 'AI for Frontend', path: '/features/ai-for-frontend' },
]);

export const metadata: Metadata = {
    title: 'AI for Frontend Development | Visual AI Editor for React | Weblab',
    description:
        'Weblab is an AI visual editor for React, Vue, and Angular teams. AI is constrained to your real components and design system, so changes ship as mergeable PRs.',
    keywords: [
        // Primary keywords
        'AI for frontend',
        'AI frontend development',
        'AI frontend tools',
        'frontend AI assistant',
        // Tool comparisons
        'AI code generator',
        'visual AI editor',
        'AI UI builder',
        'AI component builder',
        // Framework specific
        'React AI tools',
        'Vue AI tools',
        'Angular AI tools',
        'Next.js AI tools',
        // Design system
        'design system AI',
        'AI design system constraints',
        'component library AI',
        // Styling
        'Tailwind AI',
        'shadcn AI',
        'Material UI AI',
        // Workflow
        'AI to PR workflow',
        'AI code review',
        'visual to code AI',
        'design to code AI',
        // Problem/solution
        'AI brand drift solution',
        'constrained AI code generation',
        'production-ready AI code',
    ],
    openGraph: {
        title: 'AI for Frontend Development | Weblab',
        description:
            'Build frontend UIs with AI constrained to your design system. Your real React, Vue, or Angular components. Mergeable PRs, not throwaway code.',
        type: 'website',
        url: 'https://weblab.build/features/ai-for-frontend',
        siteName: 'Weblab',
        images: [
            {
                url: '/og-image.png',
                width: 1200,
                height: 630,
                alt: 'Weblab AI for frontend development preview',
            },
        ],
    },
    /* twitter: {
        card: 'summary_large_image',
        title: 'AI for Frontend Development | Weblab',
        description: 'Build frontend UIs with AI constrained to your design system. Your real components. Mergeable PRs.',
        images: ['/favicon.ico'],
    }, */
    alternates: {
        canonical: 'https://weblab.build/features/ai-for-frontend',
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
