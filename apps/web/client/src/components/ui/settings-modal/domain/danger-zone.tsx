import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { DeploymentStatus, DeploymentType } from '@weblab/models/hosting';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@weblab/ui/alert-dialog';
import { Button } from '@weblab/ui/button';
import { toast } from '@weblab/ui/sonner';

import type { Id } from '@convex/_generated/dataModel';
import { useEditorEngine } from '@/components/store/editor';
import { useHostingType } from '@/components/store/hosting';

export const DangerZone = observer(() => {
    const t = useTranslations('settings.dangerZone');
    const editorEngine = useEditorEngine();
    const projectId = editorEngine.projectId as Id<'projects'>;

    const domains = useQuery(api.domains.getAll, { projectId });
    const { deployment: unpublishPreviewDeployment, unpublish: runUnpublishPreview } =
        useHostingType(DeploymentType.UNPUBLISH_PREVIEW);
    const { deployment: unpublishCustomDeployment, unpublish: runUnpublishCustom } = useHostingType(
        DeploymentType.UNPUBLISH_CUSTOM,
    );

    const previewDomain = domains?.preview;
    const customDomain = domains?.published;

    const unpublish = async (type: DeploymentType) => {
        let unpublishResponse: {
            deploymentId: string;
        } | null = null;
        if (type === DeploymentType.UNPUBLISH_PREVIEW) {
            unpublishResponse = await runUnpublishPreview(editorEngine.projectId);
        } else {
            unpublishResponse = await runUnpublishCustom(editorEngine.projectId);
        }

        if (unpublishResponse) {
            toast.success(t('toastUnpublishSuccess'), {
                description: t('toastUnpublishSuccessDesc', { id: unpublishResponse.deploymentId }),
            });
        } else {
            toast.error(t('toastUnpublishFailed'), {
                description: t('toastUnpublishFailedDesc'),
            });
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <h2 className="text-largePlus">{t('title')}</h2>
            <div className="flex flex-col gap-4">
                <div className="flex flex-row items-center gap-2">
                    <p className="text-regular text-foreground-tertiary">
                        {!previewDomain
                            ? t('notPublished')
                            : t('unpublishFrom', { url: previewDomain.url })}
                    </p>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button
                                className="ml-auto"
                                size="sm"
                                variant="destructive"
                                disabled={
                                    !previewDomain ||
                                    unpublishPreviewDeployment?.status ===
                                        DeploymentStatus.IN_PROGRESS
                                }
                            >
                                {unpublishPreviewDeployment?.status === DeploymentStatus.IN_PROGRESS
                                    ? t('unpublishing')
                                    : t('unpublish')}
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>{t('unpublishPreviewTitle')}</AlertDialogTitle>
                                <AlertDialogDescription>
                                    {previewDomain
                                        ? t('unpublishPreviewDesc', { url: previewDomain.url })
                                        : t('unpublishPreviewDescFallback')}
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={() => {
                                        if (previewDomain) {
                                            void unpublish(DeploymentType.UNPUBLISH_PREVIEW);
                                        }
                                    }}
                                >
                                    {t('unpublish')}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
                {customDomain && (
                    <div className="flex flex-row items-center gap-2">
                        <p className="text-regular text-foreground-tertiary">
                            {t('unpublishFrom', { url: customDomain.url })}
                        </p>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button
                                    className="ml-auto"
                                    size="sm"
                                    variant="destructive"
                                    disabled={
                                        !customDomain ||
                                        unpublishCustomDeployment?.status ===
                                            DeploymentStatus.IN_PROGRESS
                                    }
                                >
                                    {unpublishCustomDeployment?.status ===
                                    DeploymentStatus.IN_PROGRESS
                                        ? t('unpublishing')
                                        : t('unpublish')}
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>{t('unpublishCustomTitle')}</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        {t('unpublishCustomDesc', { url: customDomain.url })}
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={() =>
                                            void unpublish(DeploymentType.UNPUBLISH_CUSTOM)
                                        }
                                    >
                                        {t('unpublish')}
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                )}
            </div>
        </div>
    );
});
