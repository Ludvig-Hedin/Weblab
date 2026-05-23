'use client';

import { useCallback } from 'react';
import { X } from 'lucide-react';
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
import { PropertyLabel } from './property-label';

const TARGET_LABELS: Record<WriteTarget, string> = {
    tailwind: 'Tailwind class',
    'custom-class': 'Custom class',
    inline: 'Inline style',
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
}

/**
 * Standard wrapper around every individual style control. Owns:
 *
 * - The "is set" status dot (brand-blue when set, nothing when unset — v3
 *   dropped the gray unset dot).
 * - Alt/Option-click on the label to reset the property.
 * - Hover-revealed `X` reset button for users who don't know about ⌥-click.
 * - Right-click context menu (Reset · Copy · Paste · Write target · Override).
 *
 * v3 fork: identical behavior to v2, but wired to the v3 `PropertyLabel`
 * and the v3 hook re-exports so the v3 panel can diverge visually without
 * touching v2.
 *
 * The actual editor is provided by the caller via `children` so this
 * primitive stays unopinionated about the input shape.
 */
export const PropertyControl = observer(function PropertyControl({
    property,
    label,
    children,
    className,
}: PropertyControlProps) {
    const editorEngine = useEditorEngine();
    const styleValue = useStyleValue(property);
    const setter = useStyleSetter(property);

    // Full reset: clear the authored value AND drop any per-element override
    // flag so the property falls all the way back to inherited/default. The
    // override flag is stored separately from the value (see
    // StylePreferencesStore.overrideByElement), so clearing the value alone
    // would leave the property silently pinned to inline writes.
    const reset = useCallback(() => {
        setter.set('');
        const selected = editorEngine.elements.selected;
        for (const el of selected) {
            if (el.oid) {
                editorEngine.stylePreferences.setOverride(el.oid, property, false);
            }
        }
    }, [setter, editorEngine.elements.selected, editorEngine.stylePreferences, property]);

    const handleLabelClick = useCallback<React.MouseEventHandler<HTMLButtonElement>>(
        (event) => {
            if (event.altKey) {
                event.preventDefault();
                event.stopPropagation();
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

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div
                    data-style-property={property}
                    data-style-set={styleValue.isSet ? 'true' : 'false'}
                    className={cn(
                        // Row padding aligns with the section header's `px-3` —
                        // subordination comes from header weight, not indent.
                        // No row hover fill; only the input itself lifts on hover.
                        'group/control flex items-center gap-3 px-3 py-1',
                        className,
                    )}
                >
                    <PropertyLabel
                        label={label}
                        isSet={styleValue.isSet}
                        onClick={handleLabelClick}
                    />
                    <div className="min-w-0 flex-1">
                        {children({
                            value: styleValue.value,
                            isSet: styleValue.isSet,
                            commit: setter.set,
                        })}
                    </div>
                    {/* Right edge holds a single hover-revealed reset button when
                        the property is set. The write-target chip was removed —
                        target mode now lives in the right-click menu (kept) and
                        the element-header `⋯` dropdown. Less crowding, faster scan. */}
                    {styleValue.isSet && (
                        <TooltipProvider delayDuration={400}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        type="button"
                                        onClick={reset}
                                        aria-label={`Reset ${label}`}
                                        className="text-foreground-tertiary hover:bg-foreground/5 hover:text-foreground-primary active:bg-foreground/10 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm opacity-0 transition-[opacity,color,background-color] duration-150 ease-out group-hover/control:opacity-100 focus-visible:opacity-100"
                                    >
                                        <X className="size-3" />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="text-mini">
                                    Reset (⌥-click the label)
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
