import React from 'react';
import { useTranslations } from 'next-intl';

import { APP_NAME } from '@weblab/constants';
import { Icons } from '@weblab/ui/icons';

import { Routes } from '@/utils/constants';
import { ButtonLink } from '../button-link';
import { FAQDropdown } from './faq-dropdown';

interface FAQ {
    question: string;
    answer: string | React.ReactNode;
}

interface FAQSectionProps {
    faqs?: FAQ[];
    title?: string;
    buttonText?: string;
    buttonHref?: string;
    className?: string;
}

const FAQ_KEYS = [
    'what',
    'differentDesign',
    'differentAi',
    'code',
    'collaborate',
    'stack',
    'free',
    'ownership',
] as const;

export function FAQSection({
    faqs,
    title,
    buttonText,
    buttonHref = Routes.FAQ,
    className = '',
}: FAQSectionProps) {
    const t = useTranslations('landing.faq') as (
        key: string,
        values?: Record<string, string>,
    ) => string;

    const resolvedFaqs: FAQ[] =
        faqs ??
        FAQ_KEYS.map((key) => ({
            question: t(`items.${key}.question`, { appName: APP_NAME }),
            answer: t(`items.${key}.answer`, { appName: APP_NAME }),
        }));

    const resolvedTitle = title ?? `${t('titleLine1')}\n${t('titleLine2')}`;
    const resolvedButton = buttonText ?? t('readMore');

    return (
        <div
            className={`bg-background w-full px-4 py-24 sm:px-6 md:px-8 md:py-48 ${className}`}
            id="faq"
        >
            <div className="mx-auto flex max-w-6xl flex-col items-start gap-16 sm:gap-24 md:flex-row md:gap-12">
                <div className="flex flex-1 flex-col items-start">
                    <h2 className="heading-style-h2 text-foreground-primary mt-4 mb-12 max-w-3xl text-balance">
                        {resolvedTitle.split('\n').map((line, index) => (
                            <React.Fragment key={index}>
                                {line}
                                {index < resolvedTitle.split('\n').length - 1 && <br />}
                            </React.Fragment>
                        ))}
                    </h2>
                    <ButtonLink
                        href={buttonHref}
                        rightIcon={<Icons.ArrowRight className="h-5 w-5" />}
                    >
                        {resolvedButton}
                    </ButtonLink>
                </div>
                <div className="flex flex-1 flex-col gap-6">
                    <FAQDropdown faqs={resolvedFaqs} />
                </div>
            </div>
        </div>
    );
}
