'use client';

import { cn } from '@weblab/ui/utils';

import { IconChain } from './glyphs';

export interface LinkAspectButtonProps {
    locked: boolean;
    onToggle: () => void;
    className?: string;
}

/**
 * 28×30 chain-icon button that toggles aspect-ratio locking between
 * the W and H inputs in the Size section. Active state uses the v4
 * muted-grey look so it reads as a system-level toggle (not branded).
 */
export function LinkAspectButton({ locked, onToggle, className }: LinkAspectButtonProps) {
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-pressed={locked}
            aria-label={locked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
            title={locked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
            className={cn(
                'inline-flex h-[26px] w-[28px] cursor-pointer items-center justify-center rounded-[6px] transition-colors outline-none',
                locked
                    ? 'bg-background-active text-foreground-primary shadow-sm dark:bg-[#262626]'
                    : 'text-foreground-tertiary hover:bg-background-secondary hover:text-foreground-primary dark:hover:bg-[#2F2F2F]',
                'focus-visible:ring-foreground-brand/30 focus-visible:ring-[3px]',
                className,
            )}
        >
            <IconChain size={13} />
        </button>
    );
}
