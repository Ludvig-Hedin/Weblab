import { observer } from 'mobx-react-lite';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { EditorMode } from '@weblab/models';
import { HotkeyLabel } from '@weblab/ui/hotkey-label';
import { ToggleGroup, ToggleGroupItem } from '@weblab/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import { Hotkey } from '@/components/hotkey';
import { useEditorEngine } from '@/components/store/editor';
import { transKeys } from '@/i18n/keys';

// All four editor views surfaced inline as the primary mode switcher.
// Previously Preview + CMS lived as separate icon buttons elsewhere on the
// top bar; promoting them here makes the four modes a single, consistent
// control. Inactive items use a muted foreground so the active one reads
// clearly without colour beyond the underline indicator.
const MODE_TOGGLE_ITEMS: {
    mode: EditorMode;
    hotkey: Hotkey;
}[] = [
    { mode: EditorMode.DESIGN, hotkey: Hotkey.SELECT },
    { mode: EditorMode.CODE, hotkey: Hotkey.CODE },
    { mode: EditorMode.PREVIEW, hotkey: Hotkey.PREVIEW },
    { mode: EditorMode.CMS, hotkey: Hotkey.MODE_CMS },
];

export const ModeToggle = observer(() => {
    const t = useTranslations();
    const editorEngine = useEditorEngine();
    const mode = editorEngine.state.editorMode;

    const activeIndex = MODE_TOGGLE_ITEMS.findIndex((item) => item.mode === mode);
    const itemWidthPercent = 100 / MODE_TOGGLE_ITEMS.length;
    // Slide indicator under the active mode. When the mode isn't tracked
    // (e.g. PAN), fall back to position 0 so we don't render a stranded bar.
    const xPercent = activeIndex >= 0 ? activeIndex * itemWidthPercent : 0;

    return (
        <div className="relative">
            <ToggleGroup
                className="mt-1 h-7 font-normal"
                type="single"
                value={mode}
                onValueChange={(value) => {
                    if (value) {
                        editorEngine.state.setEditorMode(value as EditorMode);
                    }
                }}
            >
                {MODE_TOGGLE_ITEMS.map((item) => (
                    <Tooltip key={item.mode}>
                        <TooltipTrigger asChild>
                            <ToggleGroupItem
                                value={item.mode}
                                aria-label={item.hotkey.description}
                                // Preserve the onboarding-tour anchor that
                                // previously lived on the play-icon button so
                                // first-run tooltips still point at Preview.
                                data-tour={
                                    item.mode === EditorMode.PREVIEW
                                        ? 'preview-button'
                                        : undefined
                                }
                                className={cn(
                                    'text-small cursor-pointer bg-transparent px-4 py-2 whitespace-nowrap transition-all duration-150 ease-in-out',
                                    mode === item.mode
                                        ? 'text-active hover:text-active text-small hover:bg-transparent'
                                        : 'text-foreground-tertiary hover:text-foreground-hover text-small hover:bg-transparent',
                                )}
                            >
                                {t(
                                    transKeys.editor.modes[
                                        item.mode.toLowerCase() as keyof typeof transKeys.editor.modes
                                    ].name,
                                )}
                            </ToggleGroupItem>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="mt-0" hideArrow>
                            <HotkeyLabel hotkey={item.hotkey} />
                        </TooltipContent>
                    </Tooltip>
                ))}
            </ToggleGroup>
            <motion.div
                className="bg-foreground absolute -top-1 h-0.5"
                initial={false}
                animate={{
                    width: `${itemWidthPercent}%`,
                    x: `${xPercent}%`,
                }}
                transition={{
                    type: 'tween',
                    ease: 'easeInOut',
                    duration: 0.2,
                }}
            />
        </div>
    );
});
