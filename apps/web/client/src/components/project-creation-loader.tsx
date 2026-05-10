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
 * Shared loading screen for the project creation lifecycle. Used in three
 * places that must look identical so the handoff is seamless:
 *   1. The Create-prompt overlay between submit click and router.push.
 *   2. The blank/template create flows on the projects page.
 *   3. The editor `/project/[id]` page while sandbox + canvas + chat boot.
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

    // The first non-ready step is the *active* one; only it gets the spinner
    // so the user has a single, unambiguous "this is happening now" focus
    // point instead of three identical spinners that read as "everything is
    // stuck."
    const activeIndex = steps ? steps.findIndex((step) => !step.ready) : -1;

    return (
        <div className={containerClass}>
            <div className="flex w-full max-w-sm flex-col items-center gap-6 px-6">
                <div className="flex flex-col items-center gap-2">
                    <div className="text-title2 text-foreground-primary text-center font-medium">
                        {heading}
                    </div>
                    {caption && (
                        <p className="text-foreground-tertiary text-small max-w-xs text-center leading-relaxed">
                            {caption}
                        </p>
                    )}
                </div>

                {/* Indeterminate progress track. The slow phase (sandbox
                    provisioning) has no reliable percentage signal, so an
                    indeterminate bar is the honest pattern — it conveys
                    activity without lying about completion. */}
                <div className="bg-foreground/5 relative h-0.5 w-full overflow-hidden rounded-full">
                    <div
                        className="bg-foreground/40 animate-weblab-indeterminate absolute inset-y-0 left-0 w-[35%] rounded-full"
                        style={{ animation: 'weblab-indeterminate 1.6s ease-in-out infinite' }}
                    />
                </div>

                {steps && steps.length > 0 && (
                    <ul className="flex w-full flex-col gap-2.5">
                        {steps.map((step, index) => {
                            const isDone = step.ready;
                            const isActive = !isDone && index === activeIndex;
                            return (
                                <li key={step.label} className="flex items-center gap-3">
                                    <span className="flex h-4 w-4 items-center justify-center">
                                        {isDone ? (
                                            <Icons.CheckCircled className="text-foreground-positive h-4 w-4" />
                                        ) : isActive ? (
                                            <Icons.LoadingSpinner className="text-foreground-primary h-4 w-4 animate-spin" />
                                        ) : (
                                            <span className="bg-foreground/15 h-1.5 w-1.5 rounded-full" />
                                        )}
                                    </span>
                                    <span
                                        className={
                                            'text-small ' +
                                            (isDone
                                                ? 'text-foreground-secondary'
                                                : isActive
                                                  ? 'text-foreground-primary font-medium'
                                                  : 'text-foreground-quadranary')
                                        }
                                    >
                                        {step.label}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
