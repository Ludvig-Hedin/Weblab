import { type Metadata } from 'next';

import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

import { buildPageMetadata } from '@/lib/seo-metadata';
import { breadcrumbSchema } from '../../seo';

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Workflows', path: '/workflows' },
    { name: 'Codex', path: '/workflows/codex' },
]);

export async function generateMetadata(): Promise<Metadata> {
    return buildPageMetadata({
        pageKey: 'workflowsCodex',
        path: '/workflows/codex',
        keywords: [
            'codex for designers',
            'openai codex visual editor',
            'openai codex design tool',
            'codex UI design',
            'visual layer for codex',
            'codex collaboration',
            'AI code visual canvas',
            'openai codex infinite canvas',
            'visual AI development',
            'codex team collaboration',
            'codex design system',
            'AI generated UI editor',
            'codex PR output',
            'design engineer workflow',
        ],
    });
}

// JSON-LD structured data
const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: `${APP_NAME} for Codex`,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web',
    description: `${APP_NAME} adds a visual design layer to OpenAI Codex. An infinite canvas for AI-built UIs with your real components, team collaboration, and direct PR output.`,
    url: `https://${APP_DOMAIN}/workflows/codex`,
    featureList: [
        'Infinite canvas for Codex projects',
        'Visual editing of AI-generated UIs',
        'Design with your real React components',
        'Real-time team collaboration',
        'Spatial comments on the canvas',
        'Direct GitHub PR output',
        'AI constrained to your design system',
        'No coding required for designers',
    ],
    offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        description: 'Free tier available',
    },
};

export default function CodexLayout({ children }: { children: React.ReactNode }) {
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
