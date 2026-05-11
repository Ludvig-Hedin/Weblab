import type { Metadata } from 'next';

import { buildPageMetadata } from '@/lib/seo-metadata';
import { breadcrumbSchema } from '../seo';

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Pricing', path: '/pricing' },
]);

export async function generateMetadata(): Promise<Metadata> {
    return buildPageMetadata({
        pageKey: 'pricing',
        path: '/pricing',
        keywords: [
            'Weblab pricing',
            'visual editor pricing',
            'AI design tool pricing',
            'cursor for designers price',
            'react visual editor cost',
        ],
    });
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
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
