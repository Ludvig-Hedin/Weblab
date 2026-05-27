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

    let colorClasses =
        'border-input bg-background hover:bg-background-weblab text-foreground-primary';
    let icon: React.ReactNode | null = <Icons.Globe className="mr-1 h-4 w-4" />;
    let text = 'Publish';

    if (isCompleted) {
        colorClasses =
            'border-foreground-brand/60 bg-foreground-brand/90 hover:bg-foreground-brand text-white hover:text-background';
        // TODO(bug-hunt): `history.length` is the editor's undo stack size, not
        // a "changes since last deploy" counter. Any edit pushes history; undo
        // doesn't reset. After publishing then editing once, this stays >0
        // forever for the session, so "Live" effectively only renders right
        // after a fresh publish. Track changes-since-deploy on the deployment
        // itself (e.g. compare HEAD vs deployment.commitSha) for accuracy.
        text = editorEngine.history.length > 0 ? 'Update' : 'Live';
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
