'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

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
        child: <BrandLogo className="h-5" />,
    },
];

export const TopBar = () => {
    const currentPath = usePathname();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const t = useTranslations('nav');

    return (
        <div className="text-foreground-secondary relative mx-auto flex h-12 w-full max-w-[1400px] items-center justify-between px-4 text-sm select-none sm:px-6 md:px-8">
            {/* Left side */}
            <div className="text-foreground-secondary flex items-center gap-4">
                {LINKS.map((link) => (
                    <Link
                        href={link.href}
                        key={link.href}
                        aria-label={link.href === Routes.HOME ? t('brandHomeAria') : undefined}
                        className={cn(
                            'transition-opacity duration-150 hover:opacity-70',
                            currentPath === link.href && 'text-foreground-primary',
                            link.href === Routes.HOME && 'py-4 pr-2',
                        )}
                    >
                        {link.child}
                    </Link>
                ))}

                <div className="lg:hidden">
                    <GitHubButton />
                </div>

                {/* Desktop dropdowns - hidden on mobile/tablet */}
                <div className="ml-3 hidden items-center gap-5 lg:flex">
                    {NAVIGATION_CATEGORIES.filter(
                        (c) => c.labelKey !== 'nav.categories.product.label',
                    ).map((category) => (
                        <DropdownMenu
                            key={category.labelKey}
                            labelKey={category.labelKey}
                            links={category.links}
                        />
                    ))}
                    <GitHubButton />
                </div>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2">
                {/* Auth button - hidden on mobile/tablet */}
                <div className="hidden lg:block">
                    <AuthButton />
                </div>

                {/* Mobile menu */}
                <MobileMenu isOpen={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen} />
            </div>
        </div>
    );
};
