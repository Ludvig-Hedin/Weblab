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
            'border-blue-400/60 bg-blue-400/90 hover:bg-blue-400 text-white hover:text-background';
        text = editorEngine.history.length > 0 ? 'Update' : 'Live';
        icon = <Icons.Globe className="mr-1 h-4 w-4" />;
    } else if (isDeploying) {
        icon = <Icons.LoadingSpinner className="mr-1 h-4 w-4 animate-spin" />;
        text = 'Publishing';
    } else if (isFailed) {
        colorClasses =
            'border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-500 hover:text-red-600 hover:border-red-500';
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
