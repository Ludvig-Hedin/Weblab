import type { Metadata } from 'next';

import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

import { buildPageMetadata } from '@/lib/seo-metadata';
import { breadcrumbSchema } from '../seo';

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Features', path: '/features' },
]);

export async function generateMetadata(): Promise<Metadata> {
    return buildPageMetadata({
        pageKey: 'features',
        path: '/features',
        keywords: [
            'visual editor features',
            'AI design tool features',
            'React visual editor',
            'design to code features',
            'component library editor',
            'design system management',
            'real-time collaboration',
            'version history',
            'infinite canvas',
            'layer management',
            'React editor',
            'Next.js visual editor',
            'Tailwind visual editor',
            'shadcn visual editor',
            'Figma alternative for code',
            'visual code editor',
            'design engineer tools',
        ],
    });
}

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
