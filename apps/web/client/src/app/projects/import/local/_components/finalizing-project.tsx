'use client';

import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';
import { CardDescription, CardTitle } from '@weblab/ui/card';
import { ProgressWithInterval } from '@weblab/ui/progress-with-interval';

import { useProjectCreation } from '../_context';
import { StepContent, StepFooter, StepHeader } from '../../steps';

export const FinalizingProject = () => {
    const t = useTranslations('projects.importLocal');
    const { isFinalizing, error, retry, cancel, finalizeProgress } = useProjectCreation();

    const phaseLabel =
        finalizeProgress.phase === 'creating-sandbox'
            ? t('creating')
            : finalizeProgress.phase === 'uploading'
              ? t('uploadingFiles', { uploaded: String(finalizeProgress.filesUploaded), total: String(finalizeProgress.totalFiles) })
              : finalizeProgress.phase === 'installing'
                ? t('installing')
                : finalizeProgress.phase === 'creating-project'
                  ? t('creatingProject')
                  : finalizeProgress.phase === 'opening-editor'
                    ? t('openingEditor')
                    : t('settingUpDefault');

    return (
        <>
            <StepHeader>
                <CardTitle>{'Setting up project...'}</CardTitle>
                <CardDescription>{phaseLabel}</CardDescription>
            </StepHeader>
            <StepContent>
                <motion.div
                    key="name"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="w-full"
                >
                    {error ? (
                        <div className="flex h-full w-full items-center justify-center">
                            <p>{error}</p>
                        </div>
                    ) : (
                        <ProgressWithInterval isLoading={isFinalizing ?? false} />
                    )}
                </motion.div>
            </StepContent>
            <StepFooter>
                <Button onClick={cancel} disabled={isFinalizing} variant="outline">
                    Cancel
                </Button>
                {error && (
                    <Button onClick={retry} disabled={isFinalizing}>
                        Retry
                    </Button>
                )}
            </StepFooter>
        </>
    );
};
