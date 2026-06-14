'use client';

import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import {
    AlignmentToolbar,
    NumberField,
    PropertyControl,
    PropertyLabel,
    SelectField,
    TrblGrid,
} from '../controls';
import { useStyleBatchSetter } from '../hooks/use-style-setter';
import { useStyleValue } from '../hooks/use-style-value';
import { Section } from './section';

const POSITION_OPTIONS = [
    { value: 'static', label: 'Static' },
    { value: 'relative', label: 'Relative' },
    { value: 'absolute', label: 'Absolute' },
    { value: 'fixed', label: 'Fixed' },
    { value: 'sticky', label: 'Sticky' },
];

/**
 * Position section — Type, T/R/L/B grid, z-index, plus the alignment toolbar
 * for absolute/fixed elements. Float and clear are kept in v2's structure
 * but moved into the Advanced expander on the Element side (rare in modern
 * layouts) — they do not surface here.
 */
export const PositionSection = observer(function PositionSection() {
    const t = useTranslations('editor.stylePanel');
    const position = useStyleValue('position');
    const top = useStyleValue('top');
    const right = useStyleValue('right');
    const bottom = useStyleValue('bottom');
    const left = useStyleValue('left');
    const zIndex = useStyleValue('z-index');

    const { setMultiple } = useStyleBatchSetter();

    const setCount = [position, top, right, bottom, left, zIndex].filter((v) => v.isSet).length;
    const showOffsets =
        position.value === 'relative' ||
        position.value === 'absolute' ||
        position.value === 'fixed' ||
        position.value === 'sticky';
    const allowAlign = position.value === 'absolute' || position.value === 'fixed';

    // Derive which alignment segment should read as active by inverting
    // `applyAlignment`'s logic. The toolbar is a single-select Radix
    // ToggleGroup, so horizontal and vertical can't both light up — we check
    // horizontal first and fall back to vertical, meaning the horizontal axis
    // wins when an element happens to match both (rare).
    const activeAlignment: string = (() => {
        // Horizontal: applyAlignment pairs an offset with clearing its sibling.
        if (left.value === '0' && !right.isSet) return 'left';
        if (left.value === '50%' && !right.isSet) return 'center-x';
        if (right.value === '0' && !left.isSet) return 'right';
        // Vertical: same shape on top/bottom.
        if (top.value === '0' && !bottom.isSet) return 'top';
        if (top.value === '50%' && !bottom.isSet) return 'center-y';
        if (bottom.value === '0' && !top.isSet) return 'bottom';
        return '';
    })();

    // Each alignment writes two offset properties (e.g. set `left`, clear
    // `right`). Commit them as one batched history entry so a single Cmd+Z
    // reverts the whole alignment gesture rather than one offset at a time.
    const applyAlignment = (value: string) => {
        switch (value) {
            case 'left':
                setMultiple([
                    { property: 'left', value: '0' },
                    { property: 'right', value: '' },
                ]);
                break;
            case 'right':
                setMultiple([
                    { property: 'right', value: '0' },
                    { property: 'left', value: '' },
                ]);
                break;
            case 'center-x':
                setMultiple([
                    { property: 'left', value: '50%' },
                    { property: 'right', value: '' },
                ]);
                break;
            case 'top':
                setMultiple([
                    { property: 'top', value: '0' },
                    { property: 'bottom', value: '' },
                ]);
                break;
            case 'bottom':
                setMultiple([
                    { property: 'bottom', value: '0' },
                    { property: 'top', value: '' },
                ]);
                break;
            case 'center-y':
                setMultiple([
                    { property: 'top', value: '50%' },
                    { property: 'bottom', value: '' },
                ]);
                break;
        }
    };

    return (
        <Section id="position" title={t('section.position')} setCount={setCount}>
            <PropertyControl property="position" label={t('position.type')}>
                {({ value, commit }) => (
                    <SelectField value={value} options={POSITION_OPTIONS} onCommit={commit} />
                )}
            </PropertyControl>
            {showOffsets && (
                <div className="flex items-center gap-3 px-3 py-1">
                    <PropertyLabel
                        label={t('position.offsets')}
                        isSet={top.isSet || right.isSet || bottom.isSet || left.isSet}
                    />
                    <div className="min-w-0 flex-1">
                        <TrblGrid prefix="" shorthand allowKeywords />
                    </div>
                </div>
            )}
            <PropertyControl property="z-index" label={t('position.zIndexLabel')}>
                {({ value, commit }) => (
                    <NumberField
                        value={value}
                        onCommit={commit}
                        defaultUnit=""
                        units={[]}
                        keywords={['auto']}
                        allowKeywords
                    />
                )}
            </PropertyControl>
            {allowAlign && (
                <div className="flex items-center gap-3 px-3 py-1">
                    <PropertyLabel label={t('position.align')} isSet={activeAlignment !== ''} />
                    <div className="min-w-0 flex-1">
                        <AlignmentToolbar value={activeAlignment} onCommit={applyAlignment} />
                    </div>
                </div>
            )}
        </Section>
    );
});
