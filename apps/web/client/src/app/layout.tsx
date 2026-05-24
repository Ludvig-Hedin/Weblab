import '@/styles/globals.css';
import '@weblab/ui/globals.css';

import { type Metadata } from 'next';
import { Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';

import { APP_DOMAIN, APP_NAME } from '@weblab/constants';
import { Toaster } from '@weblab/ui/sonner';

import { ClerkConvexProviders } from '@/components/clerk-convex-providers';
import RB2BLoader from '@/components/rb2b-loader';
import { TelemetryProvider } from '@/components/telemetry-provider';
import { AppearanceProvider } from '@/components/ui/appearance-provider';
import { env } from '@/env';
import { FeatureFlagsProvider } from '@/hooks/use-feature-flags';
import { AppQueryClientProvider } from '@/components/query-client-provider';
import { CookieConsent } from './_components/cookie-consent';
import { SWRegister } from './_components/sw-register';
import { ThemeProvider } from './_components/theme';
import { ViewTransitionNoiseSuppress } from './_components/view-transition-noise-suppress';
import { AuthProvider } from './auth/auth-context';
import { absoluteUrl, organizationSchema, softwareApplicationSchema, websiteSchema } from './seo';

const isProduction = env.NODE_ENV === 'production';

const titleTemplate = `%s`;
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

const LOCALE_TAG: Record<string, string> = {
    en: 'en_US',
    sv: 'sv_SE',
    es: 'es_ES',
    ja: 'ja_JP',
    ko: 'ko_KR',
    zh: 'zh_CN',
};

export async function generateMetadata(): Promise<Metadata> {
    const [locale, t] = await Promise.all([getLocale(), getTranslations('seo.root')]);
    const title = t('title');
    const description = t('description');
    const ogAlt = t('ogImageAlt');
    const ogLocale = LOCALE_TAG[locale] ?? LOCALE_TAG.en;

    return {
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
            locale: ogLocale,
            title,
            description,
            images: [
                {
                    url: absoluteUrl('/assets/web-preview.webp'),
                    width: 1200,
                    height: 630,
                    alt: ogAlt,
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
                    url: absoluteUrl('/assets/web-preview.webp'),
                    width: 1200,
                    height: 630,
                    alt: ogAlt,
                },
            ],
        },
        formatDetection: {
            telephone: false,
            email: false,
            address: false,
        },
    };
}

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
                {/* Desktop (Electron) chrome wiring.

                    The inline <script> promotes the `weblabDesktop` preload
                    bridge into a root data attribute *before* React hydrates,
                    so drag-region CSS applies on the first paint instead of
                    flashing in after useEffect. The preload always runs ahead
                    of any renderer scripts, so the bridge is reliably present
                    when this tag executes.

                    The inline <style> ships the drag rules as raw CSS so
                    Tailwind v4's Lightning CSS pipeline doesn't strip the
                    non-standard `-webkit-app-region` property the way it does
                    when these rules live in globals.css. The selectors mark
                    the chrome container *and* its non-interactive descendants
                    as drag, then carve out every interactive role/element as
                    `no-drag` so clicks still land. */}
                <script
                    dangerouslySetInnerHTML={{
                        __html: `(function(){var b=window.weblabDesktop;if(!b||b.target!=='desktop')return;var r=document.documentElement;r.dataset.desktop='true';if(b.platform)r.dataset.desktopPlatform=b.platform;function addStrip(){if(!document.body||document.getElementById('weblab-desktop-drag-fallback'))return;var s=document.createElement('div');s.id='weblab-desktop-drag-fallback';s.className='desktop-drag-region';s.style.cssText='position:fixed;top:0;left:0;right:0;height:38px;z-index:2147483646;pointer-events:none;';document.body.appendChild(s);}function schedule(){setTimeout(addStrip,0);}if(document.readyState==='complete'){schedule();}else{window.addEventListener('load',schedule);}})();`,
                    }}
                />
                <style
                    dangerouslySetInnerHTML={{
                        __html: `
[data-desktop='true'] :is(.top-bar, .desktop-drag-region),
[data-desktop='true'] :is(.top-bar, .desktop-drag-region) :is(div, span, h1, h2, h3, h4, h5, h6, p, section, header, nav, img, svg, ul, ol, li) {
  -webkit-app-region: drag;
  app-region: drag;
}
[data-desktop='true'] :is(.top-bar, .desktop-drag-region) :is(a, button, [role='button'], [role='menuitem'], [role='tab'], [role='switch'], [role='link'], [role='combobox'], input, select, textarea, [contenteditable='true'], [contenteditable='']),
[data-desktop='true'] .desktop-no-drag {
  -webkit-app-region: no-drag;
  app-region: no-drag;
}
[data-desktop='true'][data-desktop-platform='darwin']:not([data-desktop-fullscreen='true']) :is(.top-bar, .desktop-drag-region) {
  padding-left: 80px;
}
`,
                    }}
                />
                {/* Pre-warm connections to third-party origins reached on first paint /
                    first click (OAuth, Supabase, docs subdomain, UnicornStudio CDN). */}
                <link rel="preconnect" href="https://accounts.google.com" />
                <link rel="preconnect" href="https://github.com" />
                <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
                <link rel="dns-prefetch" href="https://docs.weblab.build" />
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify(organizationSchema),
                    }}
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
                <ViewTransitionNoiseSuppress />
                <ClerkConvexProviders>
                    <AppQueryClientProvider>
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
                                                <CookieConsent />
                                            </NextIntlClientProvider>
                                        </AuthProvider>
                                    </AppearanceProvider>
                                </ThemeProvider>
                            </TelemetryProvider>
                        </FeatureFlagsProvider>
                    </AppQueryClientProvider>
                </ClerkConvexProviders>
            </body>
        </html>
    );
}
