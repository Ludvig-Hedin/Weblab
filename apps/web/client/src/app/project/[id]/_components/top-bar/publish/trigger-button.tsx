import { useRef } from 'react';
import { observer } from 'mobx-react-lite';

import { DeploymentStatus, DeploymentType } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { DropdownMenuTrigger } from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';
import { useHostingType } from '@/components/store/hosting';

export const TriggerButton = observer(() => {
    const editorEngine = useEditorEngine();
    const { deployment: previewDeployment, isDeploying: isPreviewDeploying } = useHostingType(
        DeploymentType.PREVIEW,
    );
    const { deployment: customDeployment, isDeploying: isCustomDeploying } = useHostingType(
        DeploymentType.CUSTOM,
    );
    const isPreviewCompleted = previewDeployment?.status === DeploymentStatus.COMPLETED;
    const isCustomCompleted = customDeployment?.status === DeploymentStatus.COMPLETED;
    const isPreviewFailed = previewDeployment?.status === DeploymentStatus.FAILED;
    const isCustomFailed = customDeployment?.status === DeploymentStatus.FAILED;

    const isCompleted = isPreviewCompleted || isCustomCompleted;
    const isFailed = isPreviewFailed || isCustomFailed;
    const isDeploying = isPreviewDeploying || isCustomDeploying;

    // Snapshot the undo-stack length at the moment a deploy FINISHES so the
    // "Live" / "Update" label reflects edits-since-last-deploy, not raw undo
    // depth. Using `history.length > 0` directly stuck the label on "Update"
    // forever after the first edit (undo never reset it). Tracking the previous
    // deploying state in a ref lets us detect the deploying→done transition;
    // mutating a ref during render is the sanctioned "track previous value"
    // pattern (refs aren't part of render output).
    const publishedHistoryLenRef = useRef(0);
    const wasDeployingRef = useRef(false);
    if (wasDeployingRef.current && !isDeploying && isCompleted) {
        publishedHistoryLenRef.current = editorEngine.history.length;
    }
    wasDeployingRef.current = isDeploying;

    let colorClasses =
        'border-input bg-background hover:bg-background-weblab text-foreground-primary';
    let icon: React.ReactNode | null = <Icons.Globe className="mr-1 h-4 w-4" />;
    let text = 'Publish';

    if (isCompleted) {
        colorClasses =
            'border-foreground-brand/60 bg-foreground-brand/90 hover:bg-foreground-brand text-white hover:text-background';
        // "Update" only when there are edits since the last successful deploy
        // (baseline snapshotted above). Falls back to "Live" once the user undoes
        // back to the published state. On a fresh open with no deploy this session
        // the baseline is 0 and the undo stack is empty, so this reads "Live".
        text = editorEngine.history.length > publishedHistoryLenRef.current ? 'Update' : 'Live';
        icon = <Icons.Globe className="mr-1 h-4 w-4" />;
    } else if (isDeploying) {
        icon = <Icons.LoadingSpinner className="mr-1 h-4 w-4 animate-spin" />;
        text = 'Publishing';
    } else if (isFailed) {
        colorClasses =
            'border-destructive/30 bg-destructive/10 hover:bg-destructive/20 text-destructive hover:text-destructive hover:border-destructive';
        icon = <Icons.ExclamationTriangle className="mr-1 h-4 w-4" />;
    } else {
        colorClasses =
            'border-input bg-background hover:bg-background-weblab text-foreground-primary hover:border-foreground-primary';
    }

    return (
        <DropdownMenuTrigger asChild>
            <Button
                variant="default"
                size="sm"
                className={cn(
                    'text-mini flex h-8 items-center justify-center rounded-md border px-3 transition-colors duration-150',
                    colorClasses,
                )}
            >
                {icon}
                {text}
            </Button>
        </DropdownMenuTrigger>
    );
});
