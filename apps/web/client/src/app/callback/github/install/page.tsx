'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useAction } from 'convex/react';

import { Button } from '@weblab/ui/button';
import { Card, CardContent, CardDescription, CardTitle } from '@weblab/ui/card';
import { Icons } from '@weblab/ui/icons';

import { Routes } from '@/utils/constants';

type CallbackState = 'loading' | 'success' | 'error';

// Stable, no-animation rendering of the three states. AnimatePresence with
// `mode="wait"` previously hid the first-mount Card behind opacity:0 forever
// in some hydration paths, leaving users on a blank screen. A one-shot
// callback screen doesn't benefit from cross-fade animations enough to keep
// the failure mode.

export default function GitHubInstallCallbackPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [state, setState] = useState<CallbackState>('loading');
    const [message, setMessage] = useState<string>('');
    const [hasOpener, setHasOpener] = useState<boolean>(false);
    const calledRef = useRef(false);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setHasOpener(Boolean(window.opener));
        }
    }, []);

    const handleInstallationCallback = useAction(api.githubActions.handleInstallationCallbackUrl);

    useEffect(() => {
        // React Strict Mode double-invokes effects in dev. The mutation is
        // non-idempotent — a second fire produces a "State mismatch" error
        // that contradicts the success UI.
        if (calledRef.current) return;
        calledRef.current = true;

        const installationId = searchParams.get('installation_id');
        const setupAction = searchParams.get('setup_action');
        const stateParam = searchParams.get('state');

        if (!installationId) {
            setState('error');
            setMessage('Missing installation_id parameter');
            return;
        }

        if (!setupAction) {
            setState('error');
            setMessage('Missing setup_action parameter');
            return;
        }

        if (!stateParam) {
            setState('error');
            setMessage('Missing state parameter');
            return;
        }

        handleInstallationCallback({
            installationId,
            setupAction,
            state: stateParam,
        })
            .then(() => {
                // Scrub sensitive params after the request completes so router
                // history changes don't race with the in-flight fetch.
                window.history.replaceState({}, '', window.location.pathname);
                setState('success');
            })
            .catch((error: Error) => {
                window.history.replaceState({}, '', window.location.pathname);
                setState('error');
                setMessage(error.message);
                console.error('GitHub App installation callback failed:', error);
            });
    }, [handleInstallationCallback, searchParams]);

    // Auto-close the tab only when this page was opened via window.open()
    // — browsers block window.close() for tabs the user navigated to directly,
    // so we render a "Continue to Weblab" button instead in that case.
    useEffect(() => {
        if (state !== 'success') return;
        if (typeof window === 'undefined') return;
        if (!hasOpener) return;
        const t = setTimeout(() => {
            window.close();
        }, 5000);
        return () => clearTimeout(t);
    }, [state, hasOpener]);

    return (
        <div className="from-background-primary via-background to-background-primary flex min-h-screen items-center justify-center bg-gradient-to-br p-6">
            <div className="w-full max-w-md">
                <div className="mb-8 flex items-center justify-center gap-4">
                    <div className="bg-background-secondary rounded-xl p-4">
                        <Icons.WeblabLogo className="text-foreground-primary h-8 w-8" />
                    </div>
                    <Icons.DotsHorizontal className="text-foreground-tertiary h-8 w-8" />
                    <div className="bg-background-secondary rounded-xl p-4">
                        <Icons.GitHubLogo className="text-foreground-primary h-8 w-8" />
                    </div>
                </div>

                <Card className="border-border bg-background-primary shadow-2xl">
                    <CardContent className="p-8">
                        <div className="flex flex-col items-center text-center">
                            {state === 'loading' && (
                                <StateContent
                                    indicatorColor="bg-background-secondary"
                                    indicatorIcon={Icons.GitHubLogo}
                                    indicatorAnimated
                                    title="Connecting to GitHub"
                                    description="We're setting up your integration"
                                />
                            )}

                            {state === 'success' && (
                                <StateContent
                                    indicatorColor="bg-foreground-success"
                                    indicatorIcon={Icons.CheckCircled}
                                    title="GitHub connected!"
                                    description={
                                        hasOpener
                                            ? 'You can close this tab and return to Weblab.'
                                            : 'Continue to Weblab to finish setting up your project.'
                                    }
                                    actions={
                                        !hasOpener ? (
                                            <div className="flex w-full flex-col gap-3">
                                                <Button
                                                    variant="default"
                                                    onClick={() => router.push(Routes.PROJECTS)}
                                                    className="w-full"
                                                >
                                                    Continue to Weblab
                                                </Button>
                                            </div>
                                        ) : undefined
                                    }
                                />
                            )}

                            {state === 'error' && (
                                <StateContent
                                    indicatorColor="bg-destructive"
                                    indicatorIcon={Icons.ExclamationTriangle}
                                    title="Something went wrong"
                                    description={message}
                                    isError
                                    actions={
                                        <div className="flex w-full flex-col gap-3">
                                            <Button
                                                variant="default"
                                                onClick={() => window.location.reload()}
                                                className="w-full"
                                            >
                                                Try Again
                                            </Button>
                                            <Button
                                                variant="outline"
                                                onClick={() => router.push(Routes.IMPORT_GITHUB)}
                                                className="w-full"
                                            >
                                                Return to Import
                                            </Button>
                                        </div>
                                    }
                                />
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function StateContent({
    indicatorColor,
    indicatorIcon: IndicatorIcon,
    indicatorAnimated = false,
    title,
    description,
    isError = false,
    actions,
}: {
    indicatorColor: string;
    indicatorIcon: React.ComponentType<{ className?: string }>;
    indicatorAnimated?: boolean;
    title: string;
    description: string;
    isError?: boolean;
    actions?: React.ReactNode;
}) {
    return (
        <div className="flex w-full flex-col items-center gap-2">
            <div
                className={`relative h-16 w-16 rounded-full ${indicatorColor} mb-2 flex items-center justify-center`}
            >
                {indicatorAnimated && (
                    <div className="border-foreground-primary/30 absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-current" />
                )}
                <IndicatorIcon className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="text-foreground-primary text-xl">{title}</CardTitle>
            <CardDescription
                className={`max-w-sm ${isError ? 'text-foreground-tertiary' : 'text-foreground-secondary/90'}`}
            >
                {description}
            </CardDescription>
            {actions}
        </div>
    );
}
