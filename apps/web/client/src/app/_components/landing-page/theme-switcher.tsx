'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';

type ThemeOption = 'system' | 'light' | 'dark';

const OPTIONS: {
    value: ThemeOption;
    Icon: React.ComponentType<{ className?: string }>;
}[] = [
    { value: 'system', Icon: Icons.Laptop },
    { value: 'light', Icon: Icons.Sun },
    { value: 'dark', Icon: Icons.Moon },
];

export function ThemeSwitcher() {
    const { theme, setTheme } = useTheme();
    const t = useTranslations('landing.footer.themeSwitcher');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const current = (mounted ? (theme ?? 'system') : 'system') as ThemeOption;
    const CurrentIcon = OPTIONS.find((o) => o.value === current)?.Icon ?? Icons.Laptop;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    aria-label={t('label')}
                    className="bg-foreground-primary/[0.07] text-small text-foreground-secondary hover:text-foreground-primary flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors duration-150 focus:outline-none"
                >
                    <CurrentIcon className="h-3.5 w-3.5 shrink-0" />
                    <span>{t(current)}</span>
                    <Icons.ChevronDown className="h-3 w-3 opacity-60" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[10rem]">
                {OPTIONS.map(({ value, Icon }) => {
                    const isActive = current === value;
                    return (
                        <DropdownMenuItem
                            key={value}
                            onSelect={() => setTheme(value)}
                            className="flex items-center justify-between gap-4"
                        >
                            <span className="flex items-center gap-2">
                                <Icon className="h-3.5 w-3.5 opacity-80" />
                                {t(value)}
                            </span>
                            {isActive ? <Icons.Check className="h-3.5 w-3.5 opacity-80" /> : null}
                        </DropdownMenuItem>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
