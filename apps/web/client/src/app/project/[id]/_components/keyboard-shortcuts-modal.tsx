'use client';

import { observer } from 'mobx-react-lite';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@weblab/ui/dialog';
import { HotkeyLabel } from '@weblab/ui/hotkey-label';

import { Hotkey } from '@/components/hotkey';
import { useEditorEngine } from '@/components/store/editor';

const HOTKEY_SECTIONS = [
    {
        title: 'Modes',
        hotkeys: [
            Hotkey.SELECT,
            Hotkey.CODE,
            Hotkey.PREVIEW,
            Hotkey.PAN,
            Hotkey.COMMENT,
            Hotkey.MODE_DESIGN,
            Hotkey.MODE_CODE,
            Hotkey.MODE_PREVIEW,
        ],
    },
    {
        title: 'Panels',
        hotkeys: [
            Hotkey.SIDEBAR_LAYERS,
            Hotkey.SIDEBAR_BRAND,
            Hotkey.SIDEBAR_PAGES,
            Hotkey.SIDEBAR_IMAGES,
            Hotkey.SIDEBAR_BRANCHES,
            Hotkey.TOGGLE_TERMINAL,
            Hotkey.SHOW_HOTKEYS,
        ],
    },
    {
        title: 'Insert',
        hotkeys: [
            Hotkey.OPEN_ELEMENT_PALETTE,
            Hotkey.INSERT_DIV_F,
            Hotkey.INSERT_DIV_D,
            Hotkey.INSERT_FLEX_DIV,
            Hotkey.INSERT_TEXT,
            Hotkey.INSERT_BUTTON,
        ],
    },
    {
        title: 'Canvas',
        hotkeys: [Hotkey.ZOOM_FIT, Hotkey.ZOOM_IN, Hotkey.ZOOM_OUT],
    },
    {
        title: 'Actions',
        hotkeys: [
            Hotkey.UNDO,
            Hotkey.REDO,
            Hotkey.COPY,
            Hotkey.PASTE,
            Hotkey.CUT,
            Hotkey.DUPLICATE,
            Hotkey.DELETE,
            Hotkey.ENTER,
            Hotkey.GROUP,
            Hotkey.WRAP_IN_DIV,
            Hotkey.UNGROUP,
        ],
    },
    {
        title: 'AI',
        hotkeys: [
            Hotkey.ADD_AI_CHAT,
            Hotkey.NEW_AI_CHAT,
            Hotkey.CHAT_MODE_TOGGLE,
            Hotkey.OPEN_MODEL_PICKER,
        ],
    },
] as const;

// Exported for use in the Shortcuts settings tab — same sections as string keys
export const SHORTCUT_SECTIONS: { title: string; keys: string[] }[] = [
    {
        title: 'Modes',
        keys: ['SELECT', 'CODE', 'PREVIEW', 'PAN', 'COMMENT', 'MODE_DESIGN', 'MODE_CODE', 'MODE_PREVIEW'],
    },
    {
        title: 'Panels',
        keys: ['SIDEBAR_LAYERS', 'SIDEBAR_BRAND', 'SIDEBAR_PAGES', 'SIDEBAR_IMAGES', 'SIDEBAR_BRANCHES', 'TOGGLE_TERMINAL', 'SHOW_HOTKEYS'],
    },
    {
        title: 'Insert',
        keys: ['OPEN_ELEMENT_PALETTE', 'INSERT_DIV_F', 'INSERT_DIV_D', 'INSERT_FLEX_DIV', 'INSERT_TEXT', 'INSERT_BUTTON'],
    },
    {
        title: 'Canvas',
        keys: ['ZOOM_FIT', 'ZOOM_IN', 'ZOOM_OUT'],
    },
    {
        title: 'Actions',
        keys: ['UNDO', 'REDO', 'COPY', 'PASTE', 'CUT', 'DUPLICATE', 'DELETE', 'ENTER', 'GROUP', 'WRAP_IN_DIV', 'UNGROUP'],
    },
    {
        title: 'AI',
        keys: ['ADD_AI_CHAT', 'NEW_AI_CHAT', 'CHAT_MODE_TOGGLE', 'OPEN_MODEL_PICKER'],
    },
];

export const KeyboardShortcutsModal = observer(() => {
    const editorEngine = useEditorEngine();

    return (
        <Dialog
            open={editorEngine.state.hotkeysOpen}
            onOpenChange={(open) => editorEngine.state.setHotkeysOpen(open)}
        >
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Keyboard shortcuts</DialogTitle>
                    <DialogDescription>
                        The fastest editor actions available in the project workspace.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 sm:grid-cols-2">
                    {HOTKEY_SECTIONS.map((section) => (
                        <div
                            key={section.title}
                            className="border-border/60 bg-background-secondary/40 rounded-lg border p-4"
                        >
                            <h3 className="text-foreground mb-3 text-sm font-medium">
                                {section.title}
                            </h3>
                            <div className="space-y-2">
                                {section.hotkeys.map((hotkey) => (
                                    <div
                                        key={`${section.title}-${hotkey.command}`}
                                        className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5"
                                    >
                                        <HotkeyLabel
                                            hotkey={hotkey}
                                            className="w-full justify-between"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
});
