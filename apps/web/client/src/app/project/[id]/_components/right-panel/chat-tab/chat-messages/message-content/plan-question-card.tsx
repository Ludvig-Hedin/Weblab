'use client';

import type { z } from 'zod';
import { useState } from 'react';

import { AskUserQuestionTool } from '@weblab/ai/client';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';
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
                <p className="text-foreground-primary text-mini leading-relaxed">
                    {input.question}
                </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
                {input.options.map((opt) => {
                    const isSelected = selected.has(opt.label);
                    const optionButton = (
                        <button
                            onClick={() => toggle(opt.label)}
                            disabled={submitted}
                            className={cn(
                                'border-border-primary text-foreground-secondary hover:border-border-strong hover:text-foreground-primary text-mini rounded-md border px-2 py-1 transition-colors',
                                isSelected &&
                                    'border-foreground-tertiary bg-background-weblab text-foreground-primary',
                                submitted && 'cursor-default opacity-60',
                            )}
                        >
                            {opt.label}
                        </button>
                    );
                    return opt.description ? (
                        <Tooltip key={opt.label}>
                            <TooltipTrigger asChild>{optionButton}</TooltipTrigger>
                            <TooltipContent side="top" sideOffset={4} className="max-w-[240px]">
                                {opt.description}
                            </TooltipContent>
                        </Tooltip>
                    ) : (
                        <span key={opt.label}>{optionButton}</span>
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
                        className="text-mini h-6 px-2.5"
                    >
                        Answer
                    </Button>
                </div>
            )}
            {submitted && (
                <div className="text-foreground-tertiary text-mini mt-2 flex items-center gap-1">
                    <Icons.CheckCircled className="h-3 w-3" />
                    {/*
                     * `selected` is local state, only populated by user clicks
                     * in this session. When the message comes back as answered
                     * after a refresh / from history, `selected` is empty and
                     * the previous "Answered: ..." rendered as "Answered: ".
                     * Show "Answered" alone when we can't reproduce the labels.
                     */}
                    <span>
                        {selected.size > 0
                            ? `Answered: ${Array.from(selected).join(', ')}`
                            : 'Answered'}
                    </span>
                </div>
            )}
        </div>
    );
}
