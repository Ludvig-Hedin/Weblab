import { APP_DOMAIN, APP_NAME } from '@weblab/constants';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: `About ${APP_NAME} | The Team Behind the Visual Editor for React`,
    description:
        `Meet the team behind ${APP_NAME} — an AI-powered visual editor for frontend development. Founded to obliterate the divide between creativity and implementation. Open source.`,
    keywords: [
        // Company
        `${APP_NAME} team`,
        `${APP_NAME} founders`,
        `${APP_NAME} company`,
        `${APP_NAME} about`,
        // Mission
        'design engineering',
        'design to code',
        'creative tools startup',
        'developer tools startup',
        // Location
        'San Francisco startup',
        // Open source
        'open source design tool',
        'open source visual editor',
    ],
    openGraph: {
        title: `About ${APP_NAME}`,
        description:
            `Meet the team behind ${APP_NAME}. Founded to obliterate the divide between creativity and implementation.`,
        type: 'website',
        url: `https://${APP_DOMAIN}/about`,
        siteName: APP_NAME,
        images: [
            {
                url: 'https://framerusercontent.com/images/ScnnNT7JpmUya7afqGAets8.png',
            },
        ],
    },
    /* twitter: {
        card: 'summary_large_image',
        title: `About ${APP_NAME}`,
        description:
            `Meet the team behind ${APP_NAME}. Founded to obliterate the divide between creativity and implementation.`,
        images: ['https://framerusercontent.com/images/ScnnNT7JpmUya7afqGAets8.png'],
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
    description:
        `${APP_NAME} is an AI-powered visual editor for frontend development. Design with your real React, Vue, or Angular components. Changes become mergeable pull requests.`,
    foundingDate: '2024',
    founders: [
        {
            '@type': 'Person',
            name: 'Daniel Farrell',
            jobTitle: 'Co-Founder, Design & Growth',
            url: 'https://www.linkedin.com/in/danielrfarrell/',
        },
        {
            '@type': 'Person',
            name: 'Kiet Ho',
            jobTitle: 'Co-Founder, Engineering',
            url: 'https://www.linkedin.com/in/kiet-ho/',
        },
    ],
    numberOfEmployees: {
        '@type': 'QuantitativeValue',
        value: 3,
    },
    address: {
        '@type': 'PostalAddress',
        addressLocality: 'San Francisco',
        addressRegion: 'CA',
        addressCountry: 'US',
    },
    sameAs: [
        'https://github.com/Ludvig-Hedin/Weblab',
        // 'https://x.com/weblab',
        'https://www.linkedin.com/company/weblab/',
        // 'https://discord.gg/ZZzadNQtns',
        'https://weblab.substack.com/',
    ],
};

const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
        {
            '@type': 'Question',
            name: `What is ${APP_NAME}?`,
            acceptedAnswer: {
                '@type': 'Answer',
                text: `${APP_NAME} is an AI-powered visual editor for frontend development. It connects to your existing React, Vue, or Angular codebase and lets you design with your real components. AI is constrained to your design system, and changes become mergeable pull requests.`,
            },
        },
        {
            '@type': 'Question',
            name: `Who founded ${APP_NAME}?`,
            acceptedAnswer: {
                '@type': 'Answer',
                text: `${APP_NAME} was founded by Daniel Farrell (Design & Growth) and Kiet Ho (Engineering). Daniel is a designer with over a decade of experience, former Head of Growth at Bird. Kiet is an ex-Amazon engineer who maintained the design system at ServiceNow.`,
            },
        },
        {
            '@type': 'Question',
            name: `Where is ${APP_NAME} based?`,
            acceptedAnswer: {
                '@type': 'Answer',
                text: `${APP_NAME} is based in San Francisco, California. The team operates from their headquarters (the "Barracks").`,
            },
        },
        {
            '@type': 'Question',
            name: `Is ${APP_NAME} open source?`,
            acceptedAnswer: {
                '@type': 'Answer',
                text: `Yes. ${APP_NAME} is open source with 100+ contributors. You can browse the codebase, contribute improvements, or self-host it for your team.`,
            },
        },
    ],
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
            />
            {children}
        </>
    );
}