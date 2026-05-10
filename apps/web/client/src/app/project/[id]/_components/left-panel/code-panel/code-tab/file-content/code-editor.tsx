import type { RefObject } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorView, keymap } from '@codemirror/view';
import CodeMirror from '@uiw/react-codemirror';
import { observer } from 'mobx-react-lite';

import type { CodeNavigationTarget } from '@weblab/models';
import { convertToBase64DataUrl, getMimeType, isVideoFile } from '@weblab/utility';

import type { BinaryEditorFile, EditorFile } from '../shared/types';
import type { InlineEditSession } from './inline-edit';
import type { ViewUpdate } from '@codemirror/view';
import { useEditorEngine } from '@/components/store/editor';
import { api } from '@/trpc/react';
import {
    getBasicSetup,
    getExtensions,
    getLanguageFromFileName,
    highlightElementRange,
    scrollToLineColumn,
} from './code-mirror-config';
import { parseErrorLocation, pathMatches, setEditorErrors } from './error-fix';
import { FloatingAddToChatButton } from './floating-add-to-chat-button';
import {
    closeInlineEditEffect,
    inlineEditField,
    InlineEditPrompt,
    openInlineEditEffect,
} from './inline-edit';
import { setTabCompleteContext, setTabCompleteEnabled } from './tab-complete';
import { useAiFeatureFlags } from './use-ai-feature-flags';

interface CodeEditorProps {
    file: EditorFile;
    isActive: boolean;
    navigationTarget: CodeNavigationTarget | null;
    editorViewsRef: RefObject<Map<string, EditorView>>;
    onSaveFile: () => Promise<void>;
    onUpdateFileContent: (fileId: string, content: string) => void;
    onSelectionChange?: (selection: { from: number; to: number; text: string } | null) => void;
    onAddSelectionToChat?: (selection: { from: number; to: number; text: string }) => void;
    onFocusChatInput?: () => void;
}

export const CodeEditor = observer(
    ({
        file,
        isActive,
        navigationTarget,
        editorViewsRef,
        onSaveFile,
        onUpdateFileContent,
        onSelectionChange,
        onAddSelectionToChat,
        onFocusChatInput,
    }: CodeEditorProps) => {
        const editorEngine = useEditorEngine();
        const { tabAutocomplete: tabAutocompleteEnabled } = useAiFeatureFlags();
        // Read the user's preferred chat model so tab-complete uses it
        // instead of falling back to the route's server-side default.
        const { data: userSettings } = api.user.settings.get.useQuery();
        const tabCompleteModel = userSettings?.chat.defaultModel;
        const [currentSelection, setCurrentSelection] = useState<{
            from: number;
            to: number;
            text: string;
        } | null>(null);
        const [selectionAddedToChat, setSelectionAddedToChat] = useState(false);
        const [showButton, setShowButton] = useState(false);
        const lastNavigationTargetRef = useRef<CodeNavigationTarget | null>(null);
        const [inlineEditSession, setInlineEditSession] = useState<InlineEditSession | null>(null);

        const getFileUrl = (file: BinaryEditorFile) => {
            const mime = getMimeType(file.path.toLowerCase());
            return convertToBase64DataUrl(file.content, mime);
        };

        const selectionExtension = useMemo(() => {
            return [
                EditorView.updateListener.of((update: ViewUpdate) => {
                    if (update.selectionSet) {
                        const selection = update.state.selection.main;
                        const selectedText = update.state.sliceDoc(selection.from, selection.to);

                        if (selection.from !== selection.to) {
                            const selectionData = {
                                from: selection.from,
                                to: selection.to,
                                text: selectedText,
                            };
                            setCurrentSelection(selectionData);
                            setSelectionAddedToChat(false); // Reset the flag for new selection
                            setShowButton(false); // Hide button during selection
                            onSelectionChange?.(selectionData);
                        } else {
                            setCurrentSelection(null);
                            setSelectionAddedToChat(false); // Reset when selection is cleared
                            setShowButton(false); // Hide button when no selection
                            onSelectionChange?.(null);
                        }
                    }
                    // Mirror the active inline-edit session into React state so the
                    // floating prompt re-renders as the model streams.
                    const prev = update.startState.field(inlineEditField, false) ?? null;
                    const next = update.state.field(inlineEditField, false) ?? null;
                    if (prev !== next) {
                        setInlineEditSession(next);
                    }
                }),
                // Add mousedown listener to hide button when starting selection
                EditorView.domEventHandlers({
                    mousedown: () => {
                        setShowButton(false);
                        return false;
                    },
                    mouseup: () => {
                        // Show button after mouse release if there's a selection
                        setTimeout(() => {
                            setShowButton(true);
                        }, 0);
                        return false;
                    },
                }),
                // Add CMD+L keyboard shortcut
                keymap.of([
                    {
                        key: 'Mod-l',
                        run: (view) => {
                            const selection = view.state.selection.main;
                            if (selection.from !== selection.to) {
                                const selectedText = view.state.sliceDoc(
                                    selection.from,
                                    selection.to,
                                );
                                const selectionData = {
                                    from: selection.from,
                                    to: selection.to,
                                    text: selectedText,
                                };
                                onAddSelectionToChat?.(selectionData);
                                setSelectionAddedToChat(true); // Mark as added to chat
                                onFocusChatInput?.(); // Focus chat input
                                return true;
                            }
                            return false;
                        },
                    },
                ]),
            ];
        }, [onSelectionChange, onAddSelectionToChat, onFocusChatInput]);

        const onCreateEditor = (editor: EditorView) => {
            editorViewsRef.current?.set(file.path, editor);

            // Seed tab-complete context so the extension knows what file/project it's in.
            const language = getLanguageFromFileName(file.path);
            setTabCompleteContext(editor, {
                filePath: file.path,
                language,
                projectId: editorEngine.projectId,
                enabled: file.type === 'text' && tabAutocompleteEnabled,
                model: tabCompleteModel,
            });

            if (navigationTarget && isActive) {
                // Delay navigation to ensure document is fully loaded
                setTimeout(() => {
                    handleNavigation(editor, navigationTarget);
                }, 100);
            }
        };

        const handleInlineEditApply = (newText: string) => {
            const editor = editorViewsRef.current?.get(file.path);
            const session = inlineEditSession;
            if (!editor || !session) return;
            editor.dispatch({
                changes: { from: session.from, to: session.to, insert: newText },
                effects: closeInlineEditEffect.of(),
            });
            // Persist via the existing onUpdateFileContent path so save state stays in sync.
            const newDoc = editor.state.doc.toString();
            onUpdateFileContent(file.path, newDoc);
        };

        // Flip the tab-complete flag live if the user toggles it in settings while
        // the editor is mounted. `editorViewsRef` is a stable ref — the body
        // reads `.current`, so the ref's identity isn't a meaningful dep.
        useEffect(() => {
            const editor = editorViewsRef.current?.get(file.path);
            if (!editor) return;
            setTabCompleteEnabled(editor, file.type === 'text' && tabAutocompleteEnabled);
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [tabAutocompleteEnabled, file.path, file.type]);

        // Re-seed the tab-complete model whenever the user changes their
        // default chat model in settings, so completions follow their pick.
        useEffect(() => {
            const editor = editorViewsRef.current?.get(file.path);
            if (!editor || !tabCompleteModel) return;
            setTabCompleteContext(editor, { model: tabCompleteModel });
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [tabCompleteModel, file.path]);

        // Designer Cmd+K bridge: if a pending inline-edit request was set from the
        // canvas, open the prompt at the navigated range once the file is here.
        const pendingInlineEdit = editorEngine.ide.pendingInlineEdit;
        useEffect(() => {
            if (!pendingInlineEdit || !navigationTarget) return;
            if (!isActive || file.type !== 'text') return;
            if (navigationTarget.filePath !== file.path) return;
            const editor = editorViewsRef.current?.get(file.path);
            if (!editor) return;
            const doc = editor.state.doc;
            const { range } = navigationTarget;
            const startLine = Math.max(1, Math.min(range.start.line, doc.lines));
            const endLine = Math.max(startLine, Math.min(range.end.line, doc.lines));
            const startLineObj = doc.line(startLine);
            const endLineObj = doc.line(endLine);
            const from = startLineObj.from + Math.max(0, range.start.column);
            const to = endLineObj.from + Math.max(0, range.end.column);
            const original = editor.state.sliceDoc(
                Math.min(from, doc.length),
                Math.min(to, doc.length),
            );
            editor.dispatch({
                effects: openInlineEditEffect.of({
                    from: Math.min(from, doc.length),
                    to: Math.min(to, doc.length),
                    original,
                    initialInstruction: pendingInlineEdit.instruction,
                }),
            });
            editorEngine.ide.consumePendingInlineEdit();
        }, [
            pendingInlineEdit,
            navigationTarget,
            isActive,
            file.path,
            file.type,
            editorEngine.ide,
            editorViewsRef,
        ]);

        // Sync errors from the editor engine into the gutter for the currently-open file.
        // editorEngine.branches is a MobX observable, so reading it inside an observer
        // component re-runs this effect whenever errors change.
        const allErrors = editorEngine.branches.getAllErrors();
        useEffect(() => {
            const editor = editorViewsRef.current?.get(file.path);
            if (!editor || file.type !== 'text') return;
            const locations = allErrors
                .map(parseErrorLocation)
                .filter((loc): loc is NonNullable<typeof loc> => loc !== null)
                .filter((loc) => pathMatches(loc.filePath, file.path));
            setEditorErrors(editor, locations);
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [allErrors, file.path, file.type]);

        useEffect(() => {
            // Reset last navigation when target is cleared or file changes
            if (!navigationTarget) {
                lastNavigationTargetRef.current = null;
                return;
            }

            if (!isActive || file.type !== 'text') return;

            const editor = editorViewsRef.current?.get(file.path);
            if (!editor) return;

            // Only navigate if this is a new navigation target (not just a file save)
            const isSameTarget =
                lastNavigationTargetRef.current &&
                lastNavigationTargetRef.current.filePath === navigationTarget.filePath &&
                lastNavigationTargetRef.current.range.start.line ===
                    navigationTarget.range.start.line &&
                lastNavigationTargetRef.current.range.start.column ===
                    navigationTarget.range.start.column;

            if (!isSameTarget) {
                lastNavigationTargetRef.current = navigationTarget;
                handleNavigation(editor, navigationTarget);
            }
        }, [navigationTarget, isActive, file.type, file.path, editorViewsRef.current]);

        const handleNavigation = (editor: EditorView, target: CodeNavigationTarget) => {
            const { range } = target;
            try {
                scrollToLineColumn(editor, range.start.line, range.start.column);
                editor.dispatch({
                    effects: highlightElementRange(
                        range.start.line,
                        range.start.column,
                        range.end.line,
                        range.end.column,
                    ),
                });
            } catch (error) {
                console.error('[CodeEditor] Navigation error:', error);
            }
        };

        const handleAddToChat = (selection: { from: number; to: number; text: string }) => {
            onAddSelectionToChat?.(selection);
            setSelectionAddedToChat(true); // Mark as added to chat
            onFocusChatInput?.(); // Focus chat input
        };

        return (
            <div
                className="relative h-full"
                style={{
                    display: isActive ? 'block' : 'none',
                }}
            >
                {file.type === 'binary' && (
                    <>
                        {isVideoFile(file.path) ? (
                            <video
                                src={getFileUrl(file as BinaryEditorFile)}
                                controls
                                className="h-full w-full object-contain p-5"
                            >
                                Your browser does not support the video tag.
                            </video>
                        ) : (
                            <img
                                src={getFileUrl(file as BinaryEditorFile)}
                                alt={file.path}
                                className="h-full w-full object-contain p-5"
                            />
                        )}
                    </>
                )}
                {file.type === 'text' && typeof file.content === 'string' && (
                    <>
                        <CodeMirror
                            key={file.path}
                            value={file.content}
                            height="100%"
                            theme="dark"
                            extensions={[
                                ...getBasicSetup(onSaveFile),
                                ...getExtensions(file.path.split('.').pop() || ''),
                                ...selectionExtension,
                            ]}
                            onChange={(value) => {
                                onUpdateFileContent(file.path, value);
                            }}
                            className="h-full overflow-hidden"
                            onCreateEditor={onCreateEditor}
                        />
                        {currentSelection &&
                            showButton &&
                            onAddSelectionToChat &&
                            editorViewsRef.current?.get(file.path) &&
                            !selectionAddedToChat &&
                            !inlineEditSession && (
                                <FloatingAddToChatButton
                                    editor={editorViewsRef.current.get(file.path)!}
                                    selection={currentSelection}
                                    onAddToChat={() => handleAddToChat(currentSelection)}
                                />
                            )}
                        {inlineEditSession && editorViewsRef.current?.get(file.path) && (
                            <InlineEditPrompt
                                editor={editorViewsRef.current.get(file.path)!}
                                session={inlineEditSession}
                                filePath={file.path}
                                language={getLanguageFromFileName(file.path)}
                                projectId={editorEngine.projectId}
                                onApply={handleInlineEditApply}
                            />
                        )}
                    </>
                )}
            </div>
        );
    },
);
