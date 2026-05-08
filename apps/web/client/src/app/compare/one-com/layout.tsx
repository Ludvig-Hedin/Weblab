import type { Metadata } from 'next';

import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

import { breadcrumbSchema } from '../../seo';

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Compare', path: '/compare' },
    { name: 'vs one.com', path: '/compare/one-com' },
]);

const description = `${APP_NAME} vs one.com: ${APP_NAME} is a visual React codebase editor for engineering teams. one.com is a budget hosting and website builder for small businesses. See why developers choose Weblab over drag-and-drop website builders.`;

export const metadata: Metadata = {
    title: `${APP_NAME} vs one.com — React Visual Editor vs Budget Website Builder`,
    description,
    keywords: [
        'weblab vs one.com',
        'one.com alternative for developers',
        'react editor vs website builder',
        'developer tools vs one.com',
        'one com comparison',
        'react visual editor one com alternative',
    ],
    alternates: {
        canonical: `https://${APP_DOMAIN}/compare/one-com`,
    },
    openGraph: {
        url: `https://${APP_DOMAIN}/compare/one-com`,
        type: 'article',
        siteName: APP_NAME,
        title: `${APP_NAME} vs one.com`,
        description,
        images: [
            {
                url: '/og-image.png',
                width: 1200,
                height: 630,
                alt: `${APP_NAME} vs one.com`,
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: `${APP_NAME} vs one.com`,
        description,
        images: [
            {
                url: '/og-image.png',
                width: 1200,
                height: 630,
                alt: `${APP_NAME} vs one.com`,
            },
        ],
    },
};

export default function CompareOneComLayout({ children }: { children: React.ReactNode }) {
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
