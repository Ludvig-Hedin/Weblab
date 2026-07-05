'use client';

import { UNITS } from '@weblab/constants';
import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';

import { useInputControl } from '../hooks/use-input-control';

const OPTION_OVERRIDES: Record<string, string | undefined> = {
    Fit: 'Hug',
    Relative: 'Rel',
};

interface InputDropdownProps {
    value: number;
    unit?: string;
    dropdownValue: string;
    dropdownOptions?: string[];
    /** Accessible name for the numeric field (e.g. "Width", "Min width"). */
    label?: string;
    /** Clamp bounds for the numeric value (e.g. min 0 for dimensions). */
    min?: number;
    max?: number;
    onChange?: (value: number) => void;
    onDropdownChange?: (value: string) => void;
    onUnitChange?: (value: string) => void;
}

export const InputDropdown = ({
    value,
    unit = 'px',
    dropdownValue = 'Hug',
    dropdownOptions = ['Hug'],
    label,
    min,
    max,
    onChange,
    onDropdownChange,
    onUnitChange,
}: InputDropdownProps) => {
    const { localValue, handleKeyDown, handleChange, handleBlur, inputRef } = useInputControl(
        value,
        onChange,
        {
            min,
            max,
        },
    );

    return (
        <div className="flex items-center">
            <div className="bg-background-tertiary/50 flex h-[36px] min-w-[72px] flex-1 items-center justify-between rounded-l-md px-2.5">
                <input
                    ref={inputRef}
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]*\.?[0-9]*"
                    value={localValue}
                    onChange={(e) => handleChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={handleBlur}
                    className="text-foreground text-small focus-visible:ring-border w-[40px] rounded-sm bg-transparent text-left focus:outline-none focus-visible:ring-1"
                    aria-label={label ?? 'Value input'}
                />
                <DropdownMenu modal={false}>
                    <DropdownMenuTrigger
                        aria-label={label ? `${label} unit` : 'Unit'}
                        className="text-muted-foreground hover:text-foreground text-small focus-visible:ring-border cursor-pointer rounded-sm transition-colors focus:outline-none focus-visible:ring-1"
                    >
                        {unit}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-[64px] min-w-0">
                        {UNITS.map((unitOption: string) => (
                            <DropdownMenuItem
                                key={unitOption}
                                onClick={() => onUnitChange?.(unitOption)}
                                className="hover:bg-background-tertiary/70 hover:text-foreground text-small flex h-9 w-full items-center justify-center px-2 text-center transition-colors"
                            >
                                {unitOption.toUpperCase()}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        className="bg-background-tertiary/50 hover:bg-background-tertiary/70 hover:text-foreground ml-[1px] flex h-[36px] w-[84px] cursor-pointer items-center justify-between rounded-l-none rounded-r-md px-2.5 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <span className="text-muted-foreground group-hover:text-foreground text-small transition-colors">
                                {OPTION_OVERRIDES[dropdownValue] ?? dropdownValue}
                            </span>
                        </div>
                        <Icons.ChevronDown className="text-muted-foreground group-hover:text-foreground h-4 min-h-4 w-4 min-w-4 transition-colors" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="start"
                    className="-mt-[1px] min-w-[100px] rounded-lg p-1"
                >
                    {dropdownOptions.map((option) => (
                        <DropdownMenuItem
                            key={option}
                            onClick={() => onDropdownChange?.(option)}
                            className="text-muted-foreground hover:bg-background-tertiary/70 hover:text-foreground border-border/0 data-[highlighted]:border-border text-small flex cursor-pointer items-center rounded-md border px-2 py-1.5 transition-colors"
                        >
                            {OPTION_OVERRIDES[option] ?? option}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
};
