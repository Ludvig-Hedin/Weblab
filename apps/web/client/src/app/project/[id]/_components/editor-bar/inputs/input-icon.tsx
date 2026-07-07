import { useState } from 'react';

import { UNITS } from '@weblab/constants';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';

import { useInputControl } from '../hooks/use-input-control';

type IconType =
    | 'LeftSide'
    | 'TopSide'
    | 'RightSide'
    | 'BottomSide'
    | 'CornerTopLeft'
    | 'CornerTopRight'
    | 'CornerBottomLeft'
    | 'CornerBottomRight';

interface InputIconProps {
    value: number;
    unit?: string;
    icon?: IconType;
    onChange?: (value: number) => void;
    onUnitChange?: (unit: string) => void;
}

export const InputIcon = ({ value, unit = 'px', icon, onChange, onUnitChange }: InputIconProps) => {
    const [unitValue, setUnitValue] = useState(unit);
    const { localValue, handleKeyDown, handleChange, handleBlur, inputRef } = useInputControl(
        value,
        onChange,
    );

    const IconComponent = icon ? Icons[icon] : null;

    return (
        <div className="flex items-center gap-2">
            {IconComponent && (
                <IconComponent className="text-muted-foreground h-5 min-h-5 w-5 min-w-5" />
            )}
            <div className="bg-background-tertiary/50 flex h-[36px] w-full items-center justify-between rounded-full px-3">
                <input
                    ref={inputRef}
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]*\.?[0-9]*"
                    value={localValue}
                    onChange={(e) => handleChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    // Flush the pending debounce on focus-out. Without this, a
                    // per-side value typed <500ms before the dropdown closes is
                    // dropped: Radix unmounts the dropdown content, whose
                    // cleanup cancels the debounce. Mirrors InputDropdown.
                    onBlur={handleBlur}
                    className="text-foreground hover:text-foreground text-small w-[40px] bg-transparent uppercase focus:outline-none"
                />

                <DropdownMenu modal={false}>
                    {/* Always render the unit — hiding 'px' left a zero-width,
                        invisible trigger with no way to discover the menu. */}
                    <DropdownMenuTrigger className="text-muted-foreground hover:text-foreground cursor-pointer text-[12px] uppercase transition-colors focus:outline-none">
                        {unitValue}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-[64px] min-w-0">
                        {UNITS.map((unitOption) => (
                            <DropdownMenuItem
                                key={unitOption}
                                onClick={() => {
                                    onUnitChange?.(unitOption);
                                    setUnitValue(unitOption);
                                }}
                                className="hover:bg-background-tertiary/70 hover:text-foreground px-2 text-center text-[12px] transition-colors"
                            >
                                {unitOption}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
};
