import type { ReactNode } from 'react';
import { useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';
import { useHotkeys } from 'react-hotkeys-hook';

import { DefaultSettings, EditorAttributes } from '@weblab/constants';
import { EditorMode, InsertMode, LeftPanelTabValue } from '@weblab/models';
import { toast } from '@weblab/ui/sonner';

import { Hotkey } from '@/components/hotkey';
import { useEditorEngine } from '@/components/store/editor';
import { OPEN_STYLE_PANEL_EVENT } from '@/components/store/editor/chat';
import { useStateManager } from '@/components/store/state';
import { SettingsTabValue } from '@/components/ui/settings-modal/helpers';

/**
 * True when keyboard focus is in a text-entry surface (style-panel input,
 * chat/composer, code editor, file-name field, contentEditable). Canvas
 * clipboard/move shortcuts must yield to native behaviour there: every
 * inspector input is mounted precisely BECAUSE a canvas element is selected,
 * so the "is anything selected?" gate on those handlers never fires while the
 * user is typing — Cmd+X would cut the element instead of the input text.
 */
const isEditableTarget = (): boolean => {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement)) return false;
    const tag = el.tagName;
    return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        el.isContentEditable
    );
};

export const HotkeysArea = observer(({ children }: { children: ReactNode }) => {
    const t = useTranslations('editor.canvas.hotkeys');
    const editorEngine = useEditorEngine();
    const stateManager = useStateManager();
    // Mode active before space-to-pan started, so releasing space restores it
    // instead of always snapping to DESIGN (see space keyup handler below).
    const priorModeBeforeSpaceRef = useRef<EditorMode | null>(null);
    // Read the current binding for a hotkey key, preferring user-customized
    // bindings (persisted via Settings → Shortcuts) and falling back to the
    // default declared in `Hotkey`. Wrapping `HotkeysArea` in `observer`
    // ensures we re-render — and `useHotkeys` re-binds — when
    // `customBindings` changes.
    const getKey = (k: keyof typeof Hotkey): string => {
        const customOrDefault = stateManager.hotkeys.getBinding(k as string);
        if (customOrDefault) return customOrDefault;
        const fallback = Hotkey[k];
        return fallback instanceof Hotkey ? fallback.command : '';
    };

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
        getKey('ZOOM_FIT'),
        () => {
            editorEngine.canvas.scale = DefaultSettings.SCALE;
            editorEngine.canvas.position = {
                x: DefaultSettings.PAN_POSITION.x,
                y: DefaultSettings.PAN_POSITION.y,
            };
        },
        {
            preventDefault: true,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [getKey('ZOOM_FIT')],
    );
    useHotkeys(
        getKey('ZOOM_IN'),
        () => (editorEngine.canvas.scale = editorEngine.canvas.scale * 1.2),
        {
            preventDefault: true,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [getKey('ZOOM_IN')],
    );
    useHotkeys(
        getKey('ZOOM_OUT'),
        () => (editorEngine.canvas.scale = editorEngine.canvas.scale * 0.8),
        {
            preventDefault: true,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [getKey('ZOOM_OUT')],
    );

    // Canvas chrome — Figma parity. Deliberately NOT enabled on form tags /
    // contentEditable: typing a capital R or G in chat/search/style inputs
    // must never toggle canvas chrome (matches INSERT_DIV / INSERT_BUTTON).
    useHotkeys(
        getKey('TOGGLE_RULERS'),
        () => editorEngine.canvas.toggleRulers(),
        undefined,
        [getKey('TOGGLE_RULERS')],
    );
    useHotkeys(
        getKey('TOGGLE_LAYOUT_GUIDES'),
        () => editorEngine.canvas.toggleLayoutGuides(),
        undefined,
        [getKey('TOGGLE_LAYOUT_GUIDES')],
    );

    // Modes
    useHotkeys(
        getKey('SELECT'),
        () => editorEngine.state.setEditorMode(EditorMode.DESIGN),
        undefined,
        [getKey('SELECT')],
    );
    // D — go to design from any mode (code, preview, cms, etc.)
    useHotkeys('d', () => editorEngine.state.setEditorMode(EditorMode.DESIGN), undefined, []);
    // P — open pages panel (replaces old 'p' preview shortcut, now mod+shift+p)
    useHotkeys('p', () => toggleLeftPanelTab(LeftPanelTabValue.PAGES), undefined, []);
    useHotkeys(getKey('CODE'), () => editorEngine.state.setEditorMode(EditorMode.CODE), undefined, [
        getKey('CODE'),
    ]);

    // Cmd+Shift+K on a selected canvas element opens the inline-edit prompt
    // for the element's JSX in the code editor. (Cmd+K is reserved for the
    // global command palette.)
    useHotkeys(
        getKey('INLINE_EDIT_FROM_CANVAS'),
        () => {
            // Only meaningful in DESIGN mode — in CODE mode the editor's own
            // Mod-k binding handles inline edit on the current selection.
            if (editorEngine.state.editorMode !== EditorMode.DESIGN) return;
            const selected = editorEngine.elements.selected[0];
            if (!selected) {
                toast.info(t('toastSelectFirst'));
                return;
            }
            const oid = selected.instanceId ?? selected.oid;
            if (!oid) {
                toast.error(t('toastLocateFailed'));
                return;
            }
            void editorEngine.ide.openInlineEditFromCanvas(oid);
        },
        {
            preventDefault: true,
            enableOnFormTags: false,
            enableOnContentEditable: false,
        },
        [editorEngine, getKey('INLINE_EDIT_FROM_CANVAS')],
    );
    useHotkeys(
        getKey('ESCAPE'),
        () => {
            // Escape during an in-progress element drag cancels it without
            // committing: move state is cleared and endAllDrag() restores the
            // element's saved styles in the iframe, so it snaps back to its
            // original position and the upcoming mouseup no-ops instead of
            // running the move action.
            if (editorEngine.move.isDragInProgress) {
                void editorEngine.move.cancel();
                return;
            }
            // Layered escape: text editing (handled by the editor itself) →
            // component edit session → clear selection. One ESC per layer.
            if (!editorEngine.text.isEditing && editorEngine.components.editing) {
                editorEngine.components.exitEditMode();
                return;
            }
            editorEngine.state.setEditorMode(EditorMode.DESIGN);
            if (!editorEngine.text.isEditing) {
                editorEngine.clearUI();
            }
        },
        undefined,
        [getKey('ESCAPE')],
    );
    useHotkeys(
        getKey('PAN'),
        () => {
            // Lock canvas mode disables free panning.
            if (editorEngine.state.canvasLocked) return;
            editorEngine.state.setEditorMode(EditorMode.PAN);
        },
        undefined,
        [getKey('PAN')],
    );
    useHotkeys(
        getKey('COMMENT'),
        () => editorEngine.state.setEditorMode(EditorMode.COMMENT),
        undefined,
        [getKey('COMMENT')],
    );
    // Shift+C — disabled while an input/contentEditable owns focus so typing
    // a capital C never toggles comment pins (matches INSERT_DIV).
    useHotkeys(
        getKey('TOGGLE_COMMENTS'),
        () => editorEngine.comment.toggleCommentsVisible(),
        undefined,
        [getKey('TOGGLE_COMMENTS')],
    );
    useHotkeys(
        getKey('PREVIEW'),
        () => editorEngine.state.setEditorMode(EditorMode.PREVIEW),
        undefined,
        [getKey('PREVIEW')],
    );
    useHotkeys(
        getKey('SIDEBAR_INSERT'),
        () => toggleLeftPanelTab(LeftPanelTabValue.INSERT),
        {
            preventDefault: true,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [getKey('SIDEBAR_INSERT')],
    );
    useHotkeys(
        getKey('OPEN_ADD_PANEL'),
        () => editorEngine.state.setElementPaletteOpen(true),
        {
            preventDefault: true,
            enableOnFormTags: false,
            enableOnContentEditable: false,
        },
        [getKey('OPEN_ADD_PANEL')],
    );
    useHotkeys(
        getKey('SIDEBAR_LAYERS'),
        () => toggleLeftPanelTab(LeftPanelTabValue.LAYERS),
        {
            preventDefault: true,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [getKey('SIDEBAR_LAYERS')],
    );
    useHotkeys(
        getKey('SIDEBAR_BRAND'),
        () => toggleLeftPanelTab(LeftPanelTabValue.BRAND),
        {
            preventDefault: true,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [getKey('SIDEBAR_BRAND')],
    );
    useHotkeys(
        getKey('SIDEBAR_PAGES'),
        () => toggleLeftPanelTab(LeftPanelTabValue.PAGES),
        {
            preventDefault: true,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [getKey('SIDEBAR_PAGES')],
    );
    useHotkeys(
        getKey('SIDEBAR_IMAGES'),
        () => toggleLeftPanelTab(LeftPanelTabValue.IMAGES),
        {
            preventDefault: true,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [getKey('SIDEBAR_IMAGES')],
    );
    useHotkeys(
        getKey('SIDEBAR_BRANCHES'),
        () => toggleLeftPanelTab(LeftPanelTabValue.BRANCHES),
        {
            preventDefault: true,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [getKey('SIDEBAR_BRANCHES')],
    );
    useHotkeys(
        getKey('SIDEBAR_SEARCH'),
        () => toggleLeftPanelTab(LeftPanelTabValue.SEARCH),
        {
            preventDefault: true,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [getKey('SIDEBAR_SEARCH')],
    );
    useHotkeys(
        getKey('SIDEBAR_COMPONENTS'),
        () => toggleLeftPanelTab(LeftPanelTabValue.COMPONENTS),
        {
            preventDefault: true,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [getKey('SIDEBAR_COMPONENTS')],
    );

    // Find in design (cmd+f) — opens & focuses Search tab, suppresses browser Find.
    // enableOnFormTags so it works even when other inputs (chat, etc.) are focused.
    // When focus is inside the CodeMirror editor we yield to its native in-file
    // find — preventDefault stays inside the handler so we only suppress the
    // browser Find when we actually open the design Search tab.
    useHotkeys(
        getKey('SEARCH'),
        (e) => {
            if (
                typeof document !== 'undefined' &&
                document.activeElement?.closest?.('.cm-editor')
            ) {
                return; // let CodeMirror handle Cmd+F
            }
            e.preventDefault();
            editorEngine.state.setEditorMode(EditorMode.DESIGN);
            editorEngine.state.setLeftPanelTab(LeftPanelTabValue.SEARCH);
            editorEngine.state.setLeftPanelLocked(true);
            window.dispatchEvent(new Event('weblab:search:focus'));
        },
        { enableOnFormTags: true, enableOnContentEditable: true },
        [getKey('SEARCH')],
    );

    // Quick mode switching with CMD+1/2/3 (overrides browser defaults)
    useHotkeys(
        getKey('MODE_DESIGN'),
        () => editorEngine.state.setEditorMode(EditorMode.DESIGN),
        {
            preventDefault: true,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [getKey('MODE_DESIGN')],
    );
    useHotkeys(
        getKey('MODE_CODE'),
        () => editorEngine.state.setEditorMode(EditorMode.CODE),
        {
            preventDefault: true,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [getKey('MODE_CODE')],
    );
    useHotkeys(
        getKey('MODE_PREVIEW'),
        () => editorEngine.state.setEditorMode(EditorMode.PREVIEW),
        {
            preventDefault: true,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [getKey('MODE_PREVIEW')],
    );
    useHotkeys(
        getKey('MODE_CMS'),
        () => editorEngine.state.setEditorMode(EditorMode.CMS),
        {
            preventDefault: true,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [getKey('MODE_CMS')],
    );

    // Open the Versions tab of the Settings modal (mod+shift+h). Advertised in
    // the top-bar tooltip via HotkeyLabel — bound here so the shortcut actually
    // works. Same path the top-bar history button uses.
    useHotkeys(
        getKey('OPEN_VERSION_HISTORY'),
        () => {
            stateManager.setSettingsTab(SettingsTabValue.VERSIONS);
            stateManager.setIsSettingsModalOpen(true);
        },
        {
            preventDefault: true,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [getKey('OPEN_VERSION_HISTORY')],
    );

    // Reload all frame views (cmd+r). Hijacks the browser reload so people don't
    // accidentally lose unsaved canvas state, and works while typing.
    useHotkeys(
        getKey('RELOAD_APP'),
        () => {
            editorEngine.frames.reloadAllViews();
        },
        {
            preventDefault: true,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [getKey('RELOAD_APP')],
    );

    // Terminal toggle (broadcast event so TerminalArea can react)
    useHotkeys(
        getKey('TOGGLE_TERMINAL'),
        () => {
            window.dispatchEvent(new Event('toggle-terminal'));
        },
        {
            preventDefault: true,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [getKey('TOGGLE_TERMINAL')],
    );

    // Open model picker
    useHotkeys(
        getKey('OPEN_MODEL_PICKER'),
        () => {
            window.dispatchEvent(new Event('open-model-selector'));
        },
        {
            preventDefault: true,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [getKey('OPEN_MODEL_PICKER')],
    );
    useHotkeys(
        getKey('INSERT_DIV'),
        () => editorEngine.state.setInsertMode(InsertMode.INSERT_DIV),
        undefined,
        [getKey('INSERT_DIV')],
    );
    useHotkeys(
        getKey('INSERT_FLEX_DIV'),
        () => editorEngine.state.setInsertMode(InsertMode.INSERT_FLEX_DIV),
        undefined,
        [getKey('INSERT_FLEX_DIV')],
    );
    useHotkeys(
        getKey('INSERT_BUTTON'),
        () => editorEngine.state.setInsertMode(InsertMode.INSERT_BUTTON),
        undefined,
        [getKey('INSERT_BUTTON')],
    );
    useHotkeys(
        getKey('INSERT_TEXT'),
        () => editorEngine.state.setInsertMode(InsertMode.INSERT_TEXT),
        undefined,
        [getKey('INSERT_TEXT')],
    );
    useHotkeys(
        'space',
        () => {
            // Lock canvas mode disables space-drag panning.
            if (editorEngine.state.canvasLocked) return;
            if (editorEngine.state.editorMode === EditorMode.PAN) return;
            // Remember where we came from so keyup can return there.
            priorModeBeforeSpaceRef.current = editorEngine.state.editorMode;
            editorEngine.state.setEditorMode(EditorMode.PAN);
        },
        { keydown: true },
    );
    // Releasing space mid-pan flipped the editor straight back to DESIGN even
    // when an active middle-mouse / space-drag pan was in flight, breaking the
    // gesture. Skip the flip while a canvas pan is active — the pan-end
    // handler in canvas/index.tsx restores the mode itself. Otherwise restore
    // the mode that was active before space was pressed (PREVIEW/COMMENT/CMS),
    // falling back to DESIGN when there was no captured prior mode.
    useHotkeys(
        'space',
        () => {
            if (editorEngine.state.canvasPanning) return;
            editorEngine.state.setEditorMode(priorModeBeforeSpaceRef.current ?? EditorMode.DESIGN);
            priorModeBeforeSpaceRef.current = null;
        },
        { keyup: true },
    );
    useHotkeys(
        'alt',
        () => {
            // Suppress measurement during alt+drag (Figma-style duplicate) so
            // distance lines don't flash over the dragging element.
            if (editorEngine.move.isDragInProgress || editorEngine.move.isPreparing) return;
            editorEngine.overlay.showMeasurement();
        },
        { keydown: true },
    );
    useHotkeys('alt', () => editorEngine.overlay.removeMeasurement(), {
        keyup: true,
    });

    // Actions
    // TODO(bug-hunt): UNDO/REDO run with enableOnFormTags + enableOnContentEditable,
    // so cmd+z/cmd+shift+z fire the canvas history even while focus is in a text
    // field — hijacking the browser's native text undo/redo. May be intentional
    // Figma parity, but it pairs badly with the stale-draft commit bugs in the
    // style controls (an undo can't recover a wrongly-committed field). Consider
    // a canvas-ownership gate like COPY/PASTE, or yielding when focus is in an
    // editable field with its own undo stack.
    useHotkeys(
        getKey('UNDO'),
        () => editorEngine.action.undo(),
        {
            preventDefault: true,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [getKey('UNDO')],
    );
    useHotkeys(
        getKey('REDO'),
        () => editorEngine.action.redo(),
        {
            preventDefault: true,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [getKey('REDO')],
    );
    useHotkeys(
        getKey('ENTER'),
        () => editorEngine.text.editSelectedElement(),
        {
            preventDefault: true,
        },
        [getKey('ENTER')],
    );
    useHotkeys(
        [getKey('BACKSPACE'), getKey('DELETE')],
        () => {
            if (editorEngine.elements.selected.length > 0) {
                editorEngine.elements.delete();
            } else if (editorEngine.frames.selected.length > 0 && editorEngine.frames.canDelete()) {
                editorEngine.frames.deleteSelected();
            }
        },
        { preventDefault: true },
        [getKey('BACKSPACE'), getKey('DELETE')],
    );

    // Group / Unwrap parent
    // GROUP (cmd+g) — groups selected elements (may produce a flex/grid container)
    useHotkeys(
        getKey('GROUP'),
        () => editorEngine.group.groupSelectedElements(),
        {
            preventDefault: true,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [getKey('GROUP')],
    );
    useHotkeys(
        getKey('UNGROUP'),
        () => editorEngine.group.ungroupSelectedElement(),
        {
            preventDefault: true,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [getKey('UNGROUP')],
    );
    useHotkeys(
        getKey('CREATE_COMPONENT'),
        () => {
            const selected = editorEngine.elements.selected[0];
            if (!selected?.oid || selected.instanceId) {
                toast.error('Select an element (not a component instance) to create a component.');
                return;
            }
            editorEngine.components.openCreateDialog(selected);
        },
        { preventDefault: true },
        [getKey('CREATE_COMPONENT')],
    );
    useHotkeys(
        getKey('EDIT_COMPONENT'),
        () => {
            const selected = editorEngine.elements.selected[0];
            if (!selected?.instanceId) return;
            void editorEngine.components.enterEditMode(selected).then((entered) => {
                if (!entered) {
                    toast.error(
                        editorEngine.components.indexReady
                            ? 'This component can’t be edited here (external or unresolved).'
                            : 'Still indexing components — try again in a moment.',
                    );
                }
            });
        },
        { preventDefault: true },
        [getKey('EDIT_COMPONENT')],
    );
    useHotkeys(
        getKey('UNLINK_INSTANCE'),
        () => {
            const selected = editorEngine.elements.selected[0];
            if (!selected?.instanceId) return;
            void editorEngine.components.unlinkInstance(selected).then((result) => {
                if (!result.ok) {
                    toast.error('Could not unlink instance', { description: result.error });
                }
            });
        },
        { preventDefault: true },
        [getKey('UNLINK_INSTANCE')],
    );

    // Copy / Paste / Cut / Duplicate
    //
    // These hotkeys live behind `enableOnFormTags + enableOnContentEditable`
    // so the canvas can react when the user happens to have an element
    // selected while focus is in chat/code/etc. — but they must NOT
    // hijack native browser copy/paste in those inputs when the canvas
    // doesn't actually own a selection.
    //
    // Pattern: drop the option-level `preventDefault` and instead
    // call `e.preventDefault()` from inside the handler ONLY after we
    // confirm canvas ownership. When there's no canvas selection we
    // return early without calling preventDefault, leaving the native
    // copy/paste/cut/duplicate behavior intact for the focused input.
    useHotkeys(
        getKey('COPY'),
        (e) => {
            if (isEditableTarget()) return;
            if (
                editorEngine.elements.selected.length === 0 &&
                editorEngine.frames.selected.length === 0
            ) {
                return;
            }
            e.preventDefault();
            editorEngine.copy.copy();
        },
        { enableOnFormTags: true, enableOnContentEditable: true },
        [getKey('COPY')],
    );
    useHotkeys(
        getKey('PASTE'),
        (e) => {
            // Paste needs both an internal canvas clipboard payload
            // (`copy.copied`) AND a selected target element on the
            // canvas — `CopyManager.paste()` no-ops without either, so
            // we use the same conditions as the gate. When neither is
            // true, yield to the native input handler so users can
            // paste text into chat/code/file-name fields normally.
            if (isEditableTarget()) return;
            if (!editorEngine.copy.copied || editorEngine.elements.selected.length === 0) {
                return;
            }
            e.preventDefault();
            editorEngine.copy.paste();
            toast.success('Pasted');
        },
        { enableOnFormTags: true, enableOnContentEditable: true },
        [getKey('PASTE')],
    );
    useHotkeys(
        getKey('CUT'),
        (e) => {
            if (isEditableTarget()) return;
            if (
                editorEngine.elements.selected.length === 0 &&
                editorEngine.frames.selected.length === 0
            ) {
                return;
            }
            e.preventDefault();
            // Only toast when something was actually cut. `cut()` no-ops for a
            // frame-only selection (cut is element-only) or when copy() fails
            // (e.g. an element with no oid) — a "Cut" toast then lies.
            void editorEngine.copy.cut().then((didCut) => {
                if (didCut) toast.success('Cut');
            });
        },
        { enableOnFormTags: true, enableOnContentEditable: true },
        [getKey('CUT')],
    );
    useHotkeys(
        getKey('DUPLICATE'),
        (e) => {
            if (isEditableTarget()) return;
            if (editorEngine.elements.selected.length > 0) {
                e.preventDefault();
                editorEngine.copy.duplicate();
                toast.success('Duplicated');
                return;
            }
            if (editorEngine.frames.selected.length > 0 && editorEngine.frames.canDuplicate()) {
                e.preventDefault();
                editorEngine.frames.duplicateSelected();
                toast.success('Duplicated');
            }
        },
        { enableOnFormTags: true, enableOnContentEditable: true },
        [getKey('DUPLICATE')],
    );

    // Copy Properties / Paste Properties (Cmd/Ctrl + Alt + C / V).
    //
    // These follow the same canvas-ownership pattern as COPY/PASTE above:
    // only preventDefault when an element on the canvas is selected, so a
    // user typing in chat / a panel input never has their native shortcut
    // hijacked. The toast + manager handle the rest of the UX.
    useHotkeys(
        getKey('COPY_STYLES'),
        (e) => {
            if (isEditableTarget()) return;
            if (editorEngine.elements.selected.length === 0) {
                return;
            }
            e.preventDefault();
            void editorEngine.propertiesClipboard.copyFromSelected();
        },
        { enableOnFormTags: true, enableOnContentEditable: true },
        [getKey('COPY_STYLES')],
    );
    useHotkeys(
        getKey('PASTE_STYLES'),
        (e) => {
            if (isEditableTarget()) return;
            if (editorEngine.elements.selected.length === 0) {
                return;
            }
            e.preventDefault();
            void editorEngine.propertiesClipboard.pasteToSelected();
        },
        { enableOnFormTags: true, enableOnContentEditable: true },
        [getKey('PASTE_STYLES')],
    );

    // AI
    useHotkeys(
        getKey('ADD_AI_CHAT'),
        () => {
            if (editorEngine.state.editorMode === EditorMode.PREVIEW) {
                editorEngine.state.setEditorMode(EditorMode.DESIGN);
            }
            editorEngine.chat.focusChatInput();
        },
        { enableOnFormTags: true, enableOnContentEditable: true },
        [getKey('ADD_AI_CHAT')],
    );
    useHotkeys(
        getKey('NEW_AI_CHAT'),
        () => {
            editorEngine.state.setEditorMode(EditorMode.DESIGN);
            editorEngine.chat.conversation.startNewConversation();
        },
        { enableOnFormTags: true, enableOnContentEditable: true },
        [getKey('NEW_AI_CHAT')],
    );
    useHotkeys(
        getKey('TOGGLE_DESIGN_PREVIEW'),
        () => {
            // Toggle between design and preview mode
            if (editorEngine.state.editorMode === EditorMode.PREVIEW) {
                editorEngine.state.setEditorMode(EditorMode.DESIGN);
            } else {
                editorEngine.state.setEditorMode(EditorMode.PREVIEW);
            }
        },
        {
            preventDefault: true,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [getKey('TOGGLE_DESIGN_PREVIEW')],
    );

    // Move
    //
    // Shift+Arrow extends a text selection inside inputs/contentEditable, so —
    // like COPY/PASTE above — only act (and preventDefault) when the canvas
    // actually owns an element selection. Otherwise return early without
    // calling preventDefault so the native text-selection behaviour is intact.
    useHotkeys(
        getKey('MOVE_LAYER_UP'),
        (e) => {
            if (isEditableTarget()) return;
            if (editorEngine.elements.selected.length === 0) return;
            e.preventDefault();
            editorEngine.move.moveSelected('up');
        },
        { enableOnFormTags: true, enableOnContentEditable: true },
        [getKey('MOVE_LAYER_UP')],
    );
    useHotkeys(
        getKey('MOVE_LAYER_DOWN'),
        (e) => {
            if (isEditableTarget()) return;
            if (editorEngine.elements.selected.length === 0) return;
            e.preventDefault();
            editorEngine.move.moveSelected('down');
        },
        { enableOnFormTags: true, enableOnContentEditable: true },
        [getKey('MOVE_LAYER_DOWN')],
    );
    useHotkeys(
        getKey('SHOW_HOTKEYS'),
        () => editorEngine.state.setHotkeysOpen(!editorEngine.state.hotkeysOpen),
        {
            preventDefault: true,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [getKey('SHOW_HOTKEYS')],
    );

    // Element palette (cmd+e — moved from cmd+k now that the global command
    // palette owns cmd+k). Still a Webflow-style searchable insert menu.
    useHotkeys(
        getKey('OPEN_ELEMENT_PALETTE'),
        () => editorEngine.state.setElementPaletteOpen(!editorEngine.state.elementPaletteOpen),
        {
            preventDefault: true,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [getKey('OPEN_ELEMENT_PALETTE')],
    );

    // Global command palette (cmd+k). When focus is inside the CodeMirror
    // editor, yield to its inlineEditKeymap (Mod-k) instead of opening
    // the palette — same pattern used by the Cmd+F / SEARCH handler above.
    useHotkeys(
        getKey('OPEN_COMMAND_PALETTE'),
        (e) => {
            if (
                typeof document !== 'undefined' &&
                document.activeElement?.closest?.('.cm-editor')
            ) {
                return;
            }
            e.preventDefault();
            window.dispatchEvent(new Event('open-command-palette'));
        },
        { enableOnFormTags: true, enableOnContentEditable: true },
        [getKey('OPEN_COMMAND_PALETTE')],
    );

    // Quick-open file finder (cmd+p). Hijacks the browser print dialog so
    // we can use the same shortcut VS Code/IntelliJ users expect.
    useHotkeys(
        getKey('OPEN_FILE_FINDER'),
        () => window.dispatchEvent(new Event('open-file-finder')),
        {
            preventDefault: true,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [getKey('OPEN_FILE_FINDER')],
    );

    // Open selected element in IDE (cmd+shift+e)
    useHotkeys(
        getKey('OPEN_IN_IDE'),
        () => {
            const oid = editorEngine.elements.selected[0]?.oid;
            if (oid) {
                editorEngine.ide.openCodeBlock(oid);
            }
        },
        {
            preventDefault: true,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [getKey('OPEN_IN_IDE')],
    );

    // Zoom to fit selected element (cmd+shift+0)
    useHotkeys(
        getKey('ZOOM_TO_SELECTION'),
        () => {
            const selected = editorEngine.elements.selected[0];
            if (!selected) return;
            const frameData = editorEngine.frames.get(selected.frameId);
            if (!frameData) return;
            const { rect } = selected;
            if (!rect.width || !rect.height) return;
            const { position } = frameData.frame;
            // Center of the element in canvas (unscaled) coordinates
            const cx = position.x + rect.left + rect.width / 2;
            const cy = position.y + rect.top + rect.height / 2;
            // Viewport dimensions — parent of the transform container
            const viewport = document.getElementById(
                EditorAttributes.CANVAS_CONTAINER_ID,
            )?.parentElement;
            const W = viewport?.clientWidth ?? window.innerWidth;
            const H = viewport?.clientHeight ?? window.innerHeight;
            // Scale to fit element with 20% padding, capped at 3×
            const newScale = Math.min((W * 0.8) / rect.width, (H * 0.8) / rect.height, 3);
            editorEngine.canvas.scale = newScale;
            editorEngine.canvas.position = {
                x: W / 2 - cx * newScale,
                y: H / 2 - cy * newScale,
            };
        },
        {
            preventDefault: true,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [getKey('ZOOM_TO_SELECTION')],
    );

    // Bring forward / send backward in DOM order (cmd+] / cmd+[)
    useHotkeys(
        getKey('BRING_FORWARD'),
        () => editorEngine.move.moveSelected('up'),
        {
            preventDefault: true,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [getKey('BRING_FORWARD')],
    );
    useHotkeys(
        getKey('SEND_BACKWARD'),
        () => editorEngine.move.moveSelected('down'),
        {
            preventDefault: true,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [getKey('SEND_BACKWARD')],
    );

    // Project-wide text search (cmd+shift+f). Opens the project search stub.
    useHotkeys(
        getKey('OPEN_PROJECT_SEARCH'),
        () => window.dispatchEvent(new Event('open-project-search')),
        {
            preventDefault: true,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [getKey('OPEN_PROJECT_SEARCH')],
    );

    // Single-key panel shortcuts (Webflow-parity)
    // z → Navigator/Layers panel
    useHotkeys(
        getKey('OPEN_NAVIGATOR_PANEL'),
        () => toggleLeftPanelTab(LeftPanelTabValue.LAYERS),
        undefined,
        [getKey('OPEN_NAVIGATOR_PANEL')],
    );
    // j → Assets/Images panel
    useHotkeys(
        getKey('OPEN_ASSETS_PANEL'),
        () => toggleLeftPanelTab(LeftPanelTabValue.IMAGES),
        undefined,
        [getKey('OPEN_ASSETS_PANEL')],
    );
    // s → Style panel (right panel style tab)
    useHotkeys(
        getKey('OPEN_STYLE_PANEL'),
        () => window.dispatchEvent(new Event(OPEN_STYLE_PANEL_EVENT)),
        undefined,
        [getKey('OPEN_STYLE_PANEL')],
    );

    // Canvas DOM navigation — select by tree position (Webflow-parity).
    // Only fire when a canvas element is selected; otherwise let the browser
    // handle arrow-key scrolling. preventDefault is called inside the handler
    // conditionally so scrolling is preserved when nothing is selected.
    useHotkeys(
        getKey('SELECT_PARENT'),
        async (e) => {
            const selected = editorEngine.elements.selected[0];
            if (!selected) return;
            e.preventDefault();
            const frameData = editorEngine.frames.get(selected.frameId);
            if (!frameData?.view) return;
            const parent = await frameData.view.getParentElement(selected.domId);
            if (!parent?.domId) return;
            editorEngine.elements.click([parent]);
        },
        {},
        [editorEngine, getKey('SELECT_PARENT')],
    );
    useHotkeys(
        getKey('SELECT_CHILD'),
        async (e) => {
            const selected = editorEngine.elements.selected[0];
            if (!selected) return;
            e.preventDefault();
            const frameData = editorEngine.frames.get(selected.frameId);
            if (!frameData?.view) return;
            const count = await frameData.view.getChildrenCount(selected.domId);
            if (count === 0) return;
            const child = await frameData.view.getChildElement(selected.domId, 0);
            if (!child?.domId) return;
            editorEngine.elements.click([child]);
        },
        {},
        [editorEngine, getKey('SELECT_CHILD')],
    );
    useHotkeys(
        getKey('SELECT_PREV_SIBLING'),
        async (e) => {
            const selected = editorEngine.elements.selected[0];
            if (!selected) return;
            e.preventDefault();
            const frameData = editorEngine.frames.get(selected.frameId);
            if (!frameData?.view) return;
            const [index, parent] = await Promise.all([
                frameData.view.getElementIndex(selected.domId),
                frameData.view.getParentElement(selected.domId),
            ]);
            if (index <= 0 || !parent?.domId) return;
            const sibling = await frameData.view.getChildElement(parent.domId, index - 1);
            if (!sibling?.domId) return;
            editorEngine.elements.click([sibling]);
        },
        {},
        [editorEngine, getKey('SELECT_PREV_SIBLING')],
    );
    useHotkeys(
        getKey('SELECT_NEXT_SIBLING'),
        async (e) => {
            const selected = editorEngine.elements.selected[0];
            if (!selected) return;
            e.preventDefault();
            const frameData = editorEngine.frames.get(selected.frameId);
            if (!frameData?.view) return;
            const [index, parent] = await Promise.all([
                frameData.view.getElementIndex(selected.domId),
                frameData.view.getParentElement(selected.domId),
            ]);
            if (index === -1 || !parent?.domId) return;
            const parentCount = await frameData.view.getChildrenCount(parent.domId);
            if (index >= parentCount - 1) return;
            const sibling = await frameData.view.getChildElement(parent.domId, index + 1);
            if (!sibling?.domId) return;
            editorEngine.elements.click([sibling]);
        },
        {},
        [editorEngine, getKey('SELECT_NEXT_SIBLING')],
    );

    return <>{children}</>;
});
