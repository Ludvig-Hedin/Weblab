import type { Metadata } from 'next';

import { breadcrumbSchema } from '../../seo';

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Features', path: '/features' },
    { name: 'AI Visual Editor', path: '/features/ai' },
]);

export const metadata: Metadata = {
    title: 'AI Visual Editor | Build UIs with AI Using Your Design System | Weblab',
    description:
        'Weblab is an AI-powered visual editor that builds frontend UIs using your real React components. AI is constrained to your design system — no brand drift, no throwaway code. Changes become mergeable PRs.',
    keywords: [
        // Primary keywords
        'AI visual editor',
        'AI UI builder',
        'AI design tool',
        'AI frontend development',
        // Design system
        'AI design system',
        'AI component builder',
        'constrained AI code',
        'brand safe AI',
        // Framework specific
        'React AI builder',
        'Next.js AI editor',
        'AI Tailwind editor',
        // Workflow
        'AI to PR workflow',
        'visual AI coding',
        'design to code AI',
        // Comparisons
        'v0 alternative',
        'AI website builder',
        'AI prototype generator',
    ],
    openGraph: {
        title: 'AI Visual Editor | Weblab',
        description:
            'Build frontend UIs with AI constrained to your design system. Your real components. Mergeable PRs, not throwaway code.',
        type: 'website',
        url: 'https://weblab.build/features/ai',
        siteName: 'Weblab',
        images: [
            {
                url: '/og-image.png',
                width: 1200,
                height: 630,
                alt: 'Weblab AI visual editor preview',
            },
        ],
    },
    /* twitter: {
        card: 'summary_large_image',
        title: 'AI Visual Editor | Weblab',
        description:
            'Build frontend UIs with AI constrained to your design system. Your real components. Mergeable PRs.',
        images: ['/favicon.ico'],
    }, */
    alternates: {
        canonical: 'https://weblab.build/features/ai',
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
