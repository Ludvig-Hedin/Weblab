import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useLocale, useTranslations } from 'next-intl';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@weblab/ui/accordion';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons/index';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import { Separator } from '@weblab/ui/separator';
import { toast } from '@weblab/ui/sonner';

import { useEditorEngine } from '@/components/store/editor';
import { NoVersions } from './empty-state/version';
import { VersionRow, VersionRowType } from './version-row';

export const Versions = observer(() => {
    const t = useTranslations('settings.versions');
    const locale = useLocale();
    const editorEngine = useEditorEngine();
    const [commitToRename, setCommitToRename] = useState<string | null>(null);
    const [isCreatingBackup, setIsCreatingBackup] = useState(false);
    const selectedBranchId = editorEngine.branches.activeBranch.id;
    const branchData = editorEngine.branches.getBranchDataById(selectedBranchId);
    const gitManager = branchData?.sandbox.gitManager;
    const commits = gitManager?.commits;
    const isLoadingCommits = gitManager?.isLoadingCommits;

    // Group commits by date
    const groupedCommits = commits?.reduce(
        (acc, commit) => {
            const date = new Date(commit.timestamp * 1000);
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            let dateKey: string;
            if (date.toDateString() === today.toDateString()) {
                dateKey = t('today');
            } else if (date.toDateString() === yesterday.toDateString()) {
                dateKey = t('yesterday');
            } else {
                dateKey = date.toLocaleDateString(locale, {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                });
            }

            if (!acc[dateKey]) {
                acc[dateKey] = [];
            }
            acc[dateKey]?.push(commit);
            return acc;
        },
        {} as Record<string, typeof commits>,
    );

    const handleNewBackup = async () => {
        try {
            setIsCreatingBackup(true);
            if (!gitManager) {
                toast.error(t('toastGitNotInit'));
                return;
            }

            const result = await gitManager.createCommit();
            if (!result.success) {
                toast.error(t('toastCreateFailed'), {
                    description: result.error || 'Unknown error',
                });
                return;
            }

            toast.success(t('toastCreateSuccess'));
            editorEngine.posthog.capture('versions_create_commit_success');

            const latestCommit = gitManager.commits?.[0];
            if (!latestCommit) {
                console.error('No latest commit found');
                return;
            }
            setCommitToRename(latestCommit.oid);
        } catch (error) {
            toast.error(t('toastCreateFailed'), {
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        } finally {
            setIsCreatingBackup(false);
        }
    };

    return (
        <div className="text-regular flex flex-col">
            <div className="flex flex-row items-center justify-center gap-3 px-6 py-6">
                <h2 className="text-largePlus">{t('title')}</h2>

                {isLoadingCommits && <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />}

                {/* Branch selector */}
                <Select
                    value={selectedBranchId}
                    onValueChange={(value) => {
                        editorEngine.branches.switchToBranch(value);
                    }}
                >
                    <SelectTrigger className="ml-auto min-w-38">
                        <SelectValue placeholder={t('selectBranch')} />
                    </SelectTrigger>
                    <SelectContent>
                        {editorEngine.branches.allBranches.map((branch) => (
                            <SelectItem key={branch.id} value={branch.id}>
                                {branch.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {gitManager && (
                    <Button
                        variant="outline"
                        className="bg-background-secondary text-regular rounded-xs font-normal"
                        onClick={handleNewBackup}
                        disabled={isLoadingCommits || isCreatingBackup}
                    >
                        {isCreatingBackup ? (
                            <Icons.LoadingSpinner className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Icons.Plus className="mr-2 h-4 w-4" />
                        )}
                        {t('newBackup')}
                    </Button>
                )}
            </div>
            <Separator />

            {commits && commits.length > 0 ? (
                <div className="flex flex-col gap-2">
                    <Accordion type="multiple" defaultValue={Object.keys(groupedCommits || {})}>
                        {groupedCommits &&
                            Object.entries(groupedCommits).map(([date, dateCommits]) => (
                                <AccordionItem key={date} value={date}>
                                    <AccordionTrigger className="text-foreground-tertiary text-large px-6 py-4 font-normal">
                                        {date}
                                    </AccordionTrigger>
                                    <AccordionContent>
                                        <div className="flex flex-col">
                                            {dateCommits.map((commit, index) => (
                                                <React.Fragment key={commit.oid}>
                                                    <VersionRow
                                                        commit={commit}
                                                        type={
                                                            date === t('today')
                                                                ? VersionRowType.TODAY
                                                                : VersionRowType.PREVIOUS_DAYS
                                                        }
                                                        autoRename={commit.oid === commitToRename}
                                                        onRename={() => setCommitToRename(null)}
                                                    />
                                                    {index < dateCommits.length - 1 && (
                                                        <Separator className="bg-border mx-6 w-[calc(100%-theme(spacing.12))]" />
                                                    )}
                                                </React.Fragment>
                                            ))}
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            ))}
                    </Accordion>
                </div>
            ) : (
                <NoVersions />
            )}
        </div>
    );
});
