import type { Metadata } from 'next';

import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

import { absoluteUrl, breadcrumbSchema } from '../seo';

const url = `https://${APP_DOMAIN}/website-builder`;

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Website Builder', path: '/website-builder' },
]);

const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `Website Builder for Teams Who Own a Codebase`,
    description: `${APP_NAME} is a website builder for teams that own a React or Next.js codebase. Visual canvas, real components, AI assistance, pull-request output. Open source.`,
    url,
    mainEntityOfPage: url,
    inLanguage: 'en',
    image: absoluteUrl('/og-image.png'),
    isAccessibleForFree: true,
    author: { '@id': `https://${APP_DOMAIN}/#organization` },
    publisher: { '@id': `https://${APP_DOMAIN}/#organization` },
    about: [
        { '@type': 'Thing', name: 'Website builder' },
        { '@type': 'Thing', name: 'Visual site builder' },
        { '@type': 'Thing', name: 'AI website builder' },
        { '@type': 'Thing', name: 'React' },
    ],
};

export async function generateMetadata(): Promise<Metadata> {
    const { buildPageMetadata } = await import('@/lib/seo-metadata');
    return buildPageMetadata({
        pageKey: 'websiteBuilder',
        path: '/website-builder',
        ogType: 'article',
        keywords: [
            'website builder',
            'website builder for developers',
            'react website builder',
            'next.js website builder',
            'open source website builder',
            'visual website builder',
            'ai website builder',
            'website builder for codebase',
            'website builder pull request',
            'website builder design system',
            'website builder for teams',
            APP_NAME,
        ],
    });
}

export default function WebsiteBuilderLayout({ children }: { children: React.ReactNode }) {
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
