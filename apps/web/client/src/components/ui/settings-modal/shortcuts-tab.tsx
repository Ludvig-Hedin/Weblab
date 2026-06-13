'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useMutation } from 'convex/react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { toast } from '@weblab/ui/sonner';

import { SHORTCUT_SECTIONS } from '@/app/project/[id]/_components/keyboard-shortcuts-modal';
import { DEFAULT_HOTKEYS, makeReadableCommand } from '@/components/hotkey';
import { useStateManager } from '@/components/store/state';

function KbdChip({ command }: { command: string }) {
    return (
        <kbd className="border-border bg-background-secondary text-mini inline-flex items-center gap-1 rounded-xs border px-2 py-0.5 font-mono">
            {makeReadableCommand(command)}
        </kbd>
    );
}

const ShortcutRow = observer(
    ({
        hotkeyKey,
        isCapturing,
        onStartCapture,
        onCancelCapture,
    }: {
        hotkeyKey: string;
        isCapturing: boolean;
        onStartCapture: () => void;
        onCancelCapture: () => void;
    }) => {
        const t = useTranslations('settings.shortcuts');
        const stateManager = useStateManager();
        const updateSettings = useMutation(api.users.updateSettings);

        const defaultHotkey = DEFAULT_HOTKEYS[hotkeyKey];
        const effectiveCommand = defaultHotkey ? stateManager.hotkeys.getBinding(hotkeyKey) : '';
        const isCustomized = defaultHotkey ? stateManager.hotkeys.isCustomized(hotkeyKey) : false;

        const saveBinding = useCallback(
            async (key: string, value: string) => {
                const previous = stateManager.hotkeys.customBindings[key];
                stateManager.hotkeys.setBinding(key, value);
                try {
                    await updateSettings({
                        customShortcuts: { ...stateManager.hotkeys.customBindings },
                    });
                } catch {
                    toast.error(t('toastSaveFailed'));
                    if (previous !== undefined) {
                        stateManager.hotkeys.setBinding(key, previous);
                    } else {
                        stateManager.hotkeys.resetBinding(key);
                    }
                }
            },
            [stateManager.hotkeys, updateSettings, t],
        );

        const resetBinding = useCallback(async () => {
            const previous = stateManager.hotkeys.customBindings[hotkeyKey];
            stateManager.hotkeys.resetBinding(hotkeyKey);
            try {
                await updateSettings({
                    customShortcuts: { ...stateManager.hotkeys.customBindings },
                });
            } catch {
                toast.error(t('toastSaveFailed'));
                if (previous !== undefined) {
                    stateManager.hotkeys.setBinding(hotkeyKey, previous);
                }
            }
        }, [hotkeyKey, stateManager.hotkeys, updateSettings, t]);

        useEffect(() => {
            if (!isCapturing || !defaultHotkey) return;

            const handleKeyDown = (e: KeyboardEvent) => {
                e.preventDefault();
                e.stopPropagation();

                if (e.key === 'Escape') {
                    onCancelCapture();
                    return;
                }

                const parts: string[] = [];
                if (e.metaKey || e.ctrlKey) parts.push('mod');
                if (e.shiftKey) parts.push('shift');
                if (e.altKey) parts.push('alt');

                const key = e.key.toLowerCase();
                if (!['meta', 'ctrl', 'shift', 'alt', 'control'].includes(key)) {
                    parts.push(key === ' ' ? 'space' : key);
                }

                const hasNonModifierKey =
                    parts.length > 0 && !['mod', 'shift', 'alt'].includes(parts[parts.length - 1]!);

                if (hasNonModifierKey) {
                    const conflict = stateManager.hotkeys.getConflict(hotkeyKey, parts.join('+'));
                    if (conflict) {
                        toast.error(
                            t('conflictError', {
                                name: DEFAULT_HOTKEYS[conflict]?.description ?? conflict,
                            }),
                        );
                        onCancelCapture();
                        return;
                    }
                    void saveBinding(hotkeyKey, parts.join('+'));
                    onCancelCapture();
                }
            };

            window.addEventListener('keydown', handleKeyDown, true);
            return () => window.removeEventListener('keydown', handleKeyDown, true);
        }, [
            isCapturing,
            hotkeyKey,
            onCancelCapture,
            saveBinding,
            stateManager.hotkeys,
            defaultHotkey,
            t,
        ]);

        if (!defaultHotkey) return null;

        return (
            <div className="hover:bg-background-secondary flex items-center justify-between gap-3 rounded-md px-2 py-2">
                <span className="text-regular text-foreground-tertiary flex-1">
                    {defaultHotkey.description}
                </span>
                <div className="flex items-center gap-2">
                    {isCapturing ? (
                        <span className="text-mini text-foreground-brand animate-pulse">
                            {t('pressingKey')}
                        </span>
                    ) : (
                        <KbdChip command={effectiveCommand} />
                    )}
                    {!isCapturing && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-foreground-tertiary hover:text-foreground text-mini h-6 px-2"
                            onClick={onStartCapture}
                        >
                            {t('rebind')}
                        </Button>
                    )}
                    {isCustomized && !isCapturing && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="text-foreground-tertiary hover:text-destructive h-6 w-6"
                            title={t('resetToDefault')}
                            onClick={() => void resetBinding()}
                        >
                            <Icons.Reset className="h-3 w-3" />
                        </Button>
                    )}
                </div>
            </div>
        );
    },
);

export const ShortcutsTab = observer(() => {
    const t = useTranslations('settings.shortcuts');
    const stateManager = useStateManager();
    const updateSettings = useMutation(api.users.updateSettings);

    const [capturingKey, setCapturingKey] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const sectionTitles: Record<string, string> = {
        Modes: t('sections.modes'),
        Navigation: t('sections.navigation'),
        Panels: t('sections.panels'),
        Insert: t('sections.insert'),
        Canvas: t('sections.canvas'),
        Layers: t('sections.layers'),
        Editor: t('sections.editor'),
        AI: t('sections.ai'),
    };

    const handleResetAll = async () => {
        const previousBindings = { ...stateManager.hotkeys.customBindings };
        if (Object.keys(previousBindings).length === 0) return;
        stateManager.hotkeys.resetAll();
        try {
            await updateSettings({ customShortcuts: {} });
            toast.success(t('toastResetSuccess'), {
                action: {
                    label: t('undoLabel'),
                    onClick: () => {
                        Object.entries(previousBindings).forEach(([key, value]) => {
                            stateManager.hotkeys.setBinding(key, value);
                        });
                        void updateSettings({ customShortcuts: previousBindings });
                    },
                },
            });
        } catch {
            toast.error(t('toastResetFailed'));
            Object.entries(previousBindings).forEach(([key, value]) => {
                stateManager.hotkeys.setBinding(key, value);
            });
        }
    };

    const hasCustom = Object.keys(stateManager.hotkeys.customBindings).length > 0;

    return (
        <div className="divide-border flex flex-col divide-y px-6" ref={containerRef}>
            <div className="flex items-center justify-between py-6">
                <div>
                    <h2 className="text-largePlus">{t('title')}</h2>
                    <p className="text-regular text-foreground-tertiary">{t('description')}</p>
                </div>
                {hasCustom && (
                    <Button variant="outline" size="sm" onClick={() => void handleResetAll()}>
                        {t('resetAll')}
                    </Button>
                )}
            </div>

            {SHORTCUT_SECTIONS.map((section) => (
                <section key={section.title} className="py-6">
                    <h3 className="text-regularPlus mb-3">
                        {sectionTitles[section.title] ?? section.title}
                    </h3>
                    <div className="space-y-0.5">
                        {section.keys.map((key) => (
                            <ShortcutRow
                                key={key}
                                hotkeyKey={key}
                                isCapturing={capturingKey === key}
                                onStartCapture={() => setCapturingKey(key)}
                                onCancelCapture={() => setCapturingKey(null)}
                            />
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
});
