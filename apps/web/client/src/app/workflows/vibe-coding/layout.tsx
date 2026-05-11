import { type Metadata } from 'next';

import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

import { buildPageMetadata } from '@/lib/seo-metadata';
import { breadcrumbSchema } from '../../seo';

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Workflows', path: '/workflows' },
    { name: 'Vibe Coding', path: '/workflows/vibe-coding' },
]);

export async function generateMetadata(): Promise<Metadata> {
    return buildPageMetadata({
        pageKey: 'workflowsVibeCoding',
        path: '/workflows/vibe-coding',
        keywords: [
            'vibe coding',
            'vibe coding for teams',
            'vibe coding collaboration',
            'vibe coding tool',
            'agentic engineering',
            'AI coding collaboration',
            'team vibe coding',
            'collaborative AI coding',
            'vibe coding workflow',
            'vibe coding design system',
            'vibe coding real components',
            'AI code generator alternative',
            'AI code generator team',
            'solo coding alternative',
            'AI to PR workflow',
            'design to code team',
            'visual AI coding',
        ],
    });
}

// JSON-LD structured data
const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: `${APP_NAME} for Vibe Coding Teams`,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web',
    description: `${APP_NAME} adds collaboration to vibe coding. Design with your real components on an infinite canvas, work together in real-time, and ship changes as mergeable pull requests.`,
    url: `https://${APP_DOMAIN}/workflows/vibe-coding`,
    featureList: [
        'Team collaboration for vibe coding',
        'Real-time multiplayer canvas',
        'Design with your real components',
        'AI constrained to your design system',
        'Spatial comments and feedback',
        'Direct GitHub PR output',
        'Works with React, Vue, Angular',
        'Supports Tailwind, shadcn/ui, Material UI',
    ],
    offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        description: 'Free tier available',
    },
};

export default function VibeCodingLayout({ children }: { children: React.ReactNode }) {
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
