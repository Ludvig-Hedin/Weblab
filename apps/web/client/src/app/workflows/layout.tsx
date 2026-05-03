import { APP_DOMAIN, APP_NAME } from '@weblab/constants';
import { type Metadata } from 'next';

export const metadata: Metadata = {
    title: `Workflows | Integrate ${APP_NAME} with Claude Code, Cursor & AI Coding Tools | ${APP_NAME}`,
    description:
        `Connect ${APP_NAME} to your AI coding workflow. Add a visual design layer to Claude Code, Cursor, and other AI tools. Design with your real components, collaborate with your team, ship PRs.`,
    keywords: [
        // Primary keywords
        'claude code visual editor',
        'cursor visual editor',
        'AI coding workflow',
        'visual layer for AI',
        // Tool integrations
        'claude code for designers',
        'cursor for designers',
        'AI code editor visual',
        'visual AI coding',
        // Workflow
        'design to code workflow',
        'AI design workflow',
        'code generation visual',
        'AI development tools',
        // Problem/solution
        'visual canvas AI',
        'design system AI',
        'team collaboration AI',
    ],
    openGraph: {
        url: `https://${APP_DOMAIN}/workflows`,
        type: 'website',
        siteName: APP_NAME,
        title: 'Workflows | ${APP_NAME}',
        description:
            `Connect ${APP_NAME} to your AI coding workflow. Visual design layer for Claude Code, Cursor, and more.`,
        images: [
            {
                url: 'https://framerusercontent.com/images/ScnnNT7JpmUya7afqGAets8.png',
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Workflows | ${APP_NAME}',
        description: 'Visual design layer for Claude Code, Cursor, and AI coding tools.',
        images: ['https://framerusercontent.com/images/ScnnNT7JpmUya7afqGAets8.png'],
    },
    alternates: {
        canonical: `https://${APP_DOMAIN}/workflows`,
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
    '@type': 'WebPage',
    name: `${APP_NAME} Workflows`,
    description:
        `Connect ${APP_NAME} to your AI coding workflow. Add a visual design layer to Claude Code, Cursor, and other AI tools.`,
    url: `https://${APP_DOMAIN}/workflows`,
    mainEntity: {
        '@type': 'SoftwareApplication',
        name: APP_NAME,
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Web',
        description:
            `${APP_NAME} is an AI-powered visual editor that integrates with your AI coding workflow. Design with your real components, collaborate with your team, ship PRs.`,
        featureList: [
            'Visual canvas for AI-generated UIs',
            'Integration with Claude Code',
            'Vibe coding for teams — collaboration for AI workflows',
            'Integration with Cursor',
            'Design with your real components',
            'Real-time team collaboration',
            'Direct PR output to GitHub',
            'AI constrained to your design system',
        ],
    },
};

export default function WorkflowsLayout({ children }: { children: React.ReactNode }) {
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
