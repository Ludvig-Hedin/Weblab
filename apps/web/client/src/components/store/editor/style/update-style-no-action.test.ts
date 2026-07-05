import { describe, expect, it } from 'bun:test';

import type { DomElementStyles } from '@weblab/models';

import type { EditorEngine } from '../engine';
import type { SelectedStyle } from './index';
import { StyleManager } from './index';

// Regression (#8): updateStyleNoAction previously spread flat CSS props at the
// TOP level of SelectedStyle.styles (`{ ...styles, padding }`) instead of into
// the `defined` / `computed` sub-maps. Every consumer reads styles.defined[prop]
// / styles.computed[prop], so the optimistic mirror was invisible and the
// useStyleSetter same-value short-circuit compared against a never-updated
// `defined`, silently dropping quick A→B→A reverts. The mirror must land in the
// sub-maps.
const makeSelectedStyle = (
    defined: Record<string, string>,
    computed: Record<string, string>,
): SelectedStyle => ({
    styles: { defined, computed } as unknown as DomElementStyles,
    parentRect: {} as DOMRect,
    rect: {} as DOMRect,
});

describe('StyleManager.updateStyleNoAction', () => {
    it('merges the value into both defined and computed of selectedStyle', () => {
        const mgr = new StyleManager({} as unknown as EditorEngine);
        mgr.selectedStyle = makeSelectedStyle(
            { padding: '10px' },
            { padding: '10px', color: 'red' },
        );

        mgr.updateStyleNoAction({ padding: '20px' });

        expect(mgr.selectedStyle?.styles.defined.padding).toBe('20px');
        expect(mgr.selectedStyle?.styles.computed.padding).toBe('20px');
        // Unrelated existing values are preserved.
        expect(mgr.selectedStyle?.styles.computed.color).toBe('red');
    });

    it('mirrors the update into every entry of domIdToStyle', () => {
        const mgr = new StyleManager({} as unknown as EditorEngine);
        mgr.domIdToStyle = new Map([
            ['a', makeSelectedStyle({}, {})],
            ['b', makeSelectedStyle({ opacity: '1' }, { opacity: '1' })],
        ]);
        mgr.selectedStyle = mgr.domIdToStyle.get('a') ?? null;

        mgr.updateStyleNoAction({ opacity: '0.5' });

        expect(mgr.domIdToStyle.get('a')?.styles.defined.opacity).toBe('0.5');
        expect(mgr.domIdToStyle.get('b')?.styles.defined.opacity).toBe('0.5');
        expect(mgr.domIdToStyle.get('b')?.styles.computed.opacity).toBe('0.5');
    });

    it('coerces nullish values to an empty string rather than writing junk', () => {
        const mgr = new StyleManager({} as unknown as EditorEngine);
        mgr.selectedStyle = makeSelectedStyle({ color: 'red' }, { color: 'red' });

        mgr.updateStyleNoAction({ color: undefined } as unknown as Record<string, string>);

        expect(mgr.selectedStyle?.styles.defined.color).toBe('');
    });

    it('does not throw when there is no selection', () => {
        const mgr = new StyleManager({} as unknown as EditorEngine);
        mgr.selectedStyle = null;
        expect(() => mgr.updateStyleNoAction({ padding: '4px' })).not.toThrow();
    });
});
