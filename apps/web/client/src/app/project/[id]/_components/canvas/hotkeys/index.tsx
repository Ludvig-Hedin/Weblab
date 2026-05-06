import type { ReactNode } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';

import { DefaultSettings } from '@weblab/constants';
import { EditorMode, InsertMode, LeftPanelTabValue } from '@weblab/models';
import { toast } from '@weblab/ui/sonner';

import { Hotkey } from '@/components/hotkey';
import { useEditorEngine } from '@/components/store/editor';

export const HotkeysArea = ({ children }: { children: ReactNode }) => {
    const editorEngine = useEditorEngine();

    const toggleLeftPanelTab = (tab: LeftPanelTabValue) => {
        editorEngine.state.setEditorMode(EditorMode.DESIGN);

        if (editorEngine.state.leftPanelTab === tab && editorEngine.state.leftPanelLocked) {
            editorEngine.state.setLeftPanelLocked(false);
            return;
        }

        editorEngine.state.setLeftPanelTab(tab);
        editorEngine.state.setLeftPanelLocked(true);
    };

    // Zoom
    useHotkeys(
        Hotkey.ZOOM_FIT.command,
        () => {
            editorEngine.canvas.scale = DefaultSettings.SCALE;
            editorEngine.canvas.position = {
                x: DefaultSettings.PAN_POSITION.x,
                y: DefaultSettings.PAN_POSITION.y,
            };
        },
        { preventDefault: true },
    );
    useHotkeys(
        Hotkey.ZOOM_IN.command,
        () => (editorEngine.canvas.scale = editorEngine.canvas.scale * 1.2),
        {
            preventDefault: true,
        },
    );
    useHotkeys(
        Hotkey.ZOOM_OUT.command,
        () => (editorEngine.canvas.scale = editorEngine.canvas.scale * 0.8),
        {
            preventDefault: true,
        },
    );

    // Modes
    useHotkeys(Hotkey.SELECT.command, () => editorEngine.state.setEditorMode(EditorMode.DESIGN));
    useHotkeys(Hotkey.CODE.command, () => editorEngine.state.setEditorMode(EditorMode.CODE));
    useHotkeys(Hotkey.ESCAPE.command, () => {
        editorEngine.state.setEditorMode(EditorMode.DESIGN);
        if (!editorEngine.text.isEditing) {
            editorEngine.clearUI();
        }
    });
    useHotkeys(Hotkey.PAN.command, () => editorEngine.state.setEditorMode(EditorMode.PAN));
    useHotkeys(Hotkey.COMMENT.command, () => editorEngine.state.setEditorMode(EditorMode.COMMENT));
    useHotkeys(Hotkey.TOGGLE_COMMENTS.command, () => editorEngine.comment.toggleCommentsVisible(), {
        preventDefault: true,
    });
    useHotkeys(Hotkey.PREVIEW.command, () => editorEngine.state.setEditorMode(EditorMode.PREVIEW));
    useHotkeys(Hotkey.SIDEBAR_INSERT.command, () => toggleLeftPanelTab(LeftPanelTabValue.INSERT), {
        preventDefault: true,
    });
    useHotkeys(Hotkey.SIDEBAR_LAYERS.command, () => toggleLeftPanelTab(LeftPanelTabValue.LAYERS), {
        preventDefault: true,
    });
    useHotkeys(Hotkey.SIDEBAR_BRAND.command, () => toggleLeftPanelTab(LeftPanelTabValue.BRAND), {
        preventDefault: true,
    });
    useHotkeys(Hotkey.SIDEBAR_PAGES.command, () => toggleLeftPanelTab(LeftPanelTabValue.PAGES), {
        preventDefault: true,
    });
    useHotkeys(Hotkey.SIDEBAR_IMAGES.command, () => toggleLeftPanelTab(LeftPanelTabValue.IMAGES), {
        preventDefault: true,
    });
    useHotkeys(
        Hotkey.SIDEBAR_BRANCHES.command,
        () => toggleLeftPanelTab(LeftPanelTabValue.BRANCHES),
        {
            preventDefault: true,
        },
    );
    useHotkeys(Hotkey.SIDEBAR_SEARCH.command, () => toggleLeftPanelTab(LeftPanelTabValue.SEARCH), {
        preventDefault: true,
    });
    useHotkeys(
        Hotkey.SIDEBAR_COMPONENTS.command,
        () => toggleLeftPanelTab(LeftPanelTabValue.COMPONENTS),
        {
            preventDefault: true,
        },
    );

    // Find in design (cmd+f) — opens & focuses Search tab, suppresses browser Find.
    // enableOnFormTags so it works even when other inputs (chat, etc.) are focused.
    useHotkeys(
        Hotkey.SEARCH.command,
        (e) => {
            e.preventDefault();
            editorEngine.state.setEditorMode(EditorMode.DESIGN);
            editorEngine.state.setLeftPanelTab(LeftPanelTabValue.SEARCH);
            editorEngine.state.setLeftPanelLocked(true);
            window.dispatchEvent(new Event('weblab:search:focus'));
        },
        { enableOnFormTags: true, enableOnContentEditable: true, preventDefault: true },
    );

    // Quick mode switching with CMD+1/2/3 (overrides browser defaults)
    useHotkeys(
        Hotkey.MODE_DESIGN.command,
        () => editorEngine.state.setEditorMode(EditorMode.DESIGN),
        { preventDefault: true },
    );
    useHotkeys(Hotkey.MODE_CODE.command, () => editorEngine.state.setEditorMode(EditorMode.CODE), {
        preventDefault: true,
    });
    useHotkeys(
        Hotkey.MODE_PREVIEW.command,
        () => editorEngine.state.setEditorMode(EditorMode.PREVIEW),
        { preventDefault: true },
    );

    // Terminal toggle (broadcast event so TerminalArea can react)
    useHotkeys(
        Hotkey.TOGGLE_TERMINAL.command,
        () => {
            window.dispatchEvent(new Event('toggle-terminal'));
        },
        { preventDefault: true },
    );

    // Open model picker
    useHotkeys(
        Hotkey.OPEN_MODEL_PICKER.command,
        () => {
            window.dispatchEvent(new Event('open-model-selector'));
        },
        { preventDefault: true },
    );
    useHotkeys(
        [Hotkey.INSERT_DIV.command, Hotkey.INSERT_DIV_F.command, Hotkey.INSERT_DIV_D.command],
        () => editorEngine.state.setInsertMode(InsertMode.INSERT_DIV),
    );
    useHotkeys(Hotkey.INSERT_FLEX_DIV.command, () =>
        editorEngine.state.setInsertMode(InsertMode.INSERT_FLEX_DIV),
    );
    useHotkeys(Hotkey.INSERT_BUTTON.command, () =>
        editorEngine.state.setInsertMode(InsertMode.INSERT_BUTTON),
    );
    useHotkeys(Hotkey.INSERT_TEXT.command, () =>
        editorEngine.state.setInsertMode(InsertMode.INSERT_TEXT),
    );
    useHotkeys('space', () => editorEngine.state.setEditorMode(EditorMode.PAN), { keydown: true });
    useHotkeys('space', () => editorEngine.state.setEditorMode(EditorMode.DESIGN), { keyup: true });
    useHotkeys('alt', () => editorEngine.overlay.showMeasurement(), { keydown: true });
    useHotkeys('alt', () => editorEngine.overlay.removeMeasurement(), { keyup: true });

    // Actions
    useHotkeys(Hotkey.UNDO.command, () => editorEngine.action.undo(), {
        preventDefault: true,
    });
    useHotkeys(Hotkey.REDO.command, () => editorEngine.action.redo(), {
        preventDefault: true,
    });
    useHotkeys(Hotkey.ENTER.command, () => editorEngine.text.editSelectedElement(), {
        preventDefault: true,
    });
    useHotkeys(
        [Hotkey.BACKSPACE.command, Hotkey.DELETE.command],
        () => {
            if (editorEngine.elements.selected.length > 0) {
                editorEngine.elements.delete();
            } else if (editorEngine.frames.selected.length > 0 && editorEngine.frames.canDelete()) {
                editorEngine.frames.deleteSelected();
            }
        },
        { preventDefault: true },
    );

    // Group / Unwrap parent
    // GROUP (cmd+g) — groups selected elements (may produce a flex/grid container)
    useHotkeys(Hotkey.GROUP.command, () => editorEngine.group.groupSelectedElements(), {
        preventDefault: true,
    });
    useHotkeys(Hotkey.UNGROUP.command, () => editorEngine.group.ungroupSelectedElement(), {
        preventDefault: true,
    });

    // Copy
    useHotkeys(
        Hotkey.COPY.command,
        () => {
            if (
                editorEngine.elements.selected.length === 0 &&
                editorEngine.frames.selected.length === 0
            )
                return;
            editorEngine.copy.copy();
            toast.success('Copied');
        },
        { preventDefault: true },
    );
    useHotkeys(
        Hotkey.PASTE.command,
        () => {
            editorEngine.copy.paste();
            toast.success('Pasted');
        },
        { preventDefault: true },
    );
    useHotkeys(
        Hotkey.CUT.command,
        () => {
            if (
                editorEngine.elements.selected.length === 0 &&
                editorEngine.frames.selected.length === 0
            )
                return;
            editorEngine.copy.cut();
            toast.success('Cut');
        },
        { preventDefault: true },
    );
    useHotkeys(
        Hotkey.DUPLICATE.command,
        () => {
            if (editorEngine.elements.selected.length > 0) {
                editorEngine.copy.duplicate();
                toast.success('Duplicated');
            } else if (
                editorEngine.frames.selected.length > 0 &&
                editorEngine.frames.canDuplicate()
            ) {
                editorEngine.frames.duplicateSelected();
                toast.success('Duplicated');
            }
        },
        { preventDefault: true },
    );

    // AI
    useHotkeys(Hotkey.ADD_AI_CHAT.command, () => {
        if (editorEngine.state.editorMode === EditorMode.PREVIEW) {
            editorEngine.state.setEditorMode(EditorMode.DESIGN);
        }
        editorEngine.chat.focusChatInput();
    });
    useHotkeys(Hotkey.NEW_AI_CHAT.command, () => {
        editorEngine.state.setEditorMode(EditorMode.DESIGN);
        editorEngine.chat.conversation.startNewConversation();
    });
    useHotkeys(
        Hotkey.CHAT_MODE_TOGGLE.command,
        () => {
            // Toggle between design and preview mode
            if (editorEngine.state.editorMode === EditorMode.PREVIEW) {
                editorEngine.state.setEditorMode(EditorMode.DESIGN);
            } else {
                editorEngine.state.setEditorMode(EditorMode.PREVIEW);
            }
        },
        { preventDefault: true },
    );

    // Move
    useHotkeys(Hotkey.MOVE_LAYER_UP.command, () => editorEngine.move.moveSelected('up'));
    useHotkeys(Hotkey.MOVE_LAYER_DOWN.command, () => editorEngine.move.moveSelected('down'));
    useHotkeys(
        Hotkey.SHOW_HOTKEYS.command,
        () => editorEngine.state.setHotkeysOpen(!editorEngine.state.hotkeysOpen),
        { preventDefault: true },
    );

    // Element palette (cmd+k) — Webflow-style searchable insert menu
    useHotkeys(
        Hotkey.OPEN_ELEMENT_PALETTE.command,
        () => editorEngine.state.setElementPaletteOpen(!editorEngine.state.elementPaletteOpen),
        { preventDefault: true },
    );

    return <>{children}</>;
};
