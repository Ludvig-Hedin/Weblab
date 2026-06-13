'use client';

import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';
import { CardDescription, CardTitle } from '@weblab/ui/card';
import { ProgressWithInterval } from '@weblab/ui/progress-with-interval';

import { useFigmaImport } from '../_context';
import { StepContent, StepFooter, StepHeader } from '../../steps';

export const FigmaFinalizing = () => {
    const t = useTranslations('projects.importFigma');
    const { isFinalizing, finalizeError, retry, cancel, finalizeProgress } = useFigmaImport();

    const phaseLabel =
        finalizeProgress.phase === 'creating-sandbox'
            ? t('creatingPhase')
            : finalizeProgress.phase === 'uploading'
              ? t('uploadingPhase', { uploaded: String(finalizeProgress.filesUploaded), total: String(finalizeProgress.totalFiles) })
              : finalizeProgress.phase === 'installing'
                ? t('installingPhase')
                : finalizeProgress.phase === 'creating-project'
                  ? t('creatingProjectPhase')
                  : finalizeProgress.phase === 'opening-editor'
                    ? t('openingEditorPhase')
                    : t('creatingYourProject');

    return (
        <>
            <StepHeader>
                <CardTitle>{t('settingUpProject')}</CardTitle>
                <CardDescription>{phaseLabel}</CardDescription>
            </StepHeader>
            <StepContent>
                <motion.div
                    key="finalizing"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="w-full"
                >
                    {finalizeError ? (
                        <p className="text-destructive text-sm">{finalizeError}</p>
                    ) : (
                        <ProgressWithInterval isLoading={isFinalizing} />
                    )}
                </motion.div>
            </StepContent>
            <StepFooter>
                <Button onClick={cancel} disabled={isFinalizing} variant="outline">
                    {t('cancel')}
                </Button>
                {finalizeError && (
                    <Button onClick={retry} disabled={isFinalizing}>
                        {t('retry')}
                    </Button>
                )}
            </StepFooter>
        </>
    );
};
