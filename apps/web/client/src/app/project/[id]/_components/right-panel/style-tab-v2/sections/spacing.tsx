'use client';

import { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';

import { NumberInput } from '@weblab/ui/number-input';
import { cn } from '@weblab/ui/utils';

import { useStyleSetter } from '../hooks/use-style-setter';
import { useStyleValue } from '../hooks/use-style-value';
import { Section } from './section';

type Side = 'top' | 'right' | 'bottom' | 'left';

interface BoxFieldProps {
    side: Side;
    type: 'padding' | 'margin';
    linked: boolean;
    onLink: (value: string) => void;
}

function BoxField({ side, type, linked, onLink }: BoxFieldProps) {
    const property = `${type}-${side}`;
    const styleValue = useStyleValue(property);
    const setter = useStyleSetter(property);
    return (
        <NumberInput
            compact
            value={styleValue.value}
            allowKeywords={type === 'margin'}
            onCommit={(value) => {
                if (linked) onLink(value);
                else setter.set(value);
            }}
            className={cn('w-12 text-center', styleValue.isSet && 'border-blue-400/40')}
            aria-label={`${type} ${side}`}
        />
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
        const first = values[0];
        return values.every((v) => v === first);
    }, [top.value, right.value, bottom.value, left.value]);

    const [linked, setLinked] = useState(allEqual);
    // When the underlying values diverge, drop linked mode automatically.
    useEffect(() => {
        if (!allEqual) setLinked(false);
    }, [allEqual]);

    const topSetter = useStyleSetter(`${type}-top`);
    const rightSetter = useStyleSetter(`${type}-right`);
    const bottomSetter = useStyleSetter(`${type}-bottom`);
    const leftSetter = useStyleSetter(`${type}-left`);

    const linkAll = (value: string) => {
        topSetter.set(value);
        rightSetter.set(value);
        bottomSetter.set(value);
        leftSetter.set(value);
    };

    return (
        <div className="flex items-center gap-3 px-3 py-2">
            <span className="text-foreground-secondary text-mini w-12 shrink-0">{label}</span>
            <div className="grid flex-1 grid-cols-[1fr_auto_1fr] grid-rows-[auto_auto_auto] items-center gap-1">
                <div />
                <BoxField side="top" type={type} linked={linked} onLink={linkAll} />
                <div />
                <BoxField side="left" type={type} linked={linked} onLink={linkAll} />
                <button
                    type="button"
                    onClick={() => setLinked((v) => !v)}
                    className={cn(
                        'text-micro mx-1 h-5 w-5 rounded font-medium transition-colors duration-150',
                        linked
                            ? 'bg-foreground/12 text-foreground-primary'
                            : 'bg-foreground/5 text-foreground-tertiary hover:bg-foreground/10 hover:text-foreground-secondary',
                    )}
                    aria-label={linked ? 'Unlink sides' : 'Link sides'}
                    title={linked ? 'Unlink sides' : 'Link all four sides'}
                >
                    {linked ? '=' : '+'}
                </button>
                <BoxField side="right" type={type} linked={linked} onLink={linkAll} />
                <div />
                <BoxField side="bottom" type={type} linked={linked} onLink={linkAll} />
                <div />
            </div>
        </div>
    );
}

/**
 * Spacing section — replaces the eight independent dimension inputs with a
 * pair of nested box-model widgets (margin + padding) that genuinely link
 * all four sides together when the link toggle is on.
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
