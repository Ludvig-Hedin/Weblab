'use client';

import { Slider } from '@weblab/ui/slider';

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
}

function parseNumeric(raw: string, fallback: number): number {
    if (!raw) return fallback;
    const num = Number.parseFloat(raw);
    return Number.isNaN(num) ? fallback : num;
}

/**
 * Slider tied to a string-valued style property. Renders a draggable slider
 * plus a tiny numeric readout. Used for opacity, blur radius, etc.
 */
export function SliderField({
    value,
    onCommit,
    min = 0,
    max = 100,
    step = 1,
    suffix,
    asPercent,
}: SliderFieldProps) {
    const numeric = parseNumeric(value, min);
    const isPercentRatio = asPercent && numeric <= 1;
    const display = isPercentRatio ? Math.round(numeric * 100) : numeric;

    return (
        <div className="flex items-center gap-2">
            <Slider
                min={min}
                max={max}
                step={step}
                value={[Math.min(Math.max(display, min), max)]}
                onValueChange={(values) => {
                    const next = values[0] ?? min;
                    if (isPercentRatio) {
                        const ratio = next / 100;
                        onCommit(`${ratio}`);
                    } else {
                        onCommit(`${next}`);
                    }
                }}
                className="flex-1"
            />
            <span className="text-foreground-secondary text-mini w-10 text-right tabular-nums">
                {Math.round(display)}
                {suffix ?? ''}
            </span>
        </div>
    );
}
