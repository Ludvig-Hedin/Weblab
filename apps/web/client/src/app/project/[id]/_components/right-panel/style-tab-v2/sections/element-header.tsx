'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, MoreHorizontal } from 'lucide-react';
import { observer } from 'mobx-react-lite';

import type { ActionElement } from '@weblab/models/actions';
import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { toast } from '@weblab/ui/sonner';
import { cn } from '@weblab/ui/utils';

import type { WriteTarget } from '@/components/store/editor/style/preferences';
import { useEditorEngine } from '@/components/store/editor';
import { ALL_WRITE_TARGETS } from '@/components/store/editor/style/preferences';
import { PropertyLabel } from '../controls/property-label';
import { SelectField } from '../controls/select-field';
import { TextField } from '../controls/text-field';

const COMMON_TAGS = [
    'div',
    'span',
    'section',
    'article',
    'header',
    'footer',
    'main',
    'nav',
    'aside',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'p',
    'a',
    'button',
    'ul',
    'ol',
    'li',
    'img',
];

const TAG_OPTIONS = COMMON_TAGS.map((tag) => ({ value: tag, label: tag }));

const TARGET_LONG: Record<WriteTarget, string> = {
    tailwind: 'Tailwind classes',
    'custom-class': 'a custom class',
    inline: 'inline styles',
};

/**
 * Per-element dropdown that owns the write-target picker (and any future
 * element ops like "reset all"). Triggered by a small `⋯` button next to
 * the selector summary so the panel header stays calm.
 */
const ElementMenu = observer(function ElementMenu({
    onExpand,
    expanded,
}: {
    onExpand: () => void;
    expanded: boolean;
}) {
    const editorEngine = useEditorEngine();
    const target = editorEngine.stylePreferences.defaultWriteTarget;
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Element options"
                    className="text-foreground-tertiary hover:text-foreground-primary h-7 w-7 rounded-md"
                >
                    <MoreHorizontal className="size-3.5" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onSelect={onExpand}>
                    {expanded ? 'Hide tag, ID, classes' : 'Edit tag, ID, classes'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                    value={target}
                    onValueChange={(value) => {
                        if (!value) return;
                        editorEngine.stylePreferences.setDefaultWriteTarget(value as WriteTarget);
                    }}
                >
                    {ALL_WRITE_TARGETS.map((value) => (
                        <DropdownMenuRadioItem key={value} value={value}>
                            Write to {TARGET_LONG[value]}
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
});

/**
 * Top-of-panel block: tag picker, id, className chips, plus a compact
 * settings trigger for the default style write target. Rendered outside
 * the accordion since users almost always need it visible.
 */
export const ElementHeaderSection = observer(function ElementHeaderSection() {
    const editorEngine = useEditorEngine();
    const selected = editorEngine.elements.selected[0];
    const [actionElement, setActionElement] = useState<ActionElement | null>(null);
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        let cancelled = false;
        if (!selected) {
            setActionElement(null);
            return;
        }
        const frameData = editorEngine.frames.get(selected.frameId);
        if (!frameData?.view) {
            setActionElement(null);
            return;
        }
        void (async () => {
            try {
                const next = await frameData.view!.getActionElement(selected.domId);
                if (!cancelled) setActionElement(next);
            } catch {
                if (!cancelled) setActionElement(null);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [editorEngine.frames, selected]);

    const className = useMemo(
        () => actionElement?.attributes.className ?? actionElement?.attributes.class ?? '',
        [actionElement],
    );
    const idValue = useMemo(() => actionElement?.attributes.id ?? '', [actionElement]);
    const classes = useMemo(() => className.split(/\s+/).filter(Boolean), [className]);

    if (!selected) return null;

    const tagName = actionElement?.tagName ?? selected.tagName;

    const commitTagName = async (value: string) => {
        if (!selected.oid) {
            toast.error("Can't retag this element from here yet.");
            return;
        }
        const next = value.trim().toLowerCase();
        if (!/^[a-z][a-z0-9-]*$/.test(next)) {
            toast.error('Use a lowercase HTML tag name.');
            return;
        }
        await editorEngine.code.updateElementMetadata({
            oid: selected.oid,
            branchId: selected.branchId,
            tagName: next,
        });
        setActionElement((current) => (current ? { ...current, tagName: next } : current));
    };

    const commitClassName = async (next: string) => {
        if (!selected.oid) {
            toast.error("Can't edit this element from here yet.");
            return;
        }
        await editorEngine.code.updateElementMetadata({
            oid: selected.oid,
            branchId: selected.branchId,
            attributes: { className: next.trim() },
            overrideClasses: true,
        });
        setActionElement((current) =>
            current
                ? {
                      ...current,
                      attributes: { ...current.attributes, className: next.trim() },
                  }
                : current,
        );
    };

    const commitId = async (next: string) => {
        if (!selected.oid) {
            toast.error("Can't edit this element from here yet.");
            return;
        }
        await editorEngine.code.updateElementMetadata({
            oid: selected.oid,
            branchId: selected.branchId,
            attributes: { id: next.trim() },
        });
        setActionElement((current) =>
            current
                ? { ...current, attributes: { ...current.attributes, id: next.trim() } }
                : current,
        );
    };

    const commitClasses = useCallback(
        (next: string[]) => {
            void commitClassName(next.join(' '));
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [selected?.oid, selected?.branchId],
    );

    return (
        <div className="flex flex-col px-3 py-2">
            {/* Collapsed view: one-line CSS-selector summary. Brand-blue tag
                token, secondary `#id`, tertiary `.class`. Click expands to
                the editable rows below. Saves ~80px of always-on chrome and
                gives the panel its single most Weblab-feeling cue. */}
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    aria-expanded={expanded}
                    aria-label="Toggle element details"
                    className="group/selector flex min-w-0 flex-1 items-center gap-1 truncate text-mini text-left font-mono"
                    title={`<${tagName}${idValue ? `#${idValue}` : ''}${classes.length ? `.${classes.join('.')}` : ''}>`}
                >
                    <ChevronDown
                        className={cn(
                            'text-muted-foreground size-3 shrink-0 transition-transform duration-150',
                            expanded && 'rotate-180',
                        )}
                    />
                    <span className="text-foreground-brand">{tagName}</span>
                    {idValue && (
                        <span className="text-foreground-secondary">#{idValue}</span>
                    )}
                    {classes.map((c) => (
                        <span key={c} className="text-foreground-tertiary">
                            .{c}
                        </span>
                    ))}
                </button>
                <ElementMenu
                    expanded={expanded}
                    onExpand={() => setExpanded((v) => !v)}
                />
            </div>
            {expanded && (
                <div className="flex flex-col gap-1.5 pt-2">
                    <div className="group/control flex items-center gap-3">
                        <PropertyLabel label="Tag" isSet={!!tagName} title="HTML tag" />
                        <div className="min-w-0 flex-1">
                            <SelectField
                                value={tagName}
                                options={TAG_OPTIONS}
                                onCommit={(v) => void commitTagName(v)}
                            />
                        </div>
                    </div>
                    <div className="group/control flex items-center gap-3">
                        <PropertyLabel label="ID" isSet={!!idValue} title="Element id" />
                        <div className="min-w-0 flex-1">
                            <TextField
                                value={idValue}
                                placeholder="hero-section"
                                onCommit={(v) => void commitId(v)}
                            />
                        </div>
                    </div>
                    <div className="group/control flex items-start gap-3">
                        <PropertyLabel
                            label="Class"
                            isSet={classes.length > 0}
                            title="CSS classes"
                            className="pt-1.5"
                        />
                        <ClassChipsField classes={classes} onChange={commitClasses} />
                    </div>
                </div>
            )}
        </div>
    );
});

interface ClassChipsFieldProps {
    classes: string[];
    onChange: (next: string[]) => void;
}

/**
 * Inline class-list editor. Each existing class is a focusable chip; Left/Right
 * walks chips (and into the trailing input), Backspace/Delete removes the
 * focused chip, Enter on the input adds a new class. Clicking the container
 * background focuses the trailing input so users can keep typing.
 *
 * Long class lists collapse to roughly four chip rows with a "Show more"
 * footer; users can also expand by focusing the input.
 */
const CLASS_LIST_COLLAPSED_MAX_PX = 96; // ~4 rows of chips at h-5 + gap-1

function ClassChipsField({ classes, onChange }: ClassChipsFieldProps) {
    const [draft, setDraft] = useState('');
    const [expanded, setExpanded] = useState(false);
    const [overflowed, setOverflowed] = useState(false);
    const chipRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const wrapRef = useRef<HTMLDivElement | null>(null);

    // Drop refs for removed chips so we don't hold stale nodes.
    useEffect(() => {
        chipRefs.current.length = classes.length;
    }, [classes.length]);

    // Measure whether the chip wrap area overflows the collapsed clip so we
    // can show a "+N more" footer (or hide it). ResizeObserver covers both
    // class-list changes and panel-width changes (chips re-wrap on resize).
    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const measure = () => setOverflowed(el.scrollHeight > CLASS_LIST_COLLAPSED_MAX_PX + 2);
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, [classes.length]);

    const showCollapsed = overflowed && !expanded;

    const focusChip = useCallback((index: number) => {
        chipRefs.current[index]?.focus();
    }, []);

    const focusInput = useCallback(() => {
        inputRef.current?.focus();
    }, []);

    const removeAt = useCallback(
        (index: number) => {
            const next = classes.filter((_, i) => i !== index);
            onChange(next);
            // After remove, focus the chip that took this slot, or input.
            // TODO(bug-hunt 2026-05-13): focus race — `onChange` writes go
            // through `commitClassName` which awaits an async server mutation
            // before `actionElement` (and therefore the `classes` prop) is
            // updated. queueMicrotask fires before the next render commit, so
            // `chipRefs.current[index]` may still point at the about-to-unmount
            // node. Symptom: pressing Delete on a chip occasionally leaves
            // focus on the wrong (or no) chip. Fix should focus via a
            // useEffect keyed off `classes.length` instead of microtask, or
            // hold the next-focus target in state until refs re-attach.
            queueMicrotask(() => {
                if (next.length === 0) {
                    focusInput();
                } else if (index >= next.length) {
                    focusChip(next.length - 1);
                } else {
                    focusChip(index);
                }
            });
        },
        [classes, focusChip, focusInput, onChange],
    );

    const addFromDraft = useCallback(() => {
        const trimmed = draft.trim();
        if (!trimmed) return;
        const incoming = trimmed.split(/\s+/).filter(Boolean);
        const next = [...new Set([...classes, ...incoming])];
        onChange(next);
        setDraft('');
    }, [classes, draft, onChange]);

    const handleChipKey = (index: number, event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            if (index > 0) focusChip(index - 1);
        } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            if (index < classes.length - 1) focusChip(index + 1);
            else focusInput();
        } else if (event.key === 'Backspace' || event.key === 'Delete') {
            event.preventDefault();
            removeAt(index);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            removeAt(index);
        }
    };

    const handleInputKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
        const atStart = event.currentTarget.selectionStart === 0 && draft.length > 0;
        const emptyDraft = draft.length === 0;
        if (event.key === 'Enter') {
            event.preventDefault();
            addFromDraft();
        } else if (event.key === 'ArrowLeft' && (emptyDraft || atStart) && classes.length > 0) {
            event.preventDefault();
            focusChip(classes.length - 1);
        } else if (event.key === 'Backspace' && emptyDraft && classes.length > 0) {
            event.preventDefault();
            // Delete the last chip immediately; matches Webflow / Linear.
            removeAt(classes.length - 1);
        }
    };

    return (
        <div
            // Matches the canonical row fill — bg-foreground/5 with hover/focus accents,
            // no shadow. Keep the same geometry tokens as the other field wrappers.
            className="border-input bg-foreground/5 hover:bg-foreground/[0.08] focus-within:border-ring focus-within:ring-ring/30 flex min-h-[28px] min-w-0 flex-1 flex-col gap-1 rounded-md border p-1 transition-colors focus-within:ring-[3px]"
            onMouseDown={(event) => {
                // Click on empty container area focuses the trailing input.
                if (event.target === event.currentTarget) {
                    event.preventDefault();
                    focusInput();
                }
            }}
        >
            <div
                ref={wrapRef}
                className={cn(
                    'flex cursor-text flex-wrap items-center gap-1',
                    showCollapsed && 'overflow-hidden',
                )}
                style={showCollapsed ? { maxHeight: CLASS_LIST_COLLAPSED_MAX_PX } : undefined}
                onMouseDown={(event) => {
                    if (event.target === event.currentTarget) {
                        event.preventDefault();
                        focusInput();
                    }
                }}
            >
                {classes.map((cls, index) => (
                    <button
                        key={`${cls}-${index}`}
                        ref={(node) => {
                            chipRefs.current[index] = node;
                        }}
                        type="button"
                        onKeyDown={(event) => handleChipKey(index, event)}
                        onClick={() => focusChip(index)}
                        aria-label={`Class ${cls}. Press Backspace to remove, Left/Right arrows to navigate.`}
                        className="bg-foreground/[0.12] text-foreground-primary hover:bg-foreground/[0.18] focus-visible:ring-ring/40 text-mini inline-flex h-5 items-center gap-1 rounded-sm px-1.5 transition-colors outline-none focus-visible:ring-[3px]"
                    >
                        {cls}
                        <span
                            role="button"
                            tabIndex={-1}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={(event) => {
                                event.stopPropagation();
                                removeAt(index);
                            }}
                            aria-label={`Remove ${cls}`}
                            className="text-foreground-secondary hover:text-foreground-primary cursor-pointer leading-none"
                        >
                            ×
                        </span>
                    </button>
                ))}
                <input
                    ref={inputRef}
                    type="text"
                    value={draft}
                    placeholder={classes.length === 0 ? 'Add a class…' : ''}
                    aria-label="Add a class"
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={handleInputKey}
                    onFocus={() => {
                        // Focusing the input always expands so the caret is on screen.
                        if (overflowed) setExpanded(true);
                    }}
                    onBlur={() => {
                        if (draft.trim()) addFromDraft();
                    }}
                    className={cn(
                        'placeholder:text-muted-foreground text-mini text-foreground-primary h-5 min-w-[60px] flex-1 bg-transparent px-1 outline-none',
                    )}
                />
            </div>
            {overflowed && (
                <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    className="text-foreground-tertiary hover:text-foreground-secondary text-micro self-start px-1 transition-colors"
                >
                    {expanded ? 'Collapse' : 'More'}
                </button>
            )}
        </div>
    );
}
