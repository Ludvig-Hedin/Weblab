import stripAnsi from 'strip-ansi';

import { DeploymentStatus } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons/index';
import { cn } from '@weblab/ui/utils';

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
                <Button
                    onClick={publish}
                    variant="outline"
                    className={cn(
                        'w-full rounded-md p-3',
                        !customDomain.publishedAt &&
                            'bg-foreground-brand hover:bg-foreground-brand/80 text-white',
                    )}
                    disabled={isDeploying || isLoading}
                >
                    {isLoading && <Icons.LoadingSpinner className="mr-2 h-4 w-4 animate-spin" />}
                    {deployment?.updatedAt ? 'Update' : `Publish to ${customDomain.url}`}
                </Button>
            )}
            {failedOrCancelled && (
                <div className="flex w-full flex-col gap-2">
                    {deployment?.error && (
                        <p className="text-destructive max-h-20 overflow-y-auto">
                            {stripAnsi(deployment?.error)}
                        </p>
                    )}
                    <Button variant="outline" className="w-full p-3" onClick={retry}>
                        Try Updating Again
                    </Button>
                </div>
            )}
        </div>
    );
};
