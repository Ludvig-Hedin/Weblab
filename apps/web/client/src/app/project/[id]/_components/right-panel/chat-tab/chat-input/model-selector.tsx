'use client';

import { useEffect, useState } from 'react';

import type { ChatModel, LocalModelOption } from '@weblab/models';
import { CHAT_MODEL_OPTIONS } from '@weblab/models';
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

export const ModelSelector = ({
    value,
    onChange,
    localModels,
    localModelsLoading,
}: {
    value: ChatModel;
    onChange: (model: ChatModel) => void;
    localModels: LocalModelOption[];
    localModelsLoading: boolean;
}) => {
    const cloudOption = CHAT_MODEL_OPTIONS.find((o) => o.model === value);
    const localOption = localModels.find((o) => o.model === value);
    const currentLabel = cloudOption?.label ?? localOption?.label ?? value;

    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const handleOpen = () => setIsOpen(true);
        window.addEventListener('open-model-selector', handleOpen);
        return () => window.removeEventListener('open-model-selector', handleOpen);
    }, []);

    return (
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-foreground-secondary hover:bg-background-secondary hover:text-foreground-primary h-8 gap-1.5 px-2 text-xs"
                >
                    <Icons.ChevronDown className="h-3.5 w-3.5 shrink-0" />
                    <span className="max-w-[80px] truncate @[260px]:max-w-[160px]">
                        {currentLabel}
                    </span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel className="text-foreground-tertiary px-3 py-1.5 text-xs font-normal">
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
                        <span className="text-sm font-medium">{option.label}</span>
                        <span className="text-foreground-tertiary text-xs">{option.model}</span>
                    </DropdownMenuItem>
                ))}

                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-foreground-tertiary px-3 py-1.5 text-xs font-normal">
                    Local models
                </DropdownMenuLabel>

                {localModelsLoading ? (
                    <DropdownMenuItem disabled className="px-3 py-2 text-xs">
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
                                <span className="text-sm font-medium">{option.label}</span>
                                {option.size && (
                                    <span className="text-foreground-tertiary text-xs">
                                        {option.size}
                                    </span>
                                )}
                            </div>
                            <span className="text-foreground-tertiary text-xs">{option.model}</span>
                        </DropdownMenuItem>
                    ))
                ) : (
                    <DropdownMenuItem disabled className="text-muted-foreground px-3 py-2 text-xs">
                        No local models — start Ollama to use them
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
