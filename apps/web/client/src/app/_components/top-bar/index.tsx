'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { BrandLogo } from '@weblab/ui/brand';
import { cn } from '@weblab/ui/utils';

import { Routes } from '@/utils/constants';
import { NAVIGATION_CATEGORIES } from '@/utils/constants/navigation';
import { GitHubButton } from './github';
import { DropdownMenu } from './mega-menu';
import { MobileMenu } from './mobile-menu';
import { AuthButton } from './user';

const LINKS = [
    {
        href: Routes.HOME,
        child: <BrandLogo className="h-4" />,
    },
];

export const TopBar = () => {
    const currentPath = usePathname();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    return (
        <div className="text-foreground-secondary relative mx-auto flex h-12 w-full max-w-6xl items-center justify-between p-3 text-sm select-none">
            {/* Left side */}
            <div className="text-foreground-secondary flex items-center gap-4">
                {LINKS.map((link) => (
                    <Link
                        href={link.href}
                        key={link.href}
                        className={cn(
                            'hover:opacity-80',
                            currentPath === link.href && 'text-foreground-primary',
                            link.href === Routes.HOME && 'py-4 pr-2',
                        )}
                    >
                        {link.child}
                    </Link>
                ))}

                <div className="md:hidden">
                    <GitHubButton />
                </div>

                {/* Desktop dropdowns - hidden on mobile */}
                <div className="ml-3 hidden items-center gap-5 md:flex">
                    {NAVIGATION_CATEGORIES.map((category) => (
                        <DropdownMenu
                            key={category.label}
                            label={category.label}
                            links={category.links}
                        />
                    ))}
                    <GitHubButton />
                </div>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2">
                {/* Auth button - hidden on mobile */}
                <div className="hidden md:block">
                    <AuthButton />
                </div>

                {/* Mobile menu */}
                <MobileMenu isOpen={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen} />
            </div>
        </div>
    );
};
