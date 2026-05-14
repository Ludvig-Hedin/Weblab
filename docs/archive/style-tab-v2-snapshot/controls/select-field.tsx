'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import { cn } from '@weblab/ui/utils';

import { FIELD_BASE_CLASSES } from './constants';

export interface SelectFieldOption {
    value: string;
    label: string;
}

export interface SelectFieldProps {
    value: string;
    options: readonly SelectFieldOption[];
    onCommit: (value: string) => void;
    placeholder?: string;
    className?: string;
}

/**
 * Style panel select. Same canonical geometry as every other row editor —
 * see {@link FIELD_BASE_CLASSES}. `shadow-none` overrides the default
 * SelectTrigger shadow so the row reads flat like the rest of the panel.
 */
export function SelectField({
    value,
    options,
    onCommit,
    placeholder,
    className,
}: SelectFieldProps) {
    return (
        <Select value={value || undefined} onValueChange={onCommit}>
            <SelectTrigger className={cn(FIELD_BASE_CLASSES, 'shadow-none', className)}>
                <SelectValue placeholder={placeholder ?? '—'} />
            </SelectTrigger>
            <SelectContent className="max-w-[280px]">
                {options.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="text-mini">
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
