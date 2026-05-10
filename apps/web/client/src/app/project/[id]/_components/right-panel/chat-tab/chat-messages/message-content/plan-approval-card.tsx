'use client';

import { useState } from 'react';
import type { z } from 'zod';

import { PlanCompleteTool } from '@weblab/ai/client';
import { ChatType } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { toast } from '@weblab/ui/sonner';

import { useEditorEngine } from '@/components/store/editor';

type ApprovalInput = z.infer<typeof PlanCompleteTool.parameters>;

export function PlanApprovalCard({
    input,
    isStream,
}: {
    input: ApprovalInput;
    isStream: boolean;
}) {
    const editorEngine = useEditorEngine();
    const [building, setBuilding] = useState(false);

    const handleBuildNow = () => {
        setBuilding(true);
        editorEngine.state.setChatMode(ChatType.EDIT);
        toast.success('Plan approved — switched to Build mode');
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
                <p className="text-foreground-secondary mb-3 text-mini leading-relaxed">
                    {input.summary}
                </p>
            )}
            <div className="flex gap-2">
                <Button
                    size="sm"
                    variant="default"
                    disabled={building}
                    onClick={handleBuildNow}
                    className="h-6 px-2.5 text-mini"
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
                    className="text-foreground-tertiary hover:text-foreground-primary h-6 px-2.5 text-mini"
                    onClick={() => {
                        // User can type a refinement message — no action needed
                    }}
                >
                    Keep Refining
                </Button>
            </div>
        </div>
    );
}
