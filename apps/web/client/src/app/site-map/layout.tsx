import type { Metadata } from 'next';

import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

import { buildPageMetadata } from '@/lib/seo-metadata';
import { breadcrumbSchema } from '../seo';

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Sitemap', path: '/site-map' },
]);

export async function generateMetadata(): Promise<Metadata> {
    return buildPageMetadata({
        pageKey: 'sitemap',
        path: '/site-map',
    });
}

// JSON-LD structured data for sitemap
const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `${APP_NAME} Sitemap`,
    description: `Complete sitemap for ${APP_DOMAIN} — the AI-powered visual editor for frontend development.`,
    url: `https://${APP_DOMAIN}/site-map`,
    mainEntity: {
        '@type': 'ItemList',
        itemListElement: [
            {
                '@type': 'SiteNavigationElement',
                position: 1,
                name: 'Home',
                url: `https://${APP_DOMAIN}/`,
            },
            {
                '@type': 'SiteNavigationElement',
                position: 2,
                name: 'Features',
                url: `https://${APP_DOMAIN}/features`,
            },
            {
                '@type': 'SiteNavigationElement',
                position: 3,
                name: 'Workflows',
                url: `https://${APP_DOMAIN}/workflows`,
            },
            {
                '@type': 'SiteNavigationElement',
                position: 4,
                name: 'Pricing',
                url: `https://${APP_DOMAIN}/pricing`,
            },
            {
                '@type': 'SiteNavigationElement',
                position: 5,
                name: 'About',
                url: `https://${APP_DOMAIN}/about`,
            },
            {
                '@type': 'SiteNavigationElement',
                position: 6,
                name: 'FAQ',
                url: `https://${APP_DOMAIN}/faq`,
            },
        ],
    },
};

export default function SitemapLayout({ children }: { children: React.ReactNode }) {
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
