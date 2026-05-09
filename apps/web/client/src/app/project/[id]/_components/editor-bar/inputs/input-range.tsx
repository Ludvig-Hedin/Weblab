import { useEffect, useMemo, useRef, useState } from 'react';
import { debounce } from 'lodash';

import type { Icons } from '@weblab/ui/icons';
import { UNITS } from '@weblab/constants';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';

import { OverrideAffordance } from './override-affordance';

interface InputRangeProps {
    value: number;
    icon?: keyof typeof Icons;
    unit?: string;
    min?: number;
    max?: number;
    step?: number;
    /**
     * CSS property this control edits. When set, the rendered input is wrapped
     * in an OverrideAffordance — a subtle blue background + alt-click to reset
     * the override at the active breakpoint.
     */
    cssProperty?: string;
    onChange?: (value: number) => void;
    onUnitChange?: (unit: string) => void;
}

export const InputRange = ({
    value,
    icon,
    unit = 'px',
    min = 0,
    max = 500,
    step = 1,
    cssProperty,
    onChange,
    onUnitChange,
}: InputRangeProps) => {
    const [localValue, setLocalValue] = useState(String(value));
    const rangeRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    // Create debounced onChange handler
    const debouncedOnChange = useMemo(
        () =>
            debounce((newValue: number) => {
                onChange?.(newValue);
            }, 500),
        [onChange],
    );

    // Cleanup debounce on unmount
    useEffect(() => {
        return () => {
            debouncedOnChange.cancel();
        };
    }, [debouncedOnChange]);

    // Only update localValue when value prop changes and we're not currently editing
    useEffect(() => {
        if (!document.activeElement?.classList.contains('input-range-text')) {
            setLocalValue(String(value));
        }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setLocalValue(newValue);
    };

    const handleBlur = () => {
        const numValue = Number(localValue);
        if (!isNaN(numValue)) {
            setLocalValue(String(numValue));
            debouncedOnChange(numValue);
        } else {
            setLocalValue(String(value));
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const stepValue = e.shiftKey ? step * 10 : step;
            const direction = e.key === 'ArrowUp' ? 1 : -1;
            const currentValue = Number(localValue);
            if (!isNaN(currentValue)) {
                const newValue = currentValue + stepValue * direction;
                setLocalValue(String(newValue));
                debouncedOnChange(newValue);
            }
        } else if (e.key === 'Enter') {
            handleBlur();
        }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (rangeRef.current) {
            setIsDragging(true);
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (isDragging && rangeRef.current) {
            const rect = rangeRef.current.getBoundingClientRect();
            const percentage = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const newValue = Math.round((percentage * (max - min) + min) / step) * step;
            setLocalValue(String(newValue));
            debouncedOnChange(newValue);
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };

    const body = (
        <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2">
                <input
                    ref={rangeRef}
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={Number(localValue)}
                    onChange={(e) => {
                        const newValue = Number(e.target.value);
                        setLocalValue(String(newValue));
                        debouncedOnChange(newValue);
                    }}
                    onMouseDown={handleMouseDown}
                    className="bg-background-tertiary/50 [&::-webkit-slider-runnable-track]:bg-background-tertiary/50 [&::-moz-range-track]:bg-background-tertiary/50 [&::-webkit-slider-thumb]:bg-foreground hover:[&::-webkit-slider-thumb]:bg-foreground/90 [&::-moz-range-thumb]:bg-foreground hover:[&::-moz-range-thumb]:bg-foreground/90 [&::-ms-thumb]:bg-foreground hover:[&::-ms-thumb]:bg-foreground/90 relative h-3 flex-1 cursor-pointer appearance-none rounded-full [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 active:[&::-moz-range-thumb]:cursor-grabbing [&::-moz-range-track]:h-3 [&::-moz-range-track]:rounded-full [&::-ms-thumb]:h-4 [&::-ms-thumb]:w-4 [&::-ms-thumb]:cursor-grab [&::-ms-thumb]:appearance-none [&::-ms-thumb]:rounded-full active:[&::-ms-thumb]:cursor-grabbing [&::-webkit-slider-runnable-track]:h-3 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-thumb]:mt-[-2px] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full active:[&::-webkit-slider-thumb]:cursor-grabbing"
                />
                <div className="bg-background-tertiary/50 flex h-[36px] items-center justify-between rounded-full px-3">
                    <input
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*\.?[0-9]*"
                        value={localValue}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        onKeyDown={handleKeyDown}
                        className="text-foreground input-range-text text-small max-w-[40px] min-w-[40px] bg-transparent uppercase focus:outline-none"
                    />

                    <DropdownMenu modal={false}>
                        <DropdownMenuTrigger className="text-muted-foreground cursor-pointer text-[12px] focus:outline-none">
                            {unit === 'px' ? '' : unit}
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-[64px] min-w-0">
                            {UNITS.map((unitOption: string) => (
                                <DropdownMenuItem
                                    key={unitOption}
                                    onClick={() => onUnitChange?.(unitOption)}
                                    className="px-2 text-center text-[12px]"
                                >
                                    {unitOption.toUpperCase()}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </div>
    );

    return cssProperty ? (
        <OverrideAffordance property={cssProperty}>{body}</OverrideAffordance>
    ) : (
        body
    );
};
