import type { Metadata } from 'next';

import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

import { absoluteUrl, breadcrumbSchema } from '../seo';

const url = `https://${APP_DOMAIN}/visual-site-builder`;

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Visual Site Builder', path: '/visual-site-builder' },
]);

const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `Visual Site Builder for React & Next.js Teams`,
    description: `${APP_NAME} is a visual site builder for React and Next.js codebases. Design with your real components on an infinite canvas, edit code visually, and ship pull requests instead of mockups.`,
    url,
    mainEntityOfPage: url,
    inLanguage: 'en',
    image: absoluteUrl('/og-image.png'),
    isAccessibleForFree: true,
    author: { '@id': `https://${APP_DOMAIN}/#organization` },
    publisher: { '@id': `https://${APP_DOMAIN}/#organization` },
    about: [
        { '@type': 'Thing', name: 'Visual site builder' },
        { '@type': 'Thing', name: 'Visual website builder' },
        { '@type': 'Thing', name: 'React' },
        { '@type': 'Thing', name: 'Next.js' },
    ],
};

export async function generateMetadata(): Promise<Metadata> {
    const { buildPageMetadata } = await import('@/lib/seo-metadata');
    return buildPageMetadata({
        pageKey: 'visualSiteBuilder',
        path: '/visual-site-builder',
        ogType: 'article',
        keywords: [
            'visual site builder',
            'visual website builder',
            'react visual site builder',
            'next.js visual builder',
            'react visual editor',
            'visual builder for react',
            'visual website builder for developers',
            'visual builder open source',
            'design system visual builder',
            'figma to react visual builder',
            APP_NAME,
        ],
    });
}

export default function VisualSiteBuilderLayout({ children }: { children: React.ReactNode }) {
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
