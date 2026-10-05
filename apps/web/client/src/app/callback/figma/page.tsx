'use client';

import { useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@weblab/ui/button';
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
        <div className="bg-background flex min-h-screen items-center justify-center px-6 py-12">
            <div className="w-full max-w-md">
                <div className="mb-8 flex items-center justify-center gap-4">
                    <div className="p-4">
                        <Icons.WeblabLogo className="text-foreground-primary h-8 w-8" />
                    </div>
                    <Icons.DotsHorizontal className="text-foreground-tertiary h-8 w-8" />
                    <div className="p-4">
                        <Icons.Figma className="text-foreground-primary h-8 w-8" />
                    </div>
                </div>

                <div>
                    <div>
                        <div className="flex w-full flex-col items-center gap-4 text-center">
                            <div className="mb-2 flex h-16 w-16 items-center justify-center">
                                <Icons.ExclamationTriangle className="text-destructive h-8 w-8" />
                            </div>
                            <h1 className="text-foreground-primary text-xl leading-none font-semibold">
                                Something went wrong
                            </h1>
                            <p className="text-foreground-tertiary max-w-sm text-sm">{message}</p>
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
                    </div>
                </div>
            </div>
        </div>
    );
}
