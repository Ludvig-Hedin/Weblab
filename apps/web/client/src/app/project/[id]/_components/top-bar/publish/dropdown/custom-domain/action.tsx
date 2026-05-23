import { DeploymentStatus } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons/index';

import { parseDeploymentError } from '@/utils/deploy-errors';
import { UrlSection } from '../url';
import { useCustomDomainContext } from './provider';

export const ActionSection = () => {
    const { customDomain, deployment, publish, retry, isDeploying, isLoading } =
        useCustomDomainContext();
    const failedOrCancelled =
        deployment?.status === DeploymentStatus.FAILED ||
        deployment?.status === DeploymentStatus.CANCELLED;
    if (!customDomain) {
        return 'Something went wrong';
    }

    return (
        <div className="flex w-full flex-col gap-2">
            <UrlSection url={customDomain.url} isCopyable={false} />
            {!failedOrCancelled && (
                <Button onClick={publish} className="w-full" disabled={isDeploying || isLoading}>
                    {isLoading && <Icons.LoadingSpinner className="mr-2 h-4 w-4 animate-spin" />}
                    {deployment?.status === DeploymentStatus.COMPLETED
                        ? 'Update'
                        : `Publish to ${customDomain.url}`}
                </Button>
            )}
            {failedOrCancelled && (
                <div className="flex w-full flex-col gap-2">
                    {deployment?.error &&
                        (() => {
                            const parsed = parseDeploymentError(deployment.error);
                            return (
                                <div className="flex flex-col gap-1">
                                    <p className="text-destructive text-mini">{parsed.message}</p>
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
            )}
        </div>
    );
};
