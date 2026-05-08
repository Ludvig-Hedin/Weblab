'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import { type NavigationLink } from '@/utils/constants/navigation';

interface DropdownMenuProps {
    label: string;
    links: NavigationLink[];
}

export function DropdownMenu({ label, links }: DropdownMenuProps) {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

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

    const handleToggle = () => {
        setIsOpen(!isOpen);
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
                onClick={handleToggle}
                className={cn(
                    'text-foreground-secondary hover:text-foreground-primary -mx-1 flex items-center gap-1 px-1 py-2 text-sm transition-colors duration-150',
                )}
            >
                {label}
                <motion.span
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="inline-flex"
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
                        <div className="bg-background-primary border-foreground-primary/10 min-w-[200px] rounded-lg border p-1 shadow-lg">
                            <ul className="space-y-1">
                                {links.map((link, i) => (
                                    <motion.li
                                        key={link.href}
                                        initial={{ opacity: 0, x: -4 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{
                                            duration: 0.12,
                                            delay: i * 0.03,
                                            ease: 'easeOut',
                                        }}
                                    >
                                        <motion.a
                                            href={link.href}
                                            target={link.external ? '_blank' : undefined}
                                            rel={link.external ? 'noopener noreferrer' : undefined}
                                            className="hover:bg-foreground-primary/5 active:bg-foreground-primary/10 block rounded-md px-2 py-2 transition-colors duration-100"
                                            whileHover={{ x: 2 }}
                                            transition={{ duration: 0.12 }}
                                            onClick={() => setIsOpen(false)}
                                        >
                                            <div className="text-regular text-foreground-primary">
                                                {link.title}
                                            </div>
                                            <div className="text-small text-foreground-tertiary">
                                                {link.description}
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
