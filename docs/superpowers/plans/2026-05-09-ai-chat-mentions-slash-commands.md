# AI Chat @-Mentions and /Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain `<Textarea>` in `AiPromptComposer` with a TipTap rich-text editor that supports `@file/folder` mentions (inline blue chip + automatic context pill) and `/command` palette (mode switching, conversation management, utility actions).

**Architecture:** TipTap (`@tiptap/react`) replaces the `<Textarea>` inside `AiPromptComposer` with a visually identical `contenteditable` div. Two TipTap extensions handle `@` and `/` triggers; they show React-based floating popovers and call back into the React layer to add context pills and execute commands. `AiPromptComposer` gains two optional props (`mentionConfig`, `slashCommands`) so hero/create variants are unaffected. `ChatInput` provides both props using the `editorEngine` and the `CodeFileSystem.listAll()` method already used by the file tree panel.

**Tech Stack:** TipTap v2 (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-mention`, `@tiptap/extension-placeholder`), existing `@weblab/ui` components, existing `CodeFileSystem.listAll()` / `codeEditor.readFile()` from `editorEngine.branches.activeBranchData`.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/components/ai-prompt-composer/types.ts` | `MentionItem`, `MentionConfig`, `SlashCommand` shared interfaces |
| Create | `src/components/ai-prompt-composer/mention-list.tsx` | Keyboard-navigable file-search popup UI |
| Create | `src/components/ai-prompt-composer/slash-list.tsx` | Keyboard-navigable slash command palette UI |
| Create | `src/components/ai-prompt-composer/extensions/file-mention.tsx` | TipTap extension for `@` trigger — wires `@tiptap/extension-mention` to `mentionConfig` |
| Create | `src/components/ai-prompt-composer/extensions/slash-commands.tsx` | Custom TipTap extension for `/` trigger — collects query, renders `SlashList`, executes command |
| Create | `src/components/ai-prompt-composer/tiptap-editor.tsx` | TipTap wrapper replacing `<Textarea>` — identical styling, controlled via `value`/`onChange` |
| Modify | `src/components/ai-prompt-composer/index.tsx` | Add `mentionConfig?`, `slashCommands?` props; swap `<Textarea>` for `<TipTapEditor>` |
| Modify | `src/app/project/[id]/_components/right-panel/chat-tab/chat-input/index.tsx` | Build and pass `mentionConfig` (file search + context add) and `slashCommands` (mode/convo/utility actions); switch textarea refs to editor refs |

---

### Task 1: Install TipTap dependencies

**Files:**
- Modify: `apps/web/client/package.json`

- [ ] **Step 1: Install packages**

```bash
cd apps/web/client && bun add @tiptap/react @tiptap/starter-kit @tiptap/extension-mention @tiptap/extension-placeholder @tiptap/suggestion
```

`@tiptap/suggestion` is the standalone suggestion plugin; it ships as a transitive dep of `@tiptap/extension-mention` but we import it directly in the slash-commands extension, so it must be listed explicitly.

Expected: packages added to `apps/web/client/package.json` `dependencies`. No errors. If you see peer-dep warnings about React version, ignore them.

- [ ] **Step 2: Commit**

```bash
git add apps/web/client/package.json bun.lockb
git commit -m "feat(chat): install TipTap deps for rich-text composer"
```

---

### Task 2: Create shared types

**Files:**
- Create: `apps/web/client/src/components/ai-prompt-composer/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// apps/web/client/src/components/ai-prompt-composer/types.ts
import type React from 'react';

export interface MentionItem {
    id: string;
    label: string;
    path: string;
    isDirectory: boolean;
}

export interface MentionConfig {
    searchFiles: (query: string) => Promise<MentionItem[]>;
    onMentionSelect: (item: MentionItem) => void;
}

export interface SlashCommand {
    name: string;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    action: () => void;
    keywords?: string[];
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/client/src/components/ai-prompt-composer/types.ts
git commit -m "feat(chat): add MentionItem, MentionConfig, SlashCommand types"
```

---

### Task 3: MentionList component

**Files:**
- Create: `apps/web/client/src/components/ai-prompt-composer/mention-list.tsx`

- [ ] **Step 1: Create the component**

```tsx
// apps/web/client/src/components/ai-prompt-composer/mention-list.tsx
'use client';

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import type { MentionItem } from './types';

interface MentionListProps {
    items: MentionItem[];
    command: (item: MentionItem) => void;
}

export interface MentionListRef {
    onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const MentionList = forwardRef<MentionListRef, MentionListProps>(
    ({ items, command }, ref) => {
        const [selectedIndex, setSelectedIndex] = useState(0);

        useEffect(() => {
            setSelectedIndex(0);
        }, [items]);

        useImperativeHandle(ref, () => ({
            onKeyDown({ event }) {
                if (event.key === 'ArrowUp') {
                    setSelectedIndex((prev) => (prev - 1 + Math.max(items.length, 1)) % Math.max(items.length, 1));
                    return true;
                }
                if (event.key === 'ArrowDown') {
                    setSelectedIndex((prev) => (prev + 1) % Math.max(items.length, 1));
                    return true;
                }
                if (event.key === 'Enter') {
                    const item = items[selectedIndex];
                    if (item) {
                        command(item);
                    }
                    return true;
                }
                return false;
            },
        }));

        if (items.length === 0) {
            return (
                <div className="text-foreground-tertiary px-3 py-2 text-xs">No results</div>
            );
        }

        return (
            <div className="flex max-h-64 flex-col overflow-y-auto">
                {items.map((item, index) => (
                    <button
                        key={item.id}
                        type="button"
                        className={cn(
                            'flex items-center gap-2 px-3 py-1.5 text-left text-xs',
                            'hover:bg-background-secondary cursor-pointer',
                            index === selectedIndex && 'bg-background-secondary',
                        )}
                        onMouseDown={(e) => {
                            e.preventDefault();
                            command(item);
                        }}
                    >
                        {item.isDirectory ? (
                            <Icons.FolderOpen className="text-foreground-tertiary h-3.5 w-3.5 shrink-0" />
                        ) : (
                            <Icons.File className="text-foreground-tertiary h-3.5 w-3.5 shrink-0" />
                        )}
                        <span className="text-foreground-primary truncate">{item.label}</span>
                        {item.label !== item.path && (
                            <span className="text-foreground-tertiary ml-auto shrink-0 truncate pl-4 font-mono">
                                {item.path}
                            </span>
                        )}
                    </button>
                ))}
            </div>
        );
    },
);
MentionList.displayName = 'MentionList';
```

> **Note:** Verify that `Icons.FolderOpen` and `Icons.File` exist in `@weblab/ui/icons`. If they don't, substitute with available icon names (check the icons export in `packages/ui/src/components/icons.tsx`). Any file/folder icon pair works.

- [ ] **Step 2: Commit**

```bash
git add apps/web/client/src/components/ai-prompt-composer/mention-list.tsx
git commit -m "feat(chat): add MentionList popup component for @ file search"
```

---

### Task 4: SlashList component

**Files:**
- Create: `apps/web/client/src/components/ai-prompt-composer/slash-list.tsx`

- [ ] **Step 1: Create the component**

```tsx
// apps/web/client/src/components/ai-prompt-composer/slash-list.tsx
'use client';

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

import { cn } from '@weblab/ui/utils';

import type { SlashCommand } from './types';

interface SlashListProps {
    items: SlashCommand[];
    command: (item: SlashCommand) => void;
}

export interface SlashListRef {
    onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const SlashList = forwardRef<SlashListRef, SlashListProps>(({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
        setSelectedIndex(0);
    }, [items]);

    useImperativeHandle(ref, () => ({
        onKeyDown({ event }) {
            if (event.key === 'ArrowUp') {
                setSelectedIndex((prev) => (prev - 1 + Math.max(items.length, 1)) % Math.max(items.length, 1));
                return true;
            }
            if (event.key === 'ArrowDown') {
                setSelectedIndex((prev) => (prev + 1) % Math.max(items.length, 1));
                return true;
            }
            if (event.key === 'Enter') {
                const item = items[selectedIndex];
                if (item) {
                    command(item);
                }
                return true;
            }
            return false;
        },
    }));

    if (items.length === 0) {
        return (
            <div className="text-foreground-tertiary px-3 py-2 text-xs">No commands found</div>
        );
    }

    return (
        <div className="flex max-h-64 flex-col overflow-y-auto">
            {items.map((item, index) => {
                const Icon = item.icon;
                return (
                    <button
                        key={item.name}
                        type="button"
                        className={cn(
                            'flex items-center gap-2 px-3 py-1.5 text-left',
                            'hover:bg-background-secondary cursor-pointer',
                            index === selectedIndex && 'bg-background-secondary',
                        )}
                        onMouseDown={(e) => {
                            e.preventDefault();
                            command(item);
                        }}
                    >
                        <Icon className="text-foreground-tertiary h-3.5 w-3.5 shrink-0" />
                        <span className="text-foreground-primary text-xs font-medium">{item.label}</span>
                        <span className="text-foreground-tertiary ml-auto text-xs">{item.description}</span>
                    </button>
                );
            })}
        </div>
    );
});
SlashList.displayName = 'SlashList';
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/client/src/components/ai-prompt-composer/slash-list.tsx
git commit -m "feat(chat): add SlashList popup component for / command palette"
```

---

### Task 5: FileMention TipTap extension

**Files:**
- Create: `apps/web/client/src/components/ai-prompt-composer/extensions/file-mention.tsx`

- [ ] **Step 1: Create the extension**

```tsx
// apps/web/client/src/components/ai-prompt-composer/extensions/file-mention.tsx
'use client';

import { ReactRenderer } from '@tiptap/react';
import Mention from '@tiptap/extension-mention';

import type { MentionConfig, MentionItem } from '../types';
import { MentionList } from '../mention-list';
import type { MentionListRef } from '../mention-list';

export function buildFileMentionExtension(config: MentionConfig) {
    return Mention.extend({
        // Serialize mention nodes as "@label" when getText() is called
        renderText({ node }: { node: { attrs: { label?: string; id?: string } } }) {
            return `@${node.attrs.label ?? node.attrs.id ?? ''}`;
        },
    }).configure({
        HTMLAttributes: {
            class:
                'bg-blue-500/10 text-blue-400 rounded px-1 py-0.5 text-sm font-medium cursor-default select-none',
        },
        suggestion: {
            items: async ({ query }: { query: string }) => {
                return config.searchFiles(query);
            },
            render: () => {
                let component: ReactRenderer<MentionListRef>;
                let popupEl: HTMLDivElement;

                return {
                    onStart(props: {
                        items: MentionItem[];
                        command: (item: MentionItem) => void;
                        clientRect?: (() => DOMRect | null) | null;
                    }) {
                        component = new ReactRenderer(MentionList, {
                            props: {
                                items: props.items,
                                command: (item: MentionItem) => {
                                    // TipTap inserts the node using id+label attrs only
                                    props.command({ id: item.path, label: item.label });
                                    config.onMentionSelect(item);
                                },
                            },
                            editor: (props as { editor: ConstructorParameters<typeof ReactRenderer>[2]['editor'] }).editor,
                        });

                        popupEl = document.createElement('div');
                        popupEl.className =
                            'bg-background-primary border-border absolute z-50 min-w-[240px] max-w-sm overflow-hidden rounded-lg border shadow-lg';
                        popupEl.appendChild(component.element);
                        document.body.appendChild(popupEl);

                        const rect = props.clientRect?.();
                        if (rect) {
                            positionPopup(popupEl, rect);
                        }
                    },

                    onUpdate(props: {
                        items: MentionItem[];
                        command: (item: MentionItem) => void;
                        clientRect?: (() => DOMRect | null) | null;
                    }) {
                        component.updateProps({
                            items: props.items,
                            command: (item: MentionItem) => {
                                props.command({ id: item.path, label: item.label, ...item });
                                config.onMentionSelect(item);
                            },
                        });
                        const rect = props.clientRect?.();
                        if (rect) {
                            positionPopup(popupEl, rect);
                        }
                    },

                    onKeyDown(props: { event: KeyboardEvent }) {
                        if (props.event.key === 'Escape') {
                            popupEl.style.display = 'none';
                            return true;
                        }
                        return component.ref?.onKeyDown(props) ?? false;
                    },

                    onExit() {
                        popupEl.remove();
                        component.destroy();
                    },
                };
            },
        },
    });
}

function positionPopup(el: HTMLDivElement, rect: DOMRect) {
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const popupHeight = Math.min(el.offsetHeight || 264, 264);

    if (spaceBelow >= popupHeight || spaceBelow >= spaceAbove) {
        el.style.top = `${rect.bottom + window.scrollY + 4}px`;
    } else {
        el.style.top = `${rect.top + window.scrollY - popupHeight - 4}px`;
    }
    el.style.left = `${Math.max(8, Math.min(rect.left + window.scrollX, window.innerWidth - 256))}px`;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/client/src/components/ai-prompt-composer/extensions/file-mention.tsx
git commit -m "feat(chat): add FileMention TipTap extension for @ file/folder triggers"
```

---

### Task 6: SlashCommands TipTap extension

**Files:**
- Create: `apps/web/client/src/components/ai-prompt-composer/extensions/slash-commands.tsx`

- [ ] **Step 1: Create the extension**

```tsx
// apps/web/client/src/components/ai-prompt-composer/extensions/slash-commands.tsx
'use client';

import { Extension } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import Suggestion from '@tiptap/suggestion';

import type { SlashCommand } from '../types';
import { SlashList } from '../slash-list';
import type { SlashListRef } from '../slash-list';

export function buildSlashCommandsExtension(commands: SlashCommand[]) {
    return Extension.create({
        name: 'slashCommands',

        addOptions() {
            return { commands };
        },

        addProseMirrorPlugins() {
            return [
                Suggestion({
                    editor: this.editor,
                    char: '/',
                    allowSpaces: false,
                    startOfLine: false,
                    items: ({ query }: { query: string }) => {
                        const q = query.toLowerCase();
                        return commands.filter(
                            (cmd) =>
                                cmd.name.includes(q) ||
                                cmd.label.toLowerCase().includes(q) ||
                                cmd.keywords?.some((k) => k.includes(q)),
                        );
                    },
                    render: () => {
                        let component: ReactRenderer<SlashListRef>;
                        let popupEl: HTMLDivElement;

                        return {
                            onStart(props: {
                                items: SlashCommand[];
                                command: (item: SlashCommand) => void;
                                clientRect?: (() => DOMRect | null) | null;
                                editor: { commands: { deleteRange: (range: { from: number; to: number }) => void } };
                                range: { from: number; to: number };
                            }) {
                                component = new ReactRenderer(SlashList, {
                                    props: {
                                        items: props.items,
                                        command: (item: SlashCommand) => {
                                            // Delete the slash + query text before running the action
                                            props.command(item);
                                            item.action();
                                        },
                                    },
                                    editor: props.editor as Parameters<typeof ReactRenderer>[2]['editor'],
                                });

                                popupEl = document.createElement('div');
                                popupEl.className =
                                    'bg-background-primary border-border absolute z-50 min-w-[280px] max-w-sm overflow-hidden rounded-lg border shadow-lg';
                                popupEl.appendChild(component.element);
                                document.body.appendChild(popupEl);

                                const rect = props.clientRect?.();
                                if (rect) {
                                    positionPopup(popupEl, rect);
                                }
                            },

                            onUpdate(props: {
                                items: SlashCommand[];
                                command: (item: SlashCommand) => void;
                                clientRect?: (() => DOMRect | null) | null;
                                editor: { commands: { deleteRange: (range: { from: number; to: number }) => void } };
                                range: { from: number; to: number };
                            }) {
                                component.updateProps({
                                    items: props.items,
                                    command: (item: SlashCommand) => {
                                        props.command(item);
                                        item.action();
                                    },
                                });
                                const rect = props.clientRect?.();
                                if (rect) {
                                    positionPopup(popupEl, rect);
                                }
                            },

                            onKeyDown(props: { event: KeyboardEvent }) {
                                if (props.event.key === 'Escape') {
                                    popupEl.style.display = 'none';
                                    return true;
                                }
                                return component.ref?.onKeyDown(props) ?? false;
                            },

                            onExit() {
                                popupEl.remove();
                                component.destroy();
                            },
                        };
                    },
                }),
            ];
        },
    });
}

function positionPopup(el: HTMLDivElement, rect: DOMRect) {
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const popupHeight = Math.min(el.offsetHeight || 264, 264);

    if (spaceBelow >= popupHeight || spaceBelow >= spaceAbove) {
        el.style.top = `${rect.bottom + window.scrollY + 4}px`;
    } else {
        el.style.top = `${rect.top + window.scrollY - popupHeight - 4}px`;
    }
    el.style.left = `${Math.max(8, Math.min(rect.left + window.scrollX, window.innerWidth - 288))}px`;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/client/src/components/ai-prompt-composer/extensions/slash-commands.tsx
git commit -m "feat(chat): add SlashCommands TipTap extension for / command palette"
```

---

### Task 7: TipTapEditor component

**Files:**
- Create: `apps/web/client/src/components/ai-prompt-composer/tiptap-editor.tsx`

- [ ] **Step 1: Create the TipTap editor wrapper**

```tsx
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
            // Disable block-level formatting we don't need in a chat input
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
        editable: !disabled,
        editorProps: {
            attributes: {
                // Mirror all classes from AI_CHAT_TEXTAREA_CLASS
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
            // false = do not emit onUpdate, preventing a feedback loop
            editor.commands.setContent(value ? value : '', false);
        }
    }, [value, editor]);

    // Keep editable state in sync with disabled prop
    useEffect(() => {
        if (!editor) return;
        editor.setEditable(!disabled, false);
    }, [disabled, editor]);

    return (
        <EditorContent
            editor={editor}
            style={style}
            // The placeholder text is rendered via CSS on the .ProseMirror::before pseudo-element.
            // Add placeholder styles to globals.css (see Task 7 Step 2).
        />
    );
}
```

- [ ] **Step 2: Add placeholder CSS to globals.css**

Open `apps/web/client/src/app/globals.css` and add these styles at the bottom (before the closing of any block):

```css
/* TipTap chat input placeholder */
.ProseMirror p.is-editor-empty:first-child::before {
    content: attr(data-placeholder);
    @apply text-foreground-primary/50 pointer-events-none float-left h-0;
}

/* TipTap mention chip */
.ProseMirror .mention {
    @apply bg-blue-500/10 text-blue-400 rounded px-1 py-0.5 text-sm font-medium;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/client/src/components/ai-prompt-composer/tiptap-editor.tsx apps/web/client/src/app/globals.css
git commit -m "feat(chat): add TipTapEditor component with mention/slash support"
```

---

### Task 8: Update AiPromptComposer

**Files:**
- Modify: `apps/web/client/src/components/ai-prompt-composer/index.tsx`

- [ ] **Step 1: Add new imports and prop types**

In `apps/web/client/src/components/ai-prompt-composer/index.tsx`, make the following changes:

**Add imports** (after the existing imports):
```typescript
import type { Editor } from '@tiptap/react';

import type { MentionConfig, SlashCommand } from './types';
import { TipTapEditor } from './tiptap-editor';
```

**Add to `AiPromptComposerProps` interface** (after `textareaRef`):
```typescript
    editorRef?: React.MutableRefObject<Editor | null>;
    mentionConfig?: MentionConfig;
    slashCommands?: SlashCommand[];
```

**Add to destructured props in `AiPromptComposer`** (after `textareaRef`):
```typescript
    editorRef,
    mentionConfig,
    slashCommands,
```

- [ ] **Step 2: Replace `<Textarea>` with `<TipTapEditor>`**

Find the `<Textarea ... />` block (around line 282-301 in the original file) and replace it entirely with:

```tsx
<TipTapEditor
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    disabled={disabled}
    className={cn(
        classes.textarea,
        maxTextareaClassName,
        textareaClassName,
    )}
    style={AI_CHAT_TEXTAREA_STYLE as CSSProperties}
    onKeyDown={onKeyDown as ((event: KeyboardEvent) => void) | undefined}
    onCompositionStart={onCompositionStart}
    onCompositionEnd={onCompositionEnd}
    onPaste={onPaste as ((event: ClipboardEvent) => void) | undefined}
    editorRef={editorRef}
    mentionConfig={mentionConfig}
    slashCommands={slashCommands}
/>
```

- [ ] **Step 3: Update `isEmpty` check**

The current `isEmpty` is `value.trim().length === 0`. This still works because `onChange` always receives the plain text string from `TipTapEditor`. No change needed.

- [ ] **Step 4: Remove the old `Textarea` import**

Remove the `import { Textarea } from '@weblab/ui/textarea';` line if `Textarea` is no longer used elsewhere in the file. Check that it's only used in the one spot we just replaced.

- [ ] **Step 5: Commit**

```bash
git add apps/web/client/src/components/ai-prompt-composer/index.tsx
git commit -m "feat(chat): swap Textarea for TipTapEditor in AiPromptComposer"
```

---

### Task 9: Update ChatInput

**Files:**
- Modify: `apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-input/index.tsx`

- [ ] **Step 1: Add imports**

Add to the top of the file (after existing imports):

```typescript
import type { Editor } from '@tiptap/react';

import type { MentionConfig, MentionItem, SlashCommand } from '@/components/ai-prompt-composer/types';
```

- [ ] **Step 2: Replace `textareaRef` with `editorRef`**

Replace:
```typescript
const textareaRef = useRef<HTMLTextAreaElement>(null);
```
With:
```typescript
const editorRef = useRef<Editor | null>(null);
```

- [ ] **Step 3: Update `focusInput`**

Replace:
```typescript
const focusInput = () => {
    requestAnimationFrame(() => {
        textareaRef.current?.focus();
    });
};
```
With:
```typescript
const focusInput = () => {
    requestAnimationFrame(() => {
        editorRef.current?.commands.focus();
    });
};
```

- [ ] **Step 4: Update focus checks**

Replace:
```typescript
if (textareaRef.current && !isStreaming) {
```
With:
```typescript
if (editorRef.current && !isStreaming) {
```

(This appears in two `useEffect` calls — update both.)

- [ ] **Step 5: Update `handleKeyDown` to work with `KeyboardEvent`**

The existing `handleKeyDown` receives `React.KeyboardEvent<HTMLTextAreaElement>`. With TipTap, it will receive a plain `KeyboardEvent`. Replace the entire function:

```typescript
const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        const handled = suggestionRef.current?.handleTabNavigation(e.shiftKey);
        if (!handled) {
            editorRef.current?.commands.focus();
        }
    } else if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
        e.preventDefault();
        e.stopPropagation();
        if (suggestionRef.current?.handleEnterSelection()) {
            setTimeout(() => editorRef.current?.commands.focus(), 0);
            return;
        }
        if (!inputEmpty) {
            void sendMessage();
        }
    }
};
```

- [ ] **Step 6: Update `handleInput` — remove it**

The `handleInput` function handled auto-height for the textarea. TipTap's `contenteditable` div grows automatically via CSS (`min-h` + no `max-h` by default). Remove the `handleInput` function entirely and remove `onInput={handleInput}` from the `<AiPromptComposer>` prop.

- [ ] **Step 7: Add `mentionConfig` builder**

Add this block before the `return` statement in the component:

```typescript
const mentionConfig: MentionConfig = {
    searchFiles: async (query: string): Promise<MentionItem[]> => {
        const branchData = editorEngine.branches.activeBranchData;
        if (!branchData) return [];

        try {
            const all = await branchData.codeEditor.listAll();
            const q = query.toLowerCase();
            return all
                .filter(({ path }) => path.toLowerCase().includes(q))
                .slice(0, 20)
                .map(({ path, type }) => {
                    const isDirectory = type === 'directory';
                    const label = isDirectory
                        ? `${path.split('/').filter(Boolean).at(-1) ?? path}/`
                        : (path.split('/').at(-1) ?? path);
                    return { id: path, label, path, isDirectory };
                });
        } catch {
            return [];
        }
    },

    onMentionSelect: (item: MentionItem) => {
        const branchId = editorEngine.branches.activeBranch?.id;
        if (!branchId) return;

        const branchData = editorEngine.branches.activeBranchData;
        if (!branchData) return;

        if (item.isDirectory) {
            // Add up to 20 files from the directory
            void branchData.codeEditor.listFiles(`${item.path}/**/*`).then((paths) => {
                const limited = paths.slice(0, 20);
                void Promise.all(
                    limited.map(async (filePath) => {
                        try {
                            const content = await branchData.codeEditor.readFile(filePath);
                            if (content instanceof Uint8Array) return null;
                            return {
                                type: MessageContextType.FILE as const,
                                path: filePath,
                                displayName: filePath.split('/').at(-1) ?? filePath,
                                content,
                                branchId,
                            };
                        } catch {
                            return null;
                        }
                    }),
                ).then((contexts) => {
                    const valid = contexts.filter(
                        (c): c is NonNullable<typeof c> => c !== null,
                    );
                    if (valid.length > 0) {
                        editorEngine.chat.context.addContexts(valid);
                    }
                });
            });
        } else {
            void branchData.codeEditor.readFile(item.path).then((content) => {
                if (content instanceof Uint8Array) return;
                editorEngine.chat.context.addContexts([
                    {
                        type: MessageContextType.FILE,
                        path: item.path,
                        displayName: item.label,
                        content,
                        branchId,
                    },
                ]);
            });
        }
    },
};
```

- [ ] **Step 8: Add `slashCommands` builder**

Add this block right after the `mentionConfig` block:

```typescript
const slashCommands: SlashCommand[] = [
    {
        name: 'ask',
        label: 'Ask',
        description: 'Switch to Ask mode',
        icon: Icons.Ask,
        action: () => { editorEngine.state.chatMode = ChatType.ASK; },
        keywords: ['ask', 'question'],
    },
    {
        name: 'edit',
        label: 'Edit',
        description: 'Switch to Edit mode',
        icon: Icons.Build,
        action: () => { editorEngine.state.chatMode = ChatType.EDIT; },
        keywords: ['edit', 'build', 'code'],
    },
    {
        name: 'create',
        label: 'Create',
        description: 'Switch to Create mode',
        icon: Icons.PlusCircled,
        action: () => { editorEngine.state.chatMode = ChatType.CREATE; },
        keywords: ['create', 'new', 'component'],
    },
    {
        name: 'fix',
        label: 'Fix',
        description: 'Switch to Fix mode',
        icon: Icons.AlertTriangle,
        action: () => { editorEngine.state.chatMode = ChatType.FIX; },
        keywords: ['fix', 'bug', 'error'],
    },
    {
        name: 'new',
        label: 'New chat',
        description: 'Start a new conversation',
        icon: Icons.Plus,
        action: () => { void editorEngine.chat.conversation.startNewConversation(); },
        keywords: ['new', 'conversation', 'clear'],
    },
    {
        name: 'image',
        label: 'Add image',
        description: 'Attach an image',
        icon: Icons.Image,
        action: () => {
            // Trigger the existing image input — find the hidden file input and click it
            const input = document.querySelector<HTMLInputElement>('input[type="file"][accept="image/*"]');
            input?.click();
        },
        keywords: ['image', 'photo', 'screenshot'],
    },
];
```

> **Note:** Verify icon names `Icons.Ask`, `Icons.Build`, `Icons.PlusCircled`, `Icons.AlertTriangle`, `Icons.Plus`, `Icons.Image` exist in `@weblab/ui/icons`. If `PlusCircled` or `AlertTriangle` don't exist, substitute available icons (e.g. `Icons.Plus` for create, `Icons.Bug` or `Icons.Warning` for fix).

- [ ] **Step 9: Pass the new props to `<AiPromptComposer>`**

In the `<AiPromptComposer>` JSX, replace `textareaRef={textareaRef}` with `editorRef={editorRef}`, and add the two new props:

```tsx
<AiPromptComposer
    // ... all existing props unchanged ...
    editorRef={editorRef}        // replaces textareaRef
    mentionConfig={mentionConfig}
    slashCommands={slashCommands}
    // remove: textareaRef={textareaRef}
    // remove: onInput={handleInput}
/>
```

- [ ] **Step 10: Commit**

```bash
git add apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-input/index.tsx
git commit -m "feat(chat): wire @ file mentions and / slash commands in ChatInput"
```

---

### Task 10: Typecheck and lint

**Files:** None — validation only

- [ ] **Step 1: Run typecheck**

```bash
cd /path/to/repo && bun typecheck
```

Expected: zero TypeScript errors. Common issues to fix:
- `onKeyDown` type mismatch between `KeyboardEvent` (TipTap) and `React.KeyboardEvent`: update the `AiPromptComposerProps` type for `onKeyDown` to `(event: KeyboardEvent) => void` and ensure callers that don't use the editor (hero/create) either aren't passing `onKeyDown` or are fine with the cast.
- `Icons.FolderOpen`, `Icons.File`, `Icons.PlusCircled`, `Icons.AlertTriangle` — if any of these don't exist in `@weblab/ui/icons`, replace with valid icon names. Run `grep -n "export" packages/ui/src/components/icons.tsx | head -60` to see what's available.
- `buildFileMentionExtension` return type — TipTap generics can be tricky; add `as ReturnType<typeof Mention.configure>` cast if needed.

- [ ] **Step 2: Run lint**

```bash
bun lint
```

Expected: zero warnings. Fix any unused variable warnings from the removed `textareaRef` or `handleInput`.

- [ ] **Step 3: Commit any fixes**

```bash
git add -p
git commit -m "fix(chat): resolve typecheck and lint errors in mention/slash implementation"
```

---

## Verification Checklist

1. Open a project and type `@` in the chat input → popover appears below cursor with file list
2. Continue typing (e.g. `@src`) → list filters to matching files/folders
3. Press `↑`/`↓` to navigate, `Enter` to select → blue chip appears inline; matching context pill appears above input
4. Select a folder → up to 20 files added as context pills
5. Type `/` → slash command palette appears
6. Type `/edi` → list filters to "Edit"; Enter → chat mode switches to Edit
7. Type `/ask` → Enter → chat mode switches to Ask
8. Type `/new` → Enter → new conversation starts; palette closes; no `/new` text in editor
9. Press `Escape` while popover is open → popover closes, cursor stays in editor
10. Submit a message containing a mention → AI receives text with `@path/to/file` inline + file context
11. Click a suggestion chip (existing feature) → `setInputValue` updates editor content correctly
12. Hero / create page forms: type `@` and `/` → **no popover fires** (these pages don't pass `mentionConfig`/`slashCommands`)
13. IME input (e.g. Chinese/Japanese): composing should not trigger `@` or `/` popup prematurely
14. `bun typecheck` passes, `bun lint` passes
