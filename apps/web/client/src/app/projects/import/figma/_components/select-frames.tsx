'use client';

import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';
import { CardContent, CardDescription, CardTitle } from '@weblab/ui/card';
import { Icons } from '@weblab/ui/icons';

import { useFigmaImport } from '../_context';
import { StepContent, StepFooter, StepHeader } from '../../steps';

export const FigmaSelectFrames = () => {
    const t = useTranslations('projects.importFigma');
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
                <CardTitle>{t('selectFramesTitle')}</CardTitle>
                <CardDescription>
                    {t('selectFramesDesc', { fileName })}
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
                            <p className="text-foreground-secondary text-sm">
                                {t('selectedCount', { selected: String(selectedFrameIds.size), total: String(frames.length) })}
                            </p>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={allSelected ? deselectAll : selectAll}
                            >
                                {allSelected ? t('deselectAll') : t('selectAll')}
                            </Button>
                        </div>
                        {frames.length === 0 ? (
                            <p className="text-foreground-secondary py-6 text-center text-sm">
                                {t('noFramesFound')}
                            </p>
                        ) : (
                            <CardContent className="max-h-52 overflow-y-auto rounded-md border p-0">
                                {frames.map((frame) => {
                                    const isSelected = selectedFrameIds.has(frame.id);
                                    return (
                                        <button
                                            key={frame.id}
                                            type="button"
                                            role="checkbox"
                                            aria-checked={isSelected}
                                            aria-label={`${frame.name}, ${frame.width}×${frame.height}`}
                                            onClick={() => toggleFrame(frame.id)}
                                            className={`hover:bg-secondary w-full border-b p-3 text-left transition-colors last:border-b-0 ${isSelected ? 'bg-secondary/50' : ''}`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <div
                                                    className="h-4 w-4 shrink-0 rounded border"
                                                    style={{
                                                        backgroundColor: frame.backgroundColor,
                                                    }}
                                                />
                                                <span className="flex-1 truncate text-sm font-medium">
                                                    {frame.name}
                                                </span>
                                                <span className="text-foreground-secondary shrink-0 text-xs">
                                                    {frame.width}×{frame.height}
                                                </span>
                                                {isSelected && (
                                                    <Icons.Check className="text-foreground-success h-4 w-4 shrink-0" />
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
                    {t('back')}
                </Button>
                <Button onClick={nextStep} disabled={!canImport || isFinalizing}>
                    {t('createProject')}
                </Button>
            </StepFooter>
        </>
    );
};
