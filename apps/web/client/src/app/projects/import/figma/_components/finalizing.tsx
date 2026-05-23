'use client';

import { motion } from 'motion/react';

import { Button } from '@weblab/ui/button';
import { CardDescription, CardTitle } from '@weblab/ui/card';
import { ProgressWithInterval } from '@weblab/ui/progress-with-interval';

import { useFigmaImport } from '../_context';
import { StepContent, StepFooter, StepHeader } from '../../steps';

export const FigmaFinalizing = () => {
    const { isFinalizing, finalizeError, retry, cancel, finalizeProgress } = useFigmaImport();

    const phaseLabel =
        finalizeProgress.phase === 'creating-sandbox'
            ? 'Creating sandbox'
            : finalizeProgress.phase === 'uploading'
              ? `Uploading ${finalizeProgress.filesUploaded}/${finalizeProgress.totalFiles} files`
              : finalizeProgress.phase === 'installing'
                ? 'Installing dependencies'
                : finalizeProgress.phase === 'creating-project'
                  ? 'Creating project'
                  : finalizeProgress.phase === 'opening-editor'
                    ? 'Opening editor'
                    : 'Creating your project with the imported frames.';

    return (
        <>
            <StepHeader>
                <CardTitle>Setting up project...</CardTitle>
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
                    Cancel
                </Button>
                {finalizeError && (
                    <Button onClick={retry} disabled={isFinalizing}>
                        Retry
                    </Button>
                )}
            </StepFooter>
        </>
    );
};
