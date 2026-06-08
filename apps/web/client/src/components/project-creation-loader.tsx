'use client';

import type { ReactNode } from 'react';

import { BrandLogo } from '@weblab/ui/brand';

export interface CreationLoaderStep {
    label: string;
    ready: boolean;
}

interface ProjectCreationLoaderProps {
    heading: string;
    caption?: string;
    steps?: CreationLoaderStep[];
    overlay?: boolean;
    /**
     * Optional slot rendered beneath the steps. Used by the editor boot path
     * to surface a non-blocking watchdog affordance (e.g. a Retry button) when
     * startup stalls past a timeout. Purely additive — existing call sites that
     * omit it render exactly as before.
     */
    footer?: ReactNode;
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
    footer,
}: ProjectCreationLoaderProps) {
    const containerClass = overlay
        ? 'bg-background fixed inset-0 z-[200] flex items-center justify-center'
        : 'bg-background flex h-screen w-screen items-center justify-center';

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

                {/* Current step — single line, no checklist */}
                {steps && steps.length > 0 && (
                    <p className="text-foreground-tertiary text-small text-center">
                        {(steps.find((s) => !s.ready) ?? steps[steps.length - 1])?.label}
                    </p>
                )}

                {/* Optional watchdog/affordance slot (e.g. Retry on stall). */}
                {footer && <div className="flex w-full flex-col items-center gap-2">{footer}</div>}
            </div>
        </div>
    );
}
