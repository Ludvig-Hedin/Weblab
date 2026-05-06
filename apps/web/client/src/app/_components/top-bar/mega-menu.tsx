'use client';

import { useEffect, useRef, useState } from 'react';

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

    // Handle click outside to close menu
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
                // Only auto-open on hover for desktop
                if (window.innerWidth >= 768) {
                    setIsOpen(true);
                }
            }}
            onMouseLeave={() => {
                // Only auto-close on mouse leave for desktop
                if (window.innerWidth >= 768) {
                    setIsOpen(false);
                }
            }}
        >
            <button
                onClick={handleToggle}
                className="text-foreground-secondary -mx-1 flex items-center gap-1 px-1 py-2 text-sm hover:opacity-80 active:opacity-60"
            >
                {label}
                <Icons.ChevronDown
                    className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')}
                />
            </button>

            {isOpen && (
                <div className="absolute top-full left-1/2 z-50 -translate-x-1/2 pt-2">
                    <div className="bg-background-primary border-foreground-primary/10 min-w-[200px] rounded-lg border p-1 shadow-lg">
                        <ul className="space-y-1">
                            {links.map((link) => (
                                <li key={link.href}>
                                    <a
                                        href={link.href}
                                        target={link.external ? '_blank' : undefined}
                                        rel={link.external ? 'noopener noreferrer' : undefined}
                                        className="hover:bg-foreground-primary/5 active:bg-foreground-primary/10 block rounded-md px-2 py-2 transition-colors"
                                        onClick={() => setIsOpen(false)}
                                    >
                                        <div className="text-regular text-foreground-primary">
                                            {link.title}
                                        </div>
                                        <div className="text-small text-foreground-tertiary">
                                            {link.description}
                                        </div>
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
}
