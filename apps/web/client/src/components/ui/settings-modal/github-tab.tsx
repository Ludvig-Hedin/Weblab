'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { observer } from 'mobx-react-lite';

import { Badge } from '@weblab/ui/badge';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { toast } from '@weblab/ui/sonner';

import { api } from '@/trpc/react';
import { Routes } from '@/utils/constants';

export const GitHubTab = observer(() => {
    const router = useRouter();
    const apiUtils = api.useUtils();
    const [repoSearch, setRepoSearch] = useState('');

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

    const { data: repos, isLoading: isLoadingRepos } = api.github.getRepositoriesWithApp.useQuery(
        undefined,
        { enabled: !!installationId, retry: false },
    );

    const { mutateAsync: generateUrl, isPending: isGenerating } =
        api.github.generateInstallationUrl.useMutation();

    const { mutate: disconnect, isPending: isDisconnecting } =
        api.user.disconnectGitHub.useMutation({
            onSuccess: () => {
                void apiUtils.github.checkGitHubAppInstallation.invalidate();
                void apiUtils.github.getOrganizations.invalidate();
                void apiUtils.github.getRepositoriesWithApp.invalidate();
                toast.success('GitHub disconnected');
            },
            onError: () => toast.error('Failed to disconnect GitHub'),
        });

    const isPreconditionFailed = (error as any)?.data?.code === 'PRECONDITION_FAILED';
    const isConnected = !!installationId && !isPreconditionFailed;
    const hasQueryError = !!error && !isPreconditionFailed;

    const filteredRepos = (repos ?? []).filter((repo) =>
        repo.full_name.toLowerCase().includes(repoSearch.toLowerCase()),
    );

    const handleConnect = async () => {
        try {
            const { url } = await generateUrl({});
            window.location.href = url;
        } catch {
            toast.error('Failed to generate GitHub installation URL');
        }
    };

    return (
        <div className="flex flex-col gap-6 p-6">
            {/* Connection status */}
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
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void handleConnect()}
                                disabled={isGenerating}
                            >
                                <Icons.Gear className="mr-1.5 h-3.5 w-3.5" />
                                Configure
                            </Button>
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

            {/* Repo list — only when connected */}
            {isConnected && (
                <section className="border-border/60 bg-background-secondary/30 space-y-3 rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium">Accessible repositories</h3>
                        {repos && (
                            <span className="text-muted-foreground text-xs">
                                {repos.length} {repos.length === 1 ? 'repo' : 'repos'}
                            </span>
                        )}
                    </div>

                    <div className="relative">
                        <Icons.MagnifyingGlass className="text-muted-foreground absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
                        <Input
                            placeholder="Search repositories…"
                            value={repoSearch}
                            onChange={(e) => setRepoSearch(e.target.value)}
                            className="pl-8 text-sm"
                        />
                    </div>

                    {isLoadingRepos ? (
                        <div className="text-muted-foreground flex items-center gap-2 py-4 text-sm">
                            <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                            Loading repositories…
                        </div>
                    ) : filteredRepos.length === 0 ? (
                        <p className="text-muted-foreground py-4 text-center text-sm">
                            {repoSearch ? 'No repositories match your search.' : 'No repositories found.'}
                        </p>
                    ) : (
                        <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                            {filteredRepos.map((repo) => (
                                <div
                                    key={repo.id}
                                    className="hover:bg-background-secondary/60 flex items-center justify-between rounded-md px-2 py-2 transition-colors"
                                >
                                    <div className="min-w-0 flex-1">
                                        <span className="block truncate text-sm">
                                            {repo.full_name}
                                        </span>
                                        {repo.private && (
                                            <Badge
                                                variant="secondary"
                                                className="mt-1 px-1.5 py-0 text-xs"
                                            >
                                                Private
                                            </Badge>
                                        )}
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="ml-3 shrink-0"
                                        onClick={() =>
                                            router.push(
                                                `${Routes.IMPORT_GITHUB}?repo=${encodeURIComponent(repo.full_name)}`,
                                            )
                                        }
                                    >
                                        Import
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}

                    <Button
                        size="sm"
                        className="w-full"
                        onClick={() => router.push(Routes.IMPORT_GITHUB)}
                    >
                        <Icons.GitHubLogo className="mr-2 h-4 w-4" />
                        Import a repository
                    </Button>
                </section>
            )}
        </div>
    );
});
