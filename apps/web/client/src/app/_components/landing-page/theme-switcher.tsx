'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';

type ThemeOption = 'system' | 'light' | 'dark';
const OPTIONS: ThemeOption[] = ['system', 'light', 'dark'];

export function ThemeSwitcher() {
    const { theme, setTheme, resolvedTheme } = useTheme();
    const t = useTranslations('landing.footer.themeSwitcher');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const current = (theme ?? 'system') as ThemeOption;
    const effective = (resolvedTheme ?? 'dark') as 'light' | 'dark';

    const TriggerIcon =
        !mounted || current === 'system'
            ? effective === 'light'
                ? Icons.Sun
                : Icons.Moon
            : current === 'light'
              ? Icons.Sun
              : Icons.Moon;

    const labelFor = (opt: ThemeOption) => t(opt);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t('label')}
                    className="text-foreground-tertiary hover:text-foreground-primary h-auto gap-1.5 px-2 py-1 text-small font-normal"
                >
                    <TriggerIcon className="h-3.5 w-3.5" />
                    <span>{mounted ? labelFor(current) : labelFor('system')}</span>
                    <Icons.ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[10rem]">
                {OPTIONS.map((opt) => {
                    const isActive = mounted && current === opt;
                    const Icon =
                        opt === 'system'
                            ? Icons.Laptop
                            : opt === 'light'
                              ? Icons.Sun
                              : Icons.Moon;
                    return (
                        <DropdownMenuItem
                            key={opt}
                            onSelect={() => setTheme(opt)}
                            className="flex items-center justify-between gap-4"
                        >
                            <span className="flex items-center gap-2">
                                <Icon className="h-3.5 w-3.5 opacity-80" />
                                {labelFor(opt)}
                            </span>
                            {isActive ? (
                                <Icons.Check className="h-3.5 w-3.5 opacity-80" />
                            ) : null}
                        </DropdownMenuItem>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
