'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { observer } from 'mobx-react-lite';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import {
    ColorField,
    CustomExpander,
    NumberField,
    PropertyControl,
    PropertyLabel,
    SelectField,
    TextField,
} from '../controls';
import { PROPERTY_LABEL_OFFSET_CLASS } from '../controls/constants';
import { useStyleBatchSetter, useStyleSetter } from '../hooks/use-style-setter';
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

const BACKGROUND_SIZE_OPTIONS = [
    { value: 'auto', label: 'Auto' },
    { value: 'cover', label: 'Cover' },
    { value: 'contain', label: 'Contain' },
    { value: '100% 100%', label: 'Stretch' },
];

const BACKGROUND_REPEAT_OPTIONS = [
    { value: 'repeat', label: 'Repeat' },
    { value: 'no-repeat', label: 'No repeat' },
    { value: 'repeat-x', label: 'Repeat X' },
    { value: 'repeat-y', label: 'Repeat Y' },
];

const CORNERS = [
    { property: 'border-top-left-radius', label: 'TL' },
    { property: 'border-top-right-radius', label: 'TR' },
    { property: 'border-bottom-right-radius', label: 'BR' },
    { property: 'border-bottom-left-radius', label: 'BL' },
] as const;

function CornerRadius() {
    const tl = useStyleValue('border-top-left-radius');
    const tr = useStyleValue('border-top-right-radius');
    const br = useStyleValue('border-bottom-right-radius');
    const bl = useStyleValue('border-bottom-left-radius');
    // "All corners" writes four longhands in one gesture — commit them as a
    // single batched history entry so one Cmd+Z reverts the whole change
    // (matches `TrblGrid.setAll`). Four separate `useStyleSetter().set()`
    // calls would otherwise produce four undo steps for one user action.
    const { setMultiple } = useStyleBatchSetter();

    const allEqual = useMemo(() => {
        const v = [tl.value, tr.value, br.value, bl.value];
        return v.every((x) => x === v[0]);
    }, [tl.value, tr.value, br.value, bl.value]);

    const anySet = tl.isSet || tr.isSet || br.isSet || bl.isSet;
    const linkedValue = allEqual ? tl.value : '';
    const placeholder = !allEqual ? 'Mixed' : undefined;

    const [expanded, setExpanded] = useState(() => anySet && !allEqual);
    const prevDivergentRef = useRef(anySet && !allEqual);
    useEffect(() => {
        const divergent = anySet && !allEqual;
        if (divergent && !prevDivergentRef.current) setExpanded(true);
        prevDivergentRef.current = divergent;
    }, [anySet, allEqual]);

    const handleToggle = () => {
        setExpanded((v) => {
            const next = !v;
            prevDivergentRef.current = anySet && !allEqual;
            return next;
        });
    };

    const setAll = (value: string) => {
        setMultiple([
            { property: 'border-top-left-radius', value },
            { property: 'border-top-right-radius', value },
            { property: 'border-bottom-right-radius', value },
            { property: 'border-bottom-left-radius', value },
        ]);
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
                                    {/* Wrapper div: NumberField is a plain function
                                        component, so the tooltip trigger needs a real
                                        DOM node to attach its ref + handlers to. */}
                                    <div className="w-full">
                                        <NumberField
                                            value={linkedValue}
                                            placeholder={placeholder}
                                            onCommit={setAll}
                                            className="w-full"
                                            aria-label="Corner radius (all corners)"
                                        />
                                    </div>
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

function CornerInput({ property, label }: { property: string; label: string }) {
    const styleValue = useStyleValue(property);
    const setter = useStyleSetter(property);
    return (
        <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
            <NumberField
                value={styleValue.value}
                onCommit={setter.set}
                units={[]}
                className="text-center"
                aria-label={`Radius ${label}`}
            />
            <span className="text-foreground-tertiary text-[10px] leading-none">
                {label}
            </span>
        </div>
    );
}

/**
 * Overlays — combines Backgrounds + Borders into a single Figma-style section.
 * Top rows are the most-used (background color, border style/width/color,
 * radius); the Custom expander reveals background image/size/position/repeat
 * and the per-side border widths.
 */
export const OverlaysSection = observer(function OverlaysSection() {
    const bgColor = useStyleValue('background-color');
    const bgImage = useStyleValue('background-image');
    const bgSize = useStyleValue('background-size');
    const bgPosition = useStyleValue('background-position');
    const bgRepeat = useStyleValue('background-repeat');
    const borderStyle = useStyleValue('border-style');
    const borderWidth = useStyleValue('border-width');
    const borderColor = useStyleValue('border-color');
    const radiusTl = useStyleValue('border-top-left-radius');
    const radiusTr = useStyleValue('border-top-right-radius');
    const radiusBr = useStyleValue('border-bottom-right-radius');
    const radiusBl = useStyleValue('border-bottom-left-radius');
    const borderTop = useStyleValue('border-top-width');
    const borderRight = useStyleValue('border-right-width');
    const borderBottom = useStyleValue('border-bottom-width');
    const borderLeft = useStyleValue('border-left-width');

    const advancedProps = [
        bgImage,
        bgSize,
        bgPosition,
        bgRepeat,
        borderTop,
        borderRight,
        borderBottom,
        borderLeft,
    ];
    const advancedSetCount = advancedProps.filter((v) => v.isSet).length;
    const [customOpen, setCustomOpen] = useState(advancedSetCount > 0);

    const setCount = [
        bgColor,
        bgImage,
        bgSize,
        bgPosition,
        bgRepeat,
        borderStyle,
        borderWidth,
        borderColor,
        radiusTl,
        radiusTr,
        radiusBr,
        radiusBl,
        borderTop,
        borderRight,
        borderBottom,
        borderLeft,
    ].filter((v) => v.isSet).length;

    return (
        <Section id="overlays" title="Overlays" setCount={setCount}>
            <PropertyControl property="background-color" label="Fill">
                {({ value, commit }) => <ColorField value={value} onCommit={commit} />}
            </PropertyControl>
            <PropertyControl property="border-style" label="Stroke">
                {({ value, commit }) => (
                    <SelectField value={value} options={BORDER_STYLE_OPTIONS} onCommit={commit} />
                )}
            </PropertyControl>
            <PropertyControl property="border-width" label="Width">
                {({ value, commit }) => <NumberField value={value} onCommit={commit} />}
            </PropertyControl>
            <PropertyControl property="border-color" label="Color">
                {({ value, commit }) => <ColorField value={value} onCommit={commit} />}
            </PropertyControl>
            <CornerRadius />
            <CustomExpander
                open={customOpen}
                onOpenChange={setCustomOpen}
                summary={advancedSetCount > 0 ? `${advancedSetCount} set` : undefined}
            >
                <PropertyControl property="background-image" label="Image">
                    {({ value, commit }) => (
                        <TextField
                            value={value}
                            onCommit={commit}
                            placeholder='url("...") or linear-gradient(...)'
                        />
                    )}
                </PropertyControl>
                <PropertyControl property="background-size" label="Bg size">
                    {({ value, commit }) => (
                        <SelectField
                            value={value}
                            options={BACKGROUND_SIZE_OPTIONS}
                            onCommit={commit}
                        />
                    )}
                </PropertyControl>
                <PropertyControl property="background-position" label="Bg pos">
                    {({ value, commit }) => (
                        <TextField
                            value={value}
                            onCommit={commit}
                            placeholder="center / top left"
                        />
                    )}
                </PropertyControl>
                <PropertyControl property="background-repeat" label="Repeat">
                    {({ value, commit }) => (
                        <SelectField
                            value={value}
                            options={BACKGROUND_REPEAT_OPTIONS}
                            onCommit={commit}
                        />
                    )}
                </PropertyControl>
                <PropertyControl property="border-top-width" label="B. Top">
                    {({ value, commit }) => <NumberField value={value} onCommit={commit} />}
                </PropertyControl>
                <PropertyControl property="border-right-width" label="B. Right">
                    {({ value, commit }) => <NumberField value={value} onCommit={commit} />}
                </PropertyControl>
                <PropertyControl property="border-bottom-width" label="B. Btm">
                    {({ value, commit }) => <NumberField value={value} onCommit={commit} />}
                </PropertyControl>
                <PropertyControl property="border-left-width" label="B. Left">
                    {({ value, commit }) => <NumberField value={value} onCommit={commit} />}
                </PropertyControl>
            </CustomExpander>
        </Section>
    );
});
