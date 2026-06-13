'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useAction, useMutation } from 'convex/react';
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
    const t = useTranslations('settings.github');
    const tGlobal = useTranslations('github');
    const router = useRouter();
    const [repoSearch, setRepoSearch] = useState('');
    const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

    const checkInstallation = useAction(api.githubActions.checkGitHubAppInstallation);
    const getOrgs = useAction(api.githubActions.getOrganizations);
    const getReposWithApp = useAction(api.githubActions.getRepositoriesWithApp);
    const generateUrl = useAction(api.githubActions.generateInstallationUrlAction);
    const disconnectGitHub = useMutation(api.users.disconnectGitHub);

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
            toast.error(tGlobal('popupBlocked'));
            return;
        }

        setIsGenerating(true);
        try {
            const result = (await generateUrl({})) as { url: string };
            newWindow.location.href = result.url;
        } catch {
            newWindow.close();
            toast.error(t('toastUrlFailed'));
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDisconnect = async () => {
        setIsDisconnecting(true);
        try {
            await disconnectGitHub({});
            setInstallationId(null);
            setOrgs(null);
            setRepos(null);
            toast.success(t('toastDisconnected'));
        } catch (err) {
            console.error('Failed to disconnect GitHub', err);
            toast.error(t('toastDisconnectFailed'));
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
                        <p className="text-regular text-foreground-tertiary">{t('description')}</p>
                    </div>
                </div>

                {isLoading ? (
                    <div className="text-regular text-foreground-tertiary flex items-center gap-2">
                        <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                        {t('checkingConnection')}
                    </div>
                ) : hasQueryError ? (
                    <div className="space-y-3">
                        <p className="text-destructive text-regular">{t('connectionFailed')}</p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void retryInstallationCheck()}
                        >
                            {t('retry')}
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
                                {t('statusConnected')}
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
                                    {t('disconnectTitle')}
                                </p>
                                <p className="text-mini text-foreground-tertiary">
                                    {t('disconnectBody')}
                                </p>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setConfirmingDisconnect(false)}
                                        disabled={isDisconnecting}
                                    >
                                        {t('cancel')}
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        disabled={isDisconnecting}
                                        onClick={() => void handleDisconnect()}
                                    >
                                        {isDisconnecting ? t('disconnecting') : t('confirmDisconnect')}
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
                                    {isGenerating ? t('opening') : t('configure')}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => setConfirmingDisconnect(true)}
                                >
                                    <Icons.LinkNone className="mr-1.5 h-3.5 w-3.5" />
                                    {t('disconnectButton')}
                                </Button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <Badge variant="secondary">{t('notConnected')}</Badge>
                        </div>
                        <p className="text-regular text-foreground-tertiary">
                            {t('installDescription')}
                        </p>
                        <Button
                            size="sm"
                            disabled={isGenerating}
                            onClick={() => void handleConnect()}
                        >
                            <Icons.GitHubLogo className="mr-2 h-4 w-4" />
                            {isGenerating ? t('opening') : t('connectGitHub')}
                        </Button>
                    </div>
                )}
            </section>

            {/* Repo list — only when connected */}
            {isConnected && (
                <section className="space-y-3 py-6">
                    <div className="flex items-center justify-between">
                        <h3 className="text-regularPlus">{t('accessibleRepos')}</h3>
                        {repos && (
                            <span className="text-mini text-foreground-tertiary">
                                {t('repoCount', { count: repos.length })}
                            </span>
                        )}
                    </div>

                    <div className="relative">
                        <Icons.MagnifyingGlass className="text-foreground-tertiary absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
                        <Input
                            placeholder={t('searchRepos')}
                            value={repoSearch}
                            onChange={(e) => setRepoSearch(e.target.value)}
                            className="text-small pl-8"
                        />
                    </div>

                    {isLoadingRepos ? (
                        <div className="text-regular text-foreground-tertiary flex items-center gap-2 py-4">
                            <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                            {t('loadingRepos')}
                        </div>
                    ) : filteredRepos.length === 0 ? (
                        <p className="text-regular text-foreground-tertiary py-4 text-center">
                            {repoSearch ? t('noReposMatchSearch') : t('noReposFound')}
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
                                                {t('private')}
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
                                        {t('importButton')}
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
                        {t('importRepository')}
                    </Button>
                </section>
            )}
        </div>
    );
};
