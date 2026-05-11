import type { Metadata } from 'next';

import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

import { buildPageMetadata } from '@/lib/seo-metadata';
import { breadcrumbSchema } from '../seo';

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'About', path: '/about' },
]);

export async function generateMetadata(): Promise<Metadata> {
    return buildPageMetadata({
        pageKey: 'about',
        path: '/about',
        keywords: [
            `${APP_NAME} founder`,
            `${APP_NAME} company`,
            `${APP_NAME} about`,
            'design engineering',
            'design to code',
            'creative tools startup',
            'developer tools startup',
            'Sweden startup',
            'open source design tool',
            'open source visual editor',
        ],
    });
}

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
