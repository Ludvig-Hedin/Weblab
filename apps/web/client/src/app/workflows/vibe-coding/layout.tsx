import { type Metadata } from 'next';

import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

import { breadcrumbSchema } from '../../seo';

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Workflows', path: '/workflows' },
    { name: 'Vibe Coding', path: '/workflows/vibe-coding' },
]);

export const metadata: Metadata = {
    title: `Vibe Coding for Teams: Add Collaboration to Your AI Workflow | ${APP_NAME}`,
    description: `Vibe coding has a collaboration problem. ${APP_NAME} solves it. Design with your real components on an infinite canvas, work together in real-time, and ship PRs — not throwaway prototypes.`,
    keywords: [
        // Primary keywords
        'vibe coding',
        'vibe coding for teams',
        'vibe coding collaboration',
        'vibe coding tool',
        // Related terms
        'agentic engineering',
        'AI coding collaboration',
        'team vibe coding',
        'collaborative AI coding',
        // Problem/solution
        'vibe coding workflow',
        'vibe coding design system',
        'vibe coding real components',
        // Comparisons
        'AI code generator alternative',
        'AI code generator team',
        'solo coding alternative',
        // Workflow
        'AI to PR workflow',
        'design to code team',
        'visual AI coding',
    ],
    openGraph: {
        url: `https://${APP_DOMAIN}/workflows/vibe-coding`,
        type: 'website',
        siteName: APP_NAME,
        title: `Vibe Coding for Teams | ${APP_NAME}`,
        description: `Vibe coding has a collaboration problem. ${APP_NAME} solves it. Design with your real components, collaborate in real-time, ship PRs.`,
        images: [
            {
                url: '/favicon.ico',
            },
        ],
    },
    /* twitter: {
        card: 'summary_large_image',
        site: '@weblab',
        creator: '@weblab',
        title: `Vibe Coding for Teams | ${APP_NAME}`,
        description:
            `Vibe coding has a collaboration problem. ${APP_NAME} solves it. Real components, real-time collaboration, real PRs.`,
        images: [
            {
                url: '/favicon.ico',
            },
        ],
    }, */
    alternates: {
        canonical: `https://${APP_DOMAIN}/workflows/vibe-coding`,
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
