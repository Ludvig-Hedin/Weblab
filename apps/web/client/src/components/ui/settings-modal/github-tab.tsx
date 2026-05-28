'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useAction } from 'convex/react';
import { useTranslations } from 'next-intl';

import { Badge } from '@weblab/ui/badge';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { toast } from '@weblab/ui/sonner';

import type { GitHubRepo } from './github-tab.utils';
import { Routes } from '@/utils/constants';
import { sortRepos } from './github-tab.utils';

type GitHubOrg = {
    login: string;
};

export const GitHubTab = () => {
    const t = useTranslations();
    const router = useRouter();
    const [repoSearch, setRepoSearch] = useState('');
    const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

    const checkInstallation = useAction(api.githubActions.checkGitHubAppInstallation);
    const getOrgs = useAction(api.githubActions.getOrganizations);
    const getReposWithApp = useAction(api.githubActions.getRepositoriesWithApp);
    const generateUrl = useAction(api.githubActions.generateInstallationUrlAction);

    const [installationId, setInstallationId] = useState<string | null | undefined>(undefined);
    const [installationError, setInstallationError] = useState<unknown>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [orgs, setOrgs] = useState<GitHubOrg[] | null>(null);
    const [repos, setRepos] = useState<GitHubRepo[] | null>(null);
    const [isLoadingRepos, setIsLoadingRepos] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isDisconnecting, setIsDisconnecting] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setIsLoading(true);
            try {
                const id = await checkInstallation({});
                if (cancelled) return;
                setInstallationId(id);
                setInstallationError(null);
            } catch (err) {
                if (!cancelled) {
                    setInstallationError(err);
                    setInstallationId(null);
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [checkInstallation]);

    useEffect(() => {
        if (!installationId) return;
        let cancelled = false;
        (async () => {
            setIsLoadingRepos(true);
            try {
                const [fetchedOrgs, fetchedRepos] = await Promise.all([
                    getOrgs({}) as Promise<GitHubOrg[]>,
                    getReposWithApp({}) as Promise<GitHubRepo[]>,
                ]);
                if (cancelled) return;
                setOrgs(fetchedOrgs ?? []);
                setRepos(sortRepos(fetchedRepos ?? []));
            } catch {
                if (!cancelled) {
                    setOrgs([]);
                    setRepos([]);
                }
            } finally {
                if (!cancelled) setIsLoadingRepos(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [installationId, getOrgs, getReposWithApp]);

    // Re-check on tab focus so a connection completed in the popup is reflected
    // here without a manual page refresh. Silent (no spinner) to avoid flicker.
    useEffect(() => {
        const onFocus = () => {
            void (async () => {
                try {
                    const id = await checkInstallation({});
                    setInstallationId(id);
                    setInstallationError(null);
                } catch {
                    // Keep prior state on a transient re-check failure.
                }
            })();
        };
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [checkInstallation]);

    const isConnected = !!installationId;
    const hasQueryError = !!installationError;

    const filteredRepos = (repos ?? []).filter((repo) =>
        repo.full_name.toLowerCase().includes(repoSearch.toLowerCase()),
    );

    const handleConnect = async () => {
        const newWindow = window.open('about:blank', '_blank');
        if (!newWindow) {
            toast.error(t('github.popupBlocked'));
            return;
        }

        setIsGenerating(true);
        try {
            const result = (await generateUrl({})) as { url: string };
            newWindow.location.href = result.url;
        } catch {
            newWindow.close();
            toast.error('Failed to generate GitHub installation URL');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDisconnect = async () => {
        setIsDisconnecting(true);
        try {
            // TODO(convex): users.disconnectGitHub mutation not yet implemented.
            // Original tRPC: api.user.disconnectGitHub.useMutation()
            toast.error('Disconnect is temporarily unavailable.');
        } finally {
            setIsDisconnecting(false);
            setConfirmingDisconnect(false);
        }
    };

    const retryInstallationCheck = async () => {
        setIsLoading(true);
        try {
            const id = await checkInstallation({});
            setInstallationId(id);
            setInstallationError(null);
        } catch (err) {
            setInstallationError(err);
            setInstallationId(null);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="divide-border flex flex-col divide-y px-6">
            {/* Connection status */}
            <section className="space-y-4 py-6">
                <div className="flex items-center gap-3">
                    <Icons.GitHubLogo className="h-5 w-5" />
                    <div>
                        <h2 className="text-largePlus">GitHub</h2>
                        <p className="text-regular text-foreground-tertiary">
                            Connect your GitHub account to push code and open pull requests.
                        </p>
                    </div>
                </div>

                {isLoading ? (
                    <div className="text-regular text-foreground-tertiary flex items-center gap-2">
                        <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                        Checking connection…
                    </div>
                ) : hasQueryError ? (
                    <div className="space-y-3">
                        <p className="text-destructive text-regular">
                            Failed to check GitHub connection status. Please try again.
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void retryInstallationCheck()}
                        >
                            Retry
                        </Button>
                    </div>
                ) : isConnected ? (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <Badge
                                variant="outline"
                                className="border-foreground-success/30 bg-foreground-success/10 text-foreground-success gap-1.5"
                            >
                                <span className="bg-foreground-success size-1.5 rounded-full" />
                                Connected
                            </Badge>
                            {orgs?.[0] && (
                                <span className="text-regular text-foreground-tertiary">
                                    {orgs[0].login}
                                </span>
                            )}
                        </div>
                        {confirmingDisconnect ? (
                            <div className="border-destructive/40 bg-destructive/5 space-y-3 rounded-md border p-3">
                                <p className="text-regular text-foreground-primary">
                                    Disconnect GitHub?
                                </p>
                                <p className="text-mini text-foreground-tertiary">
                                    Weblab will no longer be able to push commits or open pull
                                    requests on your behalf. You can reconnect any time.
                                </p>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setConfirmingDisconnect(false)}
                                        disabled={isDisconnecting}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        disabled={isDisconnecting}
                                        onClick={() => void handleDisconnect()}
                                    >
                                        {isDisconnecting ? 'Disconnecting…' : 'Confirm disconnect'}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => void handleConnect()}
                                    disabled={isGenerating}
                                >
                                    <Icons.Gear className="mr-1.5 h-3.5 w-3.5" />
                                    {isGenerating ? 'Opening…' : 'Configure'}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => setConfirmingDisconnect(true)}
                                >
                                    <Icons.LinkNone className="mr-1.5 h-3.5 w-3.5" />
                                    Disconnect GitHub
                                </Button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <Badge variant="secondary">Not connected</Badge>
                        </div>
                        <p className="text-regular text-foreground-tertiary">
                            Install the GitHub App to allow Weblab to push commits and open pull
                            requests on your behalf.
                        </p>
                        <Button
                            size="sm"
                            disabled={isGenerating}
                            onClick={() => void handleConnect()}
                        >
                            <Icons.GitHubLogo className="mr-2 h-4 w-4" />
                            {isGenerating ? 'Opening…' : 'Connect GitHub'}
                        </Button>
                    </div>
                )}
            </section>

            {/* Repo list — only when connected */}
            {isConnected && (
                <section className="space-y-3 py-6">
                    <div className="flex items-center justify-between">
                        <h3 className="text-regularPlus">Accessible repositories</h3>
                        {repos && (
                            <span className="text-mini text-foreground-tertiary">
                                {repos.length} {repos.length === 1 ? 'repo' : 'repos'}
                            </span>
                        )}
                    </div>

                    <div className="relative">
                        <Icons.MagnifyingGlass className="text-foreground-tertiary absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
                        <Input
                            placeholder="Search repositories…"
                            value={repoSearch}
                            onChange={(e) => setRepoSearch(e.target.value)}
                            className="text-small pl-8"
                        />
                    </div>

                    {isLoadingRepos ? (
                        <div className="text-regular text-foreground-tertiary flex items-center gap-2 py-4">
                            <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                            Loading repositories…
                        </div>
                    ) : filteredRepos.length === 0 ? (
                        <p className="text-regular text-foreground-tertiary py-4 text-center">
                            {repoSearch
                                ? 'No repositories match your search.'
                                : 'No repositories found.'}
                        </p>
                    ) : (
                        <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                            {filteredRepos.map((repo) => (
                                <div
                                    key={repo.id}
                                    className="hover:bg-background-tertiary flex items-center justify-between rounded-md px-2 py-2 transition-colors"
                                >
                                    <div className="min-w-0 flex-1">
                                        <span
                                            className="text-regular block truncate"
                                            title={repo.full_name}
                                        >
                                            {repo.full_name}
                                        </span>
                                        {repo.private && (
                                            <Badge
                                                variant="secondary"
                                                className="text-mini mt-1 px-1.5 py-0"
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
};
