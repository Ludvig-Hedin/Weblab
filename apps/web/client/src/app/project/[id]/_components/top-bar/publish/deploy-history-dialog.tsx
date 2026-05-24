'use client';

import { useState } from 'react';
import { api } from '@convex/_generated/api';
import { useAction, useQuery } from 'convex/react';
import { observer } from 'mobx-react-lite';
import stripAnsi from 'strip-ansi';

import { DeploymentStatus, DeploymentType, HOSTING_PROVIDER_LABELS } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@weblab/ui/dialog';
import { Icons } from '@weblab/ui/icons';
import { toast } from '@weblab/ui/sonner';
import { timeAgo } from '@weblab/utility';

import type { Id } from '@convex/_generated/dataModel';
import { useEditorEngine } from '@/components/store/editor';
import { parseDeploymentError } from '@/utils/deploy-errors';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const DEPLOYMENT_TYPE_LABELS: Record<DeploymentType, string> = {
    [DeploymentType.PREVIEW]: 'Base',
    [DeploymentType.CUSTOM]: 'Custom',
    [DeploymentType.UNPUBLISH_PREVIEW]: 'Unpublish (Base)',
    [DeploymentType.UNPUBLISH_CUSTOM]: 'Unpublish (Custom)',
};

const STATUS_PILL: Record<DeploymentStatus, { label: string; className: string }> = {
    [DeploymentStatus.COMPLETED]: {
        label: 'Live',
        className: 'bg-background-positive text-foreground-positive border-border-success',
    },
    [DeploymentStatus.FAILED]: {
        label: 'Failed',
        className: 'bg-destructive/10 text-destructive border-destructive/30',
    },
    [DeploymentStatus.CANCELLED]: {
        label: 'Cancelled',
        className: 'bg-foreground/10 text-foreground-secondary',
    },
    [DeploymentStatus.IN_PROGRESS]: {
        label: 'In progress',
        className: 'bg-foreground/10 text-foreground-secondary',
    },
    [DeploymentStatus.PENDING]: {
        label: 'Pending',
        className: 'bg-foreground/10 text-foreground-secondary',
    },
};

export const DeployHistoryDialog = observer(({ open, onOpenChange }: Props) => {
    const editorEngine = useEditorEngine();
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Convex 'skip' goes in arg 2, not arg 1. Passing 'skip' as the function
    // ref triggers `Could not find public function for 'skip'` and detonates.
    const data = useQuery(
        api.deployments.list,
        open
            ? { projectId: editorEngine.projectId as Id<'projects'>, limit: 25 }
            : 'skip',
    );
    const isLoading = open && data === undefined;

    const redeploy = useAction(api.publishActions.redeploy);
    const runDeployment = useAction(api.publishActions.run);
    const [isRedeploying, setIsRedeploying] = useState(false);

    const handleRedeploy = async (deploymentId: string) => {
        setIsRedeploying(true);
        try {
            const created = await redeploy({
                deploymentId: deploymentId as Id<'deployments'>,
            });
            await runDeployment({
                deploymentId: (created as { _id: Id<'deployments'> })._id,
            });
            toast.success('Redeploy started');
            onOpenChange(false);
        } catch (err) {
            console.error(err);
            toast.error(err instanceof Error ? err.message : 'Failed to redeploy');
        } finally {
            setIsRedeploying(false);
        }
    };

    const isTerminal = (status: DeploymentStatus): boolean =>
        status === DeploymentStatus.COMPLETED ||
        status === DeploymentStatus.FAILED ||
        status === DeploymentStatus.CANCELLED;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Deployment history</DialogTitle>
                </DialogHeader>
                <div className="text-foreground-secondary flex max-h-[60vh] flex-col divide-y overflow-y-auto rounded-md border">
                    {isLoading && <p className="text-mini p-4">Loading…</p>}
                    {!isLoading && (!data || data.length === 0) && (
                        <p className="text-mini p-4">No deployments yet.</p>
                    )}
                    {data?.map((deployment) => {
                        const status = STATUS_PILL[deployment.status as DeploymentStatus];
                        const isExpanded = expandedId === deployment._id;
                        const parsedError = deployment.error
                            ? parseDeploymentError(deployment.error)
                            : null;
                        const canRedeploy =
                            isTerminal(deployment.status as DeploymentStatus) &&
                            Boolean(deployment.sandboxId);
                        return (
                            <div key={deployment._id} className="flex flex-col gap-2 p-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span
                                        className={`text-micro rounded-full border px-2 py-0.5 font-medium ${status.className}`}
                                    >
                                        {status.label}
                                    </span>
                                    <span className="text-foreground-primary text-small">
                                        {DEPLOYMENT_TYPE_LABELS[deployment.type]}
                                    </span>
                                    <span className="text-mini">·</span>
                                    <span className="text-mini">
                                        {HOSTING_PROVIDER_LABELS[deployment.provider]}
                                    </span>
                                    <span className="text-mini ml-auto">
                                        {timeAgo(new Date(deployment._creationTime))} ago
                                    </span>
                                </div>
                                {parsedError && (
                                    <p className="text-destructive text-mini">
                                        {parsedError.message}
                                        {parsedError.suggestion
                                            ? ` — ${parsedError.suggestion}`
                                            : ''}
                                    </p>
                                )}
                                <div className="flex items-center gap-2">
                                    {(deployment.buildLog ?? deployment.error) && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() =>
                                                setExpandedId(isExpanded ? null : deployment._id)
                                            }
                                        >
                                            {isExpanded ? 'Hide log' : 'Show log'}
                                        </Button>
                                    )}
                                    {canRedeploy && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={isRedeploying}
                                            onClick={() => {
                                                void handleRedeploy(deployment._id);
                                            }}
                                        >
                                            <Icons.Reload className="mr-1 h-3 w-3" />
                                            Redeploy
                                        </Button>
                                    )}
                                </div>
                                {isExpanded && (
                                    <pre className="bg-background-secondary text-mini max-h-60 overflow-auto rounded p-2 whitespace-pre-wrap">
                                        {stripAnsi(deployment.buildLog ?? deployment.error ?? '')}
                                    </pre>
                                )}
                            </div>
                        );
                    })}
                </div>
            </DialogContent>
        </Dialog>
    );
});
