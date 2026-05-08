'use client';

import { useEffect } from 'react';
import * as Portal from '@radix-ui/react-portal';
import { AnimatePresence, motion } from 'motion/react';

import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@weblab/ui/accordion';
import { cn } from '@weblab/ui/utils';

import { NAVIGATION_CATEGORIES } from '@/utils/constants/navigation';

interface MobileMenuProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}

export function MobileMenu({ isOpen, onOpenChange }: MobileMenuProps) {
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
                aria-label={isOpen ? 'Close menu' : 'Open menu'}
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

                            <div className="flex flex-1 flex-col overflow-y-auto px-6 pt-4 pb-10">
                                <Accordion type="single" collapsible className="w-full">
                                    {NAVIGATION_CATEGORIES.map((category, i) => (
                                        <motion.div
                                            key={category.label}
                                            initial={{ opacity: 0, y: 14 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{
                                                delay: i * 0.05 + 0.06,
                                                ease: 'easeOut',
                                                duration: 0.22,
                                            }}
                                        >
                                            <AccordionItem
                                                value={category.label}
                                                className="border-foreground/[0.08] border-b last:border-0"
                                            >
                                                <AccordionTrigger className="py-4 hover:no-underline [&>svg]:hidden">
                                                    <span className="text-foreground-primary text-[1.75rem] font-light leading-none tracking-tight">
                                                        {category.label}
                                                    </span>
                                                </AccordionTrigger>
                                                <AccordionContent className="bg-transparent">
                                                    <div className="flex flex-col pb-2">
                                                        {category.links.map((link) => (
                                                            <a
                                                                key={link.href}
                                                                href={link.href}
                                                                onClick={() => onOpenChange(false)}
                                                                className="text-foreground-secondary hover:text-foreground-primary flex flex-col rounded-lg px-2 py-2.5 transition-all hover:bg-white/5 active:scale-[0.99] active:opacity-80"
                                                                {...(link.external && {
                                                                    target: '_blank',
                                                                    rel: 'noopener noreferrer',
                                                                })}
                                                            >
                                                                <span className="text-sm font-medium">
                                                                    {link.title}
                                                                </span>
                                                                <span className="text-foreground-tertiary mt-0.5 text-xs">
                                                                    {link.description}
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
                                        Get Started
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
