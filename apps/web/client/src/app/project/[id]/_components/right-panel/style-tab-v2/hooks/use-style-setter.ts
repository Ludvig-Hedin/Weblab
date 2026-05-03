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
