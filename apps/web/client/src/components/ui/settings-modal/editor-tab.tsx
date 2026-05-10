'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { debounce } from 'lodash';
import { observer } from 'mobx-react-lite';

import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { toast } from '@weblab/ui/sonner';
import { Switch } from '@weblab/ui/switch';

import { api } from '@/trpc/react';

type PendingChanges = {
    shouldWarnDelete?: boolean;
    enableBunReplace?: boolean;
    buildFlags?: string;
};

export const EditorTab = observer(() => {
    const apiUtils = api.useUtils();
    const { data: userSettings } = api.user.settings.get.useQuery();
    const [savedFlash, setSavedFlash] = useState(false);
    const savedFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isMountedRef = useRef(true);
    useEffect(
        () => () => {
            isMountedRef.current = false;
            if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current);
        },
        [],
    );
    const { mutate: updateSettings, isPending: isSaving } = api.user.settings.upsert.useMutation({
        onSuccess: () => {
            void apiUtils.user.settings.get.invalidate();
            if (isMountedRef.current) {
                setSavedFlash(true);
                if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current);
                savedFlashTimer.current = setTimeout(() => setSavedFlash(false), 1800);
            }
        },
        onError: () => {
            void apiUtils.user.settings.get.invalidate();
            toast.error('Failed to save editor settings');
        },
    });

    const pendingChanges = useRef<PendingChanges>({});

    const debouncedSave = useMemo(
        () =>
            debounce(() => {
                if (Object.keys(pendingChanges.current).length === 0) return;
                const next = pendingChanges.current;
                pendingChanges.current = {};
                updateSettings(next);
            }, 400),
        [updateSettings],
    );

    useEffect(() => () => debouncedSave.cancel(), [debouncedSave]);

    const patch = (changes: PendingChanges) => {
        // Optimistic UI
        apiUtils.user.settings.get.setData(undefined, (current) => {
            if (!current) return current;
            return {
                ...current,
                editor: { ...current.editor, ...changes },
            };
        });
        pendingChanges.current = { ...pendingChanges.current, ...changes };
        debouncedSave();
    };

    const editor = userSettings?.editor;

    const SaveStatus = () => (
        <span className="text-mini">
            {isSaving ? (
                <span className="text-foreground-tertiary">Saving…</span>
            ) : (
                <span
                    className="text-foreground-secondary transition-opacity duration-300"
                    style={{ opacity: savedFlash ? 1 : 0 }}
                >
                    Saved
                </span>
            )}
        </span>
    );

    return (
        <div className="flex flex-col gap-16 p-6">
            <section className="border-border bg-background-secondary space-y-4 rounded-lg border p-4">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-largePlus">Editor preferences</h2>
                        <p className="text-regular text-foreground-tertiary">
                            Control how the editor behaves.
                        </p>
                    </div>
                    <SaveStatus />
                </div>

                <div className="space-y-3">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="text-regularPlus">Warn before deleting elements</p>
                            <p className="text-regular text-foreground-tertiary">
                                Show a confirmation dialog when removing elements.
                            </p>
                        </div>
                        <Switch
                            aria-label="Warn before deleting elements"
                            checked={editor?.shouldWarnDelete ?? true}
                            onCheckedChange={(v) => patch({ shouldWarnDelete: v })}
                        />
                    </div>

                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="text-regularPlus">Enable Bun replace</p>
                            <p className="text-regular text-foreground-tertiary">
                                Prefer Bun for package management operations.
                            </p>
                        </div>
                        <Switch
                            aria-label="Enable Bun replace"
                            checked={editor?.enableBunReplace ?? true}
                            onCheckedChange={(v) => patch({ enableBunReplace: v })}
                        />
                    </div>
                </div>
            </section>

            <section className="border-border bg-background-secondary space-y-4 rounded-lg border p-4">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-largePlus">Build configuration</h2>
                        <p className="text-regular text-foreground-tertiary">
                            Flags passed to the build command.
                        </p>
                    </div>
                    <SaveStatus />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-mini">Build flags</Label>
                    <Input
                        value={editor?.buildFlags ?? '--no-lint'}
                        onChange={(e) => patch({ buildFlags: e.target.value })}
                        className="text-small h-8 font-mono"
                        placeholder="--no-lint"
                    />
                </div>
            </section>
        </div>
    );
});
