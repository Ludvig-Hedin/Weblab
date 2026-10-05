'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import type { LocalHandoffPlan } from '@weblab/code-provider';
import { NodeFsProvider } from '@weblab/code-provider';
import { APP_NAME } from '@weblab/constants';
import { Button } from '@weblab/ui/button';
import { Checkbox } from '@weblab/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@weblab/ui/dialog';
import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import type { CleanHandoffFile } from '@/components/store/editor/git/handoff-clean';
import type { HandoffFileSummary } from '@/components/store/editor/git/handoff-summary';
import { useEditorEngine } from '@/components/store/editor';
import { cleanHandoffFiles } from '@/components/store/editor/git/handoff-clean';
import { summarizeHandoffFile } from '@/components/store/editor/git/handoff-summary';

interface LocalGitHandoffProps {
    rootPath: string;
}

function baseName(path: string): string {
    return (
        path
            .replace(/[\\/]+$/, '')
            .split(/[\\/]/)
            .at(-1) ?? path
    );
}

export function LocalGitHandoff({ rootPath }: LocalGitHandoffProps) {
    const t = useTranslations('editor.git') as (
        key: string,
        values?: Record<string, string | number>,
    ) => string;
    const editorEngine = useEditorEngine();
    const [open, setOpen] = useState(false);
    const [plan, setPlan] = useState<LocalHandoffPlan | null>(null);
    // Designer changes only: editor instrumentation stripped, original
    // formatting kept where possible. This is what the patch exports.
    const [cleanFiles, setCleanFiles] = useState<CleanHandoffFile[]>([]);
    const [summaries, setSummaries] = useState<HandoffFileSummary[]>([]);
    const [excluded, setExcluded] = useState<Set<string>>(new Set());
    const [editingFiles, setEditingFiles] = useState(false);
    const [patchPath, setPatchPath] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const provider = new NodeFsProvider({ rootPath });
    const selected = summaries.filter((file) => !excluded.has(file.path));
    const allSelected = selected.length === summaries.length;
    const blocked = !!plan && (plan.sourceChanged || plan.unsupportedChanges.length > 0);
    const totals = selected.reduce(
        (sum, file) => ({
            added: sum.added + file.added,
            removed: sum.removed + file.removed,
        }),
        { added: 0, removed: 0 },
    );

    async function review() {
        setBusy(true);
        setError(null);
        setPatchPath(null);
        setExcluded(new Set());
        setEditingFiles(false);
        try {
            if (editorEngine.code.hasPendingWrites || editorEngine.action.hasPendingRebases) {
                throw new Error(t('handoffPendingWrites'));
            }
            const next = await provider.planPrivateHandoff();
            const cleaned = cleanHandoffFiles(next.changedFiles);
            setPlan(next);
            setCleanFiles(cleaned);
            setSummaries(cleaned.map(summarizeHandoffFile));
        } catch (cause) {
            setPlan(null);
            setCleanFiles([]);
            setSummaries([]);
            setError(cause instanceof Error ? cause.message : t('handoffFailed'));
        } finally {
            setBusy(false);
        }
    }

    async function exportPatch() {
        if (!plan?.planToken || busy || selected.length === 0) return;
        setBusy(true);
        setError(null);
        try {
            if (editorEngine.code.hasPendingWrites || editorEngine.action.hasPendingRebases) {
                throw new Error(t('handoffPendingWrites'));
            }
            const exported = await provider.exportPrivateHandoff(
                plan.planToken,
                cleanFiles
                    .filter((file) => !excluded.has(file.path))
                    .map(({ path, original, updated }) => ({ path, original, updated })),
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

    function toggleFile(path: string) {
        setExcluded((prev) => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
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
                className="gap-1.5"
            >
                <Icons.GitHubLogo className="h-3.5 w-3.5" />
                {t('handoffButton')}
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="bg-background border-border-popover gap-4 p-5 sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle className="text-regular font-semibold">
                            {t('handoffTitle')}
                        </DialogTitle>
                        <DialogDescription className="sr-only">
                            {t('handoffDescription', { appName: APP_NAME })}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="text-mini min-w-0 space-y-2">
                        <div className="flex h-6 items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2">
                                {editingFiles && summaries.length > 0 && (
                                    <Checkbox
                                        aria-label={t('handoffFilesLabel')}
                                        checked={
                                            allSelected
                                                ? true
                                                : selected.length > 0
                                                  ? 'indeterminate'
                                                  : false
                                        }
                                        onCheckedChange={() =>
                                            setExcluded(
                                                allSelected
                                                    ? new Set(summaries.map((file) => file.path))
                                                    : new Set(),
                                            )
                                        }
                                    />
                                )}
                                <span
                                    className="text-foreground-primary truncate font-medium"
                                    title={plan?.sourceRootPath}
                                >
                                    {baseName(plan?.sourceRootPath ?? rootPath)}
                                </span>
                                {!allSelected && (
                                    <span className="text-foreground-tertiary shrink-0">
                                        {t('handoffSelectedCount', {
                                            selected: selected.length,
                                            total: summaries.length,
                                        })}
                                    </span>
                                )}
                            </div>
                            {summaries.length > 0 && !patchPath && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-mini h-6 px-2"
                                    disabled={busy}
                                    onClick={() => setEditingFiles((prev) => !prev)}
                                >
                                    {editingFiles ? t('handoffDoneEditing') : t('handoffEditFiles')}
                                </Button>
                            )}
                        </div>

                        <div className="border-border-popover bg-background-primary max-h-56 overflow-y-auto rounded-lg border p-1">
                            {!plan && busy ? (
                                <div className="text-foreground-secondary flex items-center gap-2 px-2 py-1.5">
                                    <Icons.LoadingSpinner className="h-3 w-3 animate-spin" />
                                    {t('working')}
                                </div>
                            ) : summaries.length === 0 ? (
                                <p className="text-foreground-secondary px-2 py-1.5">
                                    {t('handoffNoChanges', { appName: APP_NAME })}
                                </p>
                            ) : (
                                <ul>
                                    {summaries.map((file) => {
                                        const isExcluded = excluded.has(file.path);
                                        return (
                                            <li key={file.path}>
                                                <label
                                                    title={file.path}
                                                    className={cn(
                                                        'flex min-w-0 items-center gap-2 rounded px-2 py-1',
                                                        editingFiles &&
                                                            'hover:bg-background-hover cursor-pointer',
                                                    )}
                                                >
                                                    {editingFiles && (
                                                        <Checkbox
                                                            checked={!isExcluded}
                                                            onCheckedChange={() =>
                                                                toggleFile(file.path)
                                                            }
                                                        />
                                                    )}
                                                    <span
                                                        className={cn(
                                                            'min-w-0 flex-1 truncate',
                                                            isExcluded
                                                                ? 'text-foreground-tertiary'
                                                                : 'text-foreground-primary',
                                                        )}
                                                    >
                                                        {file.name}
                                                    </span>
                                                    {file.kind === 'structure' && !isExcluded && (
                                                        <span
                                                            className="shrink-0"
                                                            title={t('handoffKindStructure')}
                                                        >
                                                            <Icons.ExclamationTriangle
                                                                className="text-foreground-warning h-3 w-3"
                                                                aria-label={t(
                                                                    'handoffKindStructure',
                                                                )}
                                                            />
                                                        </span>
                                                    )}
                                                    <span className="shrink-0 font-mono tabular-nums">
                                                        {isExcluded ? (
                                                            <span className="text-foreground-tertiary">
                                                                {t('handoffExcluded')}
                                                            </span>
                                                        ) : (
                                                            <>
                                                                <span className="text-foreground-success">
                                                                    +{file.added}
                                                                </span>
                                                                <span className="text-destructive ml-1.5">
                                                                    -{file.removed}
                                                                </span>
                                                            </>
                                                        )}
                                                    </span>
                                                </label>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>

                        {summaries.length > 1 && (
                            <div className="flex justify-end px-3 font-mono tabular-nums">
                                <span className="text-foreground-success">+{totals.added}</span>
                                <span className="text-destructive ml-1.5">-{totals.removed}</span>
                            </div>
                        )}
                    </div>

                    {plan?.sourceChanged && (
                        <p className="text-foreground-warning text-mini" role="alert">
                            {t('handoffSourceChanged')}
                        </p>
                    )}
                    {plan && plan.unsupportedChanges.length > 0 && (
                        <p className="text-foreground-warning text-mini break-words" role="alert">
                            {t('handoffUnsupported', {
                                appName: APP_NAME,
                                paths: plan.unsupportedChanges.map(baseName).join(', '),
                            })}
                        </p>
                    )}
                    {error && (
                        <p className="text-foreground-warning text-mini break-words" role="alert">
                            {error}
                        </p>
                    )}
                    {patchPath && (
                        <p className="text-mini flex items-center gap-2" role="status">
                            <Icons.Check className="text-foreground-success h-3.5 w-3.5 shrink-0" />
                            {t('handoffExported')}
                        </p>
                    )}

                    <DialogFooter className="gap-2">
                        {error && !busy && (
                            <Button variant="outline" size="sm" onClick={() => void review()}>
                                {t('handoffRefresh')}
                            </Button>
                        )}
                        {patchPath ? (
                            <>
                                <Button variant="outline" size="sm" onClick={() => void copyPath()}>
                                    {t('handoffCopyPath')}
                                </Button>
                                <Button size="sm" onClick={() => setOpen(false)}>
                                    {t('handoffClose')}
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                                    {t('handoffCancel')}
                                </Button>
                                <Button
                                    size="sm"
                                    className="gap-1.5"
                                    disabled={
                                        busy || blocked || !plan?.planToken || selected.length === 0
                                    }
                                    onClick={() => void exportPatch()}
                                >
                                    {busy && plan ? (
                                        <Icons.LoadingSpinner className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <>
                                            <Icons.GitHubLogo className="h-3.5 w-3.5" />
                                            {t('handoffButton')}
                                        </>
                                    )}
                                </Button>
                            </>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
