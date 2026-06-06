'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useMutation } from 'convex/react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';

import { useHasAuthCookie } from '@/hooks/use-has-auth-cookie';

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

    // Persist the choice for signed-in visitors. On its own `setTheme` only
    // nudges next-themes in memory; `AppearanceProvider` treats the saved DB
    // setting as authoritative and re-applies it on the next load/render, so
    // an unpersisted footer pick silently reverts. Writing it back keeps the
    // footer in agreement with the settings → appearance tab.
    const hasAuthCookie = useHasAuthCookie();
    const updateSettings = useMutation(api.users.updateSettings);

    useEffect(() => {
        setMounted(true);
    }, []);

    const current = (mounted ? (theme ?? 'system') : 'system') as ThemeOption;
    const CurrentIcon = OPTIONS.find((o) => o.value === current)?.Icon ?? Icons.Laptop;

    const handleSelect = useCallback(
        (value: ThemeOption) => {
            // Apply instantly via next-themes (updates the <html> class + this
            // control), then persist so it survives reloads for signed-in users.
            setTheme(value);
            if (hasAuthCookie === true) {
                void updateSettings({ theme: value }).catch((error) => {
                    console.error('Failed to persist theme preference', error);
                });
            }
        },
        [setTheme, hasAuthCookie, updateSettings],
    );

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
                            onSelect={() => handleSelect(value)}
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
