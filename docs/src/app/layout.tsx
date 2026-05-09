import './global.css';

import { baseOptions } from '@/app/layout.config';
import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { RootProvider } from 'fumadocs-ui/provider';
import { Geist } from 'next/font/google';
import type { ReactNode } from 'react';
import RB2BLoader from '@/components/rb2b-loader';
import { APP_DOMAIN, APP_NAME } from '@/lib/site';

const geist = Geist({
    subsets: ['latin'],
    variable: '--font-geist',
});

export const metadata = {
    metadataBase: new URL(`https://${APP_DOMAIN}`),
    title: {
        default: `${APP_NAME} Docs`,
        template: `%s – ${APP_NAME} Docs`,
    },
    description:
        `Official documentation for ${APP_NAME} – an open-source "Cursor for Designers" that lets you visually edit React & Tailwind projects.`,
    openGraph: {
        siteName: `${APP_NAME} Docs`,
        type: 'website',
    },
    twitter: {
        card: 'summary_large_image',
        site: '@weblabdev',
    },
    robots: {
        index: true,
        follow: true,
    },
    alternates: {
        canonical: '/',
    },
};

const docsOptions = {
    ...baseOptions,
};

const isProduction = process.env.NODE_ENV === 'production';

export default function Layout({ children }: { children: ReactNode }) {
    return (
        <html lang="en" className={geist.variable} suppressHydrationWarning>
            <body className="flex flex-col min-h-screen">
                {isProduction && <RB2BLoader />}
                <RootProvider>
                    <DocsLayout tree={source.pageTree} {...docsOptions}>
                        {children}
                    </DocsLayout>
                </RootProvider>
            </body>
        </html>
    );
}
