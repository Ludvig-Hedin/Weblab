import type { Metadata } from 'next';

import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

import { breadcrumbSchema } from '../seo';

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'FAQ', path: '/faq' },
]);

export const metadata: Metadata = {
    title: `FAQ | ${APP_NAME} - AI-Powered Visual Editor for Frontend Development`,
    description: `Frequently asked questions about ${APP_NAME}, the AI-powered visual editor for frontend development. Learn about supported frameworks (React, Vue, Angular), component libraries (shadcn/ui, Material UI), AI features, pricing, and how ${APP_NAME} differs from other design tools.`,
    keywords: [
        `${APP_NAME} FAQ`,
        `${APP_NAME} questions`,
        'AI visual editor FAQ',
        'React visual editor',
        'design to code tool',
        'frontend AI tools',
        `${APP_NAME} vs Figma`,
        `${APP_NAME} vs V0`,
        `${APP_NAME} pricing`,
        `${APP_NAME} features`,
        'design system tools',
        'component library editor',
    ],
    openGraph: {
        title: `FAQ | ${APP_NAME}`,
        description: `Everything you need to know about ${APP_NAME} - the AI-powered visual editor for frontend development.`,
        type: 'website',
        url: `https://${APP_DOMAIN}/faq`,
        siteName: APP_NAME,
    },
    /* twitter: {
        card: 'summary_large_image',
        title: `FAQ | ${APP_NAME}`,
        description: `Everything you need to know about ${APP_NAME} - the AI-powered visual editor for frontend development.`,
    }, */
    alternates: {
        canonical: `https://${APP_DOMAIN}/faq`,
    },
    robots: {
        index: true,
        follow: true,
        googleBot: {
            index: true,
            follow: true,
            'max-snippet': -1,
        },
    },
};

export default function FAQLayout({ children }: { children: React.ReactNode }) {
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
