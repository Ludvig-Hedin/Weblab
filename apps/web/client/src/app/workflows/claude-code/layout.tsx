import { type Metadata } from 'next';

import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

import { buildPageMetadata } from '@/lib/seo-metadata';
import { breadcrumbSchema } from '../../seo';

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Workflows', path: '/workflows' },
    { name: 'Claude Code', path: '/workflows/claude-code' },
]);

export async function generateMetadata(): Promise<Metadata> {
    return buildPageMetadata({
        pageKey: 'workflowsClaudeCode',
        path: '/workflows/claude-code',
        keywords: [
            'claude code for designers',
            'claude code visual editor',
            'claude code design tool',
            'claude code UI design',
            'visual layer for claude code',
            'claude code collaboration',
            'cursor for designers',
            'AI code visual canvas',
            'anthropic claude design',
            'design engineer workflow',
            'AI coding visual design',
            'claude code infinite canvas',
            'visual AI development',
            'claude code team collaboration',
            'claude code PR output',
            'claude code design system',
            'AI generated UI editor',
        ],
    });
}

// JSON-LD structured data
const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: `${APP_NAME} for Claude Code`,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web',
    description: `${APP_NAME} adds a visual design layer to Claude Code. An infinite canvas for AI-built UIs with your real components, team collaboration, and direct PR output.`,
    url: `https://${APP_DOMAIN}/workflows/claude-code`,
    featureList: [
        'Infinite canvas for Claude Code projects',
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

export default function ClaudeCodeLayout({ children }: { children: React.ReactNode }) {
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
