'use client';

import type { ReactNode } from 'react';
import { Component } from 'react';

interface Props {
    label: string;
    children: ReactNode;
}

interface State {
    hasError: boolean;
}

/**
 * Crash-safety net for a single rendered block. A block that throws during
 * render shows a small inline tile instead of blanking the whole canvas. This is
 * NOT a content strategy — every section maps to a real block; this only guards
 * against an unexpected render error.
 */
export class SectionBoundary extends Component<Props, State> {
    state: State = { hasError: false };

    static getDerivedStateFromError(): State {
        return { hasError: true };
    }

    componentDidCatch(error: unknown): void {
        console.error('[wireframe] block render failed:', this.props.label, error);
    }

    render(): ReactNode {
        if (this.state.hasError) {
            return (
                <div className="border-border bg-muted/40 text-muted-foreground m-4 rounded-lg border border-dashed p-6 text-center text-sm">
                    Couldn’t render “{this.props.label}”.
                </div>
            );
        }
        return this.props.children;
    }
}
