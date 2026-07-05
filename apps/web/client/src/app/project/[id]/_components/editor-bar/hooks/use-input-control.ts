import type { KeyboardEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { debounce } from 'lodash';

interface InputControlOptions {
    min?: number;
    max?: number;
}

export const useInputControl = (
    value: number,
    onChange?: (value: number) => void,
    options?: InputControlOptions,
) => {
    const { min, max } = options ?? {};
    const [localValue, setLocalValue] = useState<string>(String(value));
    // Consumers attach this to their <input>. The sync effect below skips
    // overwriting the draft while the field is focused.
    const inputRef = useRef<HTMLInputElement>(null);

    // Sync the draft from the committed value ONLY when the field isn't
    // focused. Without the focus guard, the debounced commit's round-trip
    // (style.update → recompute → new `value` prop) stomps the user's
    // in-progress text mid-typing — type "1", pause >500ms, type "5" and the
    // field snaps back to "1", losing the "5". Mirrors input-range.tsx /
    // text-field.tsx / @weblab/ui number-input.
    useEffect(() => {
        if (document.activeElement !== inputRef.current) {
            setLocalValue(String(value));
        }
    }, [value]);

    const clamp = (n: number): number => {
        let result = n;
        if (min !== undefined) result = Math.max(min, result);
        if (max !== undefined) result = Math.min(max, result);
        return result;
    };

    const handleIncrement = (step: number) => {
        const currentValue = Number(localValue);
        if (!isNaN(currentValue)) {
            const newValue = clamp(currentValue + step);
            setLocalValue(String(newValue));
            debouncedOnChange(newValue);
        }
    };

    const handleChange = (inputValue: string) => {
        setLocalValue(inputValue);
        // Ignore empty / non-numeric while typing — don't commit a stray 0.
        // `handleBlur` reverts anything still invalid when focus leaves.
        if (inputValue.trim() === '') return;
        const numValue = Number(inputValue);
        if (!isNaN(numValue)) {
            debouncedOnChange(clamp(numValue));
        }
    };

    // Reverts free-text that isn't a number (e.g. "auto", "12px") back to the
    // last committed value, and snaps an out-of-range number into range, so the
    // field never sits showing an uncommitted/invalid value.
    const handleBlur = () => {
        const numValue = Number(localValue);
        if (localValue.trim() === '' || isNaN(numValue)) {
            // Cancel any debounce armed by earlier keystrokes — without this,
            // "type 12 → clear → blur" reverts the display but still commits
            // 12 when the 500ms timer fires.
            debouncedOnChange.cancel();
            setLocalValue(String(value));
            return;
        }
        const clamped = clamp(numValue);
        if (clamped !== numValue) {
            setLocalValue(String(clamped));
            debouncedOnChange(clamped);
        }
        // Commit any pending value now. These inputs often live inside
        // dropdown content that unmounts right after blur — the unmount
        // cleanup CANCELS the debounce, so without a flush an edit made
        // <500ms before closing the dropdown is silently dropped.
        debouncedOnChange.flush();
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const step = e.shiftKey ? 10 : 1;
            const direction = e.key === 'ArrowUp' ? 1 : -1;
            handleIncrement(step * direction);
        }
    };

    const debouncedOnChange = useMemo(
        () =>
            debounce((newValue: number) => {
                onChange?.(newValue);
            }, 500),
        [onChange],
    );

    useEffect(() => {
        return () => {
            debouncedOnChange.cancel();
        };
    }, [debouncedOnChange]);

    return { localValue, handleKeyDown, handleChange, handleBlur, inputRef };
};
