'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { debounce } from 'lodash';
import { observer } from 'mobx-react-lite';

import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { toast } from '@weblab/ui/sonner';
import { Switch } from '@weblab/ui/switch';

type PendingGit = {
    autoCommit?: boolean;
    autoPush?: boolean;
    commitMessageFormat?: string;
    defaultBranchPattern?: string;
};

export const GitTab = observer(() => {
    const userSettings = useQuery(api.users.getSettings);
    const updateSettingsMutation = useMutation(api.users.updateSettings);
    const [savedFlash, setSavedFlash] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const savedFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isMountedRef = useRef(true);
    useEffect(
        () => () => {
            isMountedRef.current = false;
            if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current);
        },
        [],
    );

    const pending = useRef<PendingGit>({});

    const debouncedSave = useMemo(
        () =>
            debounce(async () => {
                if (Object.keys(pending.current).length === 0) return;
                const next = pending.current;
                pending.current = {};
                setIsSaving(true);
                try {
                    await updateSettingsMutation(next);
                    if (isMountedRef.current) {
                        setSavedFlash(true);
                        if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current);
                        savedFlashTimer.current = setTimeout(() => setSavedFlash(false), 1800);
                    }
                } catch {
                    toast.error('Failed to save git settings');
                } finally {
                    if (isMountedRef.current) setIsSaving(false);
                }
            }, 400),
        [updateSettingsMutation],
    );

    useEffect(
        () => () => {
            // `flush` may return a Promise — discard it; the cleanup type
            // requires void / Destructor, not a thenable.
            void debouncedSave.flush();
        },
        [debouncedSave],
    );

    const patch = (rawChanges: PendingGit) => {
        const changes: PendingGit = { ...rawChanges };
        // Drop empty naming patterns so users clearing the input fall back to
        // defaults rather than persisting a blank value that could break
        // branch/commit creation downstream.
        if ('defaultBranchPattern' in changes && !changes.defaultBranchPattern?.trim()) {
            delete changes.defaultBranchPattern;
        }
        if ('commitMessageFormat' in changes && !changes.commitMessageFormat?.trim()) {
            delete changes.commitMessageFormat;
        }
        if (Object.keys(changes).length === 0) return;

        pending.current = { ...pending.current, ...changes };
        void debouncedSave();
    };

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
        <div className="divide-border flex flex-col divide-y px-6">
            <section className="space-y-4 py-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-largePlus">Commit behaviour</h2>
                        <p className="text-regular text-foreground-tertiary">
                            Control how changes are committed and pushed.
                        </p>
                    </div>
                    <SaveStatus />
                </div>
                <div className="space-y-3">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="text-regularPlus">Auto-commit on save</p>
                            <p className="text-regular text-foreground-tertiary">
                                Automatically commit changes when you save.
                            </p>
                        </div>
                        <Switch
                            checked={userSettings?.autoCommit ?? false}
                            onCheckedChange={(v) => patch({ autoCommit: v })}
                        />
                    </div>
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="text-regularPlus">Auto-push after commit</p>
                            <p className="text-regular text-foreground-tertiary">
                                Push to remote immediately after each commit.
                            </p>
                        </div>
                        <Switch
                            checked={userSettings?.autoPush ?? false}
                            disabled={!userSettings?.autoCommit}
                            onCheckedChange={(v) => patch({ autoPush: v })}
                        />
                    </div>
                </div>
            </section>

            <section className="space-y-4 py-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-largePlus">Naming conventions</h2>
                        <p className="text-regular text-foreground-tertiary">
                            Templates used when creating branches and commits. Use{' '}
                            <code className="bg-background-tertiary text-mini rounded-xs px-1">
                                {'{description}'}
                            </code>{' '}
                            and{' '}
                            <code className="bg-background-tertiary text-mini rounded-xs px-1">
                                {'{timestamp}'}
                            </code>{' '}
                            as placeholders.
                        </p>
                    </div>
                    <SaveStatus />
                </div>
                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <Label className="text-mini">Default branch pattern</Label>
                        <Input
                            value={userSettings?.defaultBranchPattern || 'feature/{timestamp}'}
                            onChange={(e) => patch({ defaultBranchPattern: e.target.value })}
                            className="text-small h-8 font-mono"
                            placeholder="feature/{timestamp}"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-mini">Commit message format</Label>
                        <Input
                            value={userSettings?.commitMessageFormat || 'feat: {description}'}
                            onChange={(e) => patch({ commitMessageFormat: e.target.value })}
                            className="text-small h-8 font-mono"
                            placeholder="feat: {description}"
                        />
                    </div>
                </div>
            </section>
        </div>
    );
});
