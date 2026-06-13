'use client';

import { useEffect, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useAction } from 'convex/react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@weblab/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@weblab/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { Switch } from '@weblab/ui/switch';
import { Textarea } from '@weblab/ui/textarea';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';

type CommitAction = 'commit' | 'commit-push' | 'commit-pr';

const ACTION_ICONS: Record<CommitAction, React.ReactNode> = {
    commit: <Icons.Commit className="h-4 w-4 shrink-0" />,
    'commit-push': <Icons.Upload className="h-4 w-4 shrink-0" />,
    'commit-pr': <Icons.GitHubLogo className="h-4 w-4 shrink-0" />,
};

interface CommitModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialAction: CommitAction;
}

const CommitModal = observer(({ open, onOpenChange, initialAction }: CommitModalProps) => {
    const t = useTranslations('editor.git') as (
        key: string,
        values?: Record<string, string | number>,
    ) => string;
    const editorEngine = useEditorEngine();
    const createPullRequest = useAction(api.githubActions.createPullRequest);

    const [fileCount, setFileCount] = useState<number | null>(null);
    const [stagedFileCount, setStagedFileCount] = useState<number | null>(null);
    const [diffStat, setDiffStat] = useState<{
        added: number;
        removed: number;
    } | null>(null);
    const [gitInfoError, setGitInfoError] = useState<string | null>(null);
    const [includeUnstaged, setIncludeUnstaged] = useState(true);
    const [commitMessage, setCommitMessage] = useState('');
    const [action, setAction] = useState<CommitAction>(initialAction);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (open) {
            setAction(initialAction);
            setCommitMessage('');
            setIncludeUnstaged(true);
            setFileCount(null);
            setStagedFileCount(null);
            setDiffStat(null);
            setGitInfoError(null);
            void loadGitInfo();
        }
    }, [open, initialAction]);

    async function loadGitInfo() {
        const gitManager = editorEngine.activeSandbox?.gitManager;
        if (!gitManager) {
            setFileCount(0);
            setDiffStat(null);
            setGitInfoError(t('errorStatusUnavailable'));
            return;
        }

        try {
            const [status, stat, stagedCount] = await Promise.all([
                gitManager.getStatus(),
                gitManager.getDiffStat(),
                gitManager.getStagedFileCount(),
            ]);
            setFileCount(status?.files.length ?? 0);
            setDiffStat(stat);
            setStagedFileCount(stagedCount);
            setGitInfoError(null);
        } catch (error) {
            console.error('Failed to load git info:', error);
            setFileCount(0);
            setStagedFileCount(0);
            setDiffStat(null);
            setGitInfoError(t('errorStatusFailed'));
        }
    }

    async function handleContinue() {
        setIsLoading(true);
        try {
            const gitManager = editorEngine.activeSandbox?.gitManager;
            if (!gitManager) {
                toast.error(t('toastGitUnavailable'));
                return;
            }
            const message = commitMessage.trim() || undefined;
            const activeBranch = editorEngine.branches.activeBranch;
            const branchName = activeBranch?.git?.branch ?? activeBranch?.name;
            const repoUrl = activeBranch?.git?.repoUrl ?? null;
            const baseBranch =
                editorEngine.branches.allBranches.find((branch) => branch.isDefault)?.git?.branch ??
                undefined;

            if (includeUnstaged && fileCount === 0) {
                toast.error(t('toastNoChanges'));
                return;
            }
            if (action === 'commit-pr') {
                if (!branchName) {
                    toast.error(t('toastNoBranchName'));
                    return;
                }
                if (!repoUrl) {
                    toast.error(t('toastNotLinked'));
                    return;
                }
                if (baseBranch && branchName === baseBranch) {
                    toast.error(t('toastNeedFeatureBranch'));
                    return;
                }
            }
            const prBranchName = branchName ?? undefined;
            const prRepoUrl = repoUrl ?? undefined;

            let commitResult;
            if (includeUnstaged) {
                commitResult = await gitManager.createCommit(message);
            } else {
                const hasStagedChanges = await gitManager.hasStagedChanges();
                if (!hasStagedChanges) {
                    toast.error(t('toastNoStagedChanges'));
                    return;
                }
                await gitManager.ensureGitConfig();
                // TODO(bug-hunt): Default-message divergence with the unstaged branch
                // above. createCommit() auto-generates a message when undefined;
                // commit() falls back to the placeholder 'New Weblab backup'.
                // Either pass `undefined` and let commit() generate, or have
                // createCommit() use the same placeholder for parity.
                commitResult = await gitManager.commit(message ?? 'New Weblab backup');
            }

            if (!commitResult.success) {
                toast.error(t('toastCommitFailed'), {
                    description: commitResult.error ?? undefined,
                });
                return;
            }

            if (action === 'commit-push') {
                const pushResult = await gitManager.push();
                if (!pushResult.success) {
                    toast.error(t('toastPushFailed'), {
                        description: pushResult.error ?? undefined,
                    });
                    return;
                }
                toast.success(t('toastCommittedPushed'));
            } else if (action === 'commit-pr' && prBranchName && prRepoUrl) {
                const pushResult = await gitManager.pushBranch(prBranchName, true);
                if (!pushResult.success) {
                    toast.error(t('toastPushFailed'), {
                        description: pushResult.error ?? undefined,
                    });
                    return;
                }

                const prResult = await createPullRequest({
                    repoUrl: prRepoUrl,
                    headBranch: prBranchName,
                    baseBranch,
                    title: message ?? `Update ${prBranchName}`,
                    body: `Created from Weblab on branch \`${prBranchName}\`.`,
                });

                const prUrl = prResult.url;
                const toastOptions = prUrl
                    ? {
                          description: prUrl,
                          action: {
                              label: 'Open PR',
                              onClick: () => window.open(prUrl, '_blank', 'noopener,noreferrer'),
                          },
                      }
                    : undefined;
                if (prResult.existing) {
                    toast.success(t('toastExistingPR'), toastOptions);
                } else {
                    toast.success(t('toastCreatedPR'), toastOptions);
                }
            } else {
                toast.success(t('toastCommitted'));
            }

            onOpenChange(false);
        } catch (error) {
            console.error('Git action failed:', error);
            toast.error(t('toastActionFailed'));
        } finally {
            setIsLoading(false);
        }
    }

    const stagedOnlyDisabled =
        !includeUnstaged && stagedFileCount !== null && stagedFileCount === 0;
    const noWorkingTreeChanges = includeUnstaged && fileCount !== null && fileCount === 0;
    const continueDisabled = isLoading || stagedOnlyDisabled || noWorkingTreeChanges;

    const branchName =
        editorEngine.branches.activeBranch?.git?.branch ??
        editorEngine.branches.activeBranch?.name ??
        'main';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <div className="mb-1 flex items-center gap-2">
                        <Icons.Commit className="h-5 w-5" />
                        <DialogTitle className="text-title3 font-semibold">
                            {t('dialogTitle')}
                        </DialogTitle>
                    </div>
                    <DialogDescription className="sr-only">{t('dialogDesc')}</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Branch */}
                    <div className="text-small flex items-center justify-between">
                        <span className="text-foreground-secondary">{t('branchLabel')}</span>
                        <div className="text-foreground-primary flex items-center gap-1.5">
                            <Icons.Branch className="h-3.5 w-3.5" />
                            <span>{branchName}</span>
                        </div>
                    </div>

                    {/* Changes */}
                    <div className="text-small flex items-center justify-between">
                        <span className="text-foreground-secondary">{t('changesLabel')}</span>
                        <div className="flex items-center gap-2">
                            {fileCount !== null && (
                                <span>{t('changesCount', { count: fileCount })}</span>
                            )}
                            {diffStat && (
                                <>
                                    <span className="text-foreground-success">
                                        +{diffStat.added}
                                    </span>
                                    <span className="text-destructive">-{diffStat.removed}</span>
                                </>
                            )}
                            {fileCount === null && diffStat === null && (
                                <Icons.LoadingSpinner className="h-3.5 w-3.5 animate-spin" />
                            )}
                        </div>
                    </div>
                    {gitInfoError && (
                        <p className="text-foreground-secondary text-mini">{gitInfoError}</p>
                    )}

                    {/* Include unstaged */}
                    <div className="flex items-center justify-between">
                        <label
                            htmlFor="include-unstaged"
                            className="text-small cursor-pointer select-none"
                        >
                            {t('includeUnstaged')}
                        </label>
                        <Switch
                            id="include-unstaged"
                            checked={includeUnstaged}
                            onCheckedChange={setIncludeUnstaged}
                            disabled={isLoading}
                        />
                    </div>
                    {!includeUnstaged && stagedFileCount !== null && (
                        <p className="text-foreground-secondary text-mini">
                            {stagedFileCount === 0
                                ? t('stageFilesWarning')
                                : t('stagedFilesReady', { count: stagedFileCount })}
                        </p>
                    )}

                    {/* Commit message */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <span className="text-small font-medium">{t('commitMsgLabel')}</span>
                        </div>
                        <Textarea
                            value={commitMessage}
                            onChange={(e) => setCommitMessage(e.target.value)}
                            placeholder={t('commitMsgPlaceholder')}
                            className="text-small resize-none"
                            rows={3}
                            disabled={isLoading}
                        />
                    </div>

                    {/* Next steps */}
                    <div className="space-y-1">
                        <p className="text-small font-medium">{t('nextStepsLabel')}</p>
                        <div className="border-border divide-border divide-y overflow-hidden rounded-md border">
                            {(['commit', 'commit-push', 'commit-pr'] as CommitAction[]).map((a) => (
                                <button
                                    key={a}
                                    type="button"
                                    onClick={() => setAction(a)}
                                    disabled={isLoading}
                                    className={cn(
                                        'text-small flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
                                        action === a
                                            ? 'text-foreground-primary'
                                            : 'text-foreground-secondary hover:text-foreground-primary hover:bg-background-secondary/40',
                                    )}
                                >
                                    {ACTION_ICONS[a]}
                                    <span className="flex-1">
                                        {a === 'commit'
                                            ? t('actionCommit')
                                            : a === 'commit-push'
                                              ? t('actionCommitPush')
                                              : t('actionCommitPR')}
                                    </span>
                                    {action === a && (
                                        <Icons.Check className="text-foreground-primary h-4 w-4 shrink-0" />
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <DialogFooter className="mt-2">
                    <Button
                        onClick={handleContinue}
                        disabled={continueDisabled}
                        className="min-w-[100px]"
                    >
                        {isLoading ? (
                            <>
                                <Icons.LoadingSpinner className="mr-2 h-4 w-4 animate-spin" />
                                {t('working')}
                            </>
                        ) : (
                            t('continue')
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
});

export const GitActionsButton = observer(() => {
    const t = useTranslations('editor.git') as (
        key: string,
        values?: Record<string, string | number>,
    ) => string;
    const editorEngine = useEditorEngine();
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [modalAction, setModalAction] = useState<CommitAction>('commit');

    function openModal(a: CommitAction) {
        setDropdownOpen(false);
        setModalAction(a);
        setModalOpen(true);
    }

    async function handleCreateBranch() {
        setDropdownOpen(false);
        const activeBranchId = editorEngine.branches.activeBranch?.id;
        if (!activeBranchId) {
            toast.error(t('toastNoActiveBranch'));
            return;
        }
        try {
            await editorEngine.branches.forkBranch(activeBranchId);
        } catch {
            // forkBranch handles its own error toasts
        }
    }

    return (
        <>
            <div className="border-input flex h-8 items-center overflow-hidden rounded-md border">
                <Button
                    variant="ghost"
                    size="sm"
                    // Slightly more right padding (pr-3) keeps the "Commit"
                    // label from sitting flush against the divider, giving
                    // the caret on the other side visual breathing room
                    // and reducing mis-clicks between the two halves.
                    className="border-input text-mini flex h-full items-center gap-1.5 rounded-none border-r pr-3 pl-2.5 hover:rounded-none"
                    onClick={() => openModal('commit')}
                >
                    <Icons.Cube className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">{t('dropdownCommit')}</span>
                </Button>
                <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            // Widen the caret target to 32px (w-8) and bump
                            // padding so the caret has ~6px from the divider
                            // on the left, matching the label's breathing
                            // room on the right.
                            className="h-full w-8 rounded-none px-2 hover:rounded-none"
                        >
                            <Icons.ChevronDown className="h-3 w-3" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuLabel>{t('gitActionsLabel')}</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            className="flex items-center gap-2"
                            onSelect={() => openModal('commit')}
                        >
                            <Icons.Commit className="h-4 w-4" />
                            <span>{t('dropdownCommit')}</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className="flex items-center gap-2"
                            onSelect={() => openModal('commit-push')}
                        >
                            <Icons.Upload className="h-4 w-4" />
                            <span>{t('dropdownCommitPush')}</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className="flex items-center gap-2"
                            onSelect={() => openModal('commit-pr')}
                        >
                            <Icons.GitHubLogo className="h-4 w-4" />
                            <span>{t('dropdownCreatePR')}</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            className="flex items-center gap-2"
                            onSelect={handleCreateBranch}
                        >
                            <Icons.Branch className="h-4 w-4" />
                            <span>{t('dropdownCreateBranch')}</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <CommitModal open={modalOpen} onOpenChange={setModalOpen} initialAction={modalAction} />
        </>
    );
});
