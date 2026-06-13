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

type PendingChanges = {
    shouldWarnDelete?: boolean;
    enableBunReplace?: boolean;
    buildFlags?: string;
};

export const EditorTab = observer(() => {
    const t = useTranslations();
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

    const pendingChanges = useRef<PendingChanges>({});

    const debouncedSave = useMemo(
        () =>
            debounce(async () => {
                if (Object.keys(pendingChanges.current).length === 0) return;
                const next = pendingChanges.current;
                pendingChanges.current = {};
                setIsSaving(true);
                try {
                    await updateSettingsMutation(next);
                    if (isMountedRef.current) {
                        setSavedFlash(true);
                        if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current);
                        savedFlashTimer.current = setTimeout(() => setSavedFlash(false), 1800);
                    }
                } catch {
                    toast.error(t('settings.editor.saveError'));
                } finally {
                    if (isMountedRef.current) setIsSaving(false);
                }
            }, 400),
        [updateSettingsMutation, t],
    );

    // On unmount, flush any pending debounced save so edits made
    // immediately before closing the modal aren't silently dropped.
    useEffect(() => () => void debouncedSave.flush(), [debouncedSave]);

    // Local mirror of the buildFlags text field. Binding the <Input> directly
    // to the Convex query value snapped the caret/value back mid-typing every
    // time the query re-emitted (e.g. after a debounced save round-trips). We
    // seed from the query and only re-sync from it while the field is NOT
    // focused, so in-progress edits are never clobbered.
    const [buildFlags, setBuildFlags] = useState('--no-lint');
    const buildFlagsFocusedRef = useRef(false);
    useEffect(() => {
        if (buildFlagsFocusedRef.current) return;
        if (userSettings?.buildFlags === undefined) return;
        setBuildFlags(userSettings.buildFlags);
    }, [userSettings?.buildFlags]);

    const patch = (changes: PendingChanges) => {
        pendingChanges.current = { ...pendingChanges.current, ...changes };
        void debouncedSave();
    };

    const SaveStatus = () => (
        <span className="text-mini">
            {isSaving ? (
                <span className="text-foreground-secondary">{t('settings.editor.saving')}</span>
            ) : (
                <span
                    className="text-foreground-secondary transition-opacity duration-300"
                    style={{ opacity: savedFlash ? 1 : 0 }}
                >
                    {t('settings.editor.saved')}
                </span>
            )}
        </span>
    );

    return (
        <div className="divide-border flex flex-col divide-y px-6">
            <section className="space-y-4 py-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-largePlus">{t('settings.editor.preferences.title')}</h2>
                        <p className="text-regular text-foreground-secondary">
                            {t('settings.editor.preferences.description')}
                        </p>
                    </div>
                    <SaveStatus />
                </div>

                <div className="space-y-3">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="text-regularPlus">
                                {t('settings.editor.warnDelete.title')}
                            </p>
                            <p className="text-regular text-foreground-secondary">
                                {t('settings.editor.warnDelete.description')}
                            </p>
                        </div>
                        <Switch
                            aria-label={t('settings.editor.warnDelete.title')}
                            checked={userSettings?.shouldWarnDelete ?? true}
                            onCheckedChange={(v) => patch({ shouldWarnDelete: v })}
                        />
                    </div>

                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="text-regularPlus">
                                {t('settings.editor.bunReplace.title')}
                            </p>
                            <p className="text-regular text-foreground-secondary">
                                {t('settings.editor.bunReplace.description')}
                            </p>
                        </div>
                        <Switch
                            aria-label={t('settings.editor.bunReplace.title')}
                            checked={userSettings?.enableBunReplace ?? true}
                            onCheckedChange={(v) => patch({ enableBunReplace: v })}
                        />
                    </div>
                </div>
            </section>

            <section className="space-y-4 py-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-largePlus">{t('settings.editor.build.title')}</h2>
                        <p className="text-regular text-foreground-secondary">
                            {t('settings.editor.build.description')}
                        </p>
                    </div>
                    <SaveStatus />
                </div>
                <div className="space-y-2">
                    <Label className="text-mini">{t('settings.editor.build.flagsLabel')}</Label>
                    <Input
                        value={buildFlags}
                        onChange={(e) => {
                            setBuildFlags(e.target.value);
                            patch({ buildFlags: e.target.value });
                        }}
                        onFocus={() => {
                            buildFlagsFocusedRef.current = true;
                        }}
                        onBlur={() => {
                            buildFlagsFocusedRef.current = false;
                        }}
                        className="text-small h-8 font-mono"
                        placeholder="--no-lint"
                    />
                </div>
            </section>
        </div>
    );
});
