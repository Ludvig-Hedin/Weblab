'use client';

import type { ReactNode } from 'react';
import { Component } from 'react';
import Link from 'next/link';

import { Button } from '@weblab/ui/button';

import { usePilotCopy } from '@/lib/cloud-pilot/copy';

class Boundary extends Component<
    { children: ReactNode; fallback: ReactNode },
    { failed: boolean }
> {
    state = { failed: false };
    static getDerivedStateFromError() {
        return { failed: true };
    }
    render() {
        return this.state.failed ? this.props.fallback : this.props.children;
    }
}

export function PilotBoundary({ children }: { children: ReactNode }) {
    const copy = usePilotCopy();
    return (
        <Boundary
            fallback={
                <main className="mx-auto flex max-w-lg flex-col gap-4 p-8">
                    <h1 className="text-xl font-medium">{copy.title}</h1>
                    <p role="alert" className="text-foreground-secondary">
                        {copy.loadError}
                    </p>
                    <div className="flex gap-2">
                        <Button onClick={() => window.location.reload()}>{copy.retry}</Button>
                        <Button asChild variant="ghost">
                            <Link href="/projects">{copy.back}</Link>
                        </Button>
                    </div>
                </main>
            }
        >
            {children}
        </Boundary>
    );
}

/** A failed subscription must not unmount its sibling editor and its unsaved draft. */
export class PilotSubscriptionBoundary extends Component<
    {
        children: ReactNode;
        onError: () => void;
    },
    { failed: boolean }
> {
    state = { failed: false };
    static getDerivedStateFromError() {
        return { failed: true };
    }
    componentDidCatch() {
        this.props.onError();
    }
    render() {
        return this.state.failed ? null : this.props.children;
    }
}
