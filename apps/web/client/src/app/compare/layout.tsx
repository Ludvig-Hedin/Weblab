import type { Metadata } from 'next';

import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

import { breadcrumbSchema } from '../seo';

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Compare', path: '/compare' },
]);

const description = `Compare ${APP_NAME} to Lovable, Bolt, v0, Replit, Webflow, and more. ${APP_NAME} is the visual editor that works with your real React components and ships pull requests instead of throwaway code.`;

export const metadata: Metadata = {
    title: `${APP_NAME} vs Lovable, Bolt, v0, Replit, Webflow, and more — Compare AI Design Tools`,
    description,
    alternates: {
        canonical: `https://${APP_DOMAIN}/compare`,
    },
    openGraph: {
        url: `https://${APP_DOMAIN}/compare`,
        type: 'website',
        siteName: APP_NAME,
        title: `${APP_NAME} vs Lovable, Bolt, v0, Replit, Webflow, and more`,
        description,
        images: [
            {
                url: '/og-image.png',
                width: 1200,
                height: 630,
                alt: `Compare ${APP_NAME}`,
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: `${APP_NAME} vs Lovable, Bolt, v0, Replit, Webflow, and more`,
        description,
        images: [
            {
                url: '/og-image.png',
                width: 1200,
                height: 630,
                alt: `Compare ${APP_NAME}`,
            },
        ],
    },
};

export default function CompareLayout({ children }: { children: React.ReactNode }) {
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
