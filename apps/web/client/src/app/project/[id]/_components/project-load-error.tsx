'use client';

import { useRouter } from 'next/navigation';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';

import { Routes } from '@/utils/constants';

type Variant = 'invalid-id' | 'not-found' | 'unauthorized' | 'unknown';

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
    unknown: {
        title: 'Failed to load project',
        description:
            'Something went wrong while loading this project. You can try again, or head back to your projects.',
        primaryLabel: 'Retry',
        primaryAction: 'retry',
    },
};

export const ProjectLoadError = ({ variant, message }: { variant: Variant; message?: string }) => {
    const router = useRouter();
    const copy = COPY[variant];

    const handlePrimary = () => {
        switch (copy.primaryAction) {
            case 'home':
                router.push(Routes.PROJECTS);
                return;
            case 'login':
                router.push(Routes.LOGIN);
                return;
            case 'retry':
                router.refresh();
                return;
        }
    };

    return (
        <div className="bg-background flex h-screen w-screen items-center justify-center">
            <div className="flex max-w-md flex-col items-center gap-4 px-6 text-center">
                <Icons.ExclamationTriangle className="text-foreground-primary h-8 w-8" />
                <h1 className="text-xl font-medium">{copy.title}</h1>
                <p className="text-foreground-secondary text-sm">{copy.description}</p>
                {message && variant === 'unknown' && (
                    <pre className="text-foreground-tertiary bg-background-secondary max-w-full rounded-md px-3 py-2 text-xs break-words whitespace-pre-wrap">
                        {message}
                    </pre>
                )}
                <div className="mt-2 flex items-center gap-2">
                    <Button onClick={handlePrimary}>{copy.primaryLabel}</Button>
                    {copy.primaryAction !== 'home' && (
                        <Button variant="ghost" onClick={() => router.push(Routes.PROJECTS)}>
                            Go to projects
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
};
