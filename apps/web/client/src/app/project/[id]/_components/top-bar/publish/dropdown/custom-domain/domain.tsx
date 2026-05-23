import { DeploymentStatus } from '@weblab/models';
import { timeAgo } from '@weblab/utility';

import { ActionSection } from './action';
import { useCustomDomainContext } from './provider';

export const DomainSection = () => {
    const { customDomain, deployment, isDeploying } = useCustomDomainContext();

    if (!customDomain) {
        return 'Something went wrong';
    }

    return (
        <>
            <div className="flex w-full items-center">
                <h3 className="text-foreground-tertiary text-mini font-medium">Custom Domain</h3>
                {deployment && deployment?.status === DeploymentStatus.COMPLETED && (
                    <div className="ml-auto flex items-center gap-2">
                        <p className="text-foreground-positive">Live</p>
                        <p>•</p>
                        <p>
                            Updated{' '}
                            {timeAgo(
                                deployment.updatedAt ? new Date(deployment.updatedAt) : new Date(),
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
            <ActionSection />
        </>
    );
};
