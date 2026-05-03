import { useEffect, useState } from 'react';

import { SystemTheme } from '@weblab/models/assets';
import { Icons } from '@weblab/ui/icons';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@weblab/ui/select';
import { toast } from '@weblab/ui/sonner';

import { type FrameData } from '@/components/store/editor/frames';
import { HoverOnlyTooltip } from '../hover-tooltip';

export function ThemeGroup({ frameData }: { frameData: FrameData }) {
    const [theme, setTheme] = useState<SystemTheme>(SystemTheme.SYSTEM);
    const [isOpen, setIsOpen] = useState(false);
    const themeOptions = [
        { value: SystemTheme.SYSTEM, label: 'System', icon: Icons.Laptop },
        { value: SystemTheme.DARK, label: 'Dark', icon: Icons.Moon },
        { value: SystemTheme.LIGHT, label: 'Light', icon: Icons.Sun },
    ];

    useEffect(() => {
        const getTheme = async () => {
            if (!frameData?.view) {
                console.error('No frame view found');
                return;
            }

            if (typeof frameData.view.getTheme !== 'function') {
                console.warn('Frame view getTheme method not available yet');
                return;
            }

            try {
                const theme = await frameData.view.getTheme();
                if (theme) {
                    setTheme(theme);
                }
            } catch (error) {
                console.error('Error getting theme:', error);
            }
        };
        void getTheme();
    }, [frameData]);

    async function changeTheme(newTheme: SystemTheme) {
        const previousTheme = theme;
        setTheme(newTheme);
        const success = await frameData.view?.setTheme(newTheme);
        if (!success) {
            toast.error('Failed to change theme');
            setTheme(previousTheme);
        }
    }

    const selectedOption = themeOptions.find((option) => option.value === theme) ?? {
        value: SystemTheme.SYSTEM,
        label: 'System',
        icon: Icons.Laptop,
    };
    const SelectedIcon = selectedOption.icon;

    return (
        <Select
            value={theme}
            onValueChange={(value) => void changeTheme(value as SystemTheme)}
            onOpenChange={setIsOpen}
        >
            <HoverOnlyTooltip content="Theme" side="bottom" sideOffset={10} disabled={isOpen}>
                <SelectTrigger
                    size="sm"
                    className="group border-border/0 text-muted-foreground hover:border-border hover:bg-background-tertiary/20 min-w-[112px] rounded-lg border hover:text-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                >
                    <SelectedIcon className="group-hover:text-foreground-primary h-3.5 min-h-3.5 w-3.5 min-w-3.5" />
                    <span className="text-smallPlus">{selectedOption.label}</span>
                </SelectTrigger>
            </HoverOnlyTooltip>
            <SelectContent className="bg-background-secondary rounded-md">
                {themeOptions.map((option) => {
                    const OptionIcon = option.icon;

                    return (
                        <SelectItem
                            key={option.value}
                            value={option.value}
                            className="cursor-pointer text-xs"
                        >
                            <OptionIcon className="text-foreground-onlook h-3.5 w-3.5" />
                            {option.label}
                        </SelectItem>
                    );
                })}
            </SelectContent>
        </Select>
    );
}
