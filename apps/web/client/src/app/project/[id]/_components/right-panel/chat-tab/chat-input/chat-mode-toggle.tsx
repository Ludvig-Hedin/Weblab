import { useState } from 'react';
import { observer } from 'mobx-react-lite';

import { ChatType } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import { HoverOnlyTooltip } from '../../../editor-bar/hover-tooltip';

interface ChatModeToggleProps {
    chatMode: ChatType;
    onChatModeChange: (mode: ChatType) => void;
    disabled?: boolean;
}

const MODES = [
    {
        type: ChatType.EDIT,
        label: 'Build',
        description: 'Edit files, run commands',
        Icon: Icons.Build,
    },
    {
        type: ChatType.ASK,
        label: 'Ask',
        description: 'Explore without changes',
        Icon: Icons.Ask,
    },
    {
        type: ChatType.PLAN,
        label: 'Plan',
        description: 'Research and plan before building',
        Icon: Icons.Plan,
    },
] as const;

export const ChatModeToggle = observer(
    ({ chatMode, onChatModeChange, disabled = false }: ChatModeToggleProps) => {
        const [isOpen, setIsOpen] = useState(false);

        const currentMode = MODES.find((m) => m.type === chatMode) ?? MODES[0]!;
        const { Icon } = currentMode;

        return (
            <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
                <HoverOnlyTooltip
                    className="mb-1"
                    content={<span>Open mode menu</span>}
                    side="top"
                    hideArrow
                >
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={disabled}
                            aria-label={`Mode: ${currentMode.label}`}
                            className={cn(
                                'text-foreground-tertiary hover:bg-background-tertiary hover:text-foreground-primary group text-mini flex h-7 items-center gap-1 rounded-md px-1.5 font-normal',
                                disabled && 'cursor-not-allowed opacity-50',
                            )}
                        >
                            <Icon
                                className={cn(
                                    'h-3.5 w-3.5',
                                    disabled
                                        ? 'text-foreground-tertiary'
                                        : 'text-foreground-tertiary group-hover:text-foreground-primary',
                                )}
                            />
                            <span>{currentMode.label}</span>
                            <Icons.ChevronDown className="text-foreground-tertiary h-3 w-3 shrink-0" />
                        </Button>
                    </DropdownMenuTrigger>
                </HoverOnlyTooltip>
                <DropdownMenuContent align="start" className="w-52">
                    {MODES.map((mode) => (
                        <DropdownMenuItem
                            key={mode.type}
                            onClick={() => onChatModeChange(mode.type)}
                            className={cn(
                                'flex items-start gap-2.5 px-3 py-2',
                                chatMode === mode.type && 'bg-background-weblab',
                            )}
                        >
                            <mode.Icon className="mt-0.5 h-4 w-4 shrink-0" />
                            <div className="flex flex-col gap-0.5">
                                <span className="text-mini font-medium">{mode.label}</span>
                                <span className="text-foreground-tertiary text-mini">
                                    {mode.description}
                                </span>
                            </div>
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        );
    },
);
