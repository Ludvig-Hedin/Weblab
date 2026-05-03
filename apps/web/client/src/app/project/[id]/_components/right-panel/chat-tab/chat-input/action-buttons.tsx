import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

export const ActionButtons = ({
    disabled = false,
    handleImageEvent,
    handleScreenshot,
}: {
    disabled?: boolean;
    handleImageEvent: (file: File, fileName: string) => Promise<void>;
    handleScreenshot: () => Promise<void>;
}) => {
    const handleOpenFileDialog = (e: React.MouseEvent) => {
        e.preventDefault();
        const inputElement = document.createElement('input');
        inputElement.type = 'file';
        inputElement.accept = 'image/*';
        inputElement.onchange = async () => {
            if (inputElement.files && inputElement.files.length > 0) {
                const file = inputElement.files[0];
                if (!file) return;
                await handleImageEvent(file, file.name);
            }
        };
        inputElement.click();
    };

    return (
        <DropdownMenu>
            <Tooltip>
                <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant={'ghost'}
                            size={'icon'}
                            className="h-7 w-7 text-foreground-tertiary group hover:bg-transparent cursor-pointer"
                            disabled={disabled}
                            onMouseDown={(e) => e.currentTarget.blur()}
                        >
                            <Icons.Image
                                className={cn(
                                    'w-4 h-4',
                                    disabled
                                        ? 'text-foreground-tertiary'
                                        : 'group-hover:text-foreground',
                                )}
                            />
                        </Button>
                    </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipPortal>
                    <TooltipContent side="top" sideOffset={6} hideArrow>
                        {disabled ? 'Select an element to start' : 'Add Image or Screenshot'}
                    </TooltipContent>
                </TooltipPortal>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={handleOpenFileDialog} disabled={disabled}>
                    <Icons.Upload className="mr-2 h-4 w-4" />
                    Upload Image
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void handleScreenshot()} disabled={disabled}>
                    <Icons.Laptop className="mr-2 h-4 w-4" />
                    Add Screenshot
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
