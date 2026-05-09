import type { Metadata } from 'next';

import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

import { breadcrumbSchema } from '../seo';

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'About', path: '/about' },
]);

export const metadata: Metadata = {
    title: `About ${APP_NAME} | The Visual Editor for React`,
    description: `Meet the founder behind ${APP_NAME} — an AI visual editor for frontend teams. Built in Sweden to bridge creativity and implementation. Open source.`,
    keywords: [
        // Company
        `${APP_NAME} founder`,
        `${APP_NAME} company`,
        `${APP_NAME} about`,
        // Mission
        'design engineering',
        'design to code',
        'creative tools startup',
        'developer tools startup',
        // Location
        'Sweden startup',
        // Open source
        'open source design tool',
        'open source visual editor',
    ],
    openGraph: {
        title: `About ${APP_NAME}`,
        description: `Meet the founder behind ${APP_NAME}. Built in Sweden to obliterate the divide between creativity and implementation.`,
        type: 'website',
        url: `https://${APP_DOMAIN}/about`,
        siteName: APP_NAME,
        images: [
            {
                url: '/og-image.png',
                width: 1200,
                height: 630,
                alt: `About ${APP_NAME}`,
            },
        ],
    },
    /* twitter: {
        card: 'summary_large_image',
        title: `About ${APP_NAME}`,
        description:
            `Meet the founder behind ${APP_NAME}. Built in Sweden to obliterate the divide between creativity and implementation.`,
        images: ['/favicon.ico'],
    }, */
    alternates: {
        canonical: `https://${APP_DOMAIN}/about`,
    },
    robots: {
        index: true,
        follow: true,
        googleBot: {
            index: true,
            follow: true,
            'max-video-preview': -1,
            'max-image-preview': 'large',
            'max-snippet': -1,
        },
    },
};

// AboutPage + ProfilePage hybrid for the founder bio.
const aboutPageJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: `About ${APP_NAME}`,
    url: `https://${APP_DOMAIN}/about`,
    description: `Meet the founder behind ${APP_NAME} — an AI visual website builder for React and Next.js teams. Built in Sweden.`,
    mainEntity: {
        '@type': 'Person',
        name: 'Ludvig Hedin',
        jobTitle: 'Founder',
        url: 'https://www.linkedin.com/in/ludvig-hedin-058bba194/',
        worksFor: { '@id': `https://${APP_DOMAIN}/#organization` },
        sameAs: ['https://www.linkedin.com/in/ludvig-hedin-058bba194/'],
    },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbsJsonLd) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutPageJsonLd) }}
            />
            {children}
        </>
    );
}
