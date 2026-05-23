'use client';

import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

export function HighDemand() {
    const t = useTranslations('landing.hero');
    // TODO: Use feature flags
    const isHighDemand = false;

    if (!isHighDemand) {
        return null;
    }

    return (
        <motion.p
            className="border-foreground-warning bg-foreground-warning/20 text-foreground-warning mt-2 max-w-xl rounded-xl border p-2 px-4 text-center text-sm"
            initial={{ opacity: 0, filter: 'blur(4px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            transition={{ duration: 0.6, delay: 0.15, ease: 'easeOut' }}
            style={{ willChange: 'opacity, filter', transform: 'translateZ(0)' }}
        >
            {t('highDemand')}
        </motion.p>
    );
}
