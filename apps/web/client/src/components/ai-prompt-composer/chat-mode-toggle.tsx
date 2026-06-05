import { useMemo, useState } from 'react';
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

import { HoverOnlyTooltip } from '@/app/project/[id]/_components/editor-bar/hover-tooltip';

interface ChatModeToggleProps {
    chatMode: ChatType;
    onChatModeChange: (mode: ChatType) => void;
    disabled?: boolean;
    modes?: readonly ChatType[];
}

const ALL_MODES = [
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
    ({ chatMode, onChatModeChange, disabled = false, modes }: ChatModeToggleProps) => {
        const [isOpen, setIsOpen] = useState(false);

        const visibleModes = useMemo(() => {
            if (!modes || modes.length === 0) return ALL_MODES;
            return ALL_MODES.filter((m) => modes.includes(m.type));
        }, [modes]);

        const currentMode =
            visibleModes.find((m) => m.type === chatMode) ?? visibleModes[0] ?? ALL_MODES[0];
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
                                'text-foreground-tertiary hover:bg-background-tertiary hover:text-foreground-primary group flex h-7 items-center gap-1 rounded-md px-1.5 text-xs font-normal',
                                disabled && 'cursor-not-allowed opacity-50',
                            )}
                        >
                            <Icon
                                className={cn(
                                    'h-3 w-3',
                                    disabled
                                        ? 'text-foreground-tertiary'
                                        : 'text-foreground-tertiary group-hover:text-foreground-primary',
                                )}
                            />
                            <span>{currentMode.label}</span>
                        </Button>
                    </DropdownMenuTrigger>
                </HoverOnlyTooltip>
                <DropdownMenuContent align="start" className="w-52">
                    {visibleModes.map((mode) => (
                        <DropdownMenuItem
                            key={mode.type}
                            onClick={() => onChatModeChange(mode.type)}
                            className={cn(
                                'flex items-start gap-2.5 rounded-md px-3 py-2',
                                chatMode === mode.type && 'bg-accent',
                            )}
                        >
                            <mode.Icon className="mt-0.5 h-4 w-4 shrink-0" />
                            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                                <span className="text-mini font-medium">{mode.label}</span>
                                <span className="text-foreground-tertiary text-mini">
                                    {mode.description}
                                </span>
                            </div>
                            {chatMode === mode.type && (
                                <Icons.Check className="text-foreground-secondary mt-0.5 h-3.5 w-3.5 shrink-0" />
                            )}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        );
    },
);
