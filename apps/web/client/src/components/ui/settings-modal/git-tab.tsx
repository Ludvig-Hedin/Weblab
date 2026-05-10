'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { debounce } from 'lodash';
import { observer } from 'mobx-react-lite';

import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { toast } from '@weblab/ui/sonner';
import { Switch } from '@weblab/ui/switch';

import { api } from '@/trpc/react';

type PendingGit = {
    autoCommit?: boolean;
    autoPush?: boolean;
    commitMessageFormat?: string;
    defaultBranchPattern?: string;
};

export const GitTab = observer(() => {
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
    });

    const pending = useRef<PendingGit>({});
    // Snapshot of the cache *before* the first optimistic patch in the current
    // debounce window, so onError can roll back to true previous state — not
    // to the already-mutated cache.
    const preMutationSnapshot = useRef<
        ReturnType<typeof apiUtils.user.settings.get.getData> | undefined
    >(undefined);

    const debouncedSave = useMemo(
        () =>
            debounce(() => {
                if (Object.keys(pending.current).length === 0) return;
                const next = pending.current;
                const rollbackTo = preMutationSnapshot.current;
                pending.current = {};
                preMutationSnapshot.current = undefined;
                updateSettings(next, {
                    onError: () => {
                        if (rollbackTo) {
                            apiUtils.user.settings.get.setData(undefined, rollbackTo);
                        }
                        toast.error('Failed to save git settings');
                    },
                });
            }, 400),
        [updateSettings, apiUtils],
    );

    useEffect(() => () => debouncedSave.flush(), [debouncedSave]);

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

        if (!preMutationSnapshot.current) {
            preMutationSnapshot.current = apiUtils.user.settings.get.getData();
        }
        apiUtils.user.settings.get.setData(undefined, (current) => {
            if (!current) return current;
            return { ...current, git: { ...current.git, ...changes } };
        });
        pending.current = { ...pending.current, ...changes };
        debouncedSave();
    };

    const git = userSettings?.git;

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
                            checked={git?.autoCommit ?? false}
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
                            checked={git?.autoPush ?? false}
                            disabled={!git?.autoCommit}
                            onCheckedChange={(v) => patch({ autoPush: v })}
                        />
                    </div>
                </div>
            </section>

            <section className="border-border bg-background-secondary space-y-4 rounded-lg border p-4">
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
                            value={git?.defaultBranchPattern || 'feature/{timestamp}'}
                            onChange={(e) => patch({ defaultBranchPattern: e.target.value })}
                            className="text-small h-8 font-mono"
                            placeholder="feature/{timestamp}"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-mini">Commit message format</Label>
                        <Input
                            value={git?.commitMessageFormat || 'feat: {description}'}
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
