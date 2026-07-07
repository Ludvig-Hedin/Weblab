'use client';

import { useCallback } from 'react';
import { api } from '@convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';

import { toast } from '@weblab/ui/sonner';
import { cn } from '@weblab/ui/utils';

type ThemeOption = 'light' | 'dark' | 'system';
type AccentOption = 'blue' | 'red' | 'green' | 'neutral';
type FontFamilyOption = 'sans' | 'serif';
type FontSizeOption = 'small' | 'medium' | 'large';

const ACCENT_COLORS: {
    value: AccentOption;
    bg: string;
    ring: string;
}[] = [
    {
        value: 'blue',
        bg: 'bg-[oklch(0.623_0.214_255)]',
        ring: 'ring-[oklch(0.623_0.214_255)]',
    },
    {
        value: 'red',
        bg: 'bg-[oklch(0.637_0.237_25.3)]',
        ring: 'ring-[oklch(0.637_0.237_25.3)]',
    },
    {
        value: 'green',
        bg: 'bg-[oklch(0.723_0.19_142.5)]',
        ring: 'ring-[oklch(0.723_0.19_142.5)]',
    },
    {
        value: 'neutral',
        bg: 'bg-[oklch(0.556_0_0)]',
        ring: 'ring-[oklch(0.556_0_0)]',
    },
];

function SegmentedControl<T extends string>({
    options,
    value,
    onChange,
}: {
    options: { value: T; label: string }[];
    value: T;
    onChange: (v: T) => void;
}) {
    return (
        <div className="border-border flex w-fit overflow-hidden rounded-md border">
            {options.map((opt) => (
                <button
                    key={opt.value}
                    type="button"
                    aria-pressed={value === opt.value}
                    onClick={() => onChange(opt.value)}
                    className={cn(
                        'text-regular px-3 py-1.5 transition-colors',
                        value === opt.value
                            ? 'bg-foreground text-background font-medium'
                            : 'text-foreground-secondary hover:text-foreground hover:bg-background-secondary',
                    )}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
}

export const AppearanceTab = observer(() => {
    const t = useTranslations();
    const userSettings = useQuery(api.users.getSettings);
    const updateSettingsMutation = useMutation(api.users.updateSettings);
    const { setTheme } = useTheme();

    // Literal-keyed lookup so next-intl can type-check each accent label
    // (passing a dynamic key string into t() loses the typed-message guarantee).
    const accentLabel: Record<AccentOption, string> = {
        blue: t('settings.appearance.accent.blue'),
        red: t('settings.appearance.accent.red'),
        green: t('settings.appearance.accent.green'),
        neutral: t('settings.appearance.accent.neutral'),
    };

    const update = useCallback(
        async (patch: Record<string, unknown>) => {
            // Optimistically apply data-* attrs, snapshotting prior values so we
            // can restore them if the mutation fails.
            const html = document.documentElement;
            const prevAccent = html.getAttribute('data-accent');
            const prevFontSize = html.getAttribute('data-font-size');
            const prevFontFamily = html.getAttribute('data-font-family');
            if ('accentColor' in patch)
                html.setAttribute('data-accent', patch.accentColor as string);
            if ('fontSize' in patch) html.setAttribute('data-font-size', patch.fontSize as string);
            if ('fontFamily' in patch)
                html.setAttribute('data-font-family', patch.fontFamily as string);
            if ('theme' in patch) setTheme(patch.theme as string);
            try {
                await updateSettingsMutation(patch as Parameters<typeof updateSettingsMutation>[0]);
            } catch (error) {
                // Restore the pre-mutation DOM state so the UI doesn't show a
                // change that didn't actually persist.
                console.error('Failed to update settings', error);
                if ('accentColor' in patch) {
                    if (prevAccent === null) html.removeAttribute('data-accent');
                    else html.setAttribute('data-accent', prevAccent);
                }
                if ('fontSize' in patch) {
                    if (prevFontSize === null) html.removeAttribute('data-font-size');
                    else html.setAttribute('data-font-size', prevFontSize);
                }
                if ('fontFamily' in patch) {
                    if (prevFontFamily === null) html.removeAttribute('data-font-family');
                    else html.setAttribute('data-font-family', prevFontFamily);
                }
                toast.error(t('settings.appearance.saveError'));
            }
        },
        [updateSettingsMutation, setTheme, t],
    );

    return (
        <div className="divide-border flex flex-col divide-y px-6">
            {/* Theme */}
            <section className="space-y-4 py-6">
                <div>
                    <h2 className="text-largePlus">{t('settings.appearance.theme.title')}</h2>
                    <p className="text-regular text-foreground-secondary">
                        {t('settings.appearance.theme.description')}
                    </p>
                </div>
                <SegmentedControl<ThemeOption>
                    options={[
                        { value: 'light', label: t('settings.appearance.theme.light') },
                        { value: 'dark', label: t('settings.appearance.theme.dark') },
                        { value: 'system', label: t('settings.appearance.theme.system') },
                    ]}
                    value={(userSettings?.theme ?? 'system') as ThemeOption}
                    onChange={(v) => void update({ theme: v })}
                />
            </section>

            {/* Accent color */}
            <section className="space-y-4 py-6">
                <div>
                    <h2 className="text-largePlus">{t('settings.appearance.accent.title')}</h2>
                    <p className="text-regular text-foreground-secondary">
                        {t('settings.appearance.accent.description')}
                    </p>
                </div>
                <div className="flex gap-3">
                    {ACCENT_COLORS.map((color) => (
                        <button
                            key={color.value}
                            type="button"
                            title={accentLabel[color.value]}
                            onClick={() => void update({ accentColor: color.value })}
                            className={cn(
                                'ring-offset-background h-7 w-7 rounded-full ring-2 ring-offset-2 transition-all',
                                color.bg,
                                userSettings?.accentColor === color.value
                                    ? color.ring
                                    : 'ring-transparent',
                            )}
                        />
                    ))}
                </div>
            </section>

            {/* Font family */}
            <section className="space-y-4 py-6">
                <div>
                    <h2 className="text-largePlus">{t('settings.appearance.fontFamily.title')}</h2>
                    <p className="text-regular text-foreground-secondary">
                        {t('settings.appearance.fontFamily.description')}
                    </p>
                </div>
                <SegmentedControl<FontFamilyOption>
                    options={[
                        { value: 'sans', label: t('settings.appearance.fontFamily.sans') },
                        { value: 'serif', label: t('settings.appearance.fontFamily.serif') },
                    ]}
                    value={(userSettings?.fontFamily ?? 'sans') as FontFamilyOption}
                    onChange={(v) => void update({ fontFamily: v })}
                />
            </section>

            {/* Font size */}
            <section className="space-y-4 py-6">
                <div>
                    <h2 className="text-largePlus">{t('settings.appearance.fontSize.title')}</h2>
                    <p className="text-regular text-foreground-secondary">
                        {t('settings.appearance.fontSize.description')}
                    </p>
                </div>
                <SegmentedControl<FontSizeOption>
                    options={[
                        { value: 'small', label: t('settings.appearance.fontSize.small') },
                        { value: 'medium', label: t('settings.appearance.fontSize.medium') },
                        { value: 'large', label: t('settings.appearance.fontSize.large') },
                    ]}
                    value={(userSettings?.fontSize ?? 'medium') as FontSizeOption}
                    onChange={(v) => void update({ fontSize: v })}
                />
            </section>
        </div>
    );
});
