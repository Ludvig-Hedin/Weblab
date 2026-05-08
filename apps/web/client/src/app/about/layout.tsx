import type { Metadata } from 'next';

import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

export const metadata: Metadata = {
    title: `About ${APP_NAME} | The Visual Editor for React`,
    description: `Meet the founder behind ${APP_NAME} — an AI-powered visual editor for frontend development. Built in Sweden to obliterate the divide between creativity and implementation. Open source.`,
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

// JSON-LD structured data for the organization
const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: APP_NAME,
    url: `https://${APP_DOMAIN}`,
    logo: `https://${APP_DOMAIN}/logo.png`,
    description: `${APP_NAME} is an AI-powered visual editor for frontend development. Design with your real React, Vue, or Angular components. Changes become mergeable pull requests.`,
    foundingDate: '2024',
    founders: [
        {
            '@type': 'Person',
            name: 'Ludvig Hedin',
            jobTitle: 'Founder',
            url: 'https://www.linkedin.com/in/ludvig-hedin-058bba194/',
        },
    ],
    numberOfEmployees: {
        '@type': 'QuantitativeValue',
        value: 1,
    },
    address: {
        '@type': 'PostalAddress',
        addressCountry: 'SE',
    },
    sameAs: [
        'https://github.com/Ludvig-Hedin/Weblab',
        // 'https://x.com/weblab',
        'https://www.linkedin.com/company/weblab/',
        // 'https://discord.gg/ZZzadNQtns',
        'https://weblab.substack.com/',
    ],
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
            />
            {children}
        </>
    );
}
