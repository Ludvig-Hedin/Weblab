import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

import { absoluteUrl } from '@/app/seo';

type OgType = 'website' | 'article';

interface PageMetadataOptions {
    pageKey: string;
    path: string;
    keywords?: string[];
    ogType?: OgType;
}

const LOCALE_TAG: Record<string, string> = {
    en: 'en_US',
    sv: 'sv_SE',
    es: 'es_ES',
    ja: 'ja_JP',
    ko: 'ko_KR',
    zh: 'zh_CN',
};

export async function buildPageMetadata({
    pageKey,
    path,
    keywords,
    ogType = 'website',
}: PageMetadataOptions): Promise<Metadata> {
    const [locale, tFn] = await Promise.all([
        getLocale(),
        getTranslations(`seo.${pageKey}` as never),
    ]);
    const t = tFn as unknown as (key: string) => string;
    const title = t('title');
    const description = t('description');
    const ogAlt = t('ogImageAlt');
    const url = `https://${APP_DOMAIN}${path}`;
    const ogLocale = LOCALE_TAG[locale] ?? LOCALE_TAG.en;

    return {
        title,
        description,
        ...(keywords && { keywords }),
        openGraph: {
            url,
            type: ogType,
            siteName: APP_NAME,
            locale: ogLocale,
            title,
            description,
            images: [
                {
                    url: absoluteUrl('/og-image.png'),
                    width: 1200,
                    height: 630,
                    alt: ogAlt,
                },
            ],
        },
        twitter: {
            card: 'summary_large_image',
            site: '@weblab',
            creator: '@weblab',
            title,
            description,
            images: [
                {
                    url: absoluteUrl('/og-image.png'),
                    width: 1200,
                    height: 630,
                    alt: ogAlt,
                },
            ],
        },
        alternates: {
            canonical: url,
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
    };
}
