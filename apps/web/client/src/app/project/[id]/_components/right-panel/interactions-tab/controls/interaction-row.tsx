'use client';

import { useTranslations } from 'next-intl';

import type { Interaction, TriggerKind } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons/index';

import { transKeys } from '@/i18n/keys';

interface InteractionRowProps {
    interaction: Interaction;
    onOpen: () => void;
    onDelete: () => void;
}

function triggerLabelKey(kind: TriggerKind) {
    switch (kind) {
        case 'mouse-click':
            return transKeys.editor.panels.edit.tabs.interactions.triggerTypes.click;
        case 'mouse-hover':
            return transKeys.editor.panels.edit.tabs.interactions.triggerTypes.hover;
        case 'page-load':
            return transKeys.editor.panels.edit.tabs.interactions.triggerTypes.pageLoad;
        default:
            return transKeys.editor.panels.edit.tabs.interactions.triggerTypes.custom;
    }
}

function TriggerIcon({ kind }: { kind: TriggerKind }) {
    switch (kind) {
        case 'page-load':
            return <Icons.Sparkles className="h-3.5 w-3.5" />;
        case 'mouse-click':
        case 'mouse-hover':
        default:
            return <Icons.CursorArrow className="h-3.5 w-3.5" />;
    }
}

export function InteractionRow({ interaction, onOpen, onDelete }: InteractionRowProps) {
    const t = useTranslations();

    return (
        <div
            className="hover:bg-background-secondary/40 group flex items-center gap-2 rounded-md px-3 py-2.5"
            onClick={onOpen}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpen();
                }
            }}
        >
            <span className="text-foreground-secondary flex-shrink-0">
                <TriggerIcon kind={interaction.trigger.kind} />
            </span>
            <div className="min-w-0 flex-1">
                <div className="text-foreground-primary text-mini truncate font-medium">
                    {interaction.name}
                </div>
                <div className="text-foreground-tertiary text-mini truncate">
                    {t(triggerLabelKey(interaction.trigger.kind))}
                </div>
            </div>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="text-foreground-secondary hover:bg-background-bar-active hover:text-foreground-primary h-7 w-7 rounded-md opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Open interaction menu"
                    >
                        <Icons.DotsHorizontal className="h-3.5 w-3.5" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[140px]">
                    <DropdownMenuItem
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete();
                        }}
                    >
                        {t(transKeys.editor.panels.edit.tabs.interactions.row.menu.delete)}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
