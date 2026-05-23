'use client';

import { useEffect, useState } from 'react';

import type { ChatModel, LocalModelOption, ReasoningEffort } from '@weblab/models';
import { CHAT_MODEL_OPTIONS, modelSupportsReasoningEffort } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import { env } from '@/env';
import { ModelSelectorV2 } from './model-selector-v2';
import { ReasoningEffortPills } from './reasoning-effort-pills';

export type ModelSelectorProps = {
    value: ChatModel;
    onChange: (model: ChatModel) => void;
    localModels: LocalModelOption[];
    localModelsLoading: boolean;
    reasoningEffort?: ReasoningEffort;
    onReasoningEffortChange?: (effort: ReasoningEffort) => void;
};

export const ModelSelector = (props: ModelSelectorProps) => {
    if (env.NEXT_PUBLIC_PROVIDER_PICKER_V2) {
        return <ModelSelectorV2 {...props} />;
    }
    return <ModelSelectorLegacy {...props} />;
};

const ModelSelectorLegacy = ({
    value,
    onChange,
    localModels,
    localModelsLoading,
    reasoningEffort,
    onReasoningEffortChange,
}: ModelSelectorProps) => {
    const cloudOption = CHAT_MODEL_OPTIONS.find((o) => o.model === value);
    const localOption = localModels.find((o) => o.model === value);
    const fullLabel = cloudOption?.label ?? localOption?.label ?? value;
    // Strip provider prefix ("OpenAI GPT 5.5" → "GPT 5.5", "Anthropic Claude" → "Claude").
    // Falls back to the raw label if no recognized provider prefix is present.
    const currentLabel = fullLabel.replace(
        /^(OpenAI|Anthropic|Google|Meta|Mistral|xAI|Ollama|DeepSeek|Cohere)\s+/i,
        '',
    );

    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const handleOpen = () => setIsOpen(true);
        window.addEventListener('open-model-selector', handleOpen);
        return () => window.removeEventListener('open-model-selector', handleOpen);
    }, []);

    const showEffortControl =
        !!onReasoningEffortChange && !!reasoningEffort && modelSupportsReasoningEffort(value);

    return (
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Model: ${currentLabel}`}
                    className="text-foreground-tertiary hover:bg-background-tertiary hover:text-foreground-primary h-7 gap-1 rounded-md px-1.5 text-xs font-normal"
                >
                    <span title={currentLabel} className="max-w-[160px] truncate">
                        {currentLabel}
                    </span>
                    <Icons.ChevronDown className="text-foreground-tertiary h-3 w-3 shrink-0" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel className="text-foreground-tertiary text-mini px-3 py-1.5 font-normal">
                    Cloud models
                </DropdownMenuLabel>
                {CHAT_MODEL_OPTIONS.map((option) => (
                    <DropdownMenuItem
                        key={option.model}
                        onClick={() => onChange(option.model)}
                        className={cn(
                            'flex flex-col items-start gap-0.5 px-3 py-2',
                            option.model === value && 'bg-background-weblab',
                        )}
                    >
                        <span className="text-small font-medium">{option.label}</span>
                        <span className="text-foreground-tertiary text-mini">{option.model}</span>
                    </DropdownMenuItem>
                ))}

                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-foreground-tertiary text-mini px-3 py-1.5 font-normal">
                    Local models
                </DropdownMenuLabel>

                {localModelsLoading ? (
                    <DropdownMenuItem disabled className="text-mini px-3 py-2">
                        Detecting…
                    </DropdownMenuItem>
                ) : localModels.length > 0 ? (
                    localModels.map((option) => (
                        <DropdownMenuItem
                            key={option.model}
                            onClick={() => onChange(option.model)}
                            className={cn(
                                'flex flex-col items-start gap-0.5 px-3 py-2',
                                option.model === value && 'bg-background-weblab',
                            )}
                        >
                            <div className="flex w-full items-center justify-between">
                                <span className="text-small font-medium">{option.label}</span>
                                {option.size && (
                                    <span className="text-foreground-tertiary text-mini">
                                        {option.size}
                                    </span>
                                )}
                            </div>
                            <span className="text-foreground-tertiary text-mini">
                                {option.model}
                            </span>
                        </DropdownMenuItem>
                    ))
                ) : (
                    <DropdownMenuItem
                        disabled
                        className="text-muted-foreground text-mini px-3 py-2"
                    >
                        No local models — start Ollama to use them
                    </DropdownMenuItem>
                )}

                {showEffortControl && reasoningEffort && onReasoningEffortChange && (
                    <>
                        <DropdownMenuSeparator />
                        <div className="px-2 pb-2">
                            <ReasoningEffortPills
                                value={reasoningEffort}
                                onChange={onReasoningEffortChange}
                            />
                        </div>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
