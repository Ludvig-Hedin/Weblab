'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';

import { Icons } from '@weblab/ui/icons';

type ThemeOption = 'system' | 'light' | 'dark';

const OPTIONS: { value: ThemeOption; Icon: React.ComponentType<{ className?: string }> }[] = [
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

    const current = (theme ?? 'system') as ThemeOption;

    return (
        <div
            className="bg-foreground-primary/[0.07] flex items-center gap-0.5 rounded-full px-1.5 py-1.5"
            role="group"
            aria-label={t('label')}
        >
            {OPTIONS.map(({ value, Icon }) => {
                const isActive = mounted && current === value;
                return (
                    <button
                        key={value}
                        type="button"
                        onClick={() => setTheme(value)}
                        aria-label={t(value)}
                        aria-pressed={isActive}
                        className={[
                            'flex h-6 w-6 cursor-pointer items-center justify-center rounded-full transition-colors duration-150',
                            isActive
                                ? 'bg-foreground-primary/20 text-foreground-primary'
                                : 'text-foreground-secondary hover:text-foreground-primary',
                        ].join(' ')}
                    >
                        <Icon className="h-3.5 w-3.5" />
                    </button>
                );
            })}
        </div>
    );
}
