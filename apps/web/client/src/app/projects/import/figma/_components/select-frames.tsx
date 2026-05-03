'use client';

import { Button } from '@weblab/ui/button';
import { CardContent, CardDescription, CardTitle } from '@weblab/ui/card';
import { Icons } from '@weblab/ui/icons';
import { motion } from 'motion/react';
import { StepContent, StepFooter, StepHeader } from '../../steps';
import { useFigmaImport } from '../_context';

export const FigmaSelectFrames = () => {
    const {
        prevStep,
        nextStep,
        fileName,
        frames,
        selectedFrameIds,
        toggleFrame,
        selectAll,
        deselectAll,
        isFinalizing,
    } = useFigmaImport();

    const canImport = selectedFrameIds.size > 0;
    const allSelected = frames.length > 0 && selectedFrameIds.size === frames.length;

    return (
        <>
            <StepHeader>
                <CardTitle>Select frames</CardTitle>
                <CardDescription>
                    Choose which frames to import from &quot;{fileName}&quot;.
                </CardDescription>
            </StepHeader>
            <StepContent>
                <motion.div
                    key="select-frames"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="w-full"
                >
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-foreground-secondary">
                                {selectedFrameIds.size} of {frames.length} selected
                            </p>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={allSelected ? deselectAll : selectAll}
                            >
                                {allSelected ? 'Deselect all' : 'Select all'}
                            </Button>
                        </div>
                        {frames.length === 0 ? (
                            <p className="text-sm text-foreground-secondary text-center py-6">
                                No frames found in this file&apos;s first page.
                            </p>
                        ) : (
                            <CardContent className="p-0 max-h-52 overflow-y-auto border rounded-md">
                                {frames.map((frame) => {
                                    const isSelected = selectedFrameIds.has(frame.id);
                                    return (
                                        <button
                                            key={frame.id}
                                            onClick={() => toggleFrame(frame.id)}
                                            className={`w-full text-left p-3 border-b last:border-b-0 hover:bg-secondary transition-colors ${isSelected ? 'bg-secondary/50' : ''}`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <div
                                                    className="w-4 h-4 rounded border shrink-0"
                                                    style={{ backgroundColor: frame.backgroundColor }}
                                                />
                                                <span className="text-sm font-medium flex-1 truncate">
                                                    {frame.name}
                                                </span>
                                                <span className="text-xs text-foreground-secondary shrink-0">
                                                    {frame.width}×{frame.height}
                                                </span>
                                                {isSelected && (
                                                    <Icons.Check className="w-4 h-4 text-green-500 shrink-0" />
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </CardContent>
                        )}
                    </div>
                </motion.div>
            </StepContent>
            <StepFooter>
                <Button onClick={prevStep} variant="outline" disabled={isFinalizing}>
                    Back
                </Button>
                <Button onClick={() => void nextStep()} disabled={!canImport || isFinalizing}>
                    Create Project
                </Button>
            </StepFooter>
        </>
    );
};
