import type { Metadata } from 'next';

import { APP_NAME } from '@weblab/constants';

import { buildPageMetadata } from '@/lib/seo-metadata';
import { breadcrumbSchema } from '../seo';

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'FAQ', path: '/faq' },
]);

export async function generateMetadata(): Promise<Metadata> {
    return buildPageMetadata({
        pageKey: 'faq',
        path: '/faq',
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
    });
}

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
