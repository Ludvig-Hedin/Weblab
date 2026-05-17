'use client';

import { BrandLogo } from '@weblab/ui/brand';
import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

export interface CreationLoaderStep {
    label: string;
    ready: boolean;
}

interface ProjectCreationLoaderProps {
    heading: string;
    caption?: string;
    steps?: CreationLoaderStep[];
    overlay?: boolean;
}

/**
 * Shared loading screen for the project creation lifecycle. Used in three
 * places that must look identical so the handoff is seamless:
 *   1. The Create-prompt overlay between submit click and router.push.
 *   2. The blank/template create flows on the projects page.
 *   3. The editor `/project/[id]` page while sandbox + canvas + chat boot.
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

    const activeIndex = steps ? steps.findIndex((step) => !step.ready) : -1;
    const completedCount = steps ? steps.filter((s) => s.ready).length : 0;
    const totalCount = steps?.length ?? 0;

    // 5% floor so the bar is never invisible at start; 100% only when all done.
    const progress =
        totalCount > 0 ? Math.max(5, Math.round((completedCount / totalCount) * 100)) : 5;

    return (
        <div className={containerClass}>
            <div className="flex w-full max-w-[280px] flex-col items-center gap-7 px-6">
                {/* Logo */}
                <BrandLogo className="h-5 opacity-60" />

                {/* Heading (anchor) → caption (detail) — heading is always first. */}
                <div className="flex flex-col items-center gap-2 text-center">
                    <h2 className="text-foreground-primary text-lg font-medium tracking-tight">
                        {heading}
                    </h2>
                    {caption && (
                        <p className="text-foreground-tertiary text-small max-w-[220px] leading-snug">
                            {caption}
                        </p>
                    )}
                </div>

                {/* Determinate progress bar */}
                <div
                    className="bg-foreground/8 relative h-[3px] w-full overflow-hidden rounded-full"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progress}
                    aria-label={heading}
                >
                    <div
                        className="absolute inset-y-0 left-0 rounded-full bg-blue-500 transition-[width] duration-700 ease-out"
                        style={{ width: `${progress}%` }}
                    />
                </div>

                {/* Steps — index key so dynamic labels don't cause remounts */}
                {steps && steps.length > 0 && (
                    <ul className="flex w-full flex-col gap-2.5">
                        {steps.map((step, index) => {
                            const isDone = step.ready;
                            const isActive = !isDone && index === activeIndex;
                            return (
                                <li key={index} className="flex items-center gap-3">
                                    <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                                        {isDone ? (
                                            <Icons.CheckCircled className="text-foreground-positive h-4 w-4" />
                                        ) : isActive ? (
                                            <Icons.LoadingSpinner className="text-foreground-primary h-4 w-4 animate-spin" />
                                        ) : (
                                            <span className="bg-foreground/15 h-1.5 w-1.5 rounded-full" />
                                        )}
                                    </span>
                                    <span
                                        className={cn(
                                            'text-small',
                                            isDone
                                                ? 'text-foreground-secondary'
                                                : isActive
                                                  ? 'text-foreground-primary font-medium'
                                                  : 'text-foreground-quadranary',
                                        )}
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
