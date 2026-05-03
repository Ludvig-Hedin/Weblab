'use client';

import { observer } from 'mobx-react-lite';

import { Badge } from '@weblab/ui/badge';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { toast } from '@weblab/ui/sonner';

import { api } from '@/trpc/react';

export const GitHubTab = observer(() => {
    const apiUtils = api.useUtils();

    // Check connection status — a PRECONDITION_FAILED means not connected; anything else is an error
    const {
        data: installationId,
        isLoading,
        error,
    } = api.github.checkGitHubAppInstallation.useQuery(undefined, {
        retry: false,
    });

    const { data: orgs } = api.github.getOrganizations.useQuery(undefined, {
        enabled: !!installationId,
        retry: false,
    });

    const { mutateAsync: generateUrl, isPending: isGenerating } =
        api.github.generateInstallationUrl.useMutation();

    const { mutate: disconnect, isPending: isDisconnecting } =
        api.user.disconnectGitHub.useMutation({
            onSuccess: () => {
                void apiUtils.github.checkGitHubAppInstallation.invalidate();
                // Drop cached organizations so reconnecting with a different
                // account doesn't show stale data.
                void apiUtils.github.getOrganizations.invalidate();
                toast.success('GitHub disconnected');
            },
            onError: () => toast.error('Failed to disconnect GitHub'),
        });

    const isPreconditionFailed = (error as any)?.data?.code === 'PRECONDITION_FAILED';
    const isConnected = !!installationId && !isPreconditionFailed;
    const hasQueryError = !!error && !isPreconditionFailed;

    const handleConnect = async () => {
        try {
            const { url } = await generateUrl({});
            window.location.href = url;
        } catch {
            toast.error('Failed to generate GitHub installation URL');
        }
    };

    return (
        <div className="flex flex-col gap-8 p-6">
            <section className="border-border/60 bg-background-secondary/30 space-y-4 rounded-lg border p-4">
                <div className="flex items-center gap-3">
                    <Icons.GitHubLogo className="h-5 w-5" />
                    <div>
                        <h2 className="text-base font-medium">GitHub</h2>
                        <p className="text-muted-foreground text-sm">
                            Connect your GitHub account to push code and open pull requests.
                        </p>
                    </div>
                </div>

                {isLoading ? (
                    <div className="text-muted-foreground flex items-center gap-2 text-sm">
                        <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                        Checking connection…
                    </div>
                ) : hasQueryError ? (
                    <div className="space-y-3">
                        <p className="text-destructive text-sm">
                            Failed to check GitHub connection status. Please try again.
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                                void apiUtils.github.checkGitHubAppInstallation.invalidate()
                            }
                        >
                            Retry
                        </Button>
                    </div>
                ) : isConnected ? (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <Badge className="border-green-500/30 bg-green-500/15 text-green-600">
                                Connected
                            </Badge>
                            {orgs?.[0] && (
                                <span className="text-muted-foreground text-sm">
                                    {orgs[0].login}
                                </span>
                            )}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            disabled={isDisconnecting}
                            onClick={() => disconnect()}
                        >
                            {isDisconnecting ? 'Disconnecting…' : 'Disconnect GitHub'}
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <Badge variant="secondary">Not connected</Badge>
                        </div>
                        <p className="text-muted-foreground text-sm">
                            Install the GitHub App to allow Weblab to push commits and open pull
                            requests on your behalf.
                        </p>
                        <Button size="sm" disabled={isGenerating} onClick={handleConnect}>
                            <Icons.GitHubLogo className="mr-2 h-4 w-4" />
                            {isGenerating ? 'Redirecting…' : 'Connect GitHub'}
                        </Button>
                    </div>
                )}
            </section>
        </div>
    );
});
