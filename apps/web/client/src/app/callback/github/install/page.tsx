'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useAction } from 'convex/react';
import { AnimatePresence, motion } from 'motion/react';

import { Button } from '@weblab/ui/button';
import { Card, CardContent, CardDescription, CardTitle } from '@weblab/ui/card';
import { Icons } from '@weblab/ui/icons';

import { Routes } from '@/utils/constants';

type CallbackState = 'loading' | 'success' | 'error';

export default function GitHubInstallCallbackPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [state, setState] = useState<CallbackState>('loading');
    const [message, setMessage] = useState<string>('');
    const [hasOpener, setHasOpener] = useState<boolean>(false);
    const calledRef = useRef(false);

    useEffect(() => {
        // Determined client-side only — `window` is unavailable during SSR.
        if (typeof window !== 'undefined') {
            setHasOpener(Boolean(window.opener));
        }
    }, []);

    const handleInstallationCallback = useAction(api.githubActions.handleInstallationCallbackUrl);

    useEffect(() => {
        // Guard against React Strict Mode double-invocation in development —
        // the mutation is non-idempotent and a second fire produces a
        // "State mismatch" error that conflicts with the success UI.
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

        // Call the Convex action to handle the callback.
        // Scrub sensitive params from the URL only after the request completes
        // so that Next.js router history changes don't race with the in-flight fetch.
        handleInstallationCallback({
            installationId,
            setupAction: setupAction,
            state: stateParam,
        })
            .then(() => {
                window.history.replaceState({}, '', window.location.pathname);
                setState('success');
            })
            .catch((error: Error) => {
                window.history.replaceState({}, '', window.location.pathname);
                setState('error');
                setMessage(error.message);
                console.error('GitHub App installation callback failed:', error);
            });
    }, []);

    // Auto-close the tab only when this page was opened by window.open()
    // (i.e. has an opener). Browsers block window.close() for tabs the user
    // navigated to directly (email/Slack link), so in that case we render a
    // manual "Continue to Weblab" button on the success screen instead.
    useEffect(() => {
        if (state !== 'success') return;
        if (typeof window === 'undefined') return;
        if (!hasOpener) return;
        const t = setTimeout(() => {
            window.close();
        }, 5000);
        return () => clearTimeout(t);
    }, [state, hasOpener]);

    const StateContainer = ({
        indicatorColor,
        indicatorIcon: IndicatorIcon,
        indicatorAnimated = false,
        iconAnimated = false,
        title,
        description,
        isError = false,
        actions,
    }: {
        indicatorColor: string;
        indicatorIcon: React.ComponentType<{ className?: string }>;
        indicatorAnimated?: boolean;
        iconAnimated?: boolean;
        title: string;
        description: string;
        isError?: boolean;
        actions?: React.ReactNode;
    }) => (
        <div className="flex w-full flex-col items-center gap-2">
            {iconAnimated ? (
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                >
                    <div
                        className={`relative h-16 w-16 rounded-full ${indicatorColor} mb-2 flex items-center justify-center`}
                    >
                        {indicatorAnimated && (
                            <div className="border-foreground-primary/30 absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-current" />
                        )}
                        <IndicatorIcon className="h-8 w-8 text-white" />
                    </div>
                </motion.div>
            ) : (
                <div
                    className={`relative h-16 w-16 rounded-full ${indicatorColor} mb-2 flex items-center justify-center`}
                >
                    {indicatorAnimated && (
                        <div className="border-foreground-primary/30 absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-current" />
                    )}
                    <IndicatorIcon className="h-8 w-8 text-white" />
                </div>
            )}
            <CardTitle className="text-foreground-primary text-xl">{title}</CardTitle>
            <CardDescription
                className={`max-w-sm ${isError ? 'text-foreground-tertiary' : 'text-foreground-secondary/90'}`}
            >
                {description}
            </CardDescription>
            {actions}
        </div>
    );

    return (
        <div className="from-background-primary via-background to-background-primary flex min-h-screen items-center justify-center bg-gradient-to-br p-6">
            <div className="w-full max-w-md">
                {/* Header - Above Card */}
                <div className="mb-8 flex items-center justify-center gap-4">
                    <div className="bg-background-secondary rounded-xl p-4">
                        <Icons.WeblabLogo className="text-foreground-primary h-8 w-8" />
                    </div>
                    <Icons.DotsHorizontal className="text-foreground-tertiary h-8 w-8" />
                    <div className="bg-background-secondary rounded-xl p-4">
                        <Icons.GitHubLogo className="text-foreground-primary h-8 w-8" />
                    </div>
                </div>

                <AnimatePresence mode="wait">
                    <motion.div
                        key={state}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                    >
                        <Card className="border-border bg-background-primary shadow-2xl">
                            <CardContent className="p-8">
                                <div className="flex flex-col items-center text-center">
                                    {/* Loading State */}
                                    {state === 'loading' && (
                                        <StateContainer
                                            indicatorColor="bg-background-secondary"
                                            indicatorIcon={Icons.GitHubLogo}
                                            indicatorAnimated={true}
                                            title="Connecting to GitHub"
                                            description="We're setting up your integration"
                                        />
                                    )}

                                    {/* Success State */}
                                    {state === 'success' && (
                                        <StateContainer
                                            indicatorColor="bg-foreground-success"
                                            indicatorIcon={Icons.CheckCircled}
                                            iconAnimated={true}
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
                                                            onClick={() =>
                                                                router.push(Routes.PROJECTS)
                                                            }
                                                            className="w-full"
                                                        >
                                                            Continue to Weblab
                                                        </Button>
                                                    </div>
                                                ) : undefined
                                            }
                                        />
                                    )}

                                    {/* Error State */}
                                    {state === 'error' && (
                                        <StateContainer
                                            indicatorColor="bg-destructive"
                                            indicatorIcon={Icons.ExclamationTriangle}
                                            iconAnimated={true}
                                            title="Something went wrong"
                                            description={message}
                                            isError={true}
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
                                                        onClick={() =>
                                                            router.push(Routes.IMPORT_GITHUB)
                                                        }
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
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}
