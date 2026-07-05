'use client';

import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Input } from '@weblab/ui/input';

import { useEditorEngine } from '@/components/store/editor';
import { useDropdownControl } from '../hooks/use-dropdown-manager';
import { HoverOnlyTooltip } from '../hover-tooltip';
import { ToolbarButton } from '../toolbar-button';

const OPACITY_PRESETS = [100, 80, 75, 50, 25, 10, 0];

const useOpacityControl = () => {
    const editorEngine = useEditorEngine();
    const [opacity, setOpacity] = useState(100);

    // Update local state when selected element changes
    useEffect(() => {
        const selectedElements = editorEngine.elements.selected;
        if (selectedElements.length > 0 && selectedElements[0]) {
            const element = selectedElements[0];
            const currentOpacity = element.styles?.defined?.opacity;
            // Convert opacity from decimal to percentage (e.g., 0.5 -> 50)
            const opacityPercentage =
                currentOpacity !== undefined && currentOpacity !== null
                    ? Math.round(parseFloat(currentOpacity) * 100)
                    : 100;
            setOpacity(opacityPercentage);
        } else {
            setOpacity(100);
        }
    }, [editorEngine.elements.selected]);

    // Commit a final percentage (0-100) to source as ONE undoable style action.
    // Used by presets and by the input's blur/Enter commit — never per keystroke.
    const handleOpacityChange = (value: number) => {
        const clamped = Math.min(100, Math.max(0, value));
        setOpacity(clamped);
        const opacityDecimal = clamped / 100;
        const action = editorEngine.style.getUpdateStyleAction({
            opacity: opacityDecimal.toString(),
        });
        void editorEngine.action.updateStyle(action);
    };

    return { opacity, handleOpacityChange };
};

export const Opacity = observer(() => {
    const t = useTranslations('editor.editorBar');
    const { opacity, handleOpacityChange } = useOpacityControl();
    const inputRef = useRef<HTMLInputElement>(null);
    // Local draft so clearing the field to retype doesn't instantly commit
    // opacity 0 to source (and snap the input back to "0"). The committed
    // `opacity` seeds the draft; edits stay local until blur/Enter.
    const [draft, setDraft] = useState<string>(String(opacity));

    // Re-seed the draft from the committed value only while the field is not
    // focused, so incoming selection changes don't stomp an in-progress edit.
    useEffect(() => {
        if (document.activeElement !== inputRef.current) {
            setDraft(String(opacity));
        }
    }, [opacity]);

    const { isOpen, onOpenChange } = useDropdownControl({
        id: 'opacity-dropdown',
    });

    // Hold the raw text as a draft; do NOT commit per keystroke. Empty/NaN is
    // kept as a draft (not coerced to 0) so the element doesn't flash fully
    // transparent while the user is mid-edit.
    const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setDraft(e.target.value);
    };

    // Commit on blur/Enter: parse, clamp, and write once. Invalid/empty drafts
    // revert to the last committed value instead of committing 0.
    const commitDraft = () => {
        const parsed = parseInt(draft, 10);
        if (isNaN(parsed)) {
            setDraft(String(opacity));
            return;
        }
        handleOpacityChange(parsed);
        setDraft(String(Math.min(100, Math.max(0, parsed))));
    };

    const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            commitDraft();
            inputRef.current?.blur();
        }
    };

    const handleInputAreaClick = () => {
        onOpenChange(true);
        inputRef.current?.focus();
    };

    return (
        <DropdownMenu open={isOpen} onOpenChange={onOpenChange} modal={false}>
            <HoverOnlyTooltip
                content={t('layerOpacity')}
                side="bottom"
                className="mt-1"
                hideArrow
                disabled={isOpen}
            >
                <DropdownMenuTrigger asChild>
                    <ToolbarButton
                        isOpen={isOpen}
                        className="group flex items-center gap-1"
                        onClick={handleInputAreaClick}
                    >
                        <Input
                            ref={inputRef}
                            type="number"
                            min={0}
                            max={100}
                            data-state={isOpen ? 'open' : 'closed'}
                            value={draft}
                            onChange={onInputChange}
                            onBlur={commitDraft}
                            onKeyDown={onInputKeyDown}
                            onClick={(e) => e.stopPropagation()}
                            className="data-[state=open]:text-foreground text-small focus:text-foreground-primary group-hover:text-foreground-primary text-muted-foreground !hide-spin-buttons no-focus-ring w-8 [appearance:textfield] border-none !bg-transparent px-1 text-left transition-colors duration-150 focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none"
                            aria-label={t('opacityPercentage')}
                        />
                        <span
                            onClick={(e) => e.stopPropagation()}
                            className="text-muted-foreground text-mini bg-transparent pr-2"
                        >
                            %
                        </span>
                    </ToolbarButton>
                </DropdownMenuTrigger>
            </HoverOnlyTooltip>
            <DropdownMenuContent
                align="center"
                className="text-foreground-tertiary mt-1 w-[70px] min-w-[40px] rounded-lg p-1"
            >
                {OPACITY_PRESETS.map((preset) => (
                    <DropdownMenuItem
                        key={preset}
                        onClick={() => handleOpacityChange(preset)}
                        className={`text-foreground-tertiary data-[highlighted]:bg-background-tertiary/10 border-border/0 data-[highlighted]:border-border text-small data-[highlighted]:text-foreground-primary cursor-pointer justify-center rounded-md border px-2 py-1 text-left ${
                            preset === opacity
                                ? 'border-border text-foreground-primary hover:bg-background-primary border bg-transparent'
                                : ''
                        }`}
                    >
                        {preset}%
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
});
