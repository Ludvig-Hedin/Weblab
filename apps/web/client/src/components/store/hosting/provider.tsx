'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useMemo } from 'react';
import { api } from '@convex/_generated/api';
import { useAction, useMutation, useQuery } from 'convex/react';

import type { HostingProvider as HostingProviderEnum } from '@weblab/models';
import { type Deployment } from '@weblab/db';
import { DeploymentStatus, DeploymentType } from '@weblab/models';
import { toast } from '@weblab/ui/sonner';

import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import { useEditorEngine } from '@/components/store/editor';

interface PublishParams {
    projectId: string;
    type: DeploymentType;
    sandboxId: string;
    buildScript?: string;
    buildFlags?: string;
    envVars?: Record<string, string>;
    provider?: HostingProviderEnum;
}

interface HostingContextValue {
    // State for each deployment type
    deployments: Record<DeploymentType, Deployment | null>;
    isDeploying: (type: DeploymentType) => boolean;

    // Operations
    publish: (params: PublishParams) => Promise<{ success: boolean } | null>;
    unpublish: (
        projectId: string,
        type: DeploymentType,
    ) => Promise<{ deploymentId: string } | null>;
    cancel: (type: DeploymentType) => Promise<void>;

    // Utilities — Convex live queries auto-refresh, so these are no-ops.
    refetch: (type: DeploymentType) => Promise<unknown>;
    refetchAll: () => void;
}

const HostingContext = createContext<HostingContextValue | null>(null);

interface HostingProviderProps {
    children: ReactNode;
}

/**
 * Convex deployment rows use `_id`/`_creationTime` while the existing
 * `Deployment` model (and every consumer in this directory) uses
 * `id`/`createdAt`. Adapt at the boundary so downstream UI continues to
 * compile unchanged.
 */
function toDeployment(row: Doc<'deployments'> | null | undefined): Deployment | null {
    if (!row) return null;
    return {
        id: row._id,
        type: row.type,
        status: row.status,
        sandboxId: row.sandboxId ?? null,
        message: row.message ?? null,
        buildLog: row.buildLog ?? null,
        error: row.error ?? null,
        progress: row.progress ?? null,
        urls: row.urls ?? null,
        envVars: row.envVars ?? null,
        provider: row.provider,
        projectId: row.projectId,
        requestedBy: row.requestedBy,
        buildScript: row.buildScript ?? null,
        buildFlags: row.buildFlags ?? null,
        createdAt: new Date(row._creationTime),
        updatedAt: new Date(row.updatedAt ?? row._creationTime),
    } as unknown as Deployment;
}

export const HostingProvider = ({ children }: HostingProviderProps) => {
    const editorEngine = useEditorEngine();
    const projectId = editorEngine.projectId as Id<'projects'>;

    // Convex live queries — no `refetchInterval` needed; they auto-refresh
    // whenever the underlying data changes.
    const previewRow = useQuery(api.deployments.getByType, {
        projectId,
        type: DeploymentType.PREVIEW,
    });
    const customRow = useQuery(api.deployments.getByType, {
        projectId,
        type: DeploymentType.CUSTOM,
    });
    const unpublishPreviewRow = useQuery(api.deployments.getByType, {
        projectId,
        type: DeploymentType.UNPUBLISH_PREVIEW,
    });
    const unpublishCustomRow = useQuery(api.deployments.getByType, {
        projectId,
        type: DeploymentType.UNPUBLISH_CUSTOM,
    });

    // Mutations / actions
    const runCreateDeployment = useMutation(api.deployments.create);
    const runUpdateDeployment = useMutation(api.deployments.update);
    const runDeployment = useAction(api.publishActions.run);
    const runUnpublish = useAction(api.publishActions.unpublish);
    const runCancel = useMutation(api.deployments.cancel);

    // Organize deployments by type
    const deployments = useMemo(
        () => ({
            [DeploymentType.PREVIEW]: toDeployment(previewRow),
            [DeploymentType.CUSTOM]: toDeployment(customRow),
            [DeploymentType.UNPUBLISH_PREVIEW]: toDeployment(unpublishPreviewRow),
            [DeploymentType.UNPUBLISH_CUSTOM]: toDeployment(unpublishCustomRow),
        }),
        [previewRow, customRow, unpublishPreviewRow, unpublishCustomRow],
    );

    // Check if any deployment is in progress
    const isDeploying = (type: DeploymentType): boolean => {
        return (
            deployments[type]?.status === DeploymentStatus.IN_PROGRESS ||
            deployments[type]?.status === DeploymentStatus.PENDING
        );
    };

    // Publish function
    const publish = async (params: PublishParams): Promise<{ success: boolean } | null> => {
        let deployment: Deployment | null = null;
        try {
            const row = await runCreateDeployment({
                projectId: params.projectId as Id<'projects'>,
                type: params.type,
                sandboxId: params.sandboxId,
                buildScript: params.buildScript,
                buildFlags: params.buildFlags,
                envVars: params.envVars,
                provider: params.provider,
            });
            deployment = toDeployment(row);
            if (!deployment) {
                throw new Error('Failed to create deployment');
            }

            toast.success('Deployment created', {
                description: `Deployment ID: ${deployment.id}`,
            });

            await runDeployment({
                deploymentId: deployment.id as Id<'deployments'>,
            });

            toast.success('Deployment success!');

            return {
                success: true,
            };
        } catch (error) {
            toast.error('Failed to publish deployment');
            if (deployment) {
                await runUpdateDeployment({
                    id: deployment.id as Id<'deployments'>,
                    status: DeploymentStatus.FAILED,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
            return {
                success: false,
            };
        }
    };

    // Unpublish function
    const unpublish = async (projectId: string, type: DeploymentType) => {
        try {
            const response = await runUnpublish({
                projectId: projectId as Id<'projects'>,
                type,
            });
            return response;
        } catch {
            toast.error('Failed to unpublish deployment');
            return null;
        }
    };

    // Convex live queries auto-refresh — these refetch shims exist for API
    // compatibility with the previous tRPC-based provider.
    const refetch = (_type: DeploymentType): Promise<unknown> => Promise.resolve();
    const refetchAll = () => {
        // No-op: live queries handle refresh automatically.
    };

    const cancel = async (type: DeploymentType) => {
        const target = deployments[type];
        if (!target) {
            toast.error('No deployment found');
            return;
        }
        try {
            await runCancel({
                deploymentId: target.id as Id<'deployments'>,
            });
            toast.success('Deployment cancelled');
        } catch (error) {
            toast.error('Failed to cancel deployment');
            console.error(error);
        }
    };

    const value: HostingContextValue = {
        deployments,
        isDeploying,
        publish,
        unpublish,
        refetch,
        refetchAll,
        cancel,
    };

    return <HostingContext.Provider value={value}>{children}</HostingContext.Provider>;
};

export const useHostingContext = () => {
    const context = useContext(HostingContext);
    if (!context) {
        throw new Error('useHostingContext must be used within HostingProvider');
    }
    return context;
};
