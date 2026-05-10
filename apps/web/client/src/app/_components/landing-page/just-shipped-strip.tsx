'use client';

import Link from 'next/link';
import { motion } from 'motion/react';

import { Icons } from '@weblab/ui/icons';

import { CHANGELOG_ENTRIES } from '@/lib/changelog-entries';
import { Routes } from '@/utils/constants';

export function JustShippedStrip() {
    const latest = CHANGELOG_ENTRIES[0];
    if (!latest) return null;

    return (
        <div className="pointer-events-auto relative z-20 flex w-full justify-center px-4 pb-4">
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.7, ease: 'easeOut' }}
            >
                <Link
                    href={Routes.CHANGELOG}
                    className="group border-foreground-primary/10 hover:border-foreground-primary/30 bg-background-secondary/40 inline-flex items-center gap-3 rounded-full border px-4 py-1.5 text-xs backdrop-blur-md transition-colors"
                >
                    <span className="bg-foreground-weblab/15 text-foreground-weblab rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide uppercase">
                        New in v{latest.version}
                    </span>
                    <span className="text-foreground-secondary group-hover:text-foreground-primary transition-colors">
                        {latest.title}
                    </span>
                    <Icons.ArrowRight className="text-foreground-tertiary group-hover:text-foreground-primary h-3 w-3 transition-colors" />
                </Link>
            </motion.div>
        </div>
    );
}
