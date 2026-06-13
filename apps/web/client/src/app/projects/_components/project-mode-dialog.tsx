'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@weblab/ui/dialog';
import { Icons } from '@weblab/ui/icons';

import { ExternalRoutes } from '@/utils/constants';

type ProjectModeIntent = 'create' | 'import';

interface ProjectModeDialogProps {
    open: boolean;
    intent: ProjectModeIntent;
    isBusy?: boolean;
    onOpenChange: (open: boolean) => void;
    onCloudSelect: () => void;
}

export function ProjectModeDialog({
    open,
    intent,
    isBusy = false,
    onOpenChange,
    onCloudSelect,
}: ProjectModeDialogProps) {
    const t = useTranslations('projects.modeDialog');
    const texts = {
        create: {
            title: t('create.title'),
            description: t('create.description'),
            cloudTitle: t('create.cloudTitle'),
            cloudDescription: t('create.cloudDescription'),
            localTitle: t('create.localTitle'),
            localDescription: t('create.localDescription'),
            cloudAction: t('create.cloudAction'),
        },
        import: {
            title: t('import.title'),
            description: t('import.description'),
            cloudTitle: t('import.cloudTitle'),
            cloudDescription: t('import.cloudDescription'),
            localTitle: t('import.localTitle'),
            localDescription: t('import.localDescription'),
            cloudAction: t('import.cloudAction'),
        },
    };
    const text = texts[intent];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[620px]">
                <DialogHeader>
                    <DialogTitle>{text.title}</DialogTitle>
                    <DialogDescription>{text.description}</DialogDescription>
                </DialogHeader>

                <div className="grid gap-3 sm:grid-cols-2">
                    <button
                        type="button"
                        onClick={onCloudSelect}
                        disabled={isBusy}
                        className="group border-foreground/10 bg-foreground/4 hover:border-foreground/20 hover:bg-foreground/8 flex min-h-44 flex-col justify-between rounded-lg border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <div className="space-y-3">
                            <div className="border-foreground/10 bg-background flex h-9 w-9 items-center justify-center rounded-full border">
                                {isBusy ? (
                                    <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Icons.Globe className="h-4 w-4" />
                                )}
                            </div>
                            <div>
                                <div className="text-foreground text-sm font-medium">
                                    {text.cloudTitle}
                                </div>
                                <div className="text-foreground-tertiary mt-1 text-sm leading-5">
                                    {text.cloudDescription}
                                </div>
                            </div>
                        </div>
                        <div className="text-foreground-secondary group-hover:text-foreground mt-4 flex items-center gap-2 text-sm">
                            {text.cloudAction}
                            <Icons.ArrowRight className="h-4 w-4" />
                        </div>
                    </button>

                    <div
                        className="border-foreground/8 bg-foreground/3 flex min-h-44 cursor-not-allowed flex-col justify-between rounded-lg border p-4 text-left opacity-75"
                        aria-disabled="true"
                    >
                        <div className="space-y-3">
                            <div className="border-foreground/10 bg-background flex h-9 w-9 items-center justify-center rounded-full border">
                                <Icons.Directory className="h-4 w-4" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <div className="text-foreground text-sm font-medium">
                                        {text.localTitle}
                                    </div>
                                    <span className="border-foreground/10 text-foreground-tertiary rounded-full border px-2 py-0.5 text-tiny">
                                        {t('desktopApp')}
                                    </span>
                                </div>
                                <div className="text-foreground-tertiary mt-1 text-sm leading-5">
                                    {text.localDescription}
                                </div>
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            asChild
                            className="pointer-events-auto mt-4 w-fit"
                        >
                            <a href={ExternalRoutes.DOWNLOAD_PAGE} target="_blank" rel="noreferrer">
                                {t('download')}
                            </a>
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
