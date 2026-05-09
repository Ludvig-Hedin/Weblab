import type { Metadata } from 'next';

import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

import { breadcrumbSchema } from '../seo';

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Features', path: '/features' },
]);

export const metadata: Metadata = {
    title: `Features | ${APP_NAME} — AI Visual Editor for React Teams`,
    description: `Explore ${APP_NAME}'s features: AI constrained to your design system, infinite canvas, real-time collaboration, version history, and GitHub PR output.`,
    keywords: [
        // Core features
        'visual editor features',
        'AI design tool features',
        'React visual editor',
        'design to code features',
        // Specific features
        'component library editor',
        'design system management',
        'real-time collaboration',
        'version history',
        'infinite canvas',
        'layer management',
        // Technical
        'React editor',
        'Next.js visual editor',
        'Tailwind visual editor',
        'shadcn visual editor',
        // Comparisons
        'Figma alternative for code',
        'visual code editor',
        'design engineer tools',
    ],
    openGraph: {
        title: `Features | ${APP_NAME}`,
        description:
            'AI-powered visual editor with infinite canvas, real-time collaboration, component library integration, and direct PR output.',
        type: 'website',
        url: `https://${APP_DOMAIN}/features`,
        siteName: APP_NAME,
        images: [
            {
                url: '/og-image.png',
                width: 1200,
                height: 630,
                alt: `${APP_NAME} features preview`,
            },
        ],
    },
    /* twitter: {
        card: 'summary_large_image',
        title: `Features | ${APP_NAME}`,
        description: 'AI-powered visual editor with infinite canvas, real-time collaboration, and direct PR output.',
        images: ['/favicon.ico'],
    }, */
    alternates: {
        canonical: `https://${APP_DOMAIN}/features`,
    },
    robots: {
        index: true,
        follow: true,
        googleBot: {
            index: true,
            follow: true,
            'max-snippet': -1,
        },
    },
};

// JSON-LD structured data
const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: APP_NAME,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web',
    description: `${APP_NAME} is an AI-powered visual editor for frontend development. Design with your real React, Vue, or Angular components on an infinite canvas. AI is constrained to your design system. Changes become mergeable pull requests.`,
    url: `https://${APP_DOMAIN}/features`,
    featureList: [
        'AI constrained to your design system',
        'Infinite canvas for visual design',
        'Real-time team collaboration',
        'Component library integration',
        'Theming and branding management',
        'Visual layer management',
        'Version history with auto-save',
        'React and Next.js templates',
        'Direct GitHub PR output',
        'Works with Tailwind, shadcn/ui, Material UI',
        'Open source',
    ],
    offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        description: 'Free tier available',
    },
};

export default function FeaturesLayout({ children }: { children: React.ReactNode }) {
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
