'use client';

import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { APP_NAME } from '@weblab/constants';
import { Button } from '@weblab/ui/button';
import { CardDescription, CardTitle } from '@weblab/ui/card';
import { Icons } from '@weblab/ui/icons';
import { Separator } from '@weblab/ui/separator';

import { useImportGithubProject } from '../_context';
import { StepContent, StepFooter, StepHeader } from '../../steps';

export const ConnectGithub = () => {
    const t = useTranslations('projects.importGitHub');
    const { nextStep, cancel, installation } = useImportGithubProject();
    const { hasInstallation, isConnecting, isChecking, error, redirectToInstallation, refetch } =
        installation;

    const statusRow = () => {
        if (hasInstallation) {
            return (
                <div className="flex items-start gap-3 py-1">
                    <Icons.Check className="text-foreground-success mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                        <p className="font-medium">{t('statusConnected')}</p>
                        <p className="text-foreground-secondary">
                            {t('statusConnectedDesc')}
                        </p>
                    </div>
                </div>
            );
        }

        if (isConnecting) {
            return (
                <div className="flex items-start gap-3 py-1">
                    <Icons.LoadingSpinner className="mt-0.5 h-5 w-5 shrink-0 animate-spin" />
                    <div>
                        <p className="font-medium">{t('statusConnecting')}</p>
                        <p className="text-foreground-secondary">
                            {t('statusConnectingDesc')}
                        </p>
                    </div>
                </div>
            );
        }

        return (
            <div className="flex items-start gap-3 py-1">
                <Icons.GitHubLogo className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                    <p className="font-medium">{t('statusDisconnected')}</p>
                    <p className="text-foreground-secondary">
                        {t('statusDisconnectedDesc')}
                    </p>
                </div>
            </div>
        );
    };

    return (
        <>
            <StepHeader>
                <div className="flex items-center gap-3">
                    <div className="bg-background-tertiary rounded-lg p-3">
                        <Icons.WeblabLogo className="h-6 w-6" />
                    </div>
                    <Icons.DotsHorizontal className="h-6 w-6" />
                    <div className="bg-background-tertiary rounded-lg p-3">
                        <Icons.GitHubLogo className="h-6 w-6" />
                    </div>
                </div>
                <CardTitle className="text-xl font-normal">
                    {hasInstallation ? t('githubConnected') : t('connectGitHub')}
                </CardTitle>
                <CardDescription className="font-normal">
                    {hasInstallation
                        ? t('reposAccessible', { appName: APP_NAME })
                        : t('accessRepos', { appName: APP_NAME })}
                </CardDescription>
            </StepHeader>

            <StepContent>
                <motion.div
                    key="connect-content"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="w-full text-sm"
                >
                    <Separator orientation="horizontal" className="bg-border mb-6 shrink-0" />
                    {statusRow()}
                    {error && (
                        <div className="border-destructive bg-destructive/90 mt-4 rounded-md border p-3">
                            <div className="text-small text-foreground">{error}</div>
                        </div>
                    )}
                    <Separator orientation="horizontal" className="bg-border mt-6 shrink-0" />
                </motion.div>
            </StepContent>

            <StepFooter>
                <Button onClick={cancel} variant="outline">
                    {t('cancel')}
                </Button>

                {hasInstallation ? (
                    <div className="flex gap-2">
                        <Button
                            size="icon"
                            variant="outline"
                            className="py-2"
                            onClick={() => {
                                void redirectToInstallation();
                            }}
                            title={t('configure')}
                        >
                            <Icons.Gear className="h-4 w-4" />
                        </Button>
                        <Button className="px-3 py-2" onClick={nextStep}>
                            <Icons.ArrowRight className="mr-2 h-4 w-4" />
                            <span>{t('continue')}</span>
                        </Button>
                    </div>
                ) : isConnecting ? (
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            className="px-3 py-2"
                            onClick={() => {
                                void redirectToInstallation();
                            }}
                        >
                            <Icons.GitHubLogo className="mr-2 h-4 w-4" />
                            <span>{t('openGitHubAgain')}</span>
                        </Button>
                        <Button
                            className="px-3 py-2"
                            onClick={() => {
                                void refetch();
                            }}
                            disabled={isChecking}
                        >
                            {isChecking ? (
                                <Icons.LoadingSpinner className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Icons.Reload className="mr-2 h-4 w-4" />
                            )}
                            <span>{t('iveAuthorizedIt')}</span>
                        </Button>
                    </div>
                ) : (
                    <Button
                        className="px-3 py-2"
                        onClick={() => {
                            void redirectToInstallation();
                        }}
                        disabled={isChecking}
                    >
                        <Icons.GitHubLogo className="mr-2 h-4 w-4" />
                        <span>{t('connectGitHub')}</span>
                    </Button>
                )}
            </StepFooter>
        </>
    );
};
