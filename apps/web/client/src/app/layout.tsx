import '@/styles/globals.css';
import '@weblab/ui/globals.css';

import { type Metadata } from 'next';
import { Inter } from 'next/font/google';
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
import { SWRegister } from './_components/sw-register';
import { ThemeProvider } from './_components/theme';
import { AuthProvider } from './auth/auth-context';
import { absoluteUrl, organizationSchema, softwareApplicationSchema, websiteSchema } from './seo';

const isProduction = env.NODE_ENV === 'production';

const title = `${APP_NAME} - AI Visual Website Builder for React Teams`;
const titleTemplate = `%s | ${APP_NAME}`;
const description = `${APP_NAME} is an AI visual website builder for React and Next.js teams. Design with real components, edit code visually, and ship pull requests instead of prototypes.`;
const keywords = [
    'Weblab',
    'AI visual website builder',
    'visual website builder',
    'visual site builder',
    'website builder',
    'React visual editor',
    'visual editor for React',
    'Next.js visual builder',
    'AI website builder',
    'visual code editor',
    'design to code',
    'AI design tool',
    'Figma to React',
    'open source website builder',
    'visual builder for developers',
];

export const metadata: Metadata = {
    metadataBase: new URL(`https://${APP_DOMAIN}`),
    title: {
        default: title,
        template: titleTemplate,
    },
    description,
    applicationName: APP_NAME,
    keywords,
    authors: [{ name: APP_NAME, url: `https://${APP_DOMAIN}` }],
    creator: APP_NAME,
    publisher: APP_NAME,
    category: 'Software',
    alternates: {
        canonical: `https://${APP_DOMAIN}/`,
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
    icons: [
        { rel: 'icon', url: '/favicon.svg', type: 'image/svg+xml' },
        { rel: 'icon', url: '/favicon.png', type: 'image/png' },
        { rel: 'apple-touch-icon', url: '/favicon.png' },
    ],
    manifest: '/manifest.webmanifest',
    openGraph: {
        url: `https://${APP_DOMAIN}/`,
        type: 'website',
        siteName: APP_NAME,
        locale: 'en_US',
        title,
        description,
        images: [
            {
                url: absoluteUrl('/og-image.png'),
                width: 1200,
                height: 630,
                alt: `${APP_NAME} — AI visual website builder for React teams`,
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title,
        description,
        site: '@weblab',
        creator: '@weblab',
        images: [
            {
                url: absoluteUrl('/og-image.png'),
                width: 1200,
                height: 630,
                alt: `${APP_NAME} — AI visual website builder for React teams`,
            },
        ],
    },
    formatDetection: {
        telephone: false,
        email: false,
        address: false,
    },
};

const inter = Inter({
    subsets: ['latin'],
    variable: '--font-inter',
});

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    const locale = await getLocale();

    return (
        <html lang={locale || 'en'} className={inter.variable} suppressHydrationWarning>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
                />
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
                />
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify(softwareApplicationSchema),
                    }}
                />
            </head>
            <body>
                {isProduction && <RB2BLoader />}
                <SWRegister />
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
