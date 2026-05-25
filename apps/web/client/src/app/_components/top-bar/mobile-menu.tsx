'use client';

import { useEffect } from 'react';
import * as Portal from '@radix-ui/react-portal';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@weblab/ui/accordion';
import { cn } from '@weblab/ui/utils';

import { NAVIGATION_CATEGORIES } from '@/utils/constants/navigation';

interface MobileMenuProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}

export function MobileMenu({ isOpen, onOpenChange }: MobileMenuProps) {
    const t = useTranslations() as (key: string) => string;
    useEffect(() => {
        if (isOpen) {
            document.body.classList.add('overflow-hidden');
        } else {
            document.body.classList.remove('overflow-hidden');
        }
        return () => {
            document.body.classList.remove('overflow-hidden');
        };
    }, [isOpen]);

    return (
        <>
            {/* Animated 2-line burger → X */}
            <button
                onClick={() => onOpenChange(!isOpen)}
                className="text-foreground-primary relative flex h-9 w-9 items-center justify-center rounded-full transition-opacity hover:opacity-70 active:scale-95 lg:hidden"
                aria-label={isOpen ? t('nav.mobileMenu.close') : t('nav.mobileMenu.open')}
            >
                <span
                    className={cn(
                        'absolute block h-[1.5px] w-[18px] bg-current transition-all duration-300 ease-in-out',
                        isOpen ? 'rotate-45' : '-translate-y-[3.5px]',
                    )}
                />
                <span
                    className={cn(
                        'absolute block h-[1.5px] w-[18px] bg-current transition-all duration-300 ease-in-out',
                        isOpen ? '-rotate-45' : 'translate-y-[3.5px]',
                    )}
                />
            </button>

            {/* Full-screen overlay */}
            <Portal.Root>
                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            className="bg-background fixed inset-0 flex flex-col lg:hidden"
                            style={{ zIndex: 49 }}
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.18, ease: 'easeOut' }}
                        >
                            {/* Matches navbar height */}
                            <div className="h-12 flex-shrink-0" />

                            <div className="flex flex-1 flex-col overflow-y-auto px-4 pt-8 pb-10 sm:px-6 md:px-8">
                                <Accordion
                                    type="single"
                                    collapsible
                                    className="border-foreground/10 w-full border-t"
                                >
                                    {NAVIGATION_CATEGORIES.map((category, i) => (
                                        <motion.div
                                            key={category.labelKey}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{
                                                delay: i * 0.04 + 0.06,
                                                ease: 'easeOut',
                                                duration: 0.2,
                                            }}
                                        >
                                            <AccordionItem
                                                value={category.labelKey}
                                                className="border-foreground/10 border-b last:border-b"
                                            >
                                                <AccordionTrigger className="text-foreground-primary [&>svg]:text-foreground-tertiary py-3.5 hover:no-underline [&>svg]:size-4 [&>svg]:translate-y-0">
                                                    <span className="text-[1.25rem] leading-none font-light tracking-tight">
                                                        {t(category.labelKey)}
                                                    </span>
                                                </AccordionTrigger>
                                                <AccordionContent className="bg-transparent">
                                                    <div className="flex flex-col gap-0.5 pb-2">
                                                        {category.links.map((link) => (
                                                            <a
                                                                key={link.href}
                                                                href={link.href}
                                                                onClick={() => onOpenChange(false)}
                                                                className="text-foreground-primary hover:text-foreground-primary hover:bg-foreground/[0.04] flex flex-col rounded-md px-2 py-2 transition-colors active:scale-[0.99]"
                                                                {...(link.external && {
                                                                    target: '_blank',
                                                                    rel: 'noopener noreferrer',
                                                                })}
                                                            >
                                                                <span className="text-sm font-medium">
                                                                    {t(link.titleKey)}
                                                                </span>
                                                                <span className="text-foreground-secondary mt-0.5 text-xs">
                                                                    {t(link.descriptionKey)}
                                                                </span>
                                                            </a>
                                                        ))}
                                                    </div>
                                                </AccordionContent>
                                            </AccordionItem>
                                        </motion.div>
                                    ))}
                                </Accordion>

                                <motion.div
                                    className="mt-auto pt-8"
                                    initial={{ opacity: 0, y: 14 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.22, ease: 'easeOut', duration: 0.22 }}
                                >
                                    <a
                                        href="/projects"
                                        onClick={() => onOpenChange(false)}
                                        className="bg-foreground-primary text-background block w-full rounded-full py-4 text-center text-base font-medium transition-all hover:opacity-90 active:scale-[0.97] active:opacity-80"
                                    >
                                        {t('nav.mobileMenu.getStarted')}
                                    </a>
                                </motion.div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </Portal.Root>
        </>
    );
}
