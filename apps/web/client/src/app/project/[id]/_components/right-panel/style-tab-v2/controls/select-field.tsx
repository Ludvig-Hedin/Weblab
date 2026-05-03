'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import { cn } from '@weblab/ui/utils';

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

export function SelectField({
    value,
    options,
    onCommit,
    placeholder,
    className,
}: SelectFieldProps) {
    return (
        <Select value={value || undefined} onValueChange={onCommit}>
            <SelectTrigger className={cn('h-7 text-xs', className)}>
                <SelectValue placeholder={placeholder ?? '—'} />
            </SelectTrigger>
            <SelectContent>
                {options.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="text-xs">
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
