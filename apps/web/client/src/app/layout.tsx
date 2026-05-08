import '@/styles/globals.css';
import '@weblab/ui/globals.css';

import { type Metadata } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';

import { APP_DOMAIN, APP_NAME } from '@weblab/constants';
import { Toaster } from '@weblab/ui/sonner';

import RB2BLoader from '@/components/rb2b-loader';
import { TelemetryProvider } from '@/components/telemetry-provider';
import { AppearanceProvider } from '@/components/ui/appearance-provider';
import { env } from '@/env';
import { FeatureFlagsProvider } from '@/hooks/use-feature-flags';
import { TRPCReactProvider } from '@/trpc/react';
import { ThemeProvider } from './_components/theme';
import { AuthProvider } from './auth/auth-context';
import { absoluteUrl, organizationSchema, websiteSchema } from './seo';

const isProduction = env.NODE_ENV === 'production';

const title = `${APP_NAME} - AI Visual Website Builder for React Teams`;
const description = `${APP_NAME} is an AI visual website builder for React and Next.js teams. Design with real components, edit code visually, and ship pull requests instead of prototypes.`;

export const metadata: Metadata = {
    metadataBase: new URL(`https://${APP_DOMAIN}`),
    title,
    description,
    icons: [
        { rel: 'icon', url: '/favicon.svg', type: 'image/svg+xml' },
        { rel: 'icon', url: '/favicon.png', type: 'image/png' },
    ],
    openGraph: {
        url: `https://${APP_DOMAIN}/`,
        type: 'website',
        siteName: APP_NAME,
        title,
        description,
        images: [
            {
                url: absoluteUrl('/og-image.png'),
                width: 1200,
                height: 630,
                alt: `${APP_NAME} visual editor preview`,
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [
            {
                url: absoluteUrl('/og-image.png'),
                width: 1200,
                height: 630,
                alt: `${APP_NAME} visual editor preview`,
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
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
                />
            </head>
            <body>
                {isProduction && (
                    <>
                        <Script
                            src="https://z.weblab.build/cdn-cgi/zaraz/i.js"
                            strategy="lazyOnload"
                        />
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
