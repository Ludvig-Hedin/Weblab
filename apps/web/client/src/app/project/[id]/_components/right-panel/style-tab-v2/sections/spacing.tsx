'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { observer } from 'mobx-react-lite';

import { NumberInput } from '@weblab/ui/number-input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import { useStyleSetter } from '../hooks/use-style-setter';
import { useStyleValue } from '../hooks/use-style-value';
import { Section } from './section';

type Side = 'top' | 'right' | 'bottom' | 'left';

const SIDE_LABEL: Record<Side, string> = {
    top: 'T',
    right: 'R',
    bottom: 'B',
    left: 'L',
};

interface SideInputProps {
    side: Side;
    type: 'padding' | 'margin';
}

function SideInput({ side, type }: SideInputProps) {
    const property = `${type}-${side}`;
    const styleValue = useStyleValue(property);
    const setter = useStyleSetter(property);
    return (
        <div className="flex flex-col items-center gap-0.5">
            <NumberInput
                compact
                value={styleValue.value}
                allowKeywords={type === 'margin'}
                onCommit={(value) => setter.set(value)}
                className={cn(
                    'w-full text-center',
                    styleValue.isSet && 'border-foreground-brand/40',
                )}
                aria-label={`${type} ${side}`}
            />
            <span className="text-foreground-tertiary text-[9px] leading-none uppercase">
                {SIDE_LABEL[side]}
            </span>
        </div>
    );
}

interface BoxModelProps {
    type: 'padding' | 'margin';
    label: string;
}

function BoxModel({ type, label }: BoxModelProps) {
    const top = useStyleValue(`${type}-top`);
    const right = useStyleValue(`${type}-right`);
    const bottom = useStyleValue(`${type}-bottom`);
    const left = useStyleValue(`${type}-left`);

    const allEqual = useMemo(() => {
        const values = [top.value, right.value, bottom.value, left.value];
        return values.every((v) => v === values[0]);
    }, [top.value, right.value, bottom.value, left.value]);

    const anySet = top.isSet || right.isSet || bottom.isSet || left.isSet;
    const linkedValue = allEqual ? top.value : '';
    const linkedIsSet = allEqual && top.isSet;

    // Auto-expand only when values transition from converged to divergent.
    // Once the user explicitly collapses, don't re-open on later edits.
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

    const topSetter = useStyleSetter(`${type}-top`);
    const rightSetter = useStyleSetter(`${type}-right`);
    const bottomSetter = useStyleSetter(`${type}-bottom`);
    const leftSetter = useStyleSetter(`${type}-left`);

    const setAll = (value: string) => {
        topSetter.set(value);
        rightSetter.set(value);
        bottomSetter.set(value);
        leftSetter.set(value);
    };

    const placeholder = !allEqual ? 'Mixed' : undefined;

    return (
        <TooltipProvider delayDuration={400}>
            <div className="flex flex-col gap-1.5 px-3 py-1">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={handleToggle}
                        title={expanded ? `Collapse ${label.toLowerCase()}` : `Expand to per-side`}
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
                        <span className="truncate">{label}</span>
                    </button>
                    <div className="min-w-0 flex-1">
                        {!expanded && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <NumberInput
                                        compact
                                        value={linkedValue}
                                        placeholder={placeholder}
                                        allowKeywords={type === 'margin'}
                                        onCommit={(value) => setAll(value)}
                                        className={cn(
                                            'w-full',
                                            linkedIsSet && 'border-foreground-brand/40',
                                        )}
                                        aria-label={`${type} (all sides)`}
                                    />
                                </TooltipTrigger>
                                {!allEqual && anySet && (
                                    <TooltipContent side="left" className="text-mini">
                                        Sides differ — expand to edit individually
                                    </TooltipContent>
                                )}
                            </Tooltip>
                        )}
                    </div>
                </div>
                {expanded && (
                    <div className="flex items-end gap-1.5 pl-[84px]">
                        <SideInput side="top" type={type} />
                        <SideInput side="right" type={type} />
                        <SideInput side="bottom" type={type} />
                        <SideInput side="left" type={type} />
                    </div>
                )}
            </div>
        </TooltipProvider>
    );
}

/**
 * Spacing section — padding + margin. Each row collapses to a single linked
 * input by default and expands to per-side controls when needed.
 */
export const SpacingSection = observer(function SpacingSection() {
    const top = useStyleValue('padding-top');
    const right = useStyleValue('padding-right');
    const bottom = useStyleValue('padding-bottom');
    const left = useStyleValue('padding-left');
    const mTop = useStyleValue('margin-top');
    const mRight = useStyleValue('margin-right');
    const mBottom = useStyleValue('margin-bottom');
    const mLeft = useStyleValue('margin-left');

    const setCount = [top, right, bottom, left, mTop, mRight, mBottom, mLeft].filter(
        (v) => v.isSet,
    ).length;

    return (
        <Section id="spacing" title="Spacing" setCount={setCount}>
            <BoxModel type="padding" label="Padding" />
            <BoxModel type="margin" label="Margin" />
        </Section>
    );
});
