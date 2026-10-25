'use client';

import { useFormatter, useTranslations } from 'next-intl';

import type { Project } from '@weblab/models';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@weblab/ui/dialog';

import { formatTechLabel } from './projects-toolbar';
import { SourceLocationControls } from './source-location-controls';

export function ProjectDetailsDialog({
    project,
    folderName,
    open,
    onOpenChange,
}: {
    project: Project;
    folderName?: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const t = useTranslations('selectProject');
    const format = useFormatter();
    const root = project.metadata.runtime?.local?.rootPath;
    const framework = project.metadata.runtime?.framework;
    const date = (value: Date) =>
        format.dateTime(new Date(value), {
            dateStyle: 'medium',
            timeStyle: 'short',
        });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                aria-describedby={undefined}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
            >
                <DialogHeader>
                    <DialogTitle>{project.name}</DialogTitle>
                </DialogHeader>
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-4 text-sm">
                    <dt className="text-foreground-tertiary">{t('filterFolder')}</dt>
                    <dd>{folderName ?? t('filterFolderNone')}</dd>
                    {root && project.metadata.storageMode === 'local' && (
                        <>
                            <dt className="text-foreground-tertiary">{t('localFolderPath')}</dt>
                            <dd className="min-w-0">
                                <SourceLocationControls rootPath={root} active={open} />
                            </dd>
                        </>
                    )}
                    {framework && (
                        <>
                            <dt className="text-foreground-tertiary">{t('tableColTech')}</dt>
                            <dd>{formatTechLabel(framework)}</dd>
                        </>
                    )}
                    <dt className="text-foreground-tertiary">{t('detailsCreated')}</dt>
                    <dd>{date(project.metadata.createdAt)}</dd>
                    <dt className="text-foreground-tertiary">{t('tableColUpdated')}</dt>
                    <dd>{date(project.metadata.updatedAt)}</dd>
                </dl>
            </DialogContent>
        </Dialog>
    );
}
