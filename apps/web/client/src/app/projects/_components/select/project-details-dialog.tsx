'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import type { Project } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@weblab/ui/dialog';
import { Icons } from '@weblab/ui/icons';

import { formatTechLabel } from './projects-toolbar';

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
    const path = project.metadata.runtime?.local?.rootPath;
    const framework = project.metadata.runtime?.framework;
    const date = (value: Date) =>
        format.dateTime(new Date(value), {
            dateStyle: 'medium',
            timeStyle: 'short',
        });

    const copyPath = async () => {
        if (!path) return;
        try {
            await navigator.clipboard.writeText(path);
            toast.success(t('pathCopied'));
        } catch {
            toast.error(t('copyPathFailed'));
        }
    };

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
                    {path && (
                        <>
                            <dt className="text-foreground-tertiary">{t('localFolderPath')}</dt>
                            <dd className="flex min-w-0 items-start gap-2">
                                <span className="font-mono text-xs leading-5 break-all select-text">
                                    {path}
                                </span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 shrink-0"
                                    aria-label={t('copyPath')}
                                    onClick={() => void copyPath()}
                                >
                                    <Icons.Copy className="h-3.5 w-3.5" />
                                </Button>
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
