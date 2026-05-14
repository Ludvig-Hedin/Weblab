'use client';

import { useCallback } from 'react';

import { cssToTailwind } from '@weblab/utility';

import type { WriteTarget } from '@/components/store/editor/style/preferences';
import { useEditorEngine } from '@/components/store/editor';

export interface StyleSetter {
    /** Commit a value through the active write target. Empty string deletes the property. */
    set: (value: string) => void;
    /** Resolve the property's effective write target right now. */
    resolveTarget: () => WriteTarget;
    /** True when the active target is `inline` because of an override (not the user's choice). */
    forcedInline: boolean;
}

/** A single property/value pair for a batched write. */
export interface StyleBatchEntry {
    property: string;
    value: string;
}

export interface StyleBatchSetter {
    /**
     * Commit several property changes as ONE history entry. Use this for any
     * control that writes more than one CSS property per user gesture (the
     * TRBL grid's "all sides", grow/fill presets, the overflow toggle) so a
     * single Cmd+Z reverts the whole gesture instead of one property at a time.
     */
    setMultiple: (entries: StyleBatchEntry[]) => void;
}

/**
 * Returns a setter that respects the user's current write-target preference
 * (Tailwind / custom-class / inline) and the per-element override flag.
 *
 * The setter ultimately calls `editorEngine.style.update(prop, value)` so undo,
 * redo, and AST sync continue to work — the differences live in *what* gets
 * written, not in how the change is dispatched.
 *
 * The custom-class path is currently routed through inline as well; the parser
 * support for editing arbitrary stylesheet rules is tracked separately.
 */
export function useStyleSetter(property: string): StyleSetter {
    const editorEngine = useEditorEngine();
    const selected = editorEngine.elements.selected;
    const oid = selected[0]?.oid ?? null;
    const override = editorEngine.stylePreferences.isOverridden(oid, property);
    const userTarget = editorEngine.stylePreferences.getWriteTarget(property);

    const resolveTarget = useCallback((): WriteTarget => {
        if (override) return 'inline';
        return userTarget;
    }, [override, userTarget]);

    const set = useCallback(
        (rawValue: string) => {
            const value = rawValue ?? '';
            const target = resolveTarget();

            // Short-circuit when the incoming value matches the current
            // defined value — toggling an IconToggleField back-and-forth
            // would otherwise queue a fresh AST write + iframe sync per
            // click, which surfaced as a multi-second flicker once the
            // change reached the canvas reload step.
            // TODO(bug-hunt 2026-05-13): this short-circuit ignores write-target
            // migration. If `value === current` but the user switched the write
            // target (e.g. from inline to tailwind), no re-write is queued, so
            // the property silently stays on the old target. Acceptable today
            // because target migration on an unchanged value is an edge case,
            // but the assumption should be revisited if a user-visible "switch
            // target" affordance is added.
            const defined = editorEngine.style.selectedStyle?.styles.defined ?? {};
            const currentRaw = defined[property];
            const current =
                currentRaw === undefined || currentRaw === null ? '' : String(currentRaw);
            if (value === current) return;

            // Empty string => StyleManager treats it as "remove from defined"
            // for inline values, and the parser's tailwind path strips the
            // matching class. Either is the desired "reset" behavior.
            if (value === '') {
                editorEngine.style.update(property, '');
                return;
            }

            if (target === 'tailwind') {
                // We check if a Tailwind utility exists just to see if it's possible.
                // The StyleManager + parser pipeline already supports
                // emitting Tailwind utilities for known property/value
                // pairs via the existing `update` path; for unknown ones,
                // we fall back to an inline write so the change still
                // applies visually.
                const hasUtility = Boolean(cssToTailwind(property, value));
                if (hasUtility) {
                    editorEngine.style.update(property, value);
                    return;
                }
            }

            // `custom-class` is treated as inline at the StyleManager layer for
            // now; the actual stylesheet routing lands in a follow-up.
            editorEngine.style.update(property, value);
        },
        [editorEngine.style, property, resolveTarget],
    );

    return {
        set,
        resolveTarget,
        forcedInline: override && userTarget !== 'inline',
    };
}

/**
 * Batch-write hook for multi-property controls.
 *
 * Each `useStyleSetter().set()` call routes through `StyleManager.update()`,
 * which runs one `update-style` action — i.e. one history entry — per call.
 * A control that writes four sides of padding therefore produces four undo
 * steps for one logical gesture, so a single Cmd+Z only reverts one side
 * (issue #6). `StyleManager.updateMultiple()` already commits a whole
 * `Record<property, value>` as a single `update-style` action; this hook is
 * the panel-side adapter onto it.
 *
 * Empty-string entries are kept (they mean "reset that property"), so a
 * gesture that clears several properties is still a single undo step. The
 * per-property short-circuit from `useStyleSetter.set` is intentionally *not*
 * applied here: a batch is a deliberate group write, and dropping members of
 * it would desync the resulting history entry from what the user did.
 *
 * Usage (e.g. in `trbl-grid.tsx`'s `setAll`):
 *
 *   const { setMultiple } = useStyleBatchSetter();
 *   const setAll = (value: string) =>
 *       setMultiple([
 *           { property: 'padding-top', value },
 *           { property: 'padding-right', value },
 *           { property: 'padding-bottom', value },
 *           { property: 'padding-left', value },
 *       ]);
 *
 * One `setMultiple` call ⇒ one history entry ⇒ one Cmd+Z reverts all four.
 */
export function useStyleBatchSetter(): StyleBatchSetter {
    const editorEngine = useEditorEngine();

    const setMultiple = useCallback(
        (entries: StyleBatchEntry[]) => {
            if (entries.length === 0) return;

            // Collapse to a property→value record. A later entry for the same
            // property wins — callers shouldn't pass duplicates, but if they
            // do, last-write semantics match how `updateMultiple` keys it.
            const styles: Record<string, string> = {};
            for (const { property, value } of entries) {
                styles[property] = value ?? '';
            }

            // Skip the write entirely if every value already matches what's
            // defined — avoids a no-op history entry (and the canvas resync it
            // triggers) when a control re-emits its current state.
            const defined = editorEngine.style.selectedStyle?.styles.defined ?? {};
            const changed = Object.entries(styles).some(([property, value]) => {
                const currentRaw = defined[property];
                const current =
                    currentRaw === undefined || currentRaw === null ? '' : String(currentRaw);
                return value !== current;
            });
            if (!changed) return;

            // One action → one history entry → one undo step for the gesture.
            editorEngine.style.updateMultiple(styles);
        },
        [editorEngine.style],
    );

    return { setMultiple };
}
