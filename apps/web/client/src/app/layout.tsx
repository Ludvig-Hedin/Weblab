import '@/styles/globals.css';
import '@weblab/ui/globals.css';

import RB2BLoader from '@/components/rb2b-loader';
import { APP_DOMAIN, APP_NAME, APP_TAGLINE } from '@weblab/constants';
import { TelemetryProvider } from '@/components/telemetry-provider';
import { env } from '@/env';
import { FeatureFlagsProvider } from '@/hooks/use-feature-flags';
import { TRPCReactProvider } from '@/trpc/react';
import { Toaster } from '@weblab/ui/sonner';
import { type Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import { AppearanceProvider } from '@/components/ui/appearance-provider';
import { ThemeProvider } from './_components/theme';
import { AuthProvider } from './auth/auth-context';
import { faqSchema, organizationSchema } from './seo';

const isProduction = env.NODE_ENV === 'production';

const description = `The power of Cursor for your own website. ${APP_NAME} lets you edit your React website and write your changes back to code in real-time. Iterate and experiment with AI.`;

export const metadata: Metadata = {
    title: `${APP_NAME} – ${APP_TAGLINE}`,
    description,
    icons: [
        { rel: 'icon', url: '/favicon.svg', type: 'image/svg+xml' },
        { rel: 'icon', url: '/favicon.png', type: 'image/png' },
    ],
    openGraph: {
        url: `https://${APP_DOMAIN}/`,
        type: 'website',
        siteName: APP_NAME,
        title: `${APP_NAME} – ${APP_TAGLINE}`,
        description,
        images: [
            {
                url: 'https://framerusercontent.com/images/ScnnNT7JpmUya7afqGAets8.png',
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        site: '@weblab', // update when Twitter handle changes
        creator: '@weblab',
        title: `${APP_NAME} – ${APP_TAGLINE}`,
        description,
        images: [
            {
                url: 'https://framerusercontent.com/images/ScnnNT7JpmUya7afqGAets8.png',
            },
        ],
    },
};

const inter = Inter({
    subsets: ['latin'],
    variable: '--font-inter',
});

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    const locale = await getLocale();

    return (
        <html lang={locale} className={inter.variable} suppressHydrationWarning>
            <head>
                <link rel="canonical" href={`https://${APP_DOMAIN}/`} />
                <meta name="robots" content="index, follow" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
                />
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
                />
            </head>
            <body>
                {isProduction && (
                    <>
                        <Script src="https://z.weblab.build/cdn-cgi/zaraz/i.js" strategy="lazyOnload" />
                        <RB2BLoader />
                    </>
                )}
                <TRPCReactProvider>
                    <FeatureFlagsProvider>
                        <TelemetryProvider>
                            <ThemeProvider
                                attribute="class"
                                defaultTheme="system"
                                enableSystem
                                disableTransitionOnChange
                            >
                                <AppearanceProvider>
                                    <AuthProvider>
                                        <NextIntlClientProvider>
                                            {children}
                                            <Toaster />
                                        </NextIntlClientProvider>
                                    </AuthProvider>
                                </AppearanceProvider>
                            </ThemeProvider>
                        </TelemetryProvider>
                    </FeatureFlagsProvider>
                </TRPCReactProvider>
            </body>
        </html>
    );
}
