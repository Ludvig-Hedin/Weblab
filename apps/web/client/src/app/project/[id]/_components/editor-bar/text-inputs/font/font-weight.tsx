'use client';

import { observer } from 'mobx-react-lite';

import { VARIANTS } from '@weblab/fonts';
import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { convertFontWeight } from '@weblab/utility';

import { useDropdownControl } from '../../hooks/use-dropdown-manager';
import { useTextControl } from '../../hooks/use-text-control';
import { HoverOnlyTooltip } from '../../hover-tooltip';
import { ToolbarButton } from '../../toolbar-button';

export const FontWeightSelector = observer(() => {
    const { handleFontWeightChange, textState } = useTextControl();
    const { isOpen, onOpenChange } = useDropdownControl({
        id: 'font-weight-dropdown',
    });

    return (
        <DropdownMenu open={isOpen} onOpenChange={onOpenChange} modal={false}>
            <HoverOnlyTooltip
                content="Font Weight"
                side="bottom"
                className="mt-1"
                hideArrow
                disabled={isOpen}
            >
                <DropdownMenuTrigger asChild>
                    <ToolbarButton
                        isOpen={isOpen}
                        className="flex w-24 items-center justify-start gap-2 px-3"
                    >
                        <span className="text-smallPlus">
                            {convertFontWeight(textState.fontWeight)}
                        </span>
                    </ToolbarButton>
                </DropdownMenuTrigger>
            </HoverOnlyTooltip>
            <DropdownMenuContent align="center" className="mt-1 min-w-[120px] rounded-lg p-1">
                {VARIANTS.map((weight) => (
                    <DropdownMenuItem
                        key={weight.value}
                        onClick={() => handleFontWeightChange(weight.value)}
                        className={`text-muted-foreground data-[highlighted]:bg-background-tertiary/10 border-border/0 data-[highlighted]:border-border data-[highlighted]:text-foreground hover:bg-background-tertiary/20 hover:text-foreground text-small flex cursor-pointer items-center justify-between rounded-md border px-2 py-1.5 transition-colors duration-150 ${
                            textState.fontWeight === weight.value
                                ? 'bg-background-tertiary/20 border-border text-foreground border'
                                : ''
                        }`}
                    >
                        {weight.name}
                        {textState.fontWeight === weight.value && (
                            <Icons.Check className="text-foreground-primary ml-2 h-4 w-4" />
                        )}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
});
