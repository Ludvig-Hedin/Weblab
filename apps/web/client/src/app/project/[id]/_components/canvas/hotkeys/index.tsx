import type { ReactNode } from 'react';
import { observer } from 'mobx-react-lite';
import { useHotkeys } from 'react-hotkeys-hook';

import { DefaultSettings, EditorAttributes } from '@weblab/constants';
import { EditorMode, InsertMode, LeftPanelTabValue } from '@weblab/models';
import { toast } from '@weblab/ui/sonner';

import { Hotkey } from '@/components/hotkey';
import { useEditorEngine } from '@/components/store/editor';
import { useStateManager } from '@/components/store/state';

export const HotkeysArea = observer(({ children }: { children: ReactNode }) => {
    const editorEngine = useEditorEngine();
    const stateManager = useStateManager();
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

    // Canvas chrome — Figma parity. Both stay active even while a panel
    // input owns focus (enableOnFormTags) so the user doesn't have to
    // click out of the right panel to toggle rulers/guides.
    useHotkeys(
        getKey('TOGGLE_RULERS'),
        () => editorEngine.canvas.toggleRulers(),
        {
            preventDefault: true,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
        [getKey('TOGGLE_RULERS')],
    );
    useHotkeys(
        getKey('TOGGLE_LAYOUT_GUIDES'),
        () => editorEngine.canvas.toggleLayoutGuides(),
        {
            preventDefault: true,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
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
                toast.info('Select an element first to inline-edit');
                return;
            }
            const oid = selected.instanceId ?? selected.oid;
            if (!oid) {
                toast.error("Can't locate this element's source.");
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
            editorEngine.state.setEditorMode(EditorMode.DESIGN);
            if (!editorEngine.text.isEditing) {
                editorEngine.clearUI();
            }
        },
        undefined,
        [getKey('ESCAPE')],
    );
    useHotkeys(getKey('PAN'), () => editorEngine.state.setEditorMode(EditorMode.PAN), undefined, [
        getKey('PAN'),
    ]);
    useHotkeys(
        getKey('COMMENT'),
        () => editorEngine.state.setEditorMode(EditorMode.COMMENT),
        undefined,
        [getKey('COMMENT')],
    );
    useHotkeys(
        getKey('TOGGLE_COMMENTS'),
        () => editorEngine.comment.toggleCommentsVisible(),
        {
            preventDefault: true,
            enableOnFormTags: true,
            enableOnContentEditable: true,
        },
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
        { enableOnFormTags: true, enableOnContentEditable: true },
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
            if (editorEngine.state.editorMode === EditorMode.PAN) return;
            editorEngine.state.setEditorMode(EditorMode.PAN);
        },
        { keydown: true },
    );
    // Releasing space mid-pan flipped the editor straight back to DESIGN even
    // when an active middle-mouse / space-drag pan was in flight, breaking the
    // gesture. Skip the flip while a canvas pan is active — the pan-end
    // handler in canvas/index.tsx restores DESIGN mode itself.
    useHotkeys(
        'space',
        () => {
            if (editorEngine.state.canvasPanning) return;
            editorEngine.state.setEditorMode(EditorMode.DESIGN);
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
            if (
                editorEngine.elements.selected.length === 0 &&
                editorEngine.frames.selected.length === 0
            ) {
                return;
            }
            e.preventDefault();
            editorEngine.copy.copy();
            toast.success('Copied');
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
            if (
                editorEngine.elements.selected.length === 0 &&
                editorEngine.frames.selected.length === 0
            ) {
                return;
            }
            e.preventDefault();
            editorEngine.copy.cut();
            toast.success('Cut');
        },
        { enableOnFormTags: true, enableOnContentEditable: true },
        [getKey('CUT')],
    );
    useHotkeys(
        getKey('DUPLICATE'),
        (e) => {
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
    useHotkeys(
        getKey('MOVE_LAYER_UP'),
        () => editorEngine.move.moveSelected('up'),
        { enableOnFormTags: true, enableOnContentEditable: true },
        [getKey('MOVE_LAYER_UP')],
    );
    useHotkeys(
        getKey('MOVE_LAYER_DOWN'),
        () => editorEngine.move.moveSelected('down'),
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

    return <>{children}</>;
});
