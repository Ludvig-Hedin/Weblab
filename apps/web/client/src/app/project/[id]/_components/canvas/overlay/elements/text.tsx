import { useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { EditorState, Selection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';

import { EditorAttributes } from '@weblab/constants';
import { colors } from '@weblab/ui/tokens';

import { useEditorEngine } from '@/components/store/editor';
import {
    applyStylesToEditor,
    createEditorPlugins,
    schema,
    isTextInputTransaction,
    createNodesFromContent,
    extractContentWithNewlines,
} from '@/components/store/editor/overlay/prosemirror';

export const TextEditor = observer(() => {
    const editorEngine = useEditorEngine();
    const overlayState = editorEngine.overlay.state;
    const isDisabled = editorEngine.text.isFinalizing;
    const editorRef = useRef<HTMLDivElement>(null);
    const editorViewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef<((content: string) => void) | undefined>(undefined);
    const onStopRef = useRef<(() => void) | undefined>(undefined);
    if (!overlayState.textEditor) {
        return null;
    }
    const { rect, styles, onChange, onStop, isComponent, content } = overlayState.textEditor;

    // Update callback refs
    onChangeRef.current = onChange;
    onStopRef.current = onStop;

    // Initialize ProseMirror (only when component mounts)
    useEffect(() => {
        if (!editorRef.current) {
            return;
        }

        const state = EditorState.create({
            schema,
            plugins: createEditorPlugins(
                () => onStopRef.current?.(),
                () => onStopRef.current?.(),
            ),
        });

        // The initial-content seed below dispatches a docChanged transaction;
        // without this flag dispatchTransaction would fire onChange(initialContent)
        // immediately — a spurious editText RPC + a no-op history push inside
        // the just-opened transaction. dispatch() is synchronous, so a closure
        // flag around the seed is sufficient.
        let seeding = false;
        const view = new EditorView(editorRef.current, {
            state,
            editable: () => !isDisabled,
            dispatchTransaction: (transaction) => {
                const newState = view.state.apply(transaction);
                view.updateState(newState);
                if (!seeding && onChangeRef.current && isTextInputTransaction(transaction)) {
                    const textContent = extractContentWithNewlines(view.state.doc);
                    onChangeRef.current(textContent);
                }
            },
            attributes: {
                style: 'height: 100%; padding: 0; margin: 0; box-sizing: border-box; overflow: hidden;',
            },
        });

        editorViewRef.current = view;

        // Set initial content with proper line break handling. Suppress
        // onChange while seeding — this is not a user edit.
        const nodes = createNodesFromContent(content);
        const paragraph = schema.node('paragraph', null, nodes);
        const newDoc = schema.node('doc', null, [paragraph]);
        const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, newDoc.content);
        seeding = true;
        try {
            view.dispatch(tr);
        } finally {
            seeding = false;
        }

        // Apply styles
        applyStylesToEditor(view, styles);

        // Focus the editor if not disabled
        if (!isDisabled) {
            view.focus();
        }

        // Attach blur handler directly to ProseMirror's contenteditable
        const handleBlur = (event: FocusEvent) => {
            if (onStopRef.current && !editorRef.current?.contains(event.relatedTarget as Node)) {
                onStopRef.current();
            }
        };
        view.dom.addEventListener('blur', handleBlur, true);

        return () => {
            view.dom.removeEventListener('blur', handleBlur, true);
            view.destroy();
        };
    }, []); // Only run on mount

    // Update content when it changes (but preserve cursor position and avoid disrupting ongoing edits)
    useEffect(() => {
        const view = editorViewRef.current;
        if (!view) return;

        const currentContent = extractContentWithNewlines(view.state.doc);
        if (currentContent !== content) {
            // Only update if the editor doesn't have focus (to avoid disrupting user typing)
            // or if the content change is significant (not just from user typing)
            if (!view.hasFocus() || Math.abs(currentContent.length - content.length) > 1) {
                const selection = view.state.selection;
                const nodes = createNodesFromContent(content);
                const paragraph = schema.node('paragraph', null, nodes);
                const newDoc = schema.node('doc', null, [paragraph]);
                const tr = view.state.tr.replaceWith(
                    0,
                    view.state.doc.content.size,
                    newDoc.content,
                );

                // Try to preserve cursor position if possible
                const targetPos = Math.min(selection.from, tr.doc.content.size);
                const newSelection =
                    targetPos < tr.doc.content.size
                        ? Selection.near(tr.doc.resolve(targetPos))
                        : Selection.atEnd(tr.doc);
                tr.setSelection(newSelection);

                view.dispatch(tr);
            }
        }
    }, [content]);

    // Update styles when they change
    useEffect(() => {
        const view = editorViewRef.current;
        if (view) {
            applyStylesToEditor(view, styles);
        }
    }, [styles]);

    // Update editor state when disabled state changes
    useEffect(() => {
        const view = editorViewRef.current;
        if (view) {
            view.setProps({ editable: () => !isDisabled });
        }
    }, [isDisabled]);

    // Wrapper box matches the element's exact border-box rect. Padding is
    // applied here (with `box-sizing: border-box`) so the inner ProseMirror
    // surface fills the original content area without growing the outer box.
    // Selection affordance uses an inset box-shadow rather than an `outline`
    // so the visible box does NOT grow by the stroke width when entering edit
    // mode.
    const accent = isComponent ? colors.purple[500] : colors.blue[400];
    return (
        <div
            ref={editorRef}
            style={{
                position: 'absolute',
                width: `${Math.max(rect.width, 10)}px`,
                height: `${Math.max(rect.height, 10)}px`,
                top: `${rect.top}px`,
                left: `${rect.left}px`,
                pointerEvents: isDisabled ? 'none' : 'auto',
                overflow: 'hidden',
                transformOrigin: 'top left',
                boxSizing: 'border-box',
                padding: '0',
                boxShadow: `inset 0 0 0 1px ${accent}`,
            }}
            data-weblab-ignore={EditorAttributes.DATA_WEBLAB_IGNORE}
            id={EditorAttributes.WEBLAB_RECT_ID}
        />
    );
});
