'use client';

import { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';

import { NumberInput } from '@weblab/ui/number-input';
import { cn } from '@weblab/ui/utils';

import { ColorField } from '../controls/color-field';
import { PropertyControl } from '../controls/property-control';
import { SelectField } from '../controls/select-field';
import { useStyleSetter } from '../hooks/use-style-setter';
import { useStyleValue } from '../hooks/use-style-value';
import { Section } from './section';

const BORDER_STYLE_OPTIONS = [
    { value: 'none', label: 'None' },
    { value: 'solid', label: 'Solid' },
    { value: 'dashed', label: 'Dashed' },
    { value: 'dotted', label: 'Dotted' },
    { value: 'double', label: 'Double' },
    { value: 'groove', label: 'Groove' },
    { value: 'ridge', label: 'Ridge' },
];

const CORNERS = [
    { property: 'border-top-left-radius', label: 'TL' },
    { property: 'border-top-right-radius', label: 'TR' },
    { property: 'border-bottom-right-radius', label: 'BR' },
    { property: 'border-bottom-left-radius', label: 'BL' },
] as const;

const PER_SIDE_PROPERTIES = [
    'border-top-width',
    'border-right-width',
    'border-bottom-width',
    'border-left-width',
] as const;

function CornerRadius() {
    const tl = useStyleValue('border-top-left-radius');
    const tr = useStyleValue('border-top-right-radius');
    const br = useStyleValue('border-bottom-right-radius');
    const bl = useStyleValue('border-bottom-left-radius');
    const tlSetter = useStyleSetter('border-top-left-radius');
    const trSetter = useStyleSetter('border-top-right-radius');
    const brSetter = useStyleSetter('border-bottom-right-radius');
    const blSetter = useStyleSetter('border-bottom-left-radius');

    const allEqual = useMemo(() => {
        const v = [tl.value, tr.value, br.value, bl.value];
        const f = v[0];
        return v.every((x) => x === f);
    }, [tl.value, tr.value, br.value, bl.value]);

    const [linked, setLinked] = useState(allEqual);
    useEffect(() => {
        if (!allEqual) setLinked(false);
    }, [allEqual]);

    const setAll = (value: string) => {
        tlSetter.set(value);
        trSetter.set(value);
        brSetter.set(value);
        blSetter.set(value);
    };

    const linkedValue = linked ? tl.value : '';

    return (
        <div className="flex items-start gap-3 px-3 py-2">
            <span className="text-foreground-secondary w-12 shrink-0 pt-1.5 text-xs">Radius</span>
            <div className="flex flex-1 flex-col gap-1">
                {linked ? (
                    <NumberInput
                        compact
                        value={linkedValue}
                        onCommit={setAll}
                        aria-label="Corner radius"
                    />
                ) : (
                    <div className="grid grid-cols-2 gap-1">
                        {CORNERS.map(({ property, label }) => (
                            <CornerInput key={property} property={property} label={label} />
                        ))}
                    </div>
                )}
                <button
                    type="button"
                    onClick={() => setLinked((v) => !v)}
                    className={cn(
                        'self-end rounded px-2 py-0.5 text-[10px]',
                        linked
                            ? 'bg-blue-500/20 text-blue-500'
                            : 'bg-foreground-secondary/10 text-foreground-secondary',
                    )}
                >
                    {linked ? 'Linked' : 'Per corner'}
                </button>
            </div>
        </div>
    );
}

function CornerInput({ property, label }: { property: string; label: string }) {
    const styleValue = useStyleValue(property);
    const setter = useStyleSetter(property);
    return (
        <div className="flex items-center gap-1">
            <span className="text-foreground-secondary w-5 text-[10px] uppercase">{label}</span>
            <NumberInput
                compact
                value={styleValue.value}
                onCommit={setter.set}
                className={cn(styleValue.isSet && 'border-blue-500/40')}
                aria-label={`Radius ${label}`}
            />
        </div>
    );
}

/**
 * Per-side border-width rows. Only shown when the user expands them OR when
 * at least one per-side value is already explicitly set.
 */
function PerSideWidths({ onHide }: { onHide: () => void }) {
    const top = useStyleValue('border-top-width');
    const right = useStyleValue('border-right-width');
    const bottom = useStyleValue('border-bottom-width');
    const left = useStyleValue('border-left-width');
    const anySet = top.isSet || right.isSet || bottom.isSet || left.isSet;

    return (
        <>
            <PropertyControl property="border-top-width" label="Top">
                {({ value, commit }) => <NumberInput compact value={value} onCommit={commit} />}
            </PropertyControl>
            <PropertyControl property="border-right-width" label="Right">
                {({ value, commit }) => <NumberInput compact value={value} onCommit={commit} />}
            </PropertyControl>
            <PropertyControl property="border-bottom-width" label="Bottom">
                {({ value, commit }) => <NumberInput compact value={value} onCommit={commit} />}
            </PropertyControl>
            <PropertyControl property="border-left-width" label="Left">
                {({ value, commit }) => <NumberInput compact value={value} onCommit={commit} />}
            </PropertyControl>
            {!anySet && (
                <button
                    type="button"
                    onClick={onHide}
                    className="text-foreground-secondary hover:text-foreground-primary mx-3 mb-1 self-start text-[11px]"
                >
                    Hide per-side
                </button>
            )}
        </>
    );
}

export const BordersSection = observer(function BordersSection() {
    // Detect if any per-side width is set so we auto-expand the sub-group.
    const perSideTop = useStyleValue('border-top-width');
    const perSideRight = useStyleValue('border-right-width');
    const perSideBottom = useStyleValue('border-bottom-width');
    const perSideLeft = useStyleValue('border-left-width');
    const perSideAutoExpand =
        perSideTop.isSet || perSideRight.isSet || perSideBottom.isSet || perSideLeft.isSet;

    const [showPerSide, setShowPerSide] = useState(false);
    // If per-side values become set externally, reveal the rows automatically.
    useEffect(() => {
        if (perSideAutoExpand) setShowPerSide(true);
    }, [perSideAutoExpand]);

    const props = [
        useStyleValue('border-style'),
        useStyleValue('border-width'),
        useStyleValue('border-color'),
        useStyleValue('border-top-left-radius'),
        useStyleValue('border-top-right-radius'),
        useStyleValue('border-bottom-right-radius'),
        useStyleValue('border-bottom-left-radius'),
        perSideTop,
        perSideRight,
        perSideBottom,
        perSideLeft,
    ];
    const setCount = props.filter((v) => v.isSet).length;

    return (
        <Section id="borders" title="Borders" setCount={setCount}>
            <CornerRadius />
            <PropertyControl property="border-style" label="Style">
                {({ value, commit }) => (
                    <SelectField value={value} options={BORDER_STYLE_OPTIONS} onCommit={commit} />
                )}
            </PropertyControl>
            <PropertyControl property="border-width" label="Width">
                {({ value, commit }) => <NumberInput compact value={value} onCommit={commit} />}
            </PropertyControl>
            <PropertyControl property="border-color" label="Color">
                {({ value, commit }) => <ColorField value={value} onCommit={commit} />}
            </PropertyControl>

            {/* Per-side widths — hidden by default, revealed on demand */}
            {showPerSide ? (
                <PerSideWidths onHide={() => setShowPerSide(false)} />
            ) : (
                <button
                    type="button"
                    onClick={() => setShowPerSide(true)}
                    className="text-foreground-secondary hover:text-foreground-primary mx-3 mb-1 self-start text-[11px]"
                >
                    + Per-side widths
                </button>
            )}
        </Section>
    );
});

// Expose the per-side property list for use in setCount above.
export { PER_SIDE_PROPERTIES };
