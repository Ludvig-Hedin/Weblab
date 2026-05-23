import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import { observer } from 'mobx-react-lite';

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
            toast.success('Project is being unpublished', {
                description: 'Deployment ID: ' + unpublishResponse.deploymentId,
            });
        } else {
            toast.error('Failed to unpublish project', {
                description: 'Please try again.',
            });
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <h2 className="text-largePlus">Danger Zone</h2>
            <div className="flex flex-col gap-4">
                <div className="flex flex-row items-center gap-2">
                    <p className="text-regular text-foreground-tertiary">
                        {!previewDomain
                            ? 'Your domain is not published'
                            : `Unpublish from ${previewDomain.url}`}
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
                                    ? 'Unpublishing...'
                                    : 'Unpublish'}
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Unpublish preview domain?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    {previewDomain
                                        ? `Visitors will no longer be able to reach ${previewDomain.url}. You can republish anytime.`
                                        : 'This will remove the preview deployment.'}
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={() => {
                                        if (previewDomain) {
                                            void unpublish(DeploymentType.UNPUBLISH_PREVIEW);
                                        }
                                    }}
                                >
                                    Unpublish
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
                {customDomain && (
                    <div className="flex flex-row items-center gap-2">
                        <p className="text-regular text-foreground-tertiary">
                            Unpublish from {customDomain.url}
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
                                        ? 'Unpublishing...'
                                        : 'Unpublish'}
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Unpublish custom domain?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Visitors will no longer be able to reach {customDomain.url}.
                                        You can republish anytime.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={() =>
                                            void unpublish(DeploymentType.UNPUBLISH_CUSTOM)
                                        }
                                    >
                                        Unpublish
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
