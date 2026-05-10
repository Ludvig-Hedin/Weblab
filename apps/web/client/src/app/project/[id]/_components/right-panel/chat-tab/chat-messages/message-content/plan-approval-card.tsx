'use client';

import type { z } from 'zod';
import { useState } from 'react';

import type { PlanCompleteTool } from '@weblab/ai/client';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';

import { FOCUS_CHAT_INPUT_EVENT } from '@/components/store/editor/chat';

type ApprovalInput = z.infer<typeof PlanCompleteTool.parameters>;

export function PlanApprovalCard({
    input,
    isStream,
    onBuildNow,
}: {
    input: ApprovalInput;
    isStream: boolean;
    onBuildNow: () => void;
}) {
    const [building, setBuilding] = useState(false);

    const handleBuildNow = () => {
        setBuilding(true);
        try {
            onBuildNow();
        } finally {
            // onBuildNow flips a global chat mode; the card usually unmounts.
            // If it doesn't (mode toggle cancelled elsewhere) reset the
            // spinner so the button isn't stuck forever.
            setTimeout(() => setBuilding(false), 800);
        }
    };

    if (isStream) {
        return (
            <div className="border-border-primary/40 bg-background-secondary flex items-center gap-2 rounded-lg border p-3">
                <Icons.LoadingSpinner className="text-foreground-tertiary h-3.5 w-3.5 animate-spin" />
                <span className="text-foreground-tertiary text-mini">Writing plan…</span>
            </div>
        );
    }

    return (
        <div className="border-border-primary/40 bg-background-secondary rounded-lg border p-3">
            <div className="mb-2 flex items-center gap-2">
                <Icons.Plan className="text-foreground-primary h-3.5 w-3.5 shrink-0" />
                <span className="text-foreground-primary text-mini font-medium">Plan ready</span>
            </div>
            {input.summary && (
                <p className="text-foreground-secondary text-mini mb-3 leading-relaxed">
                    {input.summary}
                </p>
            )}
            <div className="flex gap-2">
                <Button
                    size="sm"
                    variant="default"
                    disabled={building}
                    onClick={handleBuildNow}
                    className="text-mini h-6 px-2.5"
                >
                    {building ? (
                        <Icons.LoadingSpinner className="h-3 w-3 animate-spin" />
                    ) : (
                        'Build Now'
                    )}
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    className="text-foreground-tertiary hover:text-foreground-primary text-mini h-6 px-2.5"
                    onClick={() => window.dispatchEvent(new Event(FOCUS_CHAT_INPUT_EVENT))}
                >
                    Keep Refining
                </Button>
            </div>
        </div>
    );
}
