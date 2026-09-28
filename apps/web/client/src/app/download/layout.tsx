import type { Metadata } from 'next';

import { buildPageMetadata } from '@/lib/seo-metadata';
import { IS_LOCAL_APP_MODE } from '@/lib/site-mode';
import { breadcrumbSchema } from '../seo';

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Download', path: '/download' },
]);

export async function generateMetadata(): Promise<Metadata> {
    return buildPageMetadata({
        pageKey: IS_LOCAL_APP_MODE ? 'downloadLocalApp' : 'download',
        path: '/download',
    });
}

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
