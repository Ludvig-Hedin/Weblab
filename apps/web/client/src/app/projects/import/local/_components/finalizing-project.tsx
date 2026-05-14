'use client';

import { motion } from 'motion/react';

import { Button } from '@weblab/ui/button';
import { CardDescription, CardTitle } from '@weblab/ui/card';
import { ProgressWithInterval } from '@weblab/ui/progress-with-interval';

import { useProjectCreation } from '../_context';
import { StepContent, StepFooter, StepHeader } from '../../steps';

export const FinalizingProject = () => {
    const { isFinalizing, error, retry, cancel, finalizeProgress } = useProjectCreation();

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
                    : "We're setting up your project";

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
