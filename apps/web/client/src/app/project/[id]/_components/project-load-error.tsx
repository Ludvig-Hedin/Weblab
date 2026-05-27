'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import { observer } from 'mobx-react-lite';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';

import { useOptionalEditorEngine } from '@/components/store/editor';
import { getSignInUrlClient } from '@/utils/auth/sign-in-url';
import { Routes } from '@/utils/constants';

type Variant = 'invalid-id' | 'not-found' | 'unauthorized' | 'forbidden' | 'unknown';

const COPY: Record<
    Variant,
    {
        title: string;
        description: string;
        primaryLabel: string;
        primaryAction: 'home' | 'login' | 'retry';
    }
> = {
    'invalid-id': {
        title: 'Invalid project ID',
        description: 'The link you followed doesn’t look right.',
        primaryLabel: 'Go to projects',
        primaryAction: 'home',
    },
    'not-found': {
        title: 'Project not found',
        description: 'This project may have been deleted, or you may not have access to it.',
        primaryLabel: 'Go to projects',
        primaryAction: 'home',
    },
    unauthorized: {
        title: 'Your session has expired',
        description: 'Sign in again to continue working on this project.',
        primaryLabel: 'Sign in',
        primaryAction: 'login',
    },
    // Distinct from `unauthorized` (session expired): the caller IS signed
    // in but lacks access to this project. Showing a "Sign in" CTA here
    // creates an infinite loop because sign-in completes and lands them
    // right back on the same `/project/<id>` they can't view.
    forbidden: {
        title: 'You don’t have access to this project',
        description:
            'This project belongs to someone else. Ask the owner to invite you, or head back to your own projects.',
        primaryLabel: 'Go to projects',
        primaryAction: 'home',
    },
    unknown: {
        title: 'Failed to load project',
        description:
            'Something went wrong while loading this project. You can try again, or head back to your projects.',
        primaryLabel: 'Retry',
        primaryAction: 'retry',
    },
};

export const ProjectLoadError = observer(
    ({ variant, message }: { variant: Variant; message?: string }) => {
        const router = useRouter();
        const copy = COPY[variant];
        // `ProjectLoadError` can render BEFORE `EditorEngineProvider` mounts
        // (e.g. from `page.tsx` for `not-found`/`unauthorized`), so we must
        // use the optional variant to avoid throwing in that path.
        const editorEngine = useOptionalEditorEngine();
        // Only fetch the user when we actually have an engine — otherwise
        // there's no sandbox session to reconnect and the query is wasted.
        // Convex 'skip' goes in arg 2, not arg 1. Passing 'skip' as the function
        // ref triggers `Could not find public function for 'skip'` and detonates.
        const user = useQuery(api.users.me, editorEngine ? {} : 'skip');
        const [isRetrying, setIsRetrying] = useState(false);

        const handleRetry = async () => {
            // No engine available → fall back to a plain server refresh.
            // This is the path taken when the error was thrown from the
            // page Server Component before providers mounted.
            if (!editorEngine) {
                router.refresh();
                return;
            }

            setIsRetrying(true);
            try {
                // The failed sandbox state lives in MobX. `reconnect` falls
                // through to `start()` when `provider` is null (see #24), so
                // it is safe to call unconditionally. On success, MobX state
                // clears reactively and `Main` swaps back to the editor UI.
                await editorEngine.activeSandbox.session.reconnect(
                    editorEngine.branches.activeBranch?.sandbox?.id ?? editorEngine.projectId,
                    user?._id,
                );
            } catch (error) {
                console.error('ProjectLoadError retry failed', error);
                // Last-ditch fallback: refresh the route. Won't fix a stuck
                // MobX session on its own, but at least re-runs the page's
                // server-side load and may surface a different error state.
                router.refresh();
            } finally {
                setIsRetrying(false);
            }
        };

        const handlePrimary = () => {
            switch (copy.primaryAction) {
                case 'home':
                    router.push(Routes.PROJECTS);
                    return;
                case 'login':
                    router.push(getSignInUrlClient());
                    return;
                case 'retry':
                    void handleRetry();
                    return;
            }
        };

        const isRetryAction = copy.primaryAction === 'retry';

        return (
            <div className="bg-background flex h-screen w-screen items-center justify-center">
                <div className="flex max-w-md flex-col items-center gap-4 px-6 text-center">
                    <Icons.ExclamationTriangle className="text-foreground-primary h-8 w-8" />
                    <h1 className="text-title3 font-medium">{copy.title}</h1>
                    <p className="text-foreground-secondary text-small">{copy.description}</p>
                    {message && variant === 'unknown' && (
                        <pre className="text-foreground-tertiary bg-background-secondary text-mini max-w-full rounded-md px-3 py-2 break-words whitespace-pre-wrap">
                            {message}
                        </pre>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                        <Button onClick={handlePrimary} disabled={isRetryAction && isRetrying}>
                            {isRetryAction && isRetrying ? 'Retrying…' : copy.primaryLabel}
                        </Button>
                        {copy.primaryAction !== 'home' && (
                            <Button variant="ghost" asChild disabled={isRetryAction && isRetrying}>
                                <Link href={Routes.PROJECTS}>Go to projects</Link>
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        );
    },
);
