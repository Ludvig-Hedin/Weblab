'use client';

import { ChevronDown, Plus, Sparkles, X } from 'lucide-react';

import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import { FIELD_BASE_CLASSES } from './constants';

export interface NamedStyleOption {
    /** Stable identifier (e.g. text-style name or effect id). */
    name: string;
    /** Visible label (e.g. "Heading 1", "Card shadow"). */
    label: string;
    /** Optional preview hint (e.g. resolved font-size, blur radius). */
    preview?: string;
}

export interface StyleChipPickerProps {
    /** Currently selected option (matches `option.name`); empty string = none. */
    value: string;
    /** All choices the user can pick from. */
    options: readonly NamedStyleOption[];
    /** Friendly name of the picker — used in the empty-state CTA ("Add Effect"). */
    kind: string;
    /** Apply a named style. */
    onApply: (name: string) => void;
    /** Detach the named style — restores per-prop control via the Custom expander. */
    onDetach: () => void;
    /** Toggle the Custom expander beneath this chip. */
    onToggleCustom: () => void;
    /** Whether the Custom expander is currently open. */
    customOpen: boolean;
    /**
     * Optional — when set, the empty-state dropdown offers a "Create {kind}"
     * action (jumps to the Brand tab manager) instead of a dead-end label.
     */
    onCreate?: () => void;
    /**
     * When true the picker is inert — for surfaces whose saved-style registry
     * isn't built yet (Effects). Shows a muted "coming soon" chip; the Custom
     * expander toggle still works so raw controls stay reachable.
     */
    comingSoon?: boolean;
}

/**
 * Style chip + dropdown — the named-style mode of the Figma-driven Effects
 * and Text sections. When a style is applied the trigger reads as a chip with
 * the style name + an `x` to detach. When nothing is applied the trigger
 * reads as an empty CTA ("Add <kind>") that opens the picker; if the project
 * has no saved styles yet, the dropdown offers a "Create <kind>" action
 * (when `onCreate` is wired) rather than a dead end.
 *
 * The Custom expander toggle is a sibling button so users can drop into raw
 * CSS controls without leaving the chip mode.
 */
export function StyleChipPicker({
    value,
    options,
    kind,
    onApply,
    onDetach,
    onToggleCustom,
    customOpen,
    onCreate,
    comingSoon = false,
}: StyleChipPickerProps) {
    const selected = options.find((option) => option.name === value);
    return (
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {comingSoon ? (
                <TooltipProvider delayDuration={400}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div
                                className={cn(
                                    FIELD_BASE_CLASSES,
                                    'text-foreground-tertiary min-w-0 cursor-default justify-start gap-2 shadow-none',
                                )}
                            >
                                <Sparkles className="size-3 shrink-0" />
                                <span className="flex-1 truncate text-left">
                                    {kind} styles — coming soon
                                </span>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                            Saved {kind.toLowerCase()} styles aren&apos;t available yet — use the
                            Custom controls below.
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            ) : (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="outline"
                            aria-label={selected ? `Change ${kind}` : `Add ${kind}`}
                            className={cn(
                                FIELD_BASE_CLASSES,
                                'min-w-0 justify-start gap-2 shadow-none',
                            )}
                        >
                            {selected ? (
                                <>
                                    <span className="bg-foreground-brand/15 text-foreground-brand flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px]">
                                        <Sparkles className="size-2.5" />
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-left">
                                        {selected.label}
                                    </span>
                                    {selected.preview && (
                                        <span className="text-foreground-tertiary text-micro shrink-0 truncate">
                                            {selected.preview}
                                        </span>
                                    )}
                                </>
                            ) : (
                                <>
                                    <Sparkles className="text-foreground-tertiary size-3 shrink-0" />
                                    <span className="text-foreground-secondary flex-1 text-left">
                                        Add {kind}
                                    </span>
                                </>
                            )}
                            <ChevronDown className="text-muted-foreground size-3 shrink-0" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[220px]">
                        {options.length === 0 ? (
                            <>
                                <DropdownMenuLabel className="text-foreground-tertiary text-mini font-normal">
                                    No {kind.toLowerCase()}s yet
                                </DropdownMenuLabel>
                                {onCreate && (
                                    <DropdownMenuItem onSelect={onCreate} className="gap-2">
                                        <Plus className="size-3.5 shrink-0" />
                                        Create {kind.toLowerCase()}
                                    </DropdownMenuItem>
                                )}
                            </>
                        ) : (
                            options.map((option) => (
                                <DropdownMenuItem
                                    key={option.name}
                                    onSelect={() => onApply(option.name)}
                                    className="flex items-center justify-between gap-2"
                                >
                                    <span className="truncate">{option.label}</span>
                                    {option.preview && (
                                        <span className="text-foreground-tertiary text-micro shrink-0 truncate">
                                            {option.preview}
                                        </span>
                                    )}
                                </DropdownMenuItem>
                            ))
                        )}
                        {selected && (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={onDetach}>Detach</DropdownMenuItem>
                            </>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
            {selected && (
                <button
                    type="button"
                    onClick={onDetach}
                    aria-label={`Detach ${kind.toLowerCase()}`}
                    className="text-foreground-tertiary hover:bg-foreground/5 hover:text-foreground-primary flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] transition-colors"
                >
                    <X className="size-3" />
                </button>
            )}
            <button
                type="button"
                onClick={onToggleCustom}
                aria-label={customOpen ? 'Hide custom controls' : 'Show custom controls'}
                aria-pressed={customOpen}
                className={cn(
                    'text-foreground-tertiary hover:bg-foreground/5 hover:text-foreground-primary flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] transition-all duration-150',
                    customOpen ? 'bg-foreground/10 text-foreground-primary rotate-180' : 'rotate-0',
                )}
            >
                <ChevronDown className="size-3" />
            </button>
        </div>
    );
}
