// apps/web/client/src/components/ai-prompt-composer/tiptap-editor.tsx
'use client';

import type { CSSProperties, MutableRefObject } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

import { cn } from '@weblab/ui/utils';

import type { MentionConfig, SlashCommand } from './types';
import type { Editor } from '@tiptap/react';
import { buildFileMentionExtension } from './extensions/file-mention';
import { buildSlashCommandsExtension } from './extensions/slash-commands';

interface TipTapEditorProps {
    value: string;
    onChange: (value: string) => void;
    onKeyDown?: (event: KeyboardEvent) => void;
    onCompositionStart?: () => void;
    onCompositionEnd?: () => void;
    onPaste?: (event: ClipboardEvent) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    style?: CSSProperties;
    editorRef?: MutableRefObject<Editor | null>;
    mentionConfig?: MentionConfig;
    slashCommands?: SlashCommand[];
    /**
     * Hard cap on plain-text characters. Pastes are truncated, keystrokes past
     * the cap are dropped. Defaults to 8000 — enough for a long prompt but
     * orders of magnitude under what would break layout or burn tokens.
     */
    maxLength?: number;
    /** Accessible label for the contenteditable; defaults to the placeholder. */
    ariaLabel?: string;
}

const DEFAULT_MAX_LENGTH = 8000;

export function TipTapEditor({
    value,
    onChange,
    onKeyDown,
    onCompositionStart,
    onCompositionEnd,
    onPaste,
    placeholder,
    disabled = false,
    className,
    style,
    editorRef,
    mentionConfig,
    slashCommands,
    maxLength = DEFAULT_MAX_LENGTH,
    ariaLabel,
}: TipTapEditorProps) {
    const onKeyDownRef = useRef(onKeyDown);
    onKeyDownRef.current = onKeyDown;

    const extensions = useMemo(
        () => [
            StarterKit.configure({
                heading: false,
                codeBlock: false,
                blockquote: false,
                horizontalRule: false,
                bulletList: false,
                orderedList: false,
            }),
            Placeholder.configure({ placeholder: placeholder ?? '' }),
            ...(mentionConfig ? [buildFileMentionExtension(mentionConfig)] : []),
            ...(slashCommands?.length ? [buildSlashCommandsExtension(slashCommands)] : []),
        ],
        [mentionConfig, slashCommands, placeholder],
    );

    const editor = useEditor({
        extensions,
        content: value || '',
        immediatelyRender: false,
        editable: !disabled,
        editorProps: {
            attributes: {
                class: cn(
                    'text-small resize-none overflow-auto rounded-none text-left outline-none',
                    'min-h-[44px] max-h-[40vh] cursor-text px-4 pb-3 pt-3.5',
                    'text-foreground-primary caret-foreground-brand bg-transparent dark:bg-transparent',
                    'selection:bg-foreground-brand/30 selection:text-foreground-brand',
                    'focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0',
                    className ?? '',
                ),
                role: 'textbox',
                'aria-multiline': 'true',
                'aria-label': ariaLabel ?? placeholder ?? 'Message',
            },
            handleKeyDown(view, event) {
                onKeyDownRef.current?.(event);
                if (event.defaultPrevented) return true;
                // Drop printable keystrokes that would push past maxLength. Allow
                // navigation, deletion, and modifier-key combos through unchanged.
                if (
                    maxLength > 0 &&
                    event.key &&
                    event.key.length === 1 &&
                    !event.metaKey &&
                    !event.ctrlKey &&
                    !event.altKey
                ) {
                    const current = view.state.doc.textBetween(
                        0,
                        view.state.doc.content.size,
                        '\n',
                    );
                    const { from, to } = view.state.selection;
                    const selectedLength =
                        from !== to
                            ? view.state.doc.textBetween(from, to, '\n').length
                            : 0;
                    const effectiveLength = current.length - selectedLength;
                    if (effectiveLength >= maxLength) {
                        event.preventDefault();
                        return true;
                    }
                }
                return false;
            },
            handleDOMEvents: {
                compositionstart: () => {
                    onCompositionStart?.();
                    return false;
                },
                compositionend: () => {
                    onCompositionEnd?.();
                    return false;
                },
                paste: (_view, event) => {
                    onPaste?.(event);
                    return false;
                },
            },
            handlePaste(view, event) {
                if (maxLength <= 0) return false;
                const text = event.clipboardData?.getData('text/plain');
                if (!text) return false;
                const current = view.state.doc.textBetween(
                    0,
                    view.state.doc.content.size,
                    '\n',
                );
                const { from, to } = view.state.selection;
                const selectedLength =
                    from !== to ? view.state.doc.textBetween(from, to, '\n').length : 0;
                const remaining = maxLength - (current.length - selectedLength);
                if (remaining <= 0) {
                    event.preventDefault();
                    return true;
                }
                if (text.length > remaining) {
                    event.preventDefault();
                    const truncated = text.slice(0, remaining);
                    view.dispatch(view.state.tr.insertText(truncated));
                    return true;
                }
                return false;
            },
        },
        onUpdate({ editor: e }) {
            onChange(e.getText({ blockSeparator: '\n' }));
        },
    });

    // Keep editorRef in sync
    useEffect(() => {
        if (editorRef) {
            editorRef.current = editor;
        }
    }, [editor, editorRef]);

    // Sync externally-set value. `value` is plain text only — setContent replaces rich
    // mention atoms with flat text, so callers must only set non-empty values before
    // the editor has mentions (i.e. transcription/suggestion fills). Clear-on-send
    // (empty string) is always safe.
    useEffect(() => {
        if (!editor) return;
        const currentText = editor.getText({ blockSeparator: '\n' });
        if (value !== currentText) {
            // emitUpdate: false prevents onChange feedback loop
            editor.commands.setContent(value ? value : '', { emitUpdate: false });
        }
    }, [value, editor]);

    // Keep editable state in sync
    useEffect(() => {
        if (!editor) return;
        editor.setEditable(!disabled, false);
    }, [disabled, editor]);

    return <EditorContent editor={editor} style={style} />;
}
