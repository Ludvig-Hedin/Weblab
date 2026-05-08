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
import { Kbd } from '@weblab/ui/kbd';

import { Hotkey } from '@/components/hotkey';
import { useEditorEngine } from '@/components/store/editor';

type ModalEntry =
    | { kind: 'single'; hotkey: Hotkey }
    | {
          kind: 'multi';
          description: string;
          hotkeys: readonly Hotkey[];
      };

const single = (hotkey: Hotkey): ModalEntry => ({ kind: 'single', hotkey });
const multi = (description: string, hotkeys: readonly Hotkey[]): ModalEntry => ({
    kind: 'multi',
    description,
    hotkeys,
});

// Canonical hotkey list. Aliases (INSERT_DIV_F, INSERT_DIV_D) are excluded —
// only the canonical entry per action is shown. The two `MODE_*` pairs
// (e.g. SELECT=v + MODE_DESIGN=mod+1) are merged into single rows so users
// see both bindings without two near-identical entries.
const HOTKEY_SECTIONS: { title: string; entries: ModalEntry[] }[] = [
    {
        title: 'Modes',
        entries: [
            multi('Design Mode', [Hotkey.SELECT, Hotkey.MODE_DESIGN]),
            multi('Code Mode', [Hotkey.CODE, Hotkey.MODE_CODE]),
            multi('Preview Mode', [Hotkey.PREVIEW, Hotkey.MODE_PREVIEW]),
            single(Hotkey.PAN),
            single(Hotkey.COMMENT),
            single(Hotkey.TOGGLE_COMMENTS),
        ],
    },
    {
        title: 'Navigation',
        entries: [
            single(Hotkey.RELOAD_APP),
            single(Hotkey.OPEN_DEV_TOOL),
            single(Hotkey.SEARCH),
            single(Hotkey.ESCAPE),
        ],
    },
    {
        title: 'Panels',
        entries: [
            single(Hotkey.SIDEBAR_LAYERS),
            single(Hotkey.SIDEBAR_BRAND),
            single(Hotkey.SIDEBAR_PAGES),
            single(Hotkey.SIDEBAR_IMAGES),
            single(Hotkey.SIDEBAR_BRANCHES),
            single(Hotkey.SIDEBAR_INSERT),
            single(Hotkey.SIDEBAR_SEARCH),
            single(Hotkey.SIDEBAR_COMPONENTS),
            single(Hotkey.TOGGLE_TERMINAL),
            single(Hotkey.SHOW_HOTKEYS),
        ],
    },
    {
        title: 'Insert',
        entries: [
            single(Hotkey.OPEN_ELEMENT_PALETTE),
            single(Hotkey.INSERT_DIV),
            single(Hotkey.INSERT_FLEX_DIV),
            single(Hotkey.INSERT_TEXT),
            single(Hotkey.INSERT_BUTTON),
        ],
    },
    {
        title: 'Canvas',
        entries: [single(Hotkey.ZOOM_FIT), single(Hotkey.ZOOM_IN), single(Hotkey.ZOOM_OUT)],
    },
    {
        title: 'Layers',
        entries: [
            single(Hotkey.MOVE_LAYER_UP),
            single(Hotkey.MOVE_LAYER_DOWN),
            single(Hotkey.GROUP),
            single(Hotkey.UNGROUP),
        ],
    },
    {
        title: 'Editor',
        entries: [
            single(Hotkey.UNDO),
            single(Hotkey.REDO),
            single(Hotkey.COPY),
            single(Hotkey.PASTE),
            single(Hotkey.CUT),
            single(Hotkey.DUPLICATE),
            single(Hotkey.DELETE),
            single(Hotkey.BACKSPACE),
            single(Hotkey.ENTER),
            single(Hotkey.RESET_STYLE),
        ],
    },
    {
        title: 'AI',
        entries: [
            single(Hotkey.ADD_AI_CHAT),
            single(Hotkey.NEW_AI_CHAT),
            single(Hotkey.CHAT_MODE_TOGGLE),
            single(Hotkey.OPEN_MODEL_PICKER),
        ],
    },
];

// Exported for use in the Shortcuts settings tab — same sections as string keys
export const SHORTCUT_SECTIONS: { title: string; keys: string[] }[] = [
    {
        title: 'Modes',
        keys: [
            'SELECT',
            'MODE_DESIGN',
            'CODE',
            'MODE_CODE',
            'PREVIEW',
            'MODE_PREVIEW',
            'PAN',
            'COMMENT',
            'TOGGLE_COMMENTS',
        ],
    },
    {
        title: 'Navigation',
        keys: ['RELOAD_APP', 'OPEN_DEV_TOOL', 'SEARCH', 'ESCAPE'],
    },
    {
        title: 'Panels',
        keys: [
            'SIDEBAR_LAYERS',
            'SIDEBAR_BRAND',
            'SIDEBAR_PAGES',
            'SIDEBAR_IMAGES',
            'SIDEBAR_BRANCHES',
            'SIDEBAR_INSERT',
            'SIDEBAR_SEARCH',
            'SIDEBAR_COMPONENTS',
            'TOGGLE_TERMINAL',
            'SHOW_HOTKEYS',
        ],
    },
    {
        title: 'Insert',
        keys: [
            'OPEN_ELEMENT_PALETTE',
            'INSERT_DIV',
            'INSERT_FLEX_DIV',
            'INSERT_TEXT',
            'INSERT_BUTTON',
        ],
    },
    {
        title: 'Canvas',
        keys: ['ZOOM_FIT', 'ZOOM_IN', 'ZOOM_OUT'],
    },
    {
        title: 'Layers',
        keys: ['MOVE_LAYER_UP', 'MOVE_LAYER_DOWN', 'GROUP', 'UNGROUP'],
    },
    {
        title: 'Editor',
        keys: [
            'UNDO',
            'REDO',
            'COPY',
            'PASTE',
            'CUT',
            'DUPLICATE',
            'DELETE',
            'BACKSPACE',
            'ENTER',
            'RESET_STYLE',
        ],
    },
    {
        title: 'AI',
        keys: ['ADD_AI_CHAT', 'NEW_AI_CHAT', 'CHAT_MODE_TOGGLE', 'OPEN_MODEL_PICKER'],
    },
];

const MultiHotkeyRow = ({
    description,
    hotkeys,
}: {
    description: string;
    hotkeys: readonly Hotkey[];
}) => (
    <span className="flex w-full items-center justify-between gap-2">
        <span>{description}</span>
        <span className="flex items-center gap-1">
            {hotkeys.map((h, i) => (
                <span key={h.command} className="flex items-center gap-1">
                    {i > 0 && <span className="text-foreground-tertiary text-mini">or</span>}
                    <Kbd>
                        <span
                            className="text-mini inline-grid auto-cols-max grid-flow-col items-center gap-1.5 [&_kbd]:text-[1.1em]"
                            dangerouslySetInnerHTML={{ __html: h.readableCommand }}
                        />
                    </Kbd>
                </span>
            ))}
        </span>
    </span>
);

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
                            <h3 className="text-foreground text-small mb-3 font-medium">
                                {section.title}
                            </h3>
                            <div className="space-y-2">
                                {section.entries.map((entry, index) => (
                                    <div
                                        key={
                                            entry.kind === 'single'
                                                ? `${section.title}-${entry.hotkey.command}`
                                                : `${section.title}-multi-${index}`
                                        }
                                        className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5"
                                    >
                                        {entry.kind === 'single' ? (
                                            <HotkeyLabel
                                                hotkey={entry.hotkey}
                                                className="w-full justify-between"
                                            />
                                        ) : (
                                            <MultiHotkeyRow
                                                description={entry.description}
                                                hotkeys={entry.hotkeys}
                                            />
                                        )}
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
