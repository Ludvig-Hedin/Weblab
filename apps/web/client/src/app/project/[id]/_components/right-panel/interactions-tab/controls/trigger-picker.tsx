'use client';

import { useTranslations } from 'next-intl';

import type { TriggerKind } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons/index';

import { transKeys } from '@/i18n/keys';

interface TriggerPickerProps {
    onPick: (kind: TriggerKind) => void;
    /** When true: only show page-level triggers (page-load). */
    pageOnly?: boolean;
    /** When true: only show element-level triggers. */
    elementOnly?: boolean;
    ariaLabel: string;
    disabled?: boolean;
}

export function TriggerPicker({
    onPick,
    pageOnly = false,
    elementOnly = false,
    ariaLabel,
    disabled,
}: TriggerPickerProps) {
    const t = useTranslations();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="text-foreground-secondary hover:bg-background-bar-active hover:text-foreground-primary h-7 w-7 rounded-md"
                    aria-label={ariaLabel}
                    disabled={disabled}
                >
                    <Icons.Plus className="h-3.5 w-3.5" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[180px]">
                {!pageOnly && (
                    <>
                        <DropdownMenuItem onClick={() => onPick('mouse-click')}>
                            <Icons.CursorArrow className="mr-2 h-3.5 w-3.5" />
                            {t(transKeys.editor.panels.edit.tabs.interactions.triggerTypes.click)}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onPick('mouse-hover')}>
                            <Icons.CursorArrow className="mr-2 h-3.5 w-3.5" />
                            {t(transKeys.editor.panels.edit.tabs.interactions.triggerTypes.hover)}
                        </DropdownMenuItem>
                    </>
                )}
                {!elementOnly && (
                    <DropdownMenuItem onClick={() => onPick('page-load')}>
                        <Icons.Sparkles className="mr-2 h-3.5 w-3.5" />
                        {t(transKeys.editor.panels.edit.tabs.interactions.triggerTypes.pageLoad)}
                    </DropdownMenuItem>
                )}
                <DropdownMenuItem disabled>
                    {t(
                        transKeys.editor.panels.edit.tabs.interactions.triggerTypes
                            .scrollComingSoon,
                    )}
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                    {t(
                        transKeys.editor.panels.edit.tabs.interactions.triggerTypes
                            .customComingSoon,
                    )}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
