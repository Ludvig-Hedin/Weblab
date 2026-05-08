'use client';

import { motion } from 'motion/react';

import { APP_NAME } from '@weblab/constants';
import { Button } from '@weblab/ui/button';
import { CardDescription, CardTitle } from '@weblab/ui/card';
import { Icons } from '@weblab/ui/icons';
import { Separator } from '@weblab/ui/separator';

import { useImportGithubProject } from '../_context';
import { StepContent, StepFooter, StepHeader } from '../../steps';

export const ConnectGithub = () => {
    const { nextStep, cancel, installation } = useImportGithubProject();
    const { hasInstallation, isConnecting, isChecking, error, redirectToInstallation, refetch } =
        installation;

    const statusRow = () => {
        if (hasInstallation) {
            return (
                <div className="flex items-start gap-3 py-1">
                    <Icons.Check className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
                    <div>
                        <p className="font-medium">GitHub connected</p>
                        <p className="text-foreground-secondary">
                            Your repositories are ready to use
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
                        <p className="font-medium">Waiting for authorization…</p>
                        <p className="text-foreground-secondary">
                            Complete the GitHub connection in the new tab, then come back here
                        </p>
                    </div>
                </div>
            );
        }

        return (
            <div className="flex items-start gap-3 py-1">
                <Icons.GitHubLogo className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                    <p className="font-medium">Connect your GitHub account</p>
                    <p className="text-foreground-secondary">
                        Secure, fine-grained access to your repositories
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
                    {hasInstallation ? 'GitHub Connected' : 'Connect GitHub'}
                </CardTitle>
                <CardDescription className="font-normal">
                    {hasInstallation
                        ? `Your repositories are accessible in ${APP_NAME}`
                        : `Access your repositories and work with real code in ${APP_NAME}`}
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
                        <div className="mt-4 rounded-md border border-red-800 bg-red-900 p-3">
                            <div className="text-sm text-red-100">{error}</div>
                        </div>
                    )}
                    <Separator orientation="horizontal" className="bg-border mt-6 shrink-0" />
                </motion.div>
            </StepContent>

            <StepFooter>
                <Button onClick={cancel} variant="outline">
                    Cancel
                </Button>

                {hasInstallation ? (
                    <div className="flex gap-2">
                        <Button
                            size="icon"
                            variant="outline"
                            className="py-2"
                            onClick={() => redirectToInstallation()}
                            title="Reconfigure GitHub connection"
                        >
                            <Icons.Gear className="h-4 w-4" />
                        </Button>
                        <Button className="px-3 py-2" onClick={nextStep}>
                            <Icons.ArrowRight className="mr-2 h-4 w-4" />
                            <span>Continue</span>
                        </Button>
                    </div>
                ) : isConnecting ? (
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            className="px-3 py-2"
                            onClick={() => redirectToInstallation()}
                        >
                            <Icons.GitHubLogo className="mr-2 h-4 w-4" />
                            <span>Open GitHub again</span>
                        </Button>
                        <Button
                            className="px-3 py-2"
                            onClick={() => refetch()}
                            disabled={isChecking}
                        >
                            {isChecking ? (
                                <Icons.LoadingSpinner className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Icons.Reload className="mr-2 h-4 w-4" />
                            )}
                            <span>{"I've authorized it"}</span>
                        </Button>
                    </div>
                ) : (
                    <Button
                        className="px-3 py-2"
                        onClick={() => redirectToInstallation()}
                        disabled={isChecking}
                    >
                        <Icons.GitHubLogo className="mr-2 h-4 w-4" />
                        <span>Connect GitHub</span>
                    </Button>
                )}
            </StepFooter>
        </>
    );
};
