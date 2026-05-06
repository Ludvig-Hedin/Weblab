'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { toast } from '@weblab/ui/sonner';
import { cn } from '@weblab/ui/utils';

import { SHORTCUT_SECTIONS } from '@/app/project/[id]/_components/keyboard-shortcuts-modal';
import { DEFAULT_HOTKEYS, makeReadableCommand } from '@/components/hotkey';
import { useStateManager } from '@/components/store/state';
import { api } from '@/trpc/react';

function KbdChip({ command }: { command: string }) {
    return (
        <kbd className="border-border bg-background-secondary inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-xs">
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
        const stateManager = useStateManager();
        const apiUtils = api.useUtils();
        const { mutate: updateSettings } = api.user.settings.upsert.useMutation({
            onSuccess: () => void apiUtils.user.settings.get.invalidate(),
            onError: () => toast.error('Failed to save shortcut'),
        });

        const defaultHotkey = DEFAULT_HOTKEYS[hotkeyKey];
        // NOTE: do NOT early-return here — the hooks below must run on every
        // render to satisfy React's rules of hooks. We return null at the end
        // when defaultHotkey is missing instead.
        const effectiveCommand = defaultHotkey ? stateManager.hotkeys.getBinding(hotkeyKey) : '';
        const isCustomized = defaultHotkey ? stateManager.hotkeys.isCustomized(hotkeyKey) : false;

        const saveBinding = useCallback(
            (key: string, value: string) => {
                const previous = stateManager.hotkeys.customBindings[key];
                stateManager.hotkeys.setBinding(key, value);
                updateSettings(
                    { customShortcuts: { ...stateManager.hotkeys.customBindings } },
                    {
                        onError: () => {
                            if (previous !== undefined) {
                                stateManager.hotkeys.setBinding(key, previous);
                            } else {
                                stateManager.hotkeys.resetBinding(key);
                            }
                        },
                    },
                );
            },
            [stateManager.hotkeys, updateSettings],
        );

        const resetBinding = useCallback(() => {
            const previous = stateManager.hotkeys.customBindings[hotkeyKey];
            stateManager.hotkeys.resetBinding(hotkeyKey);
            updateSettings(
                { customShortcuts: { ...stateManager.hotkeys.customBindings } },
                {
                    onError: () => {
                        if (previous !== undefined) {
                            stateManager.hotkeys.setBinding(hotkeyKey, previous);
                        }
                    },
                },
            );
        }, [hotkeyKey, stateManager.hotkeys, updateSettings]);

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
                            `Already used by "${DEFAULT_HOTKEYS[conflict]?.description ?? conflict}"`,
                        );
                        onCancelCapture();
                        return;
                    }
                    saveBinding(hotkeyKey, parts.join('+'));
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
        ]);

        if (!defaultHotkey) return null;

        return (
            <div className="hover:bg-background-secondary/30 flex items-center justify-between gap-3 rounded-md px-2 py-2">
                <span className="text-muted-foreground flex-1 text-sm">
                    {defaultHotkey.description}
                </span>
                <div className="flex items-center gap-2">
                    {isCapturing ? (
                        <span className="text-foreground-brand animate-pulse text-xs">
                            Press a key combo… (Esc to cancel)
                        </span>
                    ) : (
                        <KbdChip command={effectiveCommand} />
                    )}
                    {!isCapturing && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-foreground h-6 px-2 text-xs"
                            onClick={onStartCapture}
                        >
                            Rebind
                        </Button>
                    )}
                    {isCustomized && !isCapturing && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive h-6 w-6"
                            title="Reset to default"
                            onClick={resetBinding}
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
    const stateManager = useStateManager();
    const apiUtils = api.useUtils();
    const { mutate: updateSettings } = api.user.settings.upsert.useMutation({
        onSuccess: () => {
            void apiUtils.user.settings.get.invalidate();
            toast.success('All shortcuts reset to defaults');
        },
        onError: () => toast.error('Failed to reset shortcuts'),
    });

    const [capturingKey, setCapturingKey] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleResetAll = () => {
        // Snapshot before mutating so we can roll the local state back if the
        // server upsert fails — otherwise the UI shows defaults while the
        // server still holds the user's custom bindings.
        const previousBindings = { ...stateManager.hotkeys.customBindings };
        stateManager.hotkeys.resetAll();
        updateSettings(
            { customShortcuts: {} },
            {
                onError: () => {
                    Object.entries(previousBindings).forEach(([key, value]) => {
                        stateManager.hotkeys.setBinding(key, value);
                    });
                },
            },
        );
    };

    const hasCustom = Object.keys(stateManager.hotkeys.customBindings).length > 0;

    return (
        <div className="flex flex-col gap-6 p-6" ref={containerRef}>
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-base font-medium">Keyboard shortcuts</h2>
                    <p className="text-muted-foreground text-sm">
                        Click <strong>Rebind</strong> on any row, then press your desired key combo.
                    </p>
                </div>
                {hasCustom && (
                    <Button variant="outline" size="sm" onClick={handleResetAll}>
                        Reset all to defaults
                    </Button>
                )}
            </div>

            {SHORTCUT_SECTIONS.map((section) => (
                <section
                    key={section.title}
                    className="border-border/60 bg-background-secondary/30 rounded-lg border p-4"
                >
                    <h3 className="mb-3 text-sm font-medium">{section.title}</h3>
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
