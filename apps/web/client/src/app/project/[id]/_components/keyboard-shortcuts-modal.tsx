'use client';

import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';
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
import { useStateManager } from '@/components/store/state';
import { SettingsTabValue } from '@/components/ui/settings-modal/helpers';

type ModalEntry =
    | { kind: 'single'; hotkey: Hotkey }
    | {
          kind: 'multi';
          descriptionKey: string;
          hotkeys: readonly Hotkey[];
      };

const single = (hotkey: Hotkey): ModalEntry => ({ kind: 'single', hotkey });
const multi = (descriptionKey: string, hotkeys: readonly Hotkey[]): ModalEntry => ({
    kind: 'multi',
    descriptionKey,
    hotkeys,
});

// Canonical hotkey list. The two `MODE_*` pairs (e.g. SELECT=v + MODE_DESIGN=mod+1)
// are merged into single rows so users see both bindings without two
// near-identical entries.
const HOTKEY_SECTIONS: { titleKey: string; entries: ModalEntry[] }[] = [
    {
        titleKey: 'modes',
        entries: [
            multi('designMode', [Hotkey.SELECT, Hotkey.MODE_DESIGN]),
            multi('codeMode', [Hotkey.CODE, Hotkey.MODE_CODE]),
            multi('previewMode', [Hotkey.PREVIEW, Hotkey.MODE_PREVIEW]),
            single(Hotkey.PAN),
            single(Hotkey.COMMENT),
            single(Hotkey.TOGGLE_COMMENTS),
        ],
    },
    {
        titleKey: 'navigation',
        entries: [
            single(Hotkey.OPEN_COMMAND_PALETTE),
            single(Hotkey.OPEN_FILE_FINDER),
            single(Hotkey.RELOAD_APP),
            single(Hotkey.OPEN_IN_IDE),
            single(Hotkey.SEARCH),
            single(Hotkey.ZOOM_TO_SELECTION),
            single(Hotkey.ESCAPE),
        ],
    },
    {
        titleKey: 'panels',
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
        titleKey: 'insert',
        entries: [
            single(Hotkey.OPEN_ADD_PANEL),
            single(Hotkey.OPEN_ELEMENT_PALETTE),
            single(Hotkey.INSERT_DIV),
            single(Hotkey.INSERT_FLEX_DIV),
            single(Hotkey.INSERT_TEXT),
            single(Hotkey.INSERT_BUTTON),
        ],
    },
    {
        titleKey: 'canvas',
        entries: [single(Hotkey.ZOOM_FIT), single(Hotkey.ZOOM_IN), single(Hotkey.ZOOM_OUT)],
    },
    {
        titleKey: 'layers',
        entries: [
            multi('bringForward', [Hotkey.BRING_FORWARD, Hotkey.MOVE_LAYER_UP]),
            multi('sendBackward', [Hotkey.SEND_BACKWARD, Hotkey.MOVE_LAYER_DOWN]),
            single(Hotkey.GROUP),
            single(Hotkey.UNGROUP),
        ],
    },
    {
        titleKey: 'editor',
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
        titleKey: 'ai',
        entries: [
            single(Hotkey.ADD_AI_CHAT),
            single(Hotkey.NEW_AI_CHAT),
            single(Hotkey.TOGGLE_DESIGN_PREVIEW),
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
        keys: [
            'OPEN_COMMAND_PALETTE',
            'OPEN_FILE_FINDER',
            'RELOAD_APP',
            'OPEN_IN_IDE',
            'SEARCH',
            'ZOOM_TO_SELECTION',
            'ESCAPE',
        ],
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
            'OPEN_ADD_PANEL',
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
        keys: [
            'BRING_FORWARD',
            'MOVE_LAYER_UP',
            'SEND_BACKWARD',
            'MOVE_LAYER_DOWN',
            'GROUP',
            'UNGROUP',
        ],
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
        keys: ['ADD_AI_CHAT', 'NEW_AI_CHAT', 'TOGGLE_DESIGN_PREVIEW', 'OPEN_MODEL_PICKER'],
    },
];

const MultiHotkeyRow = ({
    description,
    hotkeys,
    orLabel,
}: {
    description: string;
    hotkeys: readonly Hotkey[];
    orLabel: string;
}) => (
    <span className="flex w-full items-center justify-between gap-2">
        <span>{description}</span>
        <span className="flex items-center gap-1">
            {hotkeys.map((h, i) => (
                <span key={h.command} className="flex items-center gap-1">
                    {i > 0 && <span className="text-foreground-tertiary text-mini">{orLabel}</span>}
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
    const t = useTranslations('editor.shortcutsModal') as (key: string) => string;
    const editorEngine = useEditorEngine();
    const stateManager = useStateManager();

    const openCustomize = () => {
        editorEngine.state.setHotkeysOpen(false);
        stateManager.setSettingsTab(SettingsTabValue.SHORTCUTS);
        stateManager.setIsSettingsModalOpen(true);
    };

    return (
        <Dialog
            open={editorEngine.state.hotkeysOpen}
            onOpenChange={(open) => editorEngine.state.setHotkeysOpen(open)}
        >
            <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
                <DialogHeader>
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <DialogTitle>{t('title')}</DialogTitle>
                            <DialogDescription>{t('description')}</DialogDescription>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={openCustomize}
                            className="shrink-0"
                        >
                            {t('customize')}
                        </Button>
                    </div>
                </DialogHeader>
                <div className="grid gap-4 sm:grid-cols-2">
                    {HOTKEY_SECTIONS.map((section) => (
                        <div
                            key={section.titleKey}
                            className="border-border/60 bg-background-secondary/40 rounded-lg border p-4"
                        >
                            <h3 className="text-foreground text-small mb-3 font-medium">
                                {t(`sections.${section.titleKey}`)}
                            </h3>
                            <div className="space-y-2">
                                {section.entries.map((entry, index) => (
                                    <div
                                        key={
                                            entry.kind === 'single'
                                                ? `${section.titleKey}-${entry.hotkey.command}`
                                                : `${section.titleKey}-multi-${index}`
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
                                                description={t(`rows.${entry.descriptionKey}`)}
                                                hotkeys={entry.hotkeys}
                                                orLabel={t('or')}
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
