'use client';

import type { FrameworkId } from '@weblab/framework';
import { listReadyFrameworkAdapters } from '@weblab/framework';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@weblab/ui/dialog';
import { Icons } from '@weblab/ui/icons';

interface FrameworkSelectDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelect: (framework: FrameworkId) => void;
}

const FRAMEWORK_META: Record<
    string,
    { icon: React.ReactNode; description: string; recommended?: boolean }
> = {
    nextjs: {
        icon: <Icons.Globe className="h-4 w-4" />,
        description: 'React, Tailwind, and shadcn/ui — the recommended stack for most projects.',
        recommended: true,
    },
    'static-html': {
        icon: <Icons.Code className="h-4 w-4" />,
        description: 'Vanilla HTML, CSS, and JavaScript — no build step or framework required.',
    },
    'vite-react': {
        icon: <Icons.Globe className="h-4 w-4" />,
        description: 'React with Vite — fast HMR, lightweight config, no server-side rendering.',
    },
    remix: {
        icon: <Icons.Globe className="h-4 w-4" />,
        description: 'Full-stack React with server loaders, nested routes, and web standards.',
    },
    astro: {
        icon: <Icons.Globe className="h-4 w-4" />,
        description: 'Content-first sites with islands architecture and zero JS by default.',
    },
    'tanstack-start': {
        icon: <Icons.Globe className="h-4 w-4" />,
        description: 'Full-stack React with type-safe routing and server functions.',
    },
};

export function FrameworkSelectDialog({
    open,
    onOpenChange,
    onSelect,
}: FrameworkSelectDialogProps) {
    const adapters = listReadyFrameworkAdapters();

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[640px]">
                <DialogHeader>
                    <DialogTitle>Choose your stack</DialogTitle>
                    <DialogDescription>
                        Pick the technology for your new blank project.
                    </DialogDescription>
                </DialogHeader>

                <div
                    className={`grid gap-3 ${adapters.length === 1 ? 'grid-cols-1' : 'sm:grid-cols-2'}`}
                >
                    {adapters.map((adapter) => {
                        const meta = FRAMEWORK_META[adapter.id];
                        return (
                            <button
                                key={adapter.id}
                                type="button"
                                onClick={() => onSelect(adapter.id)}
                                className="group border-foreground/10 bg-foreground/4 hover:border-foreground/20 hover:bg-foreground/8 flex min-h-44 flex-col justify-between rounded-lg border p-4 text-left transition-colors"
                            >
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2">
                                        <div className="border-foreground/10 bg-background flex h-9 w-9 items-center justify-center rounded-full border">
                                            {meta?.icon ?? <Icons.Globe className="h-4 w-4" />}
                                        </div>
                                        {meta?.recommended && (
                                            <span className="border-foreground/20 text-foreground-secondary rounded-full border px-2 py-0.5 text-[10px]">
                                                Recommended
                                            </span>
                                        )}
                                    </div>
                                    <div>
                                        <div className="text-foreground text-sm font-medium">
                                            {adapter.displayName}
                                        </div>
                                        <div className="text-foreground-tertiary mt-1 text-sm leading-5">
                                            {meta?.description ?? adapter.displayName}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-foreground-secondary group-hover:text-foreground mt-4 flex items-center gap-2 text-sm">
                                    Start with {adapter.displayName}
                                    <Icons.ArrowRight className="h-4 w-4" />
                                </div>
                            </button>
                        );
                    })}
                </div>
            </DialogContent>
        </Dialog>
    );
}
