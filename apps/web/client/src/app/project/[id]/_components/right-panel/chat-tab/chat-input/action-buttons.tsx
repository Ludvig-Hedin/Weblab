import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import { transKeys } from '@/i18n/keys';

export const ActionButtons = ({
    disabled = false,
    processing = false,
    handleImageEvent,
}: {
    disabled?: boolean;
    processing?: boolean;
    handleImageEvent: (file: File, fileName: string) => Promise<void>;
}) => {
    const t = useTranslations();
    const isDisabled = disabled || processing;
    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        const inputElement = document.createElement('input');
        inputElement.type = 'file';
        inputElement.accept = 'image/*';
        inputElement.onchange = async () => {
            const file = inputElement.files?.[0];
            if (file) await handleImageEvent(file, file.name);
        };
        inputElement.click();
    };

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant={'ghost'}
                    size={'icon'}
                    aria-label={t(transKeys.editor.panels.edit.tabs.chat.attachImage)}
                    className="text-foreground-tertiary group h-8 w-8 cursor-pointer hover:bg-transparent"
                    disabled={isDisabled}
                    onClick={handleClick}
                    onMouseDown={(e) => e.currentTarget.blur()}
                >
                    {processing ? (
                        <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                    ) : (
                        <Icons.Image
                            className={cn('h-4 w-4', !isDisabled && 'group-hover:text-foreground')}
                        />
                    )}
                </Button>
            </TooltipTrigger>
            <TooltipPortal>
                <TooltipContent side="top" sideOffset={6} hideArrow>
                    {t(transKeys.editor.panels.edit.tabs.chat.attachImage)}
                </TooltipContent>
            </TooltipPortal>
        </Tooltip>
    );
};
