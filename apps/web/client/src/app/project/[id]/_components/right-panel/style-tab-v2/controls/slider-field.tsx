'use client';

import { useEffect, useRef } from 'react';

import { Slider } from '@weblab/ui/slider';

import { useEditorEngine } from '@/components/store/editor';

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
 *
 * Drags are wrapped in a history transaction: every tick still updates the
 * iframe (live preview via ActionManager.dispatch), but the AST source write
 * and the undo entry land ONCE on release (Radix `onValueCommit`). Without
 * the transaction, each pointer-move tick pushed a full undoable action and
 * queued a whole-file read→parse→regenerate→write on the write chain — a
 * single 0→100 opacity drag produced dozens of file writes and made undo
 * step back one tick at a time.
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
    const editorEngine = useEditorEngine();
    const inGesture = useRef(false);
    const numeric = parseNumeric(value, min);
    const isPercentRatio = asPercent && numeric <= 1;
    const display = isPercentRatio ? Math.round(numeric * 100) : numeric;

    const beginGesture = () => {
        if (inGesture.current) return;
        // `history` reaches into the active branch and throws when branch init
        // failed — degrade to per-tick commits rather than crash the panel.
        if (!editorEngine.branches.hasActiveBranch) return;
        editorEngine.history.startTransaction();
        inGesture.current = true;
    };

    const endGesture = () => {
        if (!inGesture.current) return;
        inGesture.current = false;
        if (editorEngine.branches.hasActiveBranch) {
            void editorEngine.history.commitTransaction();
        }
    };

    // If the control unmounts mid-drag (panel switch, selection change), the
    // open transaction would swallow every later edit's source write — commit
    // whatever the gesture produced so far.
    useEffect(() => {
        return () => {
            endGesture();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="flex items-center gap-2">
            <Slider
                min={min}
                max={max}
                step={step}
                value={[Math.min(Math.max(display, min), max)]}
                onValueChange={(values) => {
                    beginGesture();
                    const next = values[0] ?? min;
                    if (isPercentRatio) {
                        const ratio = next / 100;
                        onCommit(`${ratio}`);
                    } else {
                        onCommit(`${next}`);
                    }
                }}
                onValueCommit={() => {
                    endGesture();
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
