'use client';

import type { WriteTarget } from '@/components/store/editor/style/preferences';
import { useEditorEngine } from '@/components/store/editor';

export type StyleSource = 'inline' | 'class' | 'inherited' | 'computed' | 'unset';

export interface StyleValue {
    /** Resolved value. Empty string when nothing is defined or computed. */
    value: string;
    /** Where the value comes from. */
    source: StyleSource;
    /** True when the value is explicitly authored (inline or class). */
    isSet: boolean;
    /** Active write target for this property (project default + per-property override). */
    writeTarget: WriteTarget;
    /** True when "Override (this element only)" is enabled for this property+element. */
    override: boolean;
}

const EMPTY_VALUE: StyleValue = {
    value: '',
    source: 'unset',
    isSet: false,
    writeTarget: 'tailwind',
    override: false,
};

/**
 * Read the current resolved value for a CSS property on the selected element,
 * along with metadata about where the value came from and how it would be
 * written back if the user edits it.
 *
 * Note: this hook is meant to be used inside an `observer()` component so that
 * MobX picks up reads from `editorEngine.style.selectedStyle` and re-renders
 * when the selected element changes.
 */
export function useStyleValue(property: string): StyleValue {
    const editorEngine = useEditorEngine();
    const selectedStyle = editorEngine.style.selectedStyle;
    const selected = editorEngine.elements.selected;
    const oid = selected[0]?.oid ?? null;

    const writeTarget = editorEngine.stylePreferences.getWriteTarget(property);
    const override = editorEngine.stylePreferences.isOverridden(oid, property);

    if (!selectedStyle) {
        return { ...EMPTY_VALUE, writeTarget, override };
    }

    const defined = selectedStyle.styles.defined ?? {};
    const computed = selectedStyle.styles.computed ?? {};

    const definedValue = defined[property];
    if (definedValue !== undefined && definedValue !== '') {
        // The current StyleManager merges stylesheet + inline into `defined`.
        // We can't distinguish them here yet — treat both as "set" and tag the
        // source heuristically: inline if it doesn't appear in any class table,
        // class otherwise. For now we surface as `class` and let the panel
        // refine over time.
        return {
            value: String(definedValue),
            source: 'class',
            isSet: true,
            writeTarget,
            override,
        };
    }

    const computedValue = computed[property];
    if (computedValue !== undefined && computedValue !== '') {
        return {
            value: String(computedValue),
            source: 'computed',
            isSet: false,
            writeTarget,
            override,
        };
    }

    return { ...EMPTY_VALUE, writeTarget, override };
}
