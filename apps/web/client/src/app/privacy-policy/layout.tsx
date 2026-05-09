import type { Metadata } from 'next';

import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

import { breadcrumbSchema } from '../seo';

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Privacy Policy', path: '/privacy-policy' },
]);

export const metadata: Metadata = {
    title: `Privacy Policy | ${APP_NAME}`,
    description: `${APP_NAME} privacy policy. Learn how ${APP_NAME} handles your data.`,
    alternates: {
        canonical: `https://${APP_DOMAIN}/privacy-policy`,
    },
    robots: {
        index: true,
        follow: true,
    },
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
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
