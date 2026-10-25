'use client';

import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { NodeFsProvider } from '@weblab/code-provider';
import { Button } from '@weblab/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@weblab/ui/dialog';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { useTranslations } from 'next-intl';
import { useEditorEngine } from '@/components/store/editor';
import { PreloadScriptState } from '@/components/store/editor/sandbox';

export const LocalPreviewSettings = observer(function LocalPreviewSettings({ rootPath }: { rootPath: string }) {
    const t = useTranslations('editor.git') as (key: string) => string;
    const editorEngine = useEditorEngine();
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [projectId, setProjectId] = useState('');
    const [dataset, setDataset] = useState('');
    const [error, setError] = useState<string | null>(null);
    const request = useRef(0);
    useEffect(() => () => { request.current += 1; }, []);

    const activeData = !editorEngine.isClosing && editorEngine.branches.hasActiveBranch
        ? editorEngine.branches.activeBranchData : null;
    const activeSandbox = activeData?.sandbox;
    const activeProvider = activeSandbox?.session.provider;
    useEffect(() => {
        request.current += 1;
        setOpen(false);
        setBusy(false);
        setLoaded(false);
    }, [activeData, activeSandbox, activeProvider]);

    function target() {
        if (editorEngine.isClosing || !editorEngine.branches.hasActiveBranch) return null;
        const data = editorEngine.branches.activeBranchData;
        if (data.branch.runtime.type !== 'local' || data.branch.runtime.local?.rootPath !== rootPath) return null;
        return { data, branchId: data.branch.id, sandbox: data.sandbox, provider: data.sandbox.session.provider };
    }

    function isCurrent(job: number, expected: ReturnType<typeof target>) {
        if (!expected || request.current !== job) return false;
        const current = target();
        return current?.data === expected.data && current.branchId === expected.branchId &&
            current.sandbox === expected.sandbox && current.provider === expected.provider;
    }

    async function showSettings() {
        const job = ++request.current;
        const expected = target();
        setOpen(true);
        setBusy(true);
        setLoaded(false);
        setError(null);
        setProjectId('');
        setDataset('');
        try {
            const settings = await new NodeFsProvider({ rootPath }).getPreviewSettings();
            if (!isCurrent(job, expected)) return;
            setProjectId(settings?.NEXT_PUBLIC_SANITY_PROJECT_ID ?? '');
            setDataset(settings?.NEXT_PUBLIC_SANITY_DATASET ?? '');
            setLoaded(true);
        } catch (cause) {
            if (isCurrent(job, expected)) setError(cause instanceof Error ? cause.message : t('previewSettingsFailed'));
        } finally {
            if (isCurrent(job, expected)) setBusy(false);
        }
    }

    async function saveSettings() {
        if (busy || !loaded) return;
        const job = ++request.current;
        const expected = target();
        if (!expected || !isCurrent(job, expected)) return;
        const id = projectId.trim();
        const name = dataset.trim();
        if (!!id !== !!name) { setError(t('previewSettingsBoth')); return; }
        if (id && (!/^[a-z0-9]{1,32}$/.test(id) || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(name))) {
            setError(t('previewSettingsInvalid'));
            return;
        }
        const { sandbox, provider, branchId } = expected;
        if (!(provider instanceof NodeFsProvider)) { setError(t('previewSettingsNotReady')); return; }
        if (editorEngine.code.hasPendingWrites || editorEngine.action.hasPendingRebases ||
            editorEngine.action.hasPendingStylePreflights || editorEngine.text.hasPendingWork ||
            expected.data.history.isTransactionOpen || expected.data.history.isPreparingForDisposal) {
            setError(t('handoffPendingWrites'));
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await provider.stopPreview();
            if (!isCurrent(job, expected)) return;
            await provider.setPreviewSettings(id ? {
                NEXT_PUBLIC_SANITY_PROJECT_ID: id,
                NEXT_PUBLIC_SANITY_DATASET: name,
            } : null);
            if (!isCurrent(job, expected)) return;
            // An unprepared project still goes through its normal setup action.
            // Saving public coordinates must never start unprepared source code.
            if (sandbox.preloadScriptState === PreloadScriptState.INJECTED) {
                if (!await sandbox.session.restartDevServer()) throw new Error(t('previewSettingsRestartFailed'));
                if (!isCurrent(job, expected)) return;
                editorEngine.frames.reloadByBranchId(branchId);
            }
            setOpen(false);
        } catch (cause) {
            if (isCurrent(job, expected)) setError(cause instanceof Error ? cause.message : t('previewSettingsFailed'));
        } finally {
            if (isCurrent(job, expected)) setBusy(false);
        }
    }

    return <>
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!(activeProvider instanceof NodeFsProvider)} title={t('previewSettingsTitle')} aria-label={t('previewSettingsTitle')} onClick={() => { void showSettings(); }}>
            <Icons.Gear className="h-4 w-4" />
        </Button>
        <Dialog open={open} onOpenChange={(next) => { if (!busy) { request.current += 1; setOpen(next); } }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('previewSettingsTitle')}</DialogTitle>
                    <DialogDescription>{t('previewSettingsDescription')}</DialogDescription>
                    <p className="text-mini text-foreground-secondary">{t('previewSettingsDelay')}</p>
                </DialogHeader>
                <form onSubmit={(event) => { event.preventDefault(); void saveSettings(); }} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="local-preview-sanity-project">{t('previewSettingsProject')}</Label>
                        <Input id="local-preview-sanity-project" value={projectId} onChange={(event) => setProjectId(event.target.value)} disabled={busy || !loaded} autoComplete="off" spellCheck={false} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="local-preview-sanity-dataset">{t('previewSettingsDataset')}</Label>
                        <Input id="local-preview-sanity-dataset" value={dataset} onChange={(event) => setDataset(event.target.value)} disabled={busy || !loaded} autoComplete="off" spellCheck={false} />
                    </div>
                    <p className="text-mini text-foreground-secondary">{t('previewSettingsClear')}</p>
                    {error && <p role="alert" className="text-small text-red-400">{error}</p>}
                    <DialogFooter>
                        <Button type="button" variant="ghost" disabled={busy} onClick={() => { request.current += 1; setOpen(false); }}>{t('handoffCancel')}</Button>
                        <Button type="submit" disabled={busy || !loaded}>{busy ? t('working') : t('previewSettingsSave')}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    </>;
});
