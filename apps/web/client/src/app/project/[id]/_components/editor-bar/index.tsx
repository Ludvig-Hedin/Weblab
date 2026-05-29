'use client';

import { observer } from 'mobx-react-lite';
import { motion } from 'motion/react';

import type { DomElement } from '@weblab/models';
import { EditorMode } from '@weblab/models';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';
import { DivSelected } from './div-selected';
import { FrameSelected } from './frame-selected';
import { DropdownManagerProvider } from './hooks/use-dropdown-manager';
import { ImgSelected } from './img-selected';
import { TextSelected } from './text-selected';

enum TAG_CATEGORIES {
    TEXT = 'text',
    DIV = 'div',
    IMG = 'img',
    VIDEO = 'video',
}

const TAG_TYPES: Record<TAG_CATEGORIES, string[]> = {
    [TAG_CATEGORIES.TEXT]: [
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'p',
        'span',
        'a',
        'strong',
        'b',
        'em',
        'i',
        'mark',
        'code',
        'small',
        'blockquote',
        'pre',
        'time',
        'sub',
        'sup',
        'del',
        'ins',
        'u',
        'abbr',
        'cite',
        'q',
    ],
    [TAG_CATEGORIES.DIV]: ['div'],
    [TAG_CATEGORIES.IMG]: ['img'],
    // TODO: Add video tag support (dispatch falls through to DivSelected)
    [TAG_CATEGORIES.VIDEO]: [],
} as const;

const getSelectedTag = (selected: DomElement[]): TAG_CATEGORIES => {
    if (selected.length === 0) {
        return TAG_CATEGORIES.DIV;
    }
    const tag = selected[0]?.tagName;
    if (!tag) {
        return TAG_CATEGORIES.DIV;
    }
    for (const [key, value] of Object.entries(TAG_TYPES)) {
        if (value.includes(tag.toLowerCase())) {
            return key as TAG_CATEGORIES;
        }
    }
    return TAG_CATEGORIES.DIV;
};

export const EditorBar = observer(({ availableWidth }: { availableWidth?: number }) => {
    const editorEngine = useEditorEngine();
    const selectedElement = editorEngine.elements.selected[0];
    const selectedTag = selectedElement ? getSelectedTag(editorEngine.elements.selected) : null;
    const selectedFrame = editorEngine.frames.selected?.[0];
    const windowSelected = selectedFrame && !selectedElement;

    const getTopBar = () => {
        if (windowSelected) {
            return <FrameSelected availableWidth={availableWidth} />;
        }
        if (selectedTag === TAG_CATEGORIES.TEXT) {
            return <TextSelected availableWidth={availableWidth} />;
        }
        if (selectedTag === TAG_CATEGORIES.IMG) {
            return <ImgSelected availableWidth={availableWidth} />;
        }
        return <DivSelected availableWidth={availableWidth} />;
    };

    if (!selectedElement && !selectedFrame) {
        return null;
    }

    // Frame/window toolbar (device picker, theme, rotate, duplicate, delete) is
    // hidden per request. The device presets it exposed now also live in the
    // Preview device selector. Element styling toolbars (text/img/div) still
    // render below. getTopBar() keeps the <FrameSelected /> wiring intact;
    // remove this guard to restore the floating frame toolbar.
    if (windowSelected) {
        return null;
    }

    return (
        <DropdownManagerProvider>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className={cn(
                    'border-border bg-background-primary z-50 flex flex-col overflow-hidden rounded-xl border p-1 shadow-xl',
                    editorEngine.state.editorMode !== EditorMode.DESIGN &&
                        !windowSelected &&
                        'hidden',
                )}
                transition={{
                    type: 'spring',
                    bounce: 0.1,
                    duration: 0.4,
                    stiffness: 200,
                    damping: 25,
                }}
            >
                {getTopBar()}
            </motion.div>
        </DropdownManagerProvider>
    );
});
