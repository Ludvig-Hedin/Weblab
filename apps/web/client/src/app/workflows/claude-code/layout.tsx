import { type Metadata } from 'next';

import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

export const metadata: Metadata = {
    title: `Claude Code for Designers: Add a Visual Canvas to Your Workflow | ${APP_NAME}`,
    description: `Designers using Claude Code need a visual layer. ${APP_NAME} gives you an infinite canvas for your AI-built UIs — with your real components, team collaboration, and PR output.`,
    keywords: [
        // Primary keywords
        'claude code for designers',
        'claude code visual editor',
        'claude code design tool',
        'claude code UI design',
        'visual layer for claude code',
        'claude code collaboration',
        // Related tools
        'cursor for designers',
        'AI code visual canvas',
        'anthropic claude design',
        // Workflow
        'design engineer workflow',
        'AI coding visual design',
        'claude code infinite canvas',
        'visual AI development',
        // Problem/solution
        'claude code team collaboration',
        'claude code PR output',
        'claude code design system',
        'AI generated UI editor',
    ],
    openGraph: {
        url: `https://${APP_DOMAIN}/workflows/claude-code`,
        type: 'website',
        siteName: APP_NAME,
        title: `Claude Code for Designers: Add a Visual Canvas to Your Workflow | ${APP_NAME}`,
        description: `Designers using Claude Code need a visual layer. ${APP_NAME} gives you an infinite canvas for your AI-built UIs — with your real components, team collaboration, and PR output.`,
        images: [
            {
                url: '/og-image.png',
                width: 1200,
                height: 630,
                alt: `${APP_NAME} Claude Code workflow preview`,
            },
        ],
    },
    /* twitter: {
        card: 'summary_large_image',
        site: '@weblab',
        creator: '@weblab',
        title: `Claude Code for Designers | ${APP_NAME}`,
        description:
            'The visual canvas your Claude Code workflow is missing. Design with your real components, collaborate with your team, ship PRs.',
        images: [
            {
                url: '/favicon.ico',
            },
        ],
    }, */
    alternates: {
        canonical: `https://${APP_DOMAIN}/workflows/claude-code`,
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
            {children}
        </>
    );
}
