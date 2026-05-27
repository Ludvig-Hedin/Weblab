'use client';

import { useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@weblab/ui/button';
import { Card, CardContent, CardDescription, CardTitle } from '@weblab/ui/card';
import { Icons } from '@weblab/ui/icons';

import { Routes } from '@/utils/constants';

// Figma OAuth callback is `#disabled` until OAuth is configured. All branches
// resolve to the same error UI, so the page derives its message synchronously
// from URL params during render instead of routing it through useEffect +
// useState — the previous version sometimes failed to transition off the
// loading state under React Strict Mode's double-invoke + AnimatePresence
// `mode="wait"` interaction, leaving the user staring at a spinner forever.

function resolveMessage(searchParams: URLSearchParams | ReadonlyURLSearchParamsLike): string {
    const error = searchParams.get('error');
    if (error) return `Figma returned an error: ${error}`;
    const code = searchParams.get('code');
    const stateParam = searchParams.get('state');
    if (!code || !stateParam) return 'Missing required parameters from Figma.';
    return 'Figma OAuth is not configured yet. Return to import and use a personal access token.';
}

// Minimal shape we read from `useSearchParams()` — Next.js's
// `ReadonlyURLSearchParams` isn't exported, so we type structurally to avoid
// pulling in internal types.
interface ReadonlyURLSearchParamsLike {
    get(name: string): string | null;
}

export default function FigmaOAuthCallbackPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const message = resolveMessage(searchParams);

    return (
        <div className="from-background-primary via-background to-background-primary flex min-h-screen items-center justify-center bg-gradient-to-br p-6">
            <div className="w-full max-w-md">
                <div className="mb-8 flex items-center justify-center gap-4">
                    <div className="bg-background-secondary rounded-xl p-4">
                        <Icons.WeblabLogo className="text-foreground-primary h-8 w-8" />
                    </div>
                    <Icons.DotsHorizontal className="text-foreground-tertiary h-8 w-8" />
                    <div className="bg-background-secondary rounded-xl p-4">
                        <Icons.Figma className="text-foreground-primary h-8 w-8" />
                    </div>
                </div>

                <Card className="border-border bg-background-primary shadow-2xl">
                    <CardContent className="p-8">
                        <div className="flex w-full flex-col items-center gap-4 text-center">
                            <div className="bg-destructive mb-2 flex h-16 w-16 items-center justify-center rounded-full">
                                <Icons.ExclamationTriangle className="h-8 w-8 text-white" />
                            </div>
                            <CardTitle className="text-foreground-primary text-xl">
                                Something went wrong
                            </CardTitle>
                            <CardDescription className="text-foreground-tertiary max-w-sm">
                                {message}
                            </CardDescription>
                            <div className="mt-2 flex w-full flex-col gap-3">
                                <Button
                                    variant="outline"
                                    onClick={() => router.push(Routes.IMPORT_FIGMA)}
                                    className="w-full"
                                >
                                    Return to Import
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
