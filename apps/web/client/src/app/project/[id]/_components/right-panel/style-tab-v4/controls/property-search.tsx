'use client';

import * as React from 'react';
import { Search } from 'lucide-react';

import { toast } from '@weblab/ui/sonner';
import { cn } from '@weblab/ui/utils';

import { FIELD_BASE_CLASSES } from './constants';

/**
 * One searchable entry in the panel's property registry.
 *
 * - `property` — the CSS property name in kebab-case. Used to locate the row
 *   in the DOM: every `PropertyControl` row carries a matching
 *   `data-style-property` attribute, and the per-side `TrblGrid` cells carry
 *   it as their `aria-label`. The resolver tries both.
 * - `label` — human-readable label, shown as the result's primary text.
 * - `sectionId` — the `Section` id the row lives under. Passed back through
 *   `onNavigate` so the parent can expand a collapsed accordion section
 *   before we scroll.
 * - `resolveSelector` — optional fallback selector for entries whose row has
 *   no `data-style-property` / matching `aria-label` node (e.g. the shorthand
 *   `padding`/`margin`, which `TrblGrid` only renders as per-side inputs). The
 *   resolver tries this when the primary lookup fails.
 */
export interface PropertyRegistryEntry {
    property: string;
    label: string;
    sectionId: string;
    resolveSelector?: string;
}

/**
 * Static registry of the v3 Style panel's editable properties. Not every CSS
 * property — just the ones the panel actually surfaces a control for, so a
 * result always resolves to a real row. Kept in this file (per the slice
 * contract) and grouped by section for easy scanning.
 */
const PROPERTY_REGISTRY: PropertyRegistryEntry[] = [
    // Layout
    { property: 'display', label: 'Display', sectionId: 'layout' },
    { property: 'flex-direction', label: 'Flex direction', sectionId: 'layout' },
    {
        property: 'justify-content',
        label: 'Justify content',
        sectionId: 'layout',
    },
    { property: 'align-items', label: 'Align items', sectionId: 'layout' },
    { property: 'gap', label: 'Gap', sectionId: 'layout' },
    // `padding`/`margin` shorthands have no `data-style-property` node — the
    // `TrblGrid` control only renders per-side inputs labelled `padding-top`
    // etc., so fall back to the first side.
    {
        property: 'padding',
        label: 'Padding',
        sectionId: 'layout',
        resolveSelector: '[aria-label="padding-top"]',
    },
    {
        property: 'margin',
        label: 'Margin',
        sectionId: 'layout',
        resolveSelector: '[aria-label="margin-top"]',
    },
    // Position
    { property: 'position', label: 'Position', sectionId: 'position' },
    { property: 'top', label: 'Top', sectionId: 'position' },
    { property: 'right', label: 'Right', sectionId: 'position' },
    { property: 'bottom', label: 'Bottom', sectionId: 'position' },
    { property: 'left', label: 'Left', sectionId: 'position' },
    { property: 'z-index', label: 'Z-index', sectionId: 'position' },
    // Size
    { property: 'width', label: 'Width', sectionId: 'size' },
    { property: 'height', label: 'Height', sectionId: 'size' },
    { property: 'min-width', label: 'Min width', sectionId: 'size' },
    { property: 'min-height', label: 'Min height', sectionId: 'size' },
    { property: 'max-width', label: 'Max width', sectionId: 'size' },
    { property: 'max-height', label: 'Max height', sectionId: 'size' },
    { property: 'aspect-ratio', label: 'Aspect ratio', sectionId: 'size' },
    { property: 'object-fit', label: 'Object fit', sectionId: 'size' },
    { property: 'overflow', label: 'Overflow', sectionId: 'size' },
    // Text
    { property: 'font-family', label: 'Font family', sectionId: 'text' },
    { property: 'font-size', label: 'Font size', sectionId: 'text' },
    { property: 'font-weight', label: 'Font weight', sectionId: 'text' },
    { property: 'line-height', label: 'Line height', sectionId: 'text' },
    { property: 'letter-spacing', label: 'Letter spacing', sectionId: 'text' },
    { property: 'text-align', label: 'Text align', sectionId: 'text' },
    { property: 'text-transform', label: 'Text transform', sectionId: 'text' },
    {
        property: 'text-decoration-line',
        label: 'Text decoration',
        sectionId: 'text',
    },
    { property: 'text-shadow', label: 'Text shadow', sectionId: 'text' },
    { property: 'color', label: 'Text color', sectionId: 'text' },
    // Styles
    { property: 'opacity', label: 'Opacity', sectionId: 'styles' },
    { property: 'visibility', label: 'Visibility', sectionId: 'styles' },
    // Background
    {
        property: 'background-color',
        label: 'Background color',
        sectionId: 'background',
    },
    {
        property: 'background-image',
        label: 'Background image',
        sectionId: 'background',
    },
    {
        property: 'background-size',
        label: 'Background size',
        sectionId: 'background',
    },
    {
        property: 'background-repeat',
        label: 'Background repeat',
        sectionId: 'background',
    },
    // Border
    { property: 'border-width', label: 'Border width', sectionId: 'border' },
    { property: 'border-color', label: 'Border color', sectionId: 'border' },
    { property: 'border-style', label: 'Border style', sectionId: 'border' },
    { property: 'border-radius', label: 'Border radius', sectionId: 'border' },
    // Effects
    { property: 'box-shadow', label: 'Box shadow', sectionId: 'effects' },
    { property: 'filter', label: 'Filter', sectionId: 'effects' },
    {
        property: 'backdrop-filter',
        label: 'Backdrop filter',
        sectionId: 'effects',
    },
    { property: 'mix-blend-mode', label: 'Blend mode', sectionId: 'effects' },
    { property: 'outline-width', label: 'Outline width', sectionId: 'effects' },
    { property: 'outline-color', label: 'Outline color', sectionId: 'effects' },
    { property: 'outline-style', label: 'Outline style', sectionId: 'effects' },
    { property: 'outline-offset', label: 'Outline offset', sectionId: 'effects' },
    // Transforms
    { property: 'transform', label: 'Transform', sectionId: 'transforms' },
    {
        property: 'transform-origin',
        label: 'Transform origin',
        sectionId: 'transforms',
    },
    {
        property: 'transform-style',
        label: 'Transform style',
        sectionId: 'transforms',
    },
    { property: 'rotate', label: 'Rotate', sectionId: 'transforms' },
    { property: 'perspective', label: 'Perspective', sectionId: 'transforms' },
    {
        property: 'perspective-origin',
        label: 'Perspective origin',
        sectionId: 'transforms',
    },
    {
        property: 'backface-visibility',
        label: 'Backface visibility',
        sectionId: 'transforms',
    },
    // Transitions
    { property: 'transition', label: 'Transition', sectionId: 'transitions' },
    {
        property: 'transition-property',
        label: 'Transition property',
        sectionId: 'transitions',
    },
    {
        property: 'transition-duration',
        label: 'Transition duration',
        sectionId: 'transitions',
    },
    {
        property: 'transition-delay',
        label: 'Transition delay',
        sectionId: 'transitions',
    },
    {
        property: 'transition-timing-function',
        label: 'Transition timing',
        sectionId: 'transitions',
    },
    // Advanced — flow
    { property: 'float', label: 'Float', sectionId: 'advanced' },
    { property: 'clear', label: 'Clear', sectionId: 'advanced' },
    // Cursor
    { property: 'cursor', label: 'Cursor', sectionId: 'cursor' },
    { property: 'pointer-events', label: 'Pointer events', sectionId: 'cursor' },
    { property: 'user-select', label: 'User select', sectionId: 'cursor' },
    { property: 'touch-action', label: 'Touch action', sectionId: 'cursor' },
];

const MAX_RESULTS = 8;

/** Case-insensitive substring match against both the label and the CSS name. */
function matchEntries(query: string): PropertyRegistryEntry[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const scored = PROPERTY_REGISTRY.map((entry) => {
        const label = entry.label.toLowerCase();
        const prop = entry.property.toLowerCase();
        // Rank prefix matches above mid-string matches so "pad" surfaces
        // "Padding" before "Backdrop filter" (which contains no "pad" — but
        // guards the general case for short queries).
        let score = -1;
        if (label.startsWith(q) || prop.startsWith(q)) score = 0;
        else if (label.includes(q) || prop.includes(q)) score = 1;
        return { entry, score };
    }).filter((s) => s.score >= 0);
    scored.sort((a, b) => a.score - b.score);
    return scored.slice(0, MAX_RESULTS).map((s) => s.entry);
}

/**
 * Locate a property's row in the panel DOM. `PropertyControl` rows expose
 * `data-style-property`; the per-side `TrblGrid` inputs (padding/margin/
 * offsets) expose the property name as their `aria-label` instead. Try both,
 * then fall back to the entry's `resolveSelector` for shorthands like
 * `padding`/`margin` whose row has no node matching the property name.
 */
function findRowElement(entry: PropertyRegistryEntry): HTMLElement | null {
    return (
        document.querySelector<HTMLElement>(`[data-style-property="${entry.property}"]`) ??
        document.querySelector<HTMLElement>(`[aria-label="${entry.property}"]`) ??
        (entry.resolveSelector ? document.querySelector<HTMLElement>(entry.resolveSelector) : null)
    );
}

export interface PropertySearchProps {
    /**
     * Called before scrolling with the `sectionId` of the chosen property, so
     * the parent can expand a collapsed accordion section. If the section was
     * collapsed the row won't be in the DOM yet — the scroll is deferred a
     * frame to let it mount.
     */
    onNavigate?: (sectionId: string) => void;
    className?: string;
}

/**
 * Property search — a compact field at the top of the v3 Style panel. Type a
 * CSS property (or its friendly label) and pick from a live result list to
 * jump straight to that control: the panel scrolls the row into view and
 * focuses it.
 *
 * Keyboard: ↑/↓ move the highlight, Enter selects, Escape closes the list.
 * The list is a plain absolutely-positioned panel rather than a Popover so
 * focus stays in the input while arrowing — lighter, and it never steals the
 * caret.
 */
export function PropertySearch({ onNavigate, className }: PropertySearchProps) {
    const [query, setQuery] = React.useState('');
    const [open, setOpen] = React.useState(false);
    const [activeIndex, setActiveIndex] = React.useState(0);
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    // Pending close timer for the input's blur. Held in a ref so a re-focus
    // can cancel it before it fires.
    const blurCloseTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const results = React.useMemo(() => matchEntries(query), [query]);

    // Clear any pending blur-close timer on unmount.
    React.useEffect(() => {
        return () => {
            if (blurCloseTimer.current) clearTimeout(blurCloseTimer.current);
        };
    }, []);

    // Keep the highlight in range as results change.
    React.useEffect(() => {
        setActiveIndex(0);
    }, [query]);

    // Close the list on an outside click.
    React.useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: PointerEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [open]);

    const select = React.useCallback(
        (entry: PropertyRegistryEntry) => {
            setOpen(false);
            setQuery('');
            inputRef.current?.blur();

            onNavigate?.(entry.sectionId);

            // Defer the scroll so a just-expanded accordion section has a frame
            // to mount its rows before we look for the target.
            const scrollToRow = () => {
                const row = findRowElement(entry);
                if (!row) {
                    // The row is conditionally hidden (e.g. `flex-direction`
                    // only renders when `display` is flex). Give quiet feedback
                    // instead of a silent no-op.
                    toast("That property isn't editable for the selected element.");
                    return;
                }
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                const focusable = row.matches('input, button, [tabindex]')
                    ? row
                    : row.querySelector<HTMLElement>(
                          'input, button, [tabindex]:not([tabindex="-1"])',
                      );
                focusable?.focus({ preventScroll: true });
            };
            requestAnimationFrame(() => requestAnimationFrame(scrollToRow));
        },
        [onNavigate],
    );

    const handleKeyDown = React.useCallback<React.KeyboardEventHandler<HTMLInputElement>>(
        (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                if (open) {
                    setOpen(false);
                } else {
                    setQuery('');
                    event.currentTarget.blur();
                }
                return;
            }
            if (!results.length) return;
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                setOpen(true);
                setActiveIndex((i) => (i + 1) % results.length);
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setOpen(true);
                setActiveIndex((i) => (i - 1 + results.length) % results.length);
            } else if (event.key === 'Enter') {
                event.preventDefault();
                const entry = results[activeIndex];
                if (entry) select(entry);
            }
        },
        [activeIndex, open, results, select],
    );

    // Show the list whenever the box is open with a non-empty query — even
    // with zero results, so we can render a "no match" row instead of a dead
    // box. Arrow/Enter handlers stay gated on `results.length`, so the empty
    // row is never keyboard-selectable.
    const hasQuery = query.trim().length > 0;
    const showList = open && hasQuery;

    return (
        <div ref={containerRef} className={cn('relative', className)}>
            <div className={cn(FIELD_BASE_CLASSES, 'flex items-center gap-2 px-[10px]')}>
                <Search className="text-muted-foreground size-3.5 shrink-0" />
                <input
                    ref={inputRef}
                    type="text"
                    role="combobox"
                    aria-expanded={showList}
                    aria-controls="property-search-results"
                    aria-autocomplete="list"
                    spellCheck={false}
                    value={query}
                    placeholder="Search properties…"
                    onChange={(event) => {
                        setQuery(event.target.value);
                        setOpen(true);
                    }}
                    onFocus={() => {
                        // Re-focus wins the race against a pending blur close.
                        if (blurCloseTimer.current) {
                            clearTimeout(blurCloseTimer.current);
                            blurCloseTimer.current = null;
                        }
                        setOpen(true);
                    }}
                    onBlur={() => {
                        // Close on tab-out, but defer so a pointer-down on a
                        // result still selects before the list tears down.
                        // Arrow-nav keeps focus in the input, so it's unaffected.
                        if (blurCloseTimer.current) clearTimeout(blurCloseTimer.current);
                        blurCloseTimer.current = setTimeout(() => {
                            setOpen(false);
                            blurCloseTimer.current = null;
                        }, 120);
                    }}
                    onKeyDown={handleKeyDown}
                    className="text-foreground-primary placeholder:text-muted-foreground text-mini min-w-0 flex-1 cursor-text bg-transparent outline-none"
                />
            </div>
            {showList && (
                <ul
                    id="property-search-results"
                    role="listbox"
                    className="bg-popover border-foreground/8 absolute top-[34px] right-0 left-0 z-50 max-h-[256px] overflow-y-auto rounded-[10px] border p-1 shadow-md"
                >
                    {results.length === 0 && (
                        // Non-interactive empty state — `presentation` role, no
                        // pointer handlers, so arrow keys / Enter skip it.
                        <li
                            role="presentation"
                            className="text-foreground-tertiary text-mini px-2 py-1.5"
                        >
                            No matching property
                        </li>
                    )}
                    {results.map((entry, index) => (
                        <li
                            key={entry.property}
                            role="option"
                            aria-selected={index === activeIndex}
                            // Use pointerdown (not click) so selection fires
                            // before the input's blur tears the list down.
                            onPointerDown={(event) => {
                                event.preventDefault();
                                select(entry);
                            }}
                            onMouseEnter={() => setActiveIndex(index)}
                            className={cn(
                                'flex cursor-pointer items-center justify-between gap-2 rounded-[6px] px-2 py-1.5 transition-colors',
                                index === activeIndex
                                    ? 'bg-foreground-brand/15 text-foreground-primary'
                                    : 'text-foreground-secondary hover:bg-foreground/5',
                            )}
                        >
                            <span className="text-mini truncate">{entry.label}</span>
                            <span className="text-foreground-tertiary text-[10px]">
                                {entry.property}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
