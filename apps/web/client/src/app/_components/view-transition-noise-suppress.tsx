'use client';

import { useEffect } from 'react';

import { installViewTransitionNoiseSuppression } from '@/components/store/editor/sandbox/global-error-suppress';

/**
 * Mount-once client component that installs a global `unhandledrejection`
 * filter for React 19.2's View Transitions rejections. See
 * `installViewTransitionNoiseSuppression` for the rationale.
 *
 * Rendered from the root layout so it runs on every page, not just inside
 * the project canvas.
 */
export function ViewTransitionNoiseSuppress() {
    useEffect(() => {
        installViewTransitionNoiseSuppression();
    }, []);

    return null;
}
