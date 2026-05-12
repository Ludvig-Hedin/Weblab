import type { Metadata } from 'next';

import { buildPageMetadata } from '@/lib/seo-metadata';
import { breadcrumbSchema } from '../seo';

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Security', path: '/security' },
]);

export async function generateMetadata(): Promise<Metadata> {
    return buildPageMetadata({
        pageKey: 'security',
        path: '/security',
    });
}

export default function SecurityLayout({ children }: { children: React.ReactNode }) {
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
