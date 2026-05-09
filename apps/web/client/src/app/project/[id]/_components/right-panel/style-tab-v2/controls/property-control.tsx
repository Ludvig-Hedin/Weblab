'use client';

import { useCallback } from 'react';
import { observer } from 'mobx-react-lite';

import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuRadioGroup,
    ContextMenuRadioItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '@weblab/ui/context-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import type { WriteTarget } from '@/components/store/editor/style/preferences';
import { useEditorEngine } from '@/components/store/editor';
import { ALL_WRITE_TARGETS } from '@/components/store/editor/style/preferences';
import { useStyleSetter } from '../hooks/use-style-setter';
import { useStyleValue } from '../hooks/use-style-value';

const TARGET_LABELS: Record<WriteTarget, string> = {
    tailwind: 'Tailwind class',
    'custom-class': 'Custom class',
    inline: 'Inline style',
};

const TARGET_CHIPS: Record<WriteTarget, string> = {
    tailwind: 'tw',
    'custom-class': 'css',
    inline: 'inline',
};

export interface PropertyControlProps {
    /** CSS property name in kebab-case, e.g. `padding-top`, `font-size`. */
    property: string;
    /** Human-readable label shown to the user. */
    label: string;
    /** Render the actual editor; receives the resolved value and a commit function. */
    children: (api: {
        value: string;
        isSet: boolean;
        commit: (value: string) => void;
    }) => React.ReactNode;
    /** Optional extra class for the row container. */
    className?: string;
    /**
     * When true, the row hides the write-target chip even if the target is non-default.
     * Useful for compound rows where the chip is rendered once for the group.
     */
    hideTargetChip?: boolean;
}

/**
 * Standard wrapper around every individual style control. Owns:
 *
 * - The "is set" status dot (blue when set, neutral otherwise).
 * - Alt/Option-click on the dot or label to reset the property.
 * - Right-click context menu (Reset, Copy, Paste, Convert to Tailwind/Inline/Custom class, Override).
 * - The write-target chip ("tw" / "css" / "inline" / "override") with a tooltip explaining what's
 *   actually being written.
 *
 * The actual editor (number input, select, color picker, ...) is provided by the caller via
 * `children` so this primitive stays unopinionated about the input shape.
 */
export const PropertyControl = observer(function PropertyControl({
    property,
    label,
    children,
    className,
    hideTargetChip,
}: PropertyControlProps) {
    const editorEngine = useEditorEngine();
    const styleValue = useStyleValue(property);
    const setter = useStyleSetter(property);

    const reset = useCallback(() => {
        setter.set('');
    }, [setter]);

    const handleLabelClick = useCallback<React.MouseEventHandler>(
        (event) => {
            if (event.altKey) {
                event.preventDefault();
                reset();
            }
        },
        [reset],
    );

    const setTarget = useCallback(
        (target: WriteTarget) => {
            editorEngine.stylePreferences.setWriteTarget(property, target);
        },
        [editorEngine.stylePreferences, property],
    );

    const toggleOverride = useCallback(() => {
        const selected = editorEngine.elements.selected;
        if (selected.length === 0) return;
        const newOverrideValue = !styleValue.override;
        for (const el of selected) {
            if (el.oid) {
                editorEngine.stylePreferences.setOverride(el.oid, property, newOverrideValue);
            }
        }
    }, [
        editorEngine.elements.selected,
        editorEngine.stylePreferences,
        property,
        styleValue.override,
    ]);

    const copy = useCallback(async () => {
        if (typeof navigator === 'undefined' || !navigator.clipboard) return;
        try {
            await navigator.clipboard.writeText(styleValue.value);
        } catch {
            // ignore
        }
    }, [styleValue.value]);

    const paste = useCallback(async () => {
        if (typeof navigator === 'undefined' || !navigator.clipboard) return;
        try {
            const text = await navigator.clipboard.readText();
            if (text) setter.set(text);
        } catch {
            // ignore
        }
    }, [setter]);

    const showChip =
        !hideTargetChip &&
        styleValue.isSet &&
        (styleValue.override ||
            styleValue.writeTarget !== editorEngine.stylePreferences.defaultWriteTarget);

    const targetChipText = styleValue.override ? 'override' : TARGET_CHIPS[styleValue.writeTarget];

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div
                    data-style-property={property}
                    className={cn('group/control flex items-center gap-2 px-3 py-1.5', className)}
                >
                    <button
                        type="button"
                        onClick={handleLabelClick}
                        title={`${label} — alt-click to reset`}
                        className="text-mini flex w-20 shrink-0 items-center gap-1.5 text-left"
                    >
                        <span
                            aria-hidden
                            className={cn(
                                'h-1.5 w-1.5 rounded-full transition-colors',
                                styleValue.isSet
                                    ? 'bg-foreground-brand'
                                    : 'bg-foreground-secondary/30 group-hover/control:bg-foreground-secondary/60',
                            )}
                        />
                        <span
                            className={cn(
                                'truncate',
                                styleValue.isSet
                                    ? 'text-foreground-primary'
                                    : 'text-foreground-secondary',
                            )}
                        >
                            {label}
                        </span>
                    </button>
                    <div className="min-w-0 flex-1">
                        {children({
                            value: styleValue.value,
                            isSet: styleValue.isSet,
                            commit: setter.set,
                        })}
                    </div>
                    {showChip && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span
                                        className={cn(
                                            'text-micro shrink-0 rounded-sm px-1 uppercase',
                                            styleValue.override
                                                ? 'bg-foreground/12 text-foreground-primary'
                                                : 'bg-foreground/5 text-foreground-tertiary',
                                        )}
                                    >
                                        {targetChipText}
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="text-mini">
                                    {styleValue.override
                                        ? `Inline override (this element only)`
                                        : `Writing as ${TARGET_LABELS[styleValue.writeTarget]}`}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-56">
                <ContextMenuItem onSelect={reset} disabled={!styleValue.isSet}>
                    Reset
                    <span className="text-foreground-secondary text-mini ml-auto">⌥-click</span>
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={() => void copy()} disabled={!styleValue.value}>
                    Copy value
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => void paste()}>Paste value</ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuRadioGroup
                    value={styleValue.writeTarget}
                    onValueChange={(value) => setTarget(value as WriteTarget)}
                >
                    {ALL_WRITE_TARGETS.map((target) => (
                        <ContextMenuRadioItem key={target} value={target}>
                            Write as {TARGET_LABELS[target]}
                        </ContextMenuRadioItem>
                    ))}
                </ContextMenuRadioGroup>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={toggleOverride}>
                    {styleValue.override
                        ? '✓ Override (this element only)'
                        : 'Override (this element only)'}
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
});
