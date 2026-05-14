'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Square } from 'lucide-react';
import { observer } from 'mobx-react-lite';

import { NumberInput } from '@weblab/ui/number-input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import { ColorField } from '../controls/color-field';
import { InlineButton } from '../controls/inline-button';
import { PropertyControl } from '../controls/property-control';
import { PROPERTY_LABEL_OFFSET_CLASS } from '../controls/constants';
import { PropertyLabel } from '../controls/property-label';
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

type CornerProperty = (typeof CORNERS)[number]['property'];

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
        return v.every((x) => x === v[0]);
    }, [tl.value, tr.value, br.value, bl.value]);

    const anySet = tl.isSet || tr.isSet || br.isSet || bl.isSet;
    const linkedValue = allEqual ? tl.value : '';
    const linkedIsSet = allEqual && tl.isSet;
    const placeholder = !allEqual ? 'Mixed' : undefined;

    // User-driven collapse intent: once they explicitly close the row, don't
    // pop it back open just because a value diverges. We only auto-expand on
    // the first transition into a divergent state.
    const [expanded, setExpanded] = useState(() => anySet && !allEqual);
    const prevDivergentRef = useRef(anySet && !allEqual);
    useEffect(() => {
        const divergent = anySet && !allEqual;
        if (divergent && !prevDivergentRef.current) setExpanded(true);
        prevDivergentRef.current = divergent;
    }, [anySet, allEqual]);

    // Sync ref synchronously inside the toggle handler so a manual collapse
    // performed before the next effect flush does not get re-opened by a
    // simultaneously-arriving divergent value.
    const handleToggle = () => {
        setExpanded((v) => {
            const next = !v;
            prevDivergentRef.current = anySet && !allEqual;
            return next;
        });
    };

    const setAll = (value: string) => {
        tlSetter.set(value);
        trSetter.set(value);
        brSetter.set(value);
        blSetter.set(value);
    };

    return (
        <TooltipProvider delayDuration={400}>
            <div className="group/control flex flex-col gap-1.5 px-3 py-1">
                <div className="flex items-center gap-3">
                    <PropertyLabel
                        label="Radius"
                        isSet={anySet}
                        onClick={handleToggle}
                        title={expanded ? 'Collapse radius' : 'Expand to per-corner'}
                        icon={
                            <ChevronDown
                                className={cn(
                                    'size-3 shrink-0 transition-transform duration-150',
                                    expanded ? 'rotate-180' : 'rotate-0',
                                )}
                            />
                        }
                    />
                    <div className="min-w-0 flex-1">
                        {!expanded && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <NumberInput
                                        value={linkedValue}
                                        placeholder={placeholder}
                                        onCommit={setAll}
                                        className="w-full"
                                        aria-label="Corner radius (all corners)"
                                    />
                                </TooltipTrigger>
                                {!allEqual && anySet && (
                                    <TooltipContent side="left" className="text-mini">
                                        Corners differ — expand to edit individually
                                    </TooltipContent>
                                )}
                            </Tooltip>
                        )}
                    </div>
                </div>
                {expanded && (
                    <div className={cn('flex items-end gap-1.5', PROPERTY_LABEL_OFFSET_CLASS)}>
                        {CORNERS.map(({ property, label }) => (
                            <CornerInput key={property} property={property} label={label} />
                        ))}
                    </div>
                )}
            </div>
        </TooltipProvider>
    );
}

function CornerInput({ property, label }: { property: CornerProperty; label: string }) {
    const styleValue = useStyleValue(property);
    const setter = useStyleSetter(property);
    return (
        <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
            {/* Same reasoning as Spacing.SideInput — drop the unit pill so four
                corner inputs fit the panel width. */}
            <NumberInput
                value={styleValue.value}
                onCommit={setter.set}
                units={[]}
                className="text-center"
                aria-label={`Radius ${label}`}
            />
            <span className="text-foreground-tertiary text-[10px] leading-none tracking-wider uppercase">
                {label}
            </span>
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
                {({ value, commit }) => <NumberInput value={value} onCommit={commit} />}
            </PropertyControl>
            <PropertyControl property="border-right-width" label="Right">
                {({ value, commit }) => <NumberInput value={value} onCommit={commit} />}
            </PropertyControl>
            <PropertyControl property="border-bottom-width" label="Bottom">
                {({ value, commit }) => <NumberInput value={value} onCommit={commit} />}
            </PropertyControl>
            <PropertyControl property="border-left-width" label="Left">
                {({ value, commit }) => <NumberInput value={value} onCommit={commit} />}
            </PropertyControl>
            {!anySet && <InlineButton onClick={onHide}>Hide per-side</InlineButton>}
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
        <Section id="borders" title="Borders" icon={Square} setCount={setCount}>
            <CornerRadius />
            <PropertyControl property="border-style" label="Style">
                {({ value, commit }) => (
                    <SelectField value={value} options={BORDER_STYLE_OPTIONS} onCommit={commit} />
                )}
            </PropertyControl>
            <PropertyControl property="border-width" label="Width">
                {({ value, commit }) => <NumberInput value={value} onCommit={commit} />}
            </PropertyControl>
            <PropertyControl property="border-color" label="Color">
                {({ value, commit }) => <ColorField value={value} onCommit={commit} />}
            </PropertyControl>

            {/* Per-side widths — hidden by default, revealed on demand */}
            {showPerSide ? (
                <PerSideWidths onHide={() => setShowPerSide(false)} />
            ) : (
                <InlineButton onClick={() => setShowPerSide(true)}>+ Per-side</InlineButton>
            )}
        </Section>
    );
});

// Expose the per-side property list for use in setCount above.
export { PER_SIDE_PROPERTIES };
