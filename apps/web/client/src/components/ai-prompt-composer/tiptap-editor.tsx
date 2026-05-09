// apps/web/client/src/components/ai-prompt-composer/tiptap-editor.tsx
'use client';

import type { CSSProperties, MutableRefObject } from 'react';
import { useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/react';
import { EditorContent, useEditor } from '@tiptap/react';
import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';

import { cn } from '@weblab/ui/utils';

import type { MentionConfig, SlashCommand } from './types';
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
}

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
}: TipTapEditorProps) {
    const onKeyDownRef = useRef(onKeyDown);
    onKeyDownRef.current = onKeyDown;

    const extensions = [
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
    ];

    const editor = useEditor({
        extensions,
        content: value || '',
        immediatelyRender: false,
        editable: !disabled,
        editorProps: {
            attributes: {
                class: cn(
                    'text-small resize-none rounded-none outline-none',
                    'text-foreground-primary caret-foreground-brand bg-transparent',
                    'selection:bg-foreground-brand/30 selection:text-foreground-brand',
                    'cursor-text min-h-[44px]',
                    className ?? '',
                ),
            },
            handleKeyDown(_view, event) {
                onKeyDownRef.current?.(event);
                return event.defaultPrevented;
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

    // Sync externally-set value (e.g. suggestion clicks, clear-on-send)
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
