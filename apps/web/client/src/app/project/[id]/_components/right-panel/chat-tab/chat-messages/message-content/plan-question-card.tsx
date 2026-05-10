'use client';

import { useState } from 'react';
import type { z } from 'zod';

import { AskUserQuestionTool } from '@weblab/ai/client';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

type QuestionInput = z.infer<typeof AskUserQuestionTool.parameters>;

export function PlanQuestionCard({
    toolCallId,
    input,
    answered,
}: {
    toolCallId: string;
    input: QuestionInput;
    answered?: boolean;
}) {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [submitted, setSubmitted] = useState(answered ?? false);

    const toggle = (label: string) => {
        if (submitted) return;
        if (!input.multiSelect) {
            setSelected(new Set([label]));
        } else {
            setSelected((prev) => {
                const next = new Set(prev);
                if (next.has(label)) {
                    next.delete(label);
                } else {
                    next.add(label);
                }
                return next;
            });
        }
    };

    const submit = () => {
        if (submitted || selected.size === 0) return;
        const answer = Array.from(selected).join(', ');
        setSubmitted(true);
        AskUserQuestionTool.resolve(toolCallId, answer);
    };

    const canSubmit = selected.size > 0 && !submitted;

    return (
        <div className="border-border-primary/40 bg-background-secondary rounded-lg border p-3 text-sm">
            <div className="mb-2.5 flex items-start gap-2">
                <Icons.QuestionMarkCircled className="text-foreground-tertiary mt-0.5 h-3.5 w-3.5 shrink-0" />
                <p className="text-foreground-primary text-mini leading-relaxed">{input.question}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
                {input.options.map((opt) => {
                    const isSelected = selected.has(opt.label);
                    return (
                        <button
                            key={opt.label}
                            onClick={() => toggle(opt.label)}
                            disabled={submitted}
                            title={opt.description}
                            className={cn(
                                'border-border-primary text-foreground-secondary hover:border-border-strong hover:text-foreground-primary rounded-md border px-2 py-1 text-mini transition-colors',
                                isSelected &&
                                    'border-foreground-tertiary bg-background-weblab text-foreground-primary',
                                submitted && 'cursor-default opacity-60',
                            )}
                        >
                            {opt.label}
                        </button>
                    );
                })}
            </div>
            {!submitted && (
                <div className="mt-2.5 flex justify-end">
                    <Button
                        size="sm"
                        variant="default"
                        disabled={!canSubmit}
                        onClick={submit}
                        className="h-6 px-2.5 text-mini"
                    >
                        Answer
                    </Button>
                </div>
            )}
            {submitted && (
                <div className="text-foreground-tertiary mt-2 flex items-center gap-1 text-mini">
                    <Icons.CheckCircled className="h-3 w-3" />
                    <span>Answered: {Array.from(selected).join(', ')}</span>
                </div>
            )}
        </div>
    );
}
