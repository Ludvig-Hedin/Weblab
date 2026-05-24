'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

// Scoped error boundary that swallows render-time crashes inside the canvas
// subtree (frames, overlays, comment pins, remote cursors). Without it, a
// single undefined read in any of those observer components detonates the
// route-level error.tsx and the user loses the entire editor — including
// the layers panel, AI chat, and top bar that have no real dependency on
// the canvas. Logging + a sentinel placeholder keep the rest of the editor
// mountable while still surfacing the bug in DevTools.
interface State {
    error: Error | null;
}

interface Props {
    children: ReactNode;
    label?: string;
    /**
     * When `null`, render nothing on crash — useful for absolutely-positioned
     * chrome (TopBar / RightPanel / BottomBar) where a visible fallback would
     * stack on top of the canvas. The default fallback is a centered card,
     * appropriate for the canvas viewport itself.
     */
    fallback?: ReactNode;
}

export class CanvasErrorBoundary extends Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error(
            `[CanvasErrorBoundary${this.props.label ? `:${this.props.label}` : ''}] subtree crashed:`,
            error,
            info,
        );
    }

    render() {
        if (this.state.error) {
            if (this.props.fallback !== undefined) {
                return this.props.fallback;
            }
            return (
                <div className="bg-background-canvas flex h-full w-full items-center justify-center">
                    <div className="border-border max-w-md rounded-lg border p-6 text-center">
                        <p className="text-foreground-tertiary text-xs uppercase tracking-wide">
                            {this.props.label ?? 'Canvas'} unavailable
                        </p>
                        <h2 className="text-foreground mt-2 text-lg font-medium">
                            This panel couldn&apos;t render
                        </h2>
                        <p className="text-foreground-secondary mt-2 text-sm">
                            Usually this means the sandbox isn&apos;t reachable. Other panels are
                            still usable.
                        </p>
                        <p className="text-foreground-tertiary mt-3 font-mono text-xs break-all">
                            {this.state.error.message}
                        </p>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}
