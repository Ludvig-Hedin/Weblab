'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@weblab/ui/button';

import { useSourceLocation } from './use-source-location';

export function SourceLocationControls({
    rootPath,
    active = true,
}: {
    rootPath: string;
    active?: boolean;
}) {
    const t = useTranslations('selectProject');
    const source = useSourceLocation(rootPath, active);
    const path = source.location?.sourcePath;
    useEffect(() => {
        if (source.error) toast.error(t('sourceActionFailed'), { description: source.error });
    }, [source.error, t]);
    const copyPath = async (path?: string) => {
        if (!path) return;
        try {
            await navigator.clipboard.writeText(path);
            toast.success(t('pathCopied'));
        } catch {
            toast.error(t('copyPathFailed'));
        }
    };

    return (
        <div className="min-w-0 space-y-2">
            {path && (
                <span className="block select-text break-all font-mono text-xs leading-5">
                    {path}
                </span>
            )}
            {source.location?.status !== 'available' && (
                <p className="text-foreground-tertiary text-xs">
                    {t(
                        source.loading && !source.location
                            ? 'sourceChecking'
                            : source.location?.status === 'missing'
                              ? 'sourceMissing'
                              : source.location?.status === 'permissionDenied'
                                ? 'sourcePermissionDenied'
                                : source.location?.status === 'needsConfirmation'
                                  ? 'sourceNeedsConfirmation'
                                  : 'sourceUnknown',
                    )}
                </p>
            )}
            <div className="flex flex-wrap gap-2">
                {path && (
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={source.loading}
                        onClick={() => void copyPath(path)}
                    >
                        {t('copyPath')}
                    </Button>
                )}
                {source.location?.status === 'available' && (
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={source.loading}
                        onClick={() => void source.reveal()}
                    >
                        {t('revealInFinder')}
                    </Button>
                )}
                {source.supported && (
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={source.loading}
                        onClick={() => void source.locate()}
                    >
                        {t(
                            path && source.location?.status === 'available'
                                ? 'changeSourceFolder'
                                : 'locateSourceFolder',
                        )}
                    </Button>
                )}
            </div>
            {source.candidate && (
                <div className="space-y-2 pt-2">
                    <p className="text-foreground-tertiary text-xs">{t('sourcePreviousFolder')}</p>
                    <p className="break-all font-mono text-xs">
                        {source.candidate.previousPath ?? path ?? t('sourceUnknownPath')}
                    </p>
                    <p className="text-foreground-tertiary text-xs">{t('sourceChosenFolder')}</p>
                    <p className="break-all font-mono text-xs">{source.candidate.sourcePath}</p>
                    <p className="text-xs">{t('sourceFutureUpdates')}</p>
                    {source.candidate.sourceChanged && (
                        <p className="text-foreground-tertiary text-xs">
                            {t('sourceReviewChanges')}
                        </p>
                    )}
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            disabled={source.loading || !source.candidate.token}
                            onClick={() => void source.confirm()}
                        >
                            {t('useSourceFolder')}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={source.loading}
                            onClick={source.cancel}
                        >
                            {t('cancel')}
                        </Button>
                    </div>
                </div>
            )}
            <details className="text-foreground-tertiary pt-2 text-xs">
                <summary className="cursor-pointer">
                    {t(
                        source.location?.workingPath
                            ? 'savedWorkLocation'
                            : 'workingFolderLocation',
                    )}
                </summary>
                <p className="mt-2 select-text break-all font-mono">
                    {source.location?.workingPath ?? rootPath}
                </p>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void copyPath(source.location?.workingPath ?? rootPath)}
                >
                    {t('copyPath')}
                </Button>
            </details>
        </div>
    );
}
