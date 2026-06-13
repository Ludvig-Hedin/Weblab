'use client';

import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';
import { CardDescription, CardTitle } from '@weblab/ui/card';
import { Icons } from '@weblab/ui/icons';
import { ProgressWithInterval } from '@weblab/ui/progress-with-interval';

import { useImportGithubProject } from '../_context';
import { StepContent, StepFooter, StepHeader } from '../../steps';

export const FinalizingGithubProject = () => {
    const t = useTranslations('projects.importGitHub');
    const { repositoryImport, selectedRepo, retry, cancel } = useImportGithubProject();
    const phaseLabel =
        repositoryImport.phase === 'cloning-repository'
            ? t('cloningPhase')
            : repositoryImport.phase === 'creating-project'
              ? t('creatingProjectPhase')
              : repositoryImport.phase === 'opening-editor'
                ? t('openingEditorPhase')
                : t('settingUpDefault');

    return (
        <>
            <StepHeader>
                <CardTitle>
                    {repositoryImport.error ? t('importFailed') : t('settingUpProject')}
                </CardTitle>
                <CardDescription>
                    {repositoryImport.error
                        ? t('somethingWentWrong')
                        : phaseLabel}
                </CardDescription>
            </StepHeader>
            <StepContent>
                <motion.div
                    key="finalizing-content"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="w-full"
                >
                    {repositoryImport.error ? (
                        <div className="flex flex-col gap-3 rounded-md border border-red-800 bg-red-900/40 p-4 text-sm">
                            <div className="flex items-start gap-2">
                                <Icons.ExclamationTriangle className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
                                <div className="flex flex-col gap-1">
                                    {selectedRepo && (
                                        <p className="font-medium text-red-200">
                                            {selectedRepo.full_name}
                                        </p>
                                    )}
                                    <p className="text-red-300">{repositoryImport.error}</p>
                                </div>
                            </div>
                            <p className="text-foreground-secondary text-xs">
                                {t('repoAccessError')}
                            </p>
                        </div>
                    ) : (
                        <ProgressWithInterval isLoading={repositoryImport.isImporting ?? false} />
                    )}
                </motion.div>
            </StepContent>
            <StepFooter>
                <Button onClick={cancel} disabled={repositoryImport.isImporting} variant="outline">
                    {t('cancel')}
                </Button>
                {repositoryImport.error && (
                    <Button onClick={() => void retry()} disabled={repositoryImport.isImporting}>
                        <Icons.Reload className="mr-2 h-4 w-4" />
                        {t('retry')}
                    </Button>
                )}
            </StepFooter>
        </>
    );
};
