import { type Metadata } from 'next';

import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

import { buildPageMetadata } from '@/lib/seo-metadata';
import { breadcrumbSchema } from '../seo';

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Workflows', path: '/workflows' },
]);

export async function generateMetadata(): Promise<Metadata> {
    return buildPageMetadata({
        pageKey: 'workflows',
        path: '/workflows',
        keywords: [
            'claude code visual editor',
            'cursor visual editor',
            'AI coding workflow',
            'visual layer for AI',
            'claude code for designers',
            'cursor for designers',
            'AI code editor visual',
            'visual AI coding',
            'design to code workflow',
            'AI design workflow',
            'code generation visual',
            'AI development tools',
            'visual canvas AI',
            'design system AI',
            'team collaboration AI',
        ],
    });
}

// JSON-LD structured data
const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `${APP_NAME} Workflows`,
    description: `Connect ${APP_NAME} to your AI coding workflow. Add a visual design layer to Claude Code, Cursor, and other AI tools.`,
    url: `https://${APP_DOMAIN}/workflows`,
    mainEntity: {
        '@type': 'SoftwareApplication',
        name: APP_NAME,
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Web',
        description: `${APP_NAME} is an AI-powered visual editor that integrates with your AI coding workflow. Design with your real components, collaborate with your team, ship PRs.`,
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
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbsJsonLd) }}
            />
            {children}
        </>
    );
}
