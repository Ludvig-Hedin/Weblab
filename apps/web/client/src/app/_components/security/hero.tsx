'use client';

import { useTranslations } from 'next-intl';

import { BrandSymbol } from '@weblab/ui/brand';
import { Icons } from '@weblab/ui/icons';

import { Hero7 } from '@/components/hero7';

export function SecurityHero() {
    const t = useTranslations('security.hero');

    return (
        <Hero7
            eyebrow={t('eyebrow')}
            eyebrowIcon={<Icons.LockClosed className="h-3.5 w-3.5" />}
            heading={t('title')}
            description={t('subtitle')}
            primaryButton={{
                text: t('ctaSubprocessors'),
                href: '#subprocessors',
            }}
            secondaryButton={{
                text: t('ctaReport'),
                href: '#contact',
                icon: <Icons.ArrowRight className="h-3.5 w-3.5" />,
            }}
            backdrop={
                <BrandSymbol className="text-foreground-primary h-[28rem] w-[28rem] sm:h-[36rem] sm:w-[36rem]" />
            }
        />
    );
}
