'use client';

import { observer } from 'mobx-react-lite';

import {
    AlignmentToolbar,
    NumberField,
    PropertyControl,
    PropertyLabel,
    SelectField,
    TrblGrid,
} from '../controls';
import { useStyleSetter } from '../hooks/use-style-setter';
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
    const position = useStyleValue('position');
    const top = useStyleValue('top');
    const right = useStyleValue('right');
    const bottom = useStyleValue('bottom');
    const left = useStyleValue('left');
    const zIndex = useStyleValue('z-index');

    const topSetter = useStyleSetter('top');
    const rightSetter = useStyleSetter('right');
    const bottomSetter = useStyleSetter('bottom');
    const leftSetter = useStyleSetter('left');

    const setCount = [position, top, right, bottom, left, zIndex].filter((v) => v.isSet).length;
    const showOffsets =
        position.value === 'relative' ||
        position.value === 'absolute' ||
        position.value === 'fixed' ||
        position.value === 'sticky';
    const allowAlign = position.value === 'absolute' || position.value === 'fixed';

    const applyAlignment = (value: string) => {
        switch (value) {
            case 'left':
                leftSetter.set('0');
                rightSetter.set('');
                break;
            case 'right':
                rightSetter.set('0');
                leftSetter.set('');
                break;
            case 'center-x':
                leftSetter.set('50%');
                rightSetter.set('');
                break;
            case 'top':
                topSetter.set('0');
                bottomSetter.set('');
                break;
            case 'bottom':
                bottomSetter.set('0');
                topSetter.set('');
                break;
            case 'center-y':
                topSetter.set('50%');
                bottomSetter.set('');
                break;
        }
    };

    return (
        <Section id="position" title="Position" setCount={setCount}>
            <PropertyControl property="position" label="Type">
                {({ value, commit }) => (
                    <SelectField value={value} options={POSITION_OPTIONS} onCommit={commit} />
                )}
            </PropertyControl>
            {showOffsets && (
                <div className="flex items-center gap-3 px-3 py-1">
                    <PropertyLabel
                        label="Offsets"
                        isSet={top.isSet || right.isSet || bottom.isSet || left.isSet}
                    />
                    <div className="min-w-0 flex-1">
                        <TrblGrid prefix="" shorthand allowKeywords />
                    </div>
                </div>
            )}
            <PropertyControl property="z-index" label="Z-index">
                {({ value, commit }) => (
                    <NumberField
                        value={value}
                        onCommit={commit}
                        defaultUnit=""
                        units={[]}
                        allowKeywords
                    />
                )}
            </PropertyControl>
            {allowAlign && (
                <div className="flex items-center gap-3 px-3 py-1">
                    <PropertyLabel label="Align" isSet={false} />
                    <div className="min-w-0 flex-1">
                        <AlignmentToolbar value="" onCommit={applyAlignment} />
                    </div>
                </div>
            )}
        </Section>
    );
});
