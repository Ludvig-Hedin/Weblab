import type { RefObject } from 'react';
import { useTranslations } from 'next-intl';

import type { CodeNavigationTarget } from '@weblab/models';
import { Icons } from '@weblab/ui/icons';
import { pathsEqual } from '@weblab/utility';

import type { EditorFile } from '../shared/types';
import type { EditorView } from '@codemirror/view';
import type { CodeDraftPreflight } from '@/lib/code-drafts';
import { transKeys } from '@/i18n/keys';
import { CodeEditor } from './code-editor';
import { UnsavedChangesDialog } from './unsaved-changes-dialog';

interface CodeEditorAreaProps {
    openedFiles: EditorFile[];
    activeFile: EditorFile | null;
    showUnsavedDialog: boolean;
    navigationTarget: CodeNavigationTarget | null;
    editorViewsRef: RefObject<Map<string, EditorView>>;
    onSaveFile: () => Promise<void>;
    onSaveAndCloseFiles: () => Promise<void>;
    onUpdateFileContent: (fileId: string, content: string) => void;
    onBeforeUpdateFileContent?: CodeDraftPreflight;
    onDraftDispatchFailed?: () => void;
    onDiscardChanges: () => void;
    onCancelUnsaved: () => void;
    fileCountToClose?: number;
    onSelectionChange?: (selection: { from: number; to: number; text: string } | null) => void;
    onCursorChange?: (info: { line: number; column: number; selectionLength: number }) => void;
    onAddSelectionToChat?: (selection: { from: number; to: number; text: string }) => void;
    onFocusChatInput?: () => void;
}

export const CodeEditorArea = ({
    openedFiles,
    activeFile,
    showUnsavedDialog,
    navigationTarget,
    editorViewsRef,
    onSaveFile,
    onSaveAndCloseFiles,
    onUpdateFileContent,
    onBeforeUpdateFileContent,
    onDraftDispatchFailed,
    onDiscardChanges,
    onCancelUnsaved,
    fileCountToClose,
    onSelectionChange,
    onCursorChange,
    onAddSelectionToChat,
    onFocusChatInput,
}: CodeEditorAreaProps) => {
    const t = useTranslations();

    return (
        <div className="bg-background-canvas relative flex-1 overflow-hidden">
            <div className="h-full">
                {openedFiles.length === 0 || !activeFile ? (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3">
                        <Icons.Code className="text-foreground-quadranary h-6 w-6" />
                        <div className="text-foreground-tertiary text-small max-w-64 text-center">
                            {t(transKeys.editor.panels.code.emptyState)}
                        </div>
                    </div>
                ) : (
                    // Codemirror keeps track of editor history
                    // having one for each opened file will make a better experience despite the overhead
                    openedFiles.map((file) => (
                        <CodeEditor
                            key={file.path}
                            file={file}
                            isActive={pathsEqual(activeFile?.path, file.path)}
                            navigationTarget={
                                pathsEqual(navigationTarget?.filePath, file.path)
                                    ? navigationTarget
                                    : null
                            }
                            editorViewsRef={editorViewsRef}
                            onSaveFile={onSaveFile}
                            onUpdateFileContent={onUpdateFileContent}
                            onBeforeUpdateFileContent={onBeforeUpdateFileContent}
                            onDraftDispatchFailed={onDraftDispatchFailed}
                            onSelectionChange={
                                pathsEqual(activeFile?.path, file.path)
                                    ? onSelectionChange
                                    : undefined
                            }
                            onCursorChange={
                                pathsEqual(activeFile?.path, file.path) ? onCursorChange : undefined
                            }
                            onAddSelectionToChat={
                                pathsEqual(activeFile?.path, file.path)
                                    ? onAddSelectionToChat
                                    : undefined
                            }
                            onFocusChatInput={
                                pathsEqual(activeFile?.path, file.path)
                                    ? onFocusChatInput
                                    : undefined
                            }
                        />
                    ))
                )}
            </div>
            {showUnsavedDialog && (fileCountToClose ?? 0) > 0 && (
                <UnsavedChangesDialog
                    onSave={onSaveAndCloseFiles}
                    onDiscard={onDiscardChanges}
                    onCancel={() => {
                        onCancelUnsaved();
                    }}
                    fileCount={fileCountToClose}
                />
            )}
        </div>
    );
};
