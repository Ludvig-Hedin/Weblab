import type { Metadata } from 'next';

import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

import { breadcrumbSchema } from '../seo';

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Download', path: '/download' },
]);

export const metadata: Metadata = {
    title: `Download ${APP_NAME} | Mac, Windows, Linux & iOS`,
    description: `Get the ${APP_NAME} desktop app for macOS, Windows and Linux, or the iOS app on iPhone and iPad.`,
    openGraph: {
        title: `Download ${APP_NAME}`,
        description: `Get ${APP_NAME} on macOS, Windows, Linux, and iOS.`,
        type: 'website',
        url: `https://${APP_DOMAIN}/download`,
        siteName: APP_NAME,
    },
    alternates: {
        canonical: `https://${APP_DOMAIN}/download`,
    },
    robots: {
        index: true,
        follow: true,
    },
};

export default function DownloadLayout({ children }: { children: React.ReactNode }) {
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
