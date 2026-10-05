'use client';

import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { Icons } from '@weblab/ui/icons';

import { SplitText } from '@/components/motion/split-text';
import { LOCAL_APP_DOWNLOAD_URL } from '@/lib/site-mode';
import { AnimatedButton } from '../landing-page/animated';

/**
 * Local-app mode hero intro (docs/guides/local-app-mode.md): centered title,
 * one line of copy and a direct Mac download. Replaces the prompt card and
 * sign-up CTAs, which stay in the code for cloud mode.
 */
export function LocalAppHeroIntro() {
    const t = useTranslations('localApp.hero');
    return (
        <section className="flex w-full max-w-3xl flex-col items-center gap-5 px-4 text-center sm:px-6 md:px-8">
            <SplitText
                as="h1"
                mode="mount"
                stagger={0.06}
                duration={0.6}
                className="heading-style-h1 text-center text-balance"
            >
                {t('title')}
            </SplitText>
            <motion.p
                className="text-foreground-secondary max-w-xl text-sm leading-[1.4] text-balance md:text-base"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.15, ease: 'easeOut' }}
            >
                {t('subtitle')}
            </motion.p>
            <motion.div
                className="flex flex-col items-center gap-2"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3, ease: 'easeOut' }}
            >
                <AnimatedButton
                    href={LOCAL_APP_DOWNLOAD_URL}
                    variant="default"
                    className="h-10 rounded-full px-5 text-sm"
                    leadingIcon={<Icons.Download className="h-4 w-4" />}
                >
                    {t('download')}
                </AnimatedButton>
                <p className="text-foreground-tertiary text-xs">{t('requirements')}</p>
            </motion.div>
        </section>
    );
}
