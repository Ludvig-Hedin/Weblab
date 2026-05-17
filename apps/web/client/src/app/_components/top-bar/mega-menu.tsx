'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslations } from 'next-intl';

import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import { type NavigationLink } from '@/utils/constants/navigation';

interface DropdownMenuProps {
    labelKey: string;
    links: NavigationLink[];
}

export function DropdownMenu({ labelKey, links }: DropdownMenuProps) {
    const t = useTranslations() as (key: string) => string;
    const label = t(labelKey);
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const firstItemRef = useRef<HTMLAnchorElement>(null);
    const menuId = useId();

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsOpen(false);
                triggerRef.current?.focus();
            }
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [isOpen]);

    const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setIsOpen(true);
            // Focus first item on next tick so it's mounted.
            requestAnimationFrame(() => firstItemRef.current?.focus());
        }
    };

    return (
        <div
            ref={menuRef}
            className="relative"
            onMouseEnter={() => {
                if (window.innerWidth >= 768) {
                    setIsOpen(true);
                }
            }}
            onMouseLeave={() => {
                if (window.innerWidth >= 768) {
                    setIsOpen(false);
                }
            }}
        >
            <button
                ref={triggerRef}
                type="button"
                aria-haspopup="menu"
                aria-expanded={isOpen}
                aria-controls={menuId}
                onClick={() => setIsOpen((v) => !v)}
                onKeyDown={handleTriggerKeyDown}
                className={cn(
                    'text-foreground-secondary hover:text-foreground-primary focus-visible:text-foreground-primary focus-visible:outline-foreground-primary/40 -mx-1 flex items-center gap-1 px-1 py-2 text-sm transition-colors duration-150 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2',
                )}
            >
                {label}
                <motion.span
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="inline-flex"
                    aria-hidden="true"
                >
                    <Icons.ChevronDown className="h-4 w-4" />
                </motion.span>
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.97 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                        className="absolute top-full left-1/2 z-50 -translate-x-1/2 pt-2"
                    >
                        <div
                            id={menuId}
                            role="menu"
                            aria-label={label}
                            className="bg-background-primary border-foreground/8 min-w-[200px] rounded-lg border p-1 shadow-lg"
                        >
                            <ul className="space-y-1">
                                {links.map((link, i) => (
                                    <motion.li
                                        key={link.href}
                                        role="none"
                                        initial={{ opacity: 0, x: -4 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{
                                            duration: 0.12,
                                            delay: i * 0.03,
                                            ease: 'easeOut',
                                        }}
                                    >
                                        <motion.a
                                            ref={i === 0 ? firstItemRef : undefined}
                                            role="menuitem"
                                            href={link.href}
                                            target={link.external ? '_blank' : undefined}
                                            rel={link.external ? 'noopener noreferrer' : undefined}
                                            className="hover:bg-foreground-primary/5 focus-visible:bg-foreground-primary/5 focus-visible:outline-foreground-primary/40 active:bg-foreground-primary/10 block rounded-md px-2 py-2 transition-colors duration-150 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1"
                                            whileHover={{ x: 2 }}
                                            transition={{ duration: 0.12 }}
                                            onClick={() => setIsOpen(false)}
                                        >
                                            <div className="text-regular text-foreground-primary">
                                                {t(link.titleKey)}
                                            </div>
                                            <div className="text-small text-foreground-tertiary">
                                                {t(link.descriptionKey)}
                                            </div>
                                        </motion.a>
                                    </motion.li>
                                ))}
                            </ul>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
