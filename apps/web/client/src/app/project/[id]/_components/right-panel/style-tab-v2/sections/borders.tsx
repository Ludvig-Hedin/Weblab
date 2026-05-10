'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { observer } from 'mobx-react-lite';

import { NumberInput } from '@weblab/ui/number-input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@weblab/ui/tooltip';
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
            <div className="flex flex-col gap-1.5 px-3 py-1">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={handleToggle}
                        title={expanded ? 'Collapse radius' : 'Expand to per-corner'}
                        className={cn(
                            'text-mini flex w-[72px] shrink-0 items-center gap-1 text-left transition-colors',
                            anySet
                                ? 'text-foreground-primary font-medium'
                                : 'text-foreground-tertiary hover:text-foreground-secondary font-normal',
                        )}
                    >
                        <ChevronDown
                            className={cn(
                                'size-3 shrink-0 transition-transform duration-150',
                                expanded ? 'rotate-180' : 'rotate-0',
                            )}
                        />
                        <span className="truncate">Radius</span>
                    </button>
                    <div className="min-w-0 flex-1">
                        {!expanded && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <NumberInput
                                        compact
                                        value={linkedValue}
                                        placeholder={placeholder}
                                        onCommit={setAll}
                                        className={cn(
                                            'w-full',
                                            linkedIsSet && 'border-foreground-brand/40',
                                        )}
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
                    <div className="flex items-end gap-1.5 pl-[84px]">
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
        <div className="flex flex-1 flex-col items-center gap-0.5">
            <NumberInput
                compact
                value={styleValue.value}
                onCommit={setter.set}
                className={cn(
                    'w-full text-center',
                    styleValue.isSet && 'border-foreground-brand/40',
                )}
                aria-label={`Radius ${label}`}
            />
            <span className="text-foreground-tertiary text-[9px] leading-none uppercase">
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
