'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import type { LocalHandoffPlan } from '@weblab/code-provider';
import { NodeFsProvider } from '@weblab/code-provider';
import { APP_NAME } from '@weblab/constants';
import { Button } from '@weblab/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@weblab/ui/dialog';
import { ScrollArea } from '@weblab/ui/scroll-area';

import type { CleanHandoffFile } from '@/components/store/editor/git/handoff-clean';
import { SourceLocationControls } from '@/app/projects/_components/select/source-location-controls';
import { useEditorEngine } from '@/components/store/editor';
import { cleanHandoffFiles } from '@/components/store/editor/git/handoff-clean';
import { CodeDiff } from '../right-panel/chat-tab/code-display/code-diff';

interface LocalGitHandoffProps {
    rootPath: string;
}

export function LocalGitHandoff({ rootPath }: LocalGitHandoffProps) {
    const t = useTranslations('editor.git');
    const editorEngine = useEditorEngine();
    const [open, setOpen] = useState(false);
    const [plan, setPlan] = useState<LocalHandoffPlan | null>(null);
    // Designer changes only: editor instrumentation stripped, original
    // formatting kept where possible. This is what the patch exports.
    const [cleanFiles, setCleanFiles] = useState<CleanHandoffFile[]>([]);
    const [selectedPath, setSelectedPath] = useState<string | null>(null);
    const [patchPath, setPatchPath] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const provider = new NodeFsProvider({ rootPath });
    const selected = cleanFiles.find((file) => file.path === selectedPath);
    const reformattedPaths = cleanFiles.filter((file) => file.reformatted).map((file) => file.path);

    async function review() {
        setBusy(true);
        setError(null);
        setPatchPath(null);
        try {
            if (editorEngine.code.hasPendingWrites || editorEngine.action.hasPendingRebases) {
                throw new Error(t('handoffPendingWrites'));
            }
            const next = await provider.planPrivateHandoff();
            const cleaned = cleanHandoffFiles(next.changedFiles);
            setPlan(next);
            setCleanFiles(cleaned);
            setSelectedPath(cleaned[0]?.path ?? null);
        } catch (cause) {
            setPlan(null);
            setCleanFiles([]);
            setError(cause instanceof Error ? cause.message : t('handoffFailed'));
        } finally {
            setBusy(false);
        }
    }

    async function exportPatch() {
        if (!plan?.planToken || busy || cleanFiles.length === 0) return;
        setBusy(true);
        setError(null);
        try {
            if (editorEngine.code.hasPendingWrites || editorEngine.action.hasPendingRebases) {
                throw new Error(t('handoffPendingWrites'));
            }
            const exported = await provider.exportPrivateHandoff(
                plan.planToken,
                cleanFiles.map(({ path, original, updated }) => ({ path, original, updated })),
            );
            setPatchPath(exported.patchPath);
        } catch (cause) {
            setPatchPath(null);
            setError(cause instanceof Error ? cause.message : t('handoffFailed'));
        } finally {
            setBusy(false);
        }
    }

    async function copyPath() {
        if (!patchPath) return;
        try {
            await navigator.clipboard.writeText(patchPath);
            toast.success(t('handoffPathCopied'));
        } catch {
            toast.error(t('handoffCopyFailed'));
        }
    }

    async function copyWorkingCopyPath() {
        try {
            await navigator.clipboard.writeText(rootPath);
            toast.success(t('handoffPathCopied'));
        } catch {
            toast.error(t('handoffCopyFailed'));
        }
    }

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                onClick={() => {
                    setOpen(true);
                    void review();
                }}
            >
                {t('handoffButton')}
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-h-[85vh] sm:max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>{t('handoffTitle')}</DialogTitle>
                        <DialogDescription>
                            {t('handoffDescription', { appName: APP_NAME })}
                        </DialogDescription>
                    </DialogHeader>
                    {busy && !plan && <p className="text-small">{t('working')}</p>}
                    {error && (
                        <>
                            <p className="text-destructive text-small" role="alert">
                                {error}
                            </p>
                            <SourceLocationControls rootPath={rootPath} active={open} />
                        </>
                    )}
                    {plan && (
                        <>
                            <p className="text-foreground-secondary text-small break-all">
                                {t('handoffSource', { path: plan.sourceRootPath })}
                            </p>
                            <p className="text-foreground-secondary text-small break-all">
                                {t('handoffWorkingCopy', { appName: APP_NAME, path: rootPath })}
                            </p>
                            {plan.sourceChanged && (
                                <p className="text-destructive text-small" role="alert">
                                    {t('handoffSourceChanged')}
                                </p>
                            )}
                            {plan.unsupportedChanges.length > 0 && (
                                <p className="text-destructive text-small" role="alert">
                                    {t('handoffUnsupported', {
                                        paths: plan.unsupportedChanges.join(', '),
                                    })}
                                </p>
                            )}
                            {reformattedPaths.length > 0 && (
                                <p className="text-foreground-secondary text-small" role="status">
                                    {t('handoffReformatted', {
                                        paths: reformattedPaths.join(', '),
                                    })}
                                </p>
                            )}
                            {cleanFiles.length === 0 ? (
                                <p className="text-foreground-secondary text-small">
                                    {t('handoffNoChanges', { appName: APP_NAME })}
                                </p>
                            ) : (
                                <div className="min-h-0 space-y-3">
                                    <div className="flex flex-wrap gap-2">
                                        {cleanFiles.map((file) => (
                                            <Button
                                                key={file.path}
                                                variant={
                                                    selectedPath === file.path
                                                        ? 'secondary'
                                                        : 'ghost'
                                                }
                                                size="sm"
                                                onClick={() => setSelectedPath(file.path)}
                                            >
                                                {file.path}
                                            </Button>
                                        ))}
                                    </div>
                                    {selected && (
                                        <ScrollArea className="border-border max-h-[45vh] border">
                                            <CodeDiff
                                                originalCode={selected.original ?? ''}
                                                modifiedCode={selected.updated ?? ''}
                                            />
                                        </ScrollArea>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                    {patchPath && (
                        <div className="text-small space-y-2">
                            <p>{t('handoffExported')}</p>
                            <code className="block select-all break-all">{patchPath}</code>
                            <p className="text-foreground-secondary">
                                {t('handoffApplyInstructions')}
                            </p>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => void copyWorkingCopyPath()}>
                            {t('handoffCopyWorkingCopy')}
                        </Button>
                        {patchPath && (
                            <Button variant="outline" onClick={() => void copyPath()}>
                                {t('handoffCopyPath')}
                            </Button>
                        )}
                        <Button variant="outline" disabled={busy} onClick={() => void review()}>
                            {t('handoffRefresh')}
                        </Button>
                        <Button
                            disabled={busy || !plan?.planToken || cleanFiles.length === 0}
                            onClick={() => void exportPatch()}
                        >
                            {t('handoffExport')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
