'use client';

import { useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { useTheme } from 'next-themes';

import { cn } from '@weblab/ui/utils';

import { api } from '@/trpc/react';

type ThemeOption = 'light' | 'dark' | 'system';
type AccentOption = 'blue' | 'red' | 'green' | 'neutral';
type FontFamilyOption = 'sans' | 'serif';
type FontSizeOption = 'small' | 'medium' | 'large';
type DensityOption = 'compact' | 'comfortable';

const ACCENT_COLORS: { value: AccentOption; label: string; bg: string; ring: string }[] = [
    {
        value: 'blue',
        label: 'Blue',
        bg: 'bg-[oklch(0.623_0.214_255)]',
        ring: 'ring-[oklch(0.623_0.214_255)]',
    },
    {
        value: 'red',
        label: 'Red',
        bg: 'bg-[oklch(0.637_0.237_25.3)]',
        ring: 'ring-[oklch(0.637_0.237_25.3)]',
    },
    {
        value: 'green',
        label: 'Green',
        bg: 'bg-[oklch(0.723_0.19_142.5)]',
        ring: 'ring-[oklch(0.723_0.19_142.5)]',
    },
    {
        value: 'neutral',
        label: 'Neutral',
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
                            : 'text-foreground-tertiary hover:text-foreground hover:bg-background-secondary',
                    )}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
}

export const AppearanceTab = observer(() => {
    const apiUtils = api.useUtils();
    const { data: userSettings } = api.user.settings.get.useQuery();
    const { mutate: updateSettings } = api.user.settings.upsert.useMutation({
        onSuccess: () => void apiUtils.user.settings.get.invalidate(),
        onError: () => void apiUtils.user.settings.get.invalidate(),
    });
    const { setTheme } = useTheme();

    const appearance = userSettings?.appearance;

    const update = useCallback(
        (patch: Record<string, unknown>) => {
            // Optimistically apply data-* attrs
            const html = document.documentElement;
            if ('accentColor' in patch)
                html.setAttribute('data-accent', patch.accentColor as string);
            if ('uiDensity' in patch) html.setAttribute('data-density', patch.uiDensity as string);
            if ('fontSize' in patch) html.setAttribute('data-font-size', patch.fontSize as string);
            if ('fontFamily' in patch)
                html.setAttribute('data-font-family', patch.fontFamily as string);
            if ('theme' in patch) setTheme(patch.theme as string);
            updateSettings(patch);
        },
        [updateSettings, setTheme],
    );

    return (
        <div className="flex flex-col gap-16 p-6">
            {/* Theme */}
            <section className="border-border bg-background-secondary space-y-4 rounded-lg border p-4">
                <div>
                    <h2 className="text-largePlus">Theme</h2>
                    <p className="text-regular text-foreground-tertiary">
                        Choose your preferred color scheme.
                    </p>
                </div>
                <SegmentedControl<ThemeOption>
                    options={[
                        { value: 'light', label: 'Light' },
                        { value: 'dark', label: 'Dark' },
                        { value: 'system', label: 'System' },
                    ]}
                    value={(appearance?.theme ?? 'system') as ThemeOption}
                    onChange={(v) => update({ theme: v })}
                />
            </section>

            {/* Accent color */}
            <section className="border-border bg-background-secondary space-y-4 rounded-lg border p-4">
                <div>
                    <h2 className="text-largePlus">Accent color</h2>
                    <p className="text-regular text-foreground-tertiary">
                        Used for active states and highlights.
                    </p>
                </div>
                <div className="flex gap-3">
                    {ACCENT_COLORS.map((color) => (
                        <button
                            key={color.value}
                            type="button"
                            title={color.label}
                            onClick={() => update({ accentColor: color.value })}
                            className={cn(
                                'ring-offset-background h-7 w-7 rounded-full ring-2 ring-offset-2 transition-all',
                                color.bg,
                                appearance?.accentColor === color.value
                                    ? color.ring
                                    : 'ring-transparent',
                            )}
                        />
                    ))}
                </div>
            </section>

            {/* Font family */}
            <section className="border-border bg-background-secondary space-y-4 rounded-lg border p-4">
                <div>
                    <h2 className="text-largePlus">Font family</h2>
                    <p className="text-regular text-foreground-tertiary">
                        Applies to the app UI, not your project.
                    </p>
                </div>
                <SegmentedControl<FontFamilyOption>
                    options={[
                        { value: 'sans', label: 'Sans-serif' },
                        { value: 'serif', label: 'Serif' },
                    ]}
                    value={(appearance?.fontFamily ?? 'sans') as FontFamilyOption}
                    onChange={(v) => update({ fontFamily: v })}
                />
            </section>

            {/* Font size */}
            <section className="border-border bg-background-secondary space-y-4 rounded-lg border p-4">
                <div>
                    <h2 className="text-largePlus">Font size</h2>
                    <p className="text-regular text-foreground-tertiary">
                        Base size for the app UI text.
                    </p>
                </div>
                <SegmentedControl<FontSizeOption>
                    options={[
                        { value: 'small', label: 'Small' },
                        { value: 'medium', label: 'Medium' },
                        { value: 'large', label: 'Large' },
                    ]}
                    value={(appearance?.fontSize ?? 'medium') as FontSizeOption}
                    onChange={(v) => update({ fontSize: v })}
                />
            </section>

            {/* Density */}
            <section className="border-border bg-background-secondary space-y-4 rounded-lg border p-4">
                <div>
                    <h2 className="text-largePlus">Density</h2>
                    <p className="text-regular text-foreground-tertiary">
                        Controls spacing throughout the UI.
                    </p>
                </div>
                <SegmentedControl<DensityOption>
                    options={[
                        { value: 'compact', label: 'Compact' },
                        { value: 'comfortable', label: 'Comfortable' },
                    ]}
                    value={(appearance?.uiDensity ?? 'comfortable') as DensityOption}
                    onChange={(v) => update({ uiDensity: v })}
                />
            </section>
        </div>
    );
});
