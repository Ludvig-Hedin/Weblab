import { useState } from 'react';
import { api } from '@convex/_generated/api';
import { useAction, useQuery } from 'convex/react';
import { observer } from 'mobx-react-lite';

import { DeploymentStatus, DeploymentType } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons/index';
import { toast } from '@weblab/ui/sonner';
import { timeAgo } from '@weblab/utility';

import type { Id } from '@convex/_generated/dataModel';
import { useEditorEngine } from '@/components/store/editor';
import { useHostingType } from '@/components/store/hosting';
import { parseDeploymentError } from '@/utils/deploy-errors';
import { useSelectedProvider } from './selected-provider';
import { UrlSection } from './url';

export const PreviewDomainSection = observer(() => {
    const editorEngine = useEditorEngine();
    const { selectedProvider } = useSelectedProvider();
    const [isLoading, setIsLoading] = useState(false);
    const project = useQuery(api.projects.get, {
        projectId: editorEngine.projectId as Id<'projects'>,
    });
    const previewDomain = useQuery(api.domains.previewGet, {
        projectId: editorEngine.projectId as Id<'projects'>,
    });
    const createPreviewDomain = useAction(api.domainActions.previewCreate);
    const [isCreatingDomain, setIsCreatingDomain] = useState(false);
    const { deployment, publish: runPublish, isDeploying } = useHostingType(DeploymentType.PREVIEW);

    const createBaseDomain = async (): Promise<void> => {
        setIsCreatingDomain(true);
        try {
            const created = await createPreviewDomain({
                projectId: editorEngine.projectId as Id<'projects'>,
            });
            if (!created) {
                console.error('Failed to create preview domain');
                toast.error('Failed to create preview domain');
                return;
            }
            await publish();
        } finally {
            setIsCreatingDomain(false);
        }
    };

    const publish = async (): Promise<void> => {
        if (!project) {
            console.error('No project found');
            toast.error('No project found');
            return;
        }
        const sandboxId = editorEngine.branches.activeBranch?.sandbox?.id;
        if (!sandboxId) {
            console.error('No sandbox found');
            toast.error('No sandbox found');
            return;
        }
        setIsLoading(true);
        try {
            await runPublish({
                projectId: editorEngine.projectId,
                sandboxId,
                provider: selectedProvider,
            });
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const retry = () => {
        if (!previewDomain?.url) {
            console.error(`No preview domain info found`);
            return;
        }
        publish();
    };

    const renderDomain = () => {
        if (!previewDomain) {
            return 'Something went wrong';
        }

        return (
            <>
                <div className="flex w-full items-center">
                    <h3 className="text-foreground-tertiary text-mini font-medium">Base Domain</h3>
                    {deployment && deployment?.status === DeploymentStatus.COMPLETED && (
                        <div className="ml-auto flex items-center gap-2">
                            <p className="text-foreground-positive">Live</p>
                            <p>•</p>
                            <p>
                                Updated{' '}
                                {timeAgo(
                                    deployment.updatedAt
                                        ? new Date(deployment.updatedAt)
                                        : new Date(),
                                )}{' '}
                                ago
                            </p>
                        </div>
                    )}
                    {deployment?.status === DeploymentStatus.FAILED && (
                        <div className="ml-auto flex items-center gap-2">
                            <p className="text-destructive">Error</p>
                        </div>
                    )}
                    {deployment?.status === DeploymentStatus.CANCELLED && (
                        <div className="ml-auto flex items-center gap-2">
                            <p className="text-foreground-secondary">Cancelled</p>
                        </div>
                    )}
                    {isDeploying && (
                        <div className="ml-auto flex items-center gap-2">
                            <p className="">Updating • In progress</p>
                        </div>
                    )}
                </div>
                {renderActionSection()}
            </>
        );
    };

    const renderNoDomain = () => {
        return (
            <>
                <div className="flex w-full items-center">
                    <h3 className="text-foreground-tertiary text-mini font-medium">Publish</h3>
                </div>

                <Button disabled={isCreatingDomain} onClick={createBaseDomain} className="w-full">
                    {isCreatingDomain ? 'Creating domain...' : 'Publish my site'}
                </Button>
            </>
        );
    };

    const renderActionSection = () => {
        if (!previewDomain?.url) {
            return 'Something went wrong';
        }

        return (
            <div className="flex w-full flex-col gap-2">
                <UrlSection url={previewDomain.url} isCopyable={true} />
                {deployment?.status === DeploymentStatus.FAILED ||
                deployment?.status === DeploymentStatus.CANCELLED ? (
                    <div className="flex w-full flex-col gap-2">
                        {deployment?.error &&
                            (() => {
                                const parsed = parseDeploymentError(deployment.error);
                                return (
                                    <div className="flex flex-col gap-1">
                                        <p className="text-destructive text-mini">
                                            {parsed.message}
                                        </p>
                                        {parsed.suggestion && (
                                            <p className="text-foreground-secondary text-mini">
                                                {parsed.suggestion}
                                            </p>
                                        )}
                                    </div>
                                );
                            })()}
                        <Button variant="outline" className="w-full" onClick={retry}>
                            Try Updating Again
                        </Button>
                    </div>
                ) : (
                    <Button
                        onClick={() => publish()}
                        className="w-full"
                        disabled={isDeploying || isLoading}
                    >
                        {isLoading && (
                            <Icons.LoadingSpinner className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Update
                    </Button>
                )}
            </div>
        );
    };

    return (
        <div className="flex flex-col items-center gap-2 p-3">
            {previewDomain?.url ? renderDomain() : renderNoDomain()}
        </div>
    );
});
