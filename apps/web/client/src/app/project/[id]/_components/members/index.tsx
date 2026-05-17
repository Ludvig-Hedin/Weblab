'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@weblab/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';

import { useProjectCapabilitiesContext } from '@/hooks/use-project-capabilities-context';
import { MembersContent } from './members-content';

interface MembersProps {
    onPopoverOpenChange?: (isOpen: boolean) => void;
}

export const Members = ({ onPopoverOpenChange }: MembersProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const { canInvite, canManageAccess, isLoading: capsLoading } = useProjectCapabilitiesContext();
    // Viewer / reviewer / unrelated workspace member: hide the invite trigger
    // entirely. Managers AND workspace owners/admins (recovery) keep access.
    if (!capsLoading && !canInvite && !canManageAccess) {
        return null;
    }

    const handleOpenChange = (open: boolean) => {
        setIsOpen(open);
        onPopoverOpenChange?.(open);
    };

    return (
        <Popover open={isOpen} onOpenChange={handleOpenChange}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            size="icon"
                            className="hover:border-border bg-background-secondary hover:bg-background-secondary/80 text-foreground-secondary hover:text-foreground-primary size-8 rounded-full"
                        >
                            <Icons.Plus className="size-4" />
                        </Button>
                    </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="z-50 mt-1" hideArrow>
                    <p>Invite team members</p>
                </TooltipContent>
            </Tooltip>
            <PopoverContent className="w-96 p-0" side="bottom" align="center" sideOffset={4}>
                <MembersContent />
            </PopoverContent>
        </Popover>
    );
};
