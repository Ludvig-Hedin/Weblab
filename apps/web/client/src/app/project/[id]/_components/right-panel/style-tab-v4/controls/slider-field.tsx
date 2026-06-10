'use client';

import { Slider } from '@weblab/ui/slider';
import { cn } from '@weblab/ui/utils';

import { INLINE_LABEL_CLASSES } from './constants';

export interface SliderFieldProps {
    /** Current value as a string (we keep all values as strings to match useStyleValue). */
    value: string;
    onCommit: (value: string) => void;
    min?: number;
    max?: number;
    step?: number;
    /** Suffix shown next to the numeric readout, e.g. "%". */
    suffix?: string;
    /** When true, the displayed value is multiplied by 100 (for 0..1 opacity-style props). */
    asPercent?: boolean;
    disabled?: boolean;
}

function parseNumeric(raw: string, fallback: number): number {
    if (!raw) return fallback;
    const num = Number.parseFloat(raw);
    return Number.isNaN(num) ? fallback : num;
}

/**
 * Slider tied to a string-valued style property (opacity, perspective,
 * rotate, blur). v4 grammar: 26px row, readout in the inline-label tone
 * with tabular figures so digits don't shift the layout.
 */
export function SliderField({
    value,
    onCommit,
    min = 0,
    max = 100,
    step = 1,
    suffix,
    asPercent,
    disabled,
}: SliderFieldProps) {
    const numeric = parseNumeric(value, min);
    const isPercentRatio = asPercent && numeric <= 1;
    const display = isPercentRatio ? Math.round(numeric * 100) : numeric;

    return (
        <div
            className={
                disabled
                    ? 'pointer-events-none flex h-[26px] items-center gap-2 opacity-50 select-none'
                    : 'flex h-[26px] items-center gap-2'
            }
        >
            <Slider
                min={min}
                max={max}
                step={step}
                disabled={disabled}
                value={[Math.min(Math.max(display, min), max)]}
                onValueChange={(values) => {
                    const next = values[0] ?? min;
                    if (isPercentRatio) {
                        onCommit(`${next / 100}`);
                    } else {
                        onCommit(`${next}`);
                    }
                }}
                className="flex-1"
            />
            <span className={cn(INLINE_LABEL_CLASSES, 'w-10 text-right tabular-nums')}>
                {Math.round(display)}
                {suffix ?? ''}
            </span>
        </div>
    );
}
