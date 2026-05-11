import type { Metadata } from 'next';

import { buildPageMetadata } from '@/lib/seo-metadata';
import { breadcrumbSchema } from '../../seo';

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Features', path: '/features' },
    { name: 'Visual Builder', path: '/features/builder' },
]);

export async function generateMetadata(): Promise<Metadata> {
    return buildPageMetadata({
        pageKey: 'featuresBuilder',
        path: '/features/builder',
        keywords: [
            'visual builder',
            'visual code editor',
            'design to code',
            'React visual builder',
            'infinite canvas',
            'visual component editor',
            'drag drop code editor',
            'WYSIWYG code editor',
            'React visual editor',
            'Next.js builder',
            'Vue visual builder',
            'Angular visual builder',
            'Figma to code',
            'Webflow alternative',
            'Framer alternative',
            'designer developer workflow',
            'design engineer tools',
        ],
    });
}

// JSON-LD structured data
const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Weblab Visual Builder',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web',
    description:
        'Weblab is a visual builder that works with your existing codebase. Design with your real React, Vue, or Angular components on an infinite canvas. Changes become mergeable pull requests.',
    url: 'https://weblab.build/features/builder',
    featureList: [
        'Infinite canvas for visual design',
        'Works with your existing codebase',
        'Design with real React, Vue, Angular components',
        'Drag-and-drop interface',
        'Visual styling controls',
        'Real-time preview',
        'Direct GitHub PR output',
        'No coding required for designers',
    ],
    offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        description: 'Free tier available',
    },
};

export default function BuilderFeaturesLayout({ children }: { children: React.ReactNode }) {
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
