import type { Metadata } from 'next';

import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

import { absoluteUrl, breadcrumbSchema } from '../seo';

const url = `https://${APP_DOMAIN}/ai-website-builder`;

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'AI Website Builder', path: '/ai-website-builder' },
]);

const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `AI Website Builder for React & Next.js Codebases`,
    description: `${APP_NAME} is an AI website builder for teams that already own a React codebase. The AI is constrained to your real components and design tokens — every output ships as a pull request, not a regenerated app.`,
    url,
    mainEntityOfPage: url,
    inLanguage: 'en',
    image: absoluteUrl('/og-image.png'),
    isAccessibleForFree: true,
    author: { '@id': `https://${APP_DOMAIN}/#organization` },
    publisher: { '@id': `https://${APP_DOMAIN}/#organization` },
    about: [
        { '@type': 'Thing', name: 'AI website builder' },
        { '@type': 'Thing', name: 'AI site builder' },
        { '@type': 'Thing', name: 'React' },
        { '@type': 'Thing', name: 'Next.js' },
    ],
};

export async function generateMetadata(): Promise<Metadata> {
    const { buildPageMetadata } = await import('@/lib/seo-metadata');
    return buildPageMetadata({
        pageKey: 'aiWebsiteBuilder',
        path: '/ai-website-builder',
        ogType: 'article',
        keywords: [
            'ai website builder',
            'ai site builder',
            'ai web builder',
            'ai react builder',
            'ai website builder for developers',
            'ai design tool',
            'ai web design',
            'ai for frontend',
            'ai visual editor',
            'ai pull request',
            APP_NAME,
        ],
    });
}

export default function AiWebsiteBuilderLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbsJsonLd) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
            />
            {children}
        </>
    );
}
