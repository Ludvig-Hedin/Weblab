import type { Metadata } from 'next';

import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

import { breadcrumbSchema } from '../../seo';

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Compare', path: '/compare' },
    { name: 'vs Claude Code', path: '/compare/claude-code' },
]);

const description = `${APP_NAME} vs Claude Code: ${APP_NAME} is a visual canvas editor for React. Claude Code is a terminal CLI that edits files via AI prompts. Compare how they handle design systems, UI editing, and team collaboration.`;

export const metadata: Metadata = {
    title: `${APP_NAME} vs Claude Code — Visual Canvas Editor vs AI Terminal CLI | ${APP_NAME}`,
    description,
    keywords: [
        'weblab vs claude code',
        'claude code alternative',
        'visual editor vs ai terminal',
        'claude code design system',
        'react visual editor vs cli',
        'anthropic claude code comparison',
    ],
    alternates: {
        canonical: `https://${APP_DOMAIN}/compare/claude-code`,
    },
    openGraph: {
        url: `https://${APP_DOMAIN}/compare/claude-code`,
        type: 'article',
        siteName: APP_NAME,
        title: `${APP_NAME} vs Claude Code`,
        description,
        images: [
            {
                url: '/og-image.png',
                width: 1200,
                height: 630,
                alt: `${APP_NAME} vs Claude Code`,
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: `${APP_NAME} vs Claude Code`,
        description,
        images: [
            {
                url: '/og-image.png',
                width: 1200,
                height: 630,
                alt: `${APP_NAME} vs Claude Code`,
            },
        ],
    },
};

export default function CompareClaudeCodeLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbsJsonLd) }}
            />
            {children}
        </>
    );
}
