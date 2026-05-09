'use client';

import { Icons } from '@weblab/ui/icons';

export interface CreationLoaderStep {
    label: string;
    ready: boolean;
}

interface ProjectCreationLoaderProps {
    heading: string;
    /** Optional caption shown under the heading (e.g. "We saved your prompt..."). */
    caption?: string;
    /** Step list with ready/pending state. Omit to show only the heading. */
    steps?: CreationLoaderStep[];
    /**
     * When true, fixes the loader to the viewport with an opaque background.
     * Use for surfaces where the loader needs to cover existing content
     * (e.g. the projects page while a prompt is being submitted).
     */
    overlay?: boolean;
}

/**
 * Shared loading screen for the project creation lifecycle. Used in two
 * places that must look identical so the handoff is seamless:
 *   1. The Create-prompt overlay between submit click and router.push.
 *   2. The editor `/project/[id]` page while sandbox + canvas + chat boot.
 *
 * Keeping a single source of truth prevents the loaders drifting visually
 * and giving the user the impression of a stutter when navigation happens.
 */
export function ProjectCreationLoader({
    heading,
    caption,
    steps,
    overlay = false,
}: ProjectCreationLoaderProps) {
    const containerClass = overlay
        ? 'bg-background fixed inset-0 z-[200] flex items-center justify-center'
        : 'bg-background flex h-screen w-screen items-center justify-center';

    return (
        <div className={containerClass}>
            <div className="flex min-w-[260px] flex-col items-center gap-5">
                <div className="flex items-center gap-2.5">
                    <Icons.LoadingSpinner className="text-foreground-primary h-5 w-5 animate-spin" />
                    <div className="text-title3 text-foreground-primary">{heading}</div>
                </div>
                {caption && (
                    <p className="text-foreground-tertiary text-small max-w-xs text-center">
                        {caption}
                    </p>
                )}
                {steps && steps.length > 0 && (
                    <ul className="text-foreground-tertiary text-small flex w-full flex-col gap-1.5">
                        {steps.map((step) => (
                            <li key={step.label} className="flex items-center gap-2">
                                {step.ready ? (
                                    <Icons.CheckCircled className="text-foreground-positive h-4 w-4" />
                                ) : (
                                    <Icons.LoadingSpinner className="text-foreground-quadranary h-4 w-4 animate-spin" />
                                )}
                                <span
                                    className={
                                        step.ready
                                            ? 'text-foreground-primary'
                                            : 'text-foreground-tertiary'
                                    }
                                >
                                    {step.label}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
