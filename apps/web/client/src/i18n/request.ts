import type { IntlError } from 'next-intl';
import { cookies, headers } from 'next/headers';
import { IntlErrorCode } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';

import { Language } from '@weblab/constants';

type MessageNode = string | { [key: string]: MessageNode } | MessageNode[];

function isPlainObject(value: unknown): value is Record<string, MessageNode> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeMessages(
    base: Record<string, MessageNode>,
    overrides: Record<string, MessageNode>,
): Record<string, MessageNode> {
    const result: Record<string, MessageNode> = { ...base };
    for (const [key, overrideValue] of Object.entries(overrides)) {
        const baseValue = base[key];
        if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
            result[key] = mergeMessages(baseValue, overrideValue);
        } else {
            result[key] = overrideValue;
        }
    }
    return result;
}

const intlBehaviorConfig = {
    onError(error: IntlError) {
        if (error.code === IntlErrorCode.MISSING_MESSAGE) {
            return;
        }
        console.error(error);
    },
    getMessageFallback({ key, namespace }: { key: string; namespace?: string }) {
        return [namespace, key].filter(Boolean).join('.');
    },
};

export default getRequestConfig(async () => {
    const locale = await getLanguage();
    const enMessages = (await import(`../../messages/en.json`)).default;

    if (locale === Language.English) {
        return { locale, messages: enMessages, ...intlBehaviorConfig };
    }

    const localeMessages = (await import(`../../messages/${locale}.json`)).default;
    return {
        locale,
        messages: mergeMessages(enMessages, localeMessages),
        ...intlBehaviorConfig,
    };
});

export async function getLanguage(): Promise<Language> {
    const cookieStore = await cookies();
    const locale = cookieStore.get('NEXT_LOCALE');

    if (locale && (Object.values(Language) as string[]).includes(locale.value)) {
        return locale.value as Language;
    }
    return detectLanguage();
}

async function detectLanguage(): Promise<Language> {
    const headersList = await headers();
    const acceptLanguage = headersList.get('accept-language') || '';

    // Try to find a matching language from header preferences
    for (const lang of acceptLanguage.split(',')) {
        // Get base language code (e.g., 'en' from 'en-US')
        const langCode = lang.split('-')[0];

        if (Object.values(Language).includes(langCode as Language)) {
            return langCode as Language;
        }
    }
    return Language.English;
}
