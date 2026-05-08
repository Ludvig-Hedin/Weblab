import type { Metadata } from 'next';

import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

import { breadcrumbSchema } from '../../seo';

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Compare', path: '/compare' },
    { name: 'vs Webflow', path: '/compare/webflow' },
]);

const description = `${APP_NAME} vs Webflow: ${APP_NAME} edits your existing React codebase on a visual canvas and ships pull requests. Webflow is a no-code visual builder that outputs its own HTML/CSS with Webflow hosting. Compare features, workflows, and code ownership.`;

export const metadata: Metadata = {
    title: `${APP_NAME} vs Webflow — React Visual Editor vs No-Code Website Builder`,
    description,
    keywords: [
        'weblab vs webflow',
        'webflow alternative for developers',
        'webflow vs react editor',
        'visual editor react codebase',
        'webflow no-code vs react visual editor',
        'webflow react alternative',
    ],
    alternates: {
        canonical: `https://${APP_DOMAIN}/compare/webflow`,
    },
    openGraph: {
        url: `https://${APP_DOMAIN}/compare/webflow`,
        type: 'article',
        siteName: APP_NAME,
        title: `${APP_NAME} vs Webflow`,
        description,
        images: [
            {
                url: '/og-image.png',
                width: 1200,
                height: 630,
                alt: `${APP_NAME} vs Webflow`,
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: `${APP_NAME} vs Webflow`,
        description,
        images: [
            {
                url: '/og-image.png',
                width: 1200,
                height: 630,
                alt: `${APP_NAME} vs Webflow`,
            },
        ],
    },
};

export default function CompareWebflowLayout({ children }: { children: React.ReactNode }) {
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
