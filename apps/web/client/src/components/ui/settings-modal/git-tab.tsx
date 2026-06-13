'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { debounce } from 'lodash';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

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
    const t = useTranslations('settings.git');
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
                    toast.error(t('toastFailed'));
                } finally {
                    if (isMountedRef.current) setIsSaving(false);
                }
            }, 400),
        [updateSettingsMutation, t],
    );

    useEffect(
        () => () => {
            void debouncedSave.flush();
        },
        [debouncedSave],
    );

    const patch = (rawChanges: PendingGit) => {
        const changes: PendingGit = { ...rawChanges };
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
                <span className="text-foreground-tertiary">{t('saving')}</span>
            ) : (
                <span
                    className="text-foreground-secondary transition-opacity duration-300"
                    style={{ opacity: savedFlash ? 1 : 0 }}
                >
                    {t('saved')}
                </span>
            )}
        </span>
    );

    return (
        <div className="divide-border flex flex-col divide-y px-6">
            <section className="space-y-4 py-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-largePlus">{t('commitBehaviourTitle')}</h2>
                        <p className="text-regular text-foreground-tertiary">
                            {t('commitBehaviourDescription')}
                        </p>
                    </div>
                    <SaveStatus />
                </div>
                <div className="space-y-3">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="text-regularPlus">{t('autoCommitLabel')}</p>
                            <p className="text-regular text-foreground-tertiary">
                                {t('autoCommitDescription')}
                            </p>
                        </div>
                        <Switch
                            checked={userSettings?.autoCommit ?? false}
                            onCheckedChange={(v) => patch({ autoCommit: v })}
                        />
                    </div>
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="text-regularPlus">{t('autoPushLabel')}</p>
                            <p className="text-regular text-foreground-tertiary">
                                {t('autoPushDescription')}
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
                        <h2 className="text-largePlus">{t('namingTitle')}</h2>
                        <p className="text-regular text-foreground-tertiary">
                            {t('namingDescription')}
                        </p>
                    </div>
                    <SaveStatus />
                </div>
                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <Label className="text-mini">{t('branchPatternLabel')}</Label>
                        <Input
                            value={userSettings?.defaultBranchPattern || 'feature/{timestamp}'}
                            onChange={(e) => patch({ defaultBranchPattern: e.target.value })}
                            className="text-small h-8 font-mono"
                            placeholder="feature/{timestamp}"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-mini">{t('commitFormatLabel')}</Label>
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
