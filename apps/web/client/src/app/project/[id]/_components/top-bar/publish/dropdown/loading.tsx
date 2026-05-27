import { useState } from 'react';

import { DeploymentType } from '@weblab/models/hosting';
import { Button } from '@weblab/ui/button';
import { Progress } from '@weblab/ui/progress';

import { useHostingType } from '@/components/store/hosting/type';

export const LoadingState = ({ type }: { type: DeploymentType }) => {
    const [isLoading, setIsLoading] = useState(false);
    const { deployment, cancel } = useHostingType(type);

    const handleCancel = async () => {
        setIsLoading(true);
        await cancel();
        setIsLoading(false);
    };

    return (
        <div className="flex flex-col gap-2 p-3">
            <p className="text-foreground-tertiary text-mini font-medium">
                {type === DeploymentType.PREVIEW ? 'Base' : 'Custom'} Domain
            </p>
            <p className="text-foreground-secondary">{deployment?.message}</p>
            <Progress value={deployment?.progress ?? 0} className="w-full" />
            <div className="mt-2 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={handleCancel} disabled={isLoading}>
                    Cancel
                </Button>
            </div>
        </div>
    );
};
