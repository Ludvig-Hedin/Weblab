'use client';

import { motion } from 'motion/react';

import { Button } from '@weblab/ui/button';
import { CardDescription, CardTitle } from '@weblab/ui/card';
import { ProgressWithInterval } from '@weblab/ui/progress-with-interval';

import { useFigmaImport } from '../_context';
import { StepContent, StepFooter, StepHeader } from '../../steps';

export const FigmaFinalizing = () => {
    const { isFinalizing, finalizeError, retry, cancel } = useFigmaImport();

    return (
        <>
            <StepHeader>
                <CardTitle>Setting up project...</CardTitle>
                <CardDescription>Creating your project with the imported frames.</CardDescription>
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
                        <p className="text-sm text-red-400">{finalizeError}</p>
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
