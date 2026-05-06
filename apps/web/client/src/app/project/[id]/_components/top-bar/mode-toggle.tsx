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

const MODE_TOGGLE_ITEMS: {
    mode: EditorMode;
    hotkey: Hotkey;
}[] = [
    {
        mode: EditorMode.DESIGN,
        hotkey: Hotkey.SELECT,
    },
    {
        mode: EditorMode.CODE,
        hotkey: Hotkey.CODE,
    },
    {
        mode: EditorMode.PREVIEW,
        hotkey: Hotkey.PREVIEW,
    },
];

export const ModeToggle = observer(() => {
    const t = useTranslations();
    const editorEngine = useEditorEngine();
    const mode = editorEngine.state.editorMode;

    const getXPosition = () => {
        if (mode === EditorMode.PREVIEW) {
            return '200%';
        }
        if (mode === EditorMode.CODE) {
            return '100%';
        }
        return '0%';
    };

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
                                className={cn(
                                    'cursor-pointer bg-transparent px-4 py-2 text-sm whitespace-nowrap transition-all duration-150 ease-in-out',
                                    mode === item.mode
                                        ? 'text-active hover:text-active text-sm hover:bg-transparent'
                                        : 'text-foreground-secondary hover:text-foreground-hover text-sm hover:bg-transparent',
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
                    width: '33.333%',
                    x: getXPosition(),
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
