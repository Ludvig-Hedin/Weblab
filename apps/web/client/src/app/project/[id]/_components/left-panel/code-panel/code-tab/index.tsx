'use client';

import {
    forwardRef,
    memo,
    useCallback,
    useEffect,
    useLayoutEffect,
    useImperativeHandle,
    useRef,
    useState,
} from 'react';
import { motion } from 'motion/react';
import { isCloudEditorRuntime } from '@convex/lib/cloudEditor';
import { useTranslations } from 'next-intl';

import { useDirectory, useFile } from '@weblab/file-system/hooks';
import { EditorMode, MessageContextType } from '@weblab/models';
import { toast } from '@weblab/ui/sonner';
import { Button } from '@weblab/ui/button';
import { pathsEqual } from '@weblab/utility';

import type { BinaryEditorFile, EditorFile, TextEditorFile } from './shared/types';
import type { EditorView } from '@codemirror/view';
import { useEditorEngine } from '@/components/store/editor';
import { useWorkingLevelLifecycle } from '@/components/working-level/editor-gate';
import { useWorkingLevel } from '@/components/working-level/provider';
import { CodeDraftSession, listCodeDrafts, type CodeDraftRecord, type CodeDraftFile } from '@/lib/code-drafts';
import { hashContent } from '@/services/sync-engine/sync-engine';
import { CodeEditorArea } from './file-content';
import { scrollToFirstMatch } from './file-content/code-mirror-config';
import { FileBreadcrumb } from './file-breadcrumb';
import { FileTabs } from './file-tabs';
import { CodeControls } from './header-controls';
import { useCodeNavigation } from './hooks/use-code-navigation';
import { isDirty } from './shared/utils';
import { FileTree } from './sidebar/file-tree';
import { StatusBar } from './status-bar';

// Keep the number of opened files below the soft limit to avoid performance issues
const SOFT_MAX_OPENED_FILES = 7;

export interface CodeTabRef {
    hasUnsavedChanges: boolean;
    getCurrentPath: () => string;
    handleSaveFile: () => Promise<void>;
    refreshFileTree: () => void;
    handleCreateFile: (filePath: string, content?: string | Uint8Array) => Promise<void>;
    handleCreateFolder: (folderPath: string) => Promise<void>;
}

interface CodeTabProps {
    projectId: string;
    branchId: string;
}

const createEditorFile = async (
    filePath: string,
    content: string | Uint8Array,
): Promise<EditorFile> => {
    const isBinary = content instanceof Uint8Array;

    if (isBinary) {
        return {
            path: filePath,
            content: content,
            type: 'binary',
            originalHash: null,
        } satisfies BinaryEditorFile;
    } else if (typeof content === 'string') {
        const originalHash = await hashContent(content);
        return {
            path: filePath,
            content: content,
            type: 'text',
            originalHash,
        } as TextEditorFile;
    } else {
        throw new Error('Invalid content type');
    }
};

const BufferedCodeTab = memo(
    forwardRef<CodeTabRef, CodeTabProps & { draftOwner: string | null }>(({ projectId, branchId, draftOwner }, ref) => {
        const editorEngine = useEditorEngine();
        const lifecycle = useWorkingLevelLifecycle();
        const workingLevel = useWorkingLevel();
        const currentOwner = useRef(workingLevel.userId);
        currentOwner.current = workingLevel.userId;
        const tDraft = useTranslations('editor.code.drafts');
        const [protection] = useState(() => {
            if (!draftOwner) return { session: null, records: [] as CodeDraftRecord[], error: false };
            try {
                const scope = { userId: draftOwner, projectId, branchId };
                const recovery = listCodeDrafts(window.localStorage, scope);
                return { session: new CodeDraftSession(window.localStorage, scope, crypto.randomUUID()), records: recovery.records, error: recovery.unreadable };
            } catch { return { session: null, records: [] as CodeDraftRecord[], error: true }; }
        });
        const [draftError, setDraftError] = useState(protection.error);
        const [draftConflict, setDraftConflict] = useState(false);
        const approvedContent = useRef(new Map<string, string>());
        const pendingSaves = useRef(new Map<string, Promise<boolean>>());
        const live = useRef(true);
        useEffect(() => {
            live.current = true;
            return () => { live.current = false; };
        }, []);
        const assertDraftOwner = () => {
            if (draftOwner && currentOwner.current !== draftOwner) throw new Error('Draft owner changed');
        };
        const editorViewsRef = useRef<Map<string, EditorView>>(new Map());
        // Pending scroll-to-search-term request from the file-tree search.
        // Resolved by the effect below once the EditorView for the file mounts.
        const pendingScrollTermRef = useRef<{
            filePath: string;
            term: string;
        } | null>(null);
        const navigationTarget = useCodeNavigation();

        const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
        const [activeEditorFile, setActiveEditorFile] = useState<EditorFile | null>(null);
        const [openedEditorFiles, setOpenedEditorFiles] = useState<EditorFile[]>([]);
        const openedEditorFilesRef = useRef<EditorFile[]>([]);
        openedEditorFilesRef.current = openedEditorFiles;
        const cloudSource = editorEngine.branches.getBranchDataById(branchId)?.sandbox.cloudSource;
        useLayoutEffect(() => cloudSource?.registerLocalWork(() =>
            openedEditorFilesRef.current.some((file) => !!protection.session?.file(file.path))
        ), [cloudSource, protection]);
        const draftsVerified = () => {
            if (!draftOwner || !protection.session?.verified(draftOwner)) return false;
            return openedEditorFilesRef.current.every((file) => {
                if (file.type !== 'text') return true;
                const content = editorViewsRef.current.get(file.path)?.state.doc.toString() ?? file.content;
                const savedDraft = protection.session?.file(file.path);
                return savedDraft ? savedDraft.content === content && savedDraft.originalHash === file.originalHash
                    : approvedContent.current.get(file.path) === content;
            });
        };
        useLayoutEffect(() => lifecycle?.prepare(async () => {
            if (draftOwner) {
                await Promise.all([...pendingSaves.current.values()]);
                if (!draftsVerified()) throw new Error('Code draft recovery could not be verified');
                return;
            }
            // Saving here would overwrite outside changes: the existing manual
            // save path has no raw-byte CAS. Refuse before any engine disposal.
            for (const file of openedEditorFilesRef.current) {
                const view = editorViewsRef.current.get(file.path);
                const buffered = file.type === 'text' && view
                    ? { ...file, content: view.state.doc.toString() } : file;
                if (await isDirty(buffered)) throw new Error('Unsaved code buffer');
            }
        }), [lifecycle]);
        useEffect(() => {
            if (!draftOwner) return;
            const warn = (event: BeforeUnloadEvent) => {
                let verified = false;
                try { verified = draftsVerified(); } catch { /* Refuse unverified exit. */ }
                // A past failed dispatch can leave the error visible after the
                // current bytes are safe. Match the lifecycle check above.
                if (verified) return;
                event.preventDefault();
                event.returnValue = '';
            };
            window.addEventListener('beforeunload', warn);
            return () => window.removeEventListener('beforeunload', warn);
        }, [draftOwner, protection]);
        // Monotonic id assigned to each loadedContent processing pass so a
        // slow load can't overwrite state set by a faster, later load.
        const processFileSeqRef = useRef(0);
        // Last-closed file paths for Cmd+Shift+T reopen (LIFO, capped).
        const recentlyClosedRef = useRef<string[]>([]);
        const [showLocalUnsavedDialog, setShowLocalUnsavedDialog] = useState(false);
        const [filesToClose, setFilesToClose] = useState<string[]>([]);
        const discardRevisions = useRef(new Map<string, number>());
        const [isSidebarOpen, setIsSidebarOpen] = useState(true);
        const [editorSelection, setEditorSelection] = useState<{
            from: number;
            to: number;
            text: string;
        } | null>(null);
        const [cursorInfo, setCursorInfo] = useState<{
            line: number;
            column: number;
            selectionLength: number;
        } | null>(null);
        const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

        // This is a workaround to allow code controls to access the hasUnsavedChanges state
        const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
        const branchData = editorEngine.branches.getBranchDataById(branchId);
        const { entries: fileEntries, loading: filesLoading } = useDirectory(
            projectId,
            branchId,
            '/',
        );

        const { content: loadedContent } = useFile(projectId, branchId, selectedFilePath || '');

        const recoverFile = async (record: CodeDraftRecord, path: string, previous = false) => {
            try {
                assertDraftOwner();
                const session = protection.session;
                if (!session || !branchData) throw new Error('Recovery unavailable');
                const existing = openedEditorFilesRef.current.find((file) => pathsEqual(file.path, path));
                if (existing && await isDirty(existing)) throw new Error('Current buffer has unsaved edits');
                assertDraftOwner();
                const recovered = session.recover(currentOwner.current, record, path, previous);
                const restored: TextEditorFile = { type: 'text', path, content: recovered.content, originalHash: recovered.originalHash };
                const next = [...openedEditorFilesRef.current.filter((file) => !pathsEqual(file.path, path)), restored];
                openedEditorFilesRef.current = next;
                approvedContent.current.set(path, restored.content);
                setOpenedEditorFiles(next);
                setActiveEditorFile(restored);
                setSelectedFilePath(path);
                const capturedEditor = branchData.codeEditor;
                let sourceConflict: CodeDraftFile['sourceConflict'] = 'unknown';
                try {
                    const source = await capturedEditor.readFile(path);
                    sourceConflict = typeof source !== 'string' ? 'missing' : await hashContent(source) === recovered.originalHash ? null : 'changed';
                } catch { sourceConflict = 'missing'; }
                if (!live.current || currentOwner.current !== draftOwner || session.file(path)?.revision !== recovered.revision) return;
                session.checkpoint(currentOwner.current, { ...recovered, sourceConflict });
                setDraftConflict(sourceConflict !== null);
            } catch {
                setDraftError(true);
                toast.error(tDraft('recoveryFailed'));
            }
        };

        const acceptDraftChange = (path: string, content: string, external: boolean, previousContent: string, apply: () => void, applied: () => boolean): boolean => {
            if (!draftOwner) { apply(); return true; }
            try {
                assertDraftOwner();
                const file = openedEditorFilesRef.current.find((file) => pathsEqual(file.path, path));
                if (!file || file.type !== 'text' || !file.originalHash || !protection.session) throw new Error('Draft baseline unavailable');
                const own = protection.session.file(path);
                if (external) {
                    if (content !== file.content || approvedContent.current.get(path) !== content
                        || (own && (own.content !== content || own.originalHash !== file.originalHash))) return false;
                    apply();
                    return true;
                }
                protection.session.applyDocument(currentOwner.current, { path, content, originalHash: file.originalHash, sourceConflict: own?.sourceConflict ?? null }, previousContent, apply, applied);
                cloudSource?.setLocalDraftChanges(true);
                setDraftError(protection.error);
                // This receipt is pinned to a successful synchronous storage write.
                approvedContent.current.set(path, content);
                return true;
            } catch (error) { setDraftError(true); if (applied()) throw error; return false; }
        };

        // React to loadedContent changes - build local EditorFile and manage opened files
        useEffect(() => {
            // `useFile` returns `content: null` while loading/error and the real
            // value (including `''` for a genuinely empty file) once loaded.
            // Guard on `== null` so a zero-byte file can still be opened — a
            // `!loadedContent` check conflated empty-but-loaded with loading.
            if (!selectedFilePath || loadedContent == null) return;

            const seq = ++processFileSeqRef.current;
            const targetPath = selectedFilePath;

            const isStale = () =>
                !live.current || seq !== processFileSeqRef.current || !pathsEqual(targetPath, selectedFilePath)
                || (draftOwner !== null && currentOwner.current !== draftOwner);

            const processFile = async () => {
                const newLocalFile = await createEditorFile(targetPath, loadedContent);
                if (isStale()) return;
                const currentFiles = openedEditorFilesRef.current;
                const existingFileIndex = currentFiles.findIndex((f) =>
                    pathsEqual(f.path, targetPath),
                );

                if (existingFileIndex >= 0) {
                    await updateExistingFile(existingFileIndex, newLocalFile, currentFiles);
                } else {
                    await addNewFile(newLocalFile, currentFiles);
                }
            };

            const updateExistingFile = async (
                index: number,
                newFile: EditorFile,
                currentFiles: EditorFile[],
            ) => {
                const existingFile = currentFiles[index];
                if (!existingFile) return;

                // Whether the open buffer has unsaved edits — needed so a disk
                // change underneath it doesn't silently clobber the user's work.
                const existingDirty = await isDirty(existingFile);
                if (isStale()) return;

                const updatedFile = createUpdatedFile(existingFile, newFile, existingDirty);
                if (isStale()) return;
                const latest = openedEditorFilesRef.current;
                if (latest[index] !== existingFile) return;
                const updatedFiles = [...latest];
                updatedFiles[index] = updatedFile;
                approvedContent.current.set(updatedFile.path, typeof updatedFile.content === 'string' ? updatedFile.content : '');
                openedEditorFilesRef.current = updatedFiles;
                setOpenedEditorFiles(updatedFiles);
                setActiveEditorFile(updatedFile);
            };

            const addNewFile = async (newFile: EditorFile, currentFiles: EditorFile[]) => {
                // If we've reached the limit, try to close first non-dirty file
                if (currentFiles.length >= SOFT_MAX_OPENED_FILES) {
                    const dirtyChecks = await Promise.all(
                        currentFiles.map(async (file) => ({
                            file,
                            dirty: await isDirty(file),
                        })),
                    );
                    if (isStale()) return;

                    // Find first non-dirty file (not the one we're about to open)
                    const fileToClose = dirtyChecks.find(
                        (check) => !check.dirty && !pathsEqual(check.file.path, newFile.path),
                    )?.file;

                    if (fileToClose) {
                        closeFileInternal(fileToClose.path);
                    }
                }

                if (isStale()) return;
                if (openedEditorFilesRef.current.some((f) => pathsEqual(f.path, newFile.path))) return;
                const next = [...openedEditorFilesRef.current, newFile];
                openedEditorFilesRef.current = next;
                approvedContent.current.set(newFile.path, typeof newFile.content === 'string' ? newFile.content : '');
                setOpenedEditorFiles(next);
                setActiveEditorFile(newFile);
            };

            const createUpdatedFile = (
                existing: EditorFile,
                newFile: EditorFile,
                existingDirty: boolean,
            ): EditorFile => {
                if (existing.type === 'binary') {
                    return { ...existing, content: newFile.content };
                }

                const existingText = existing as TextEditorFile;
                const newText = newFile as TextEditorFile;
                const diskContentChanged = existingText.originalHash !== newText.originalHash;

                // Disk changed underneath an unsaved buffer (e.g. an AI write or
                // a design-panel restyle touched the same file the user is
                // editing in the Code tab). Adopting disk content here would
                // silently destroy the user's edits. Keep their content + hash
                // so the file stays dirty; they can save (last write wins) or
                // close the file to take the new version. Without this guard the
                // edits vanished with no signal.
                if (diskContentChanged && (existingDirty || (draftOwner && protection.session?.file(existing.path)))) {
                    if (draftOwner) {
                        const protectedFile = protection.session?.file(existing.path);
                        try {
                            if (protectedFile) protection.session?.checkpoint(currentOwner.current, { ...protectedFile, sourceConflict: 'changed' });
                        } catch { setDraftError(true); }
                        setDraftConflict(true);
                        return { ...existingText };
                    }
                    toast.warning(
                        'This file changed on disk. Your unsaved edits were kept — save to overwrite, or close the file to take the new version.',
                    );
                    return { ...existingText };
                }

                return {
                    ...existingText,
                    content: diskContentChanged ? newText.content : existingText.content,
                    originalHash: diskContentChanged
                        ? newText.originalHash
                        : existingText.originalHash,
                };
            };

            void processFile().catch(console.error);
        }, [loadedContent, selectedFilePath]);

        useEffect(() => {
            if (!navigationTarget) return;

            const { filePath } = navigationTarget;

            if (!selectedFilePath || !pathsEqual(selectedFilePath, filePath)) {
                setSelectedFilePath(filePath);
            }
        }, [navigationTarget, selectedFilePath]);

        // Track dirty state of opened files
        useEffect(() => {
            let cancelled = false;
            const checkDirtyState = async () => {
                if (openedEditorFiles.length === 0) {
                    if (!cancelled) { setHasUnsavedChanges(false); cloudSource?.setLocalDraftChanges(false); }
                    return;
                }

                const dirtyChecks = await Promise.all(
                    openedEditorFiles.map((file) => isDirty(file)),
                );
                if (cancelled) return;
                const dirty = dirtyChecks.some((value) => value);
                setHasUnsavedChanges(dirty);
                cloudSource?.setLocalDraftChanges(dirty);
            };

            void checkDirtyState();
            return () => {
                cancelled = true;
            };
        }, [openedEditorFiles]);

        const [refreshKey, setRefreshKey] = useState(0);

        const refreshFileTree = useCallback(() => {
            setRefreshKey((prev) => prev + 1);
        }, []);

        // Get current directory from selected file path or default to root
        const getCurrentPath = () => {
            if (!selectedFilePath) return '';
            const parts = selectedFilePath.split('/');
            parts.pop(); // Remove filename to get directory
            return parts.join('/');
        };

        const handleFileTreeSelect = (filePath: string, searchTerm?: string) => {
            // CR-049: when the file tree had an active search query at the moment
            // the user picked a file, capture the term so we can scroll to the
            // first match in the editor once it mounts. Cleared by the effect
            // below or when the file fails to load within the retry window.
            if (searchTerm && searchTerm.trim().length >= 2) {
                pendingScrollTermRef.current = { filePath, term: searchTerm };
            } else {
                pendingScrollTermRef.current = null;
            }
            setSelectedFilePath(filePath);
        };

        // Apply a pending search-term scroll once the EditorView for the active
        // file is mounted. The view registers itself into editorViewsRef inside
        // CodeEditor's onCreateEditor callback, which runs *after* activeEditorFile
        // is set. We poll briefly (≤1s) so we don't depend on a render-cycle
        // signal that doesn't exist.
        useEffect(() => {
            if (!activeEditorFile) return;
            const pending = pendingScrollTermRef.current;
            if (!pending || !pathsEqual(pending.filePath, activeEditorFile.path)) return;

            let cancelled = false;
            let attempts = 0;
            const maxAttempts = 20;
            const intervalId = setInterval(() => {
                if (cancelled) return;
                attempts += 1;
                const view = editorViewsRef.current.get(pending.filePath);
                if (view) {
                    scrollToFirstMatch(view, pending.term);
                    pendingScrollTermRef.current = null;
                    clearInterval(intervalId);
                } else if (attempts >= maxAttempts) {
                    pendingScrollTermRef.current = null;
                    clearInterval(intervalId);
                }
            }, 50);

            return () => {
                cancelled = true;
                clearInterval(intervalId);
            };
        }, [activeEditorFile]);

        const saveFileWithHash = async (
            filePath: string,
            file: EditorFile,
        ): Promise<EditorFile> => {
            if (!branchData) {
                throw new Error('Branch data not found');
            }

            await branchData.codeEditor.writeFile(filePath, file.content || '');

            if (file.type === 'text') {
                const newHash = await hashContent(file.content);
                return { ...file, originalHash: newHash };
            }

            return file;
        };

        const saveProtectedFile = (path: string): Promise<boolean> => {
            const pending = pendingSaves.current.get(path);
            if (pending) return pending;
            const operation = (async () => {
                try {
                    assertDraftOwner();
                    const session = protection.session;
                    const current = openedEditorFilesRef.current.find((file) => pathsEqual(file.path, path));
                    if (!session || !branchData || !current || current.type !== 'text' || !current.originalHash) throw new Error('Draft baseline unavailable');
                    const content = editorViewsRef.current.get(path)?.state.doc.toString() ?? current.content;
                    if (typeof content !== 'string') throw new Error('Only text drafts can be saved');
                    const prior = session.file(path);
                    const snapshot = prior?.content === content && prior.originalHash === current.originalHash ? prior
                        : session.checkpoint(currentOwner.current, { path, content, originalHash: current.originalHash, sourceConflict: prior?.sourceConflict ?? null });
                    const capturedEditor = branchData.codeEditor;
                    const source = await capturedEditor.readFile(path);
                    if (typeof source !== 'string') throw new Error('Source file missing');
                    const sourceHash = await hashContent(source);
                    assertDraftOwner();
                    if (sourceHash !== snapshot.originalHash) {
                        const latest = session.file(path);
                        if (latest) session.checkpoint(currentOwner.current, { ...latest, sourceConflict: 'changed' });
                        setDraftConflict(true);
                        throw new Error('Source changed');
                    }
                    const diffs = [{ path, original: source, generated: snapshot.content }];
                    await editorEngine.code.saveSourceDiffs(branchId, diffs, false, capturedEditor);
                    // The write closure mutates this original diff with its confirmed
                    // bytes. Cloud formatting must not be confused with a later read.
                    const savedContent = diffs[0]!.generated;
                    if (branchData.branch.runtime.type === 'local' && savedContent !== snapshot.content) throw new Error('Local source receipt changed');
                    const savedHash = await hashContent(savedContent);
                    assertDraftOwner();
                    const newer = session.confirmSave(currentOwner.current, snapshot, savedHash);
                    if (!live.current) return !newer;
                    const next = openedEditorFilesRef.current.map((file) => pathsEqual(file.path, path)
                        ? { ...file, content: newer?.content ?? savedContent, originalHash: savedHash } : file);
                    openedEditorFilesRef.current = next;
                    approvedContent.current.set(path, newer?.content ?? savedContent);
                    setOpenedEditorFiles(next);
                    setActiveEditorFile((file) => file && pathsEqual(file.path, path) ? next.find((candidate) => pathsEqual(candidate.path, path)) ?? file : file);
                    setLastSavedAt(Date.now());
                    setDraftError(protection.error);
                    setDraftConflict(false);
                    return !newer;
                } catch {
                    if (live.current) { setDraftError(true); toast.error(tDraft('saveFailed')); }
                    return false;
                }
            })();
            pendingSaves.current.set(path, operation);
            void operation.then(() => { if (pendingSaves.current.get(path) === operation) pendingSaves.current.delete(path); });
            return operation;
        };

        const handleSaveFile = async () => {
            if (draftOwner) {
                if (selectedFilePath) await saveProtectedFile(selectedFilePath);
                return;
            }
            if (!selectedFilePath || !activeEditorFile || !branchData) return;
            try {
                // Preserve scroll position and cursor before save
                const editorView = editorViewsRef.current.get(selectedFilePath);
                const scrollPos = editorView
                    ? {
                          top: editorView.scrollDOM.scrollTop,
                          left: editorView.scrollDOM.scrollLeft,
                      }
                    : null;

                await saveFileWithHash(selectedFilePath, activeEditorFile);

                // Read back the formatted content from disk
                const formattedContent = await branchData.codeEditor.readFile(selectedFilePath);
                if (typeof formattedContent === 'string') {
                    const newHash = await hashContent(formattedContent);
                    const formattedFile: TextEditorFile = {
                        ...(activeEditorFile as TextEditorFile),
                        content: formattedContent,
                        originalHash: newHash,
                    };

                    // Update in opened files list
                    const updatedFiles = openedEditorFiles.map((file) =>
                        pathsEqual(file.path, selectedFilePath) ? formattedFile : file,
                    );
                    setOpenedEditorFiles(updatedFiles);
                    setActiveEditorFile(formattedFile);
                    setLastSavedAt(Date.now());

                    // Restore scroll position after content update with multiple attempts to ensure it sticks
                    if (scrollPos && editorView) {
                        const restoreScroll = () => {
                            editorView.scrollDOM.scrollTop = scrollPos.top;
                            editorView.scrollDOM.scrollLeft = scrollPos.left;
                        };

                        // Use multiple RAF cycles to ensure the scroll is applied after all reflows
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                restoreScroll();
                                // One more check after a short delay to handle any final adjustments
                                setTimeout(restoreScroll, 10);
                            });
                        });
                    }
                }
            } catch (error) {
                console.error('Failed to save file:', error);
                toast.error(
                    `Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`,
                );
            }
        };

        const handleSaveAndCloseFiles = async () => {
            if (draftOwner) {
                // Sequential saves retain every refused or concurrently edited buffer.
                for (const path of filesToClose) {
                    if (await saveProtectedFile(path)) {
                        const current = openedEditorFilesRef.current.find((file) => pathsEqual(file.path, path));
                        if (current && !await isDirty(current) && openedEditorFilesRef.current.find((file) => pathsEqual(file.path, path)) === current
                            && editorViewsRef.current.get(path)?.state.doc.toString() === current.content
                            && !protection.session?.file(path) && currentOwner.current === draftOwner) closeFileInternal(path);
                    }
                }
                setFilesToClose([]);
                setShowLocalUnsavedDialog(false);
                return;
            }
            try {
                // Save all files in filesToClose
                await Promise.all(
                    filesToClose.map(async (filePath) => {
                        const fileToSave = openedEditorFiles.find((f) =>
                            pathsEqual(f.path, filePath),
                        );
                        if (!fileToSave) return;

                        await saveFileWithHash(filePath, fileToSave);
                    }),
                );

                // Close the files (no need to update hashes since we're closing them)
                filesToClose.forEach((filePath) => closeFileInternal(filePath));
                setFilesToClose([]);
                setShowLocalUnsavedDialog(false);
            } catch (error) {
                console.error('Failed to save files:', error);
                toast.error(
                    `Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`,
                );
            }
        };

        const canCloseSnapshot = (file: EditorFile, revision: number | undefined) => {
            if (!live.current || (draftOwner && currentOwner.current !== draftOwner)
                || openedEditorFilesRef.current.find((current) => pathsEqual(current.path, file.path)) !== file
                || protection.session?.file(file.path)?.revision !== revision) return false;
            return (editorViewsRef.current.get(file.path)?.state.doc.toString() ?? file.content) === file.content;
        };

        const closeLocalFile = useCallback(
            (filePath: string) => {
                const fileToClose = openedEditorFilesRef.current.find((f) => pathsEqual(f.path, filePath));
                if (fileToClose) {
                    const capturedRevision = protection.session?.file(filePath)?.revision;
                    isDirty(fileToClose).then((dirty) => {
                        if (!canCloseSnapshot(fileToClose, capturedRevision)) return;
                        if (dirty) {
                            if (capturedRevision !== undefined) discardRevisions.current.set(filePath, capturedRevision);
                            setFilesToClose([filePath]);
                            setShowLocalUnsavedDialog(true);
                            return;
                        }

                        closeFileInternal(filePath);
                    });
                }
            },
            [openedEditorFiles, canCloseSnapshot, protection.session],
        );

        const closeAllLocalFiles = () => {
            Promise.all(
                openedEditorFilesRef.current.map(async (file) => ({
                    file,
                    revision: protection.session?.file(file.path)?.revision,
                    dirty: await isDirty(file),
                })),
            ).then((fileStatuses) => {
                const currentStatuses = fileStatuses.filter(({ file, revision }) => canCloseSnapshot(file, revision));
                // Close clean files immediately
                const cleanFiles = currentStatuses.filter((status) => !status.dirty);
                cleanFiles.forEach((status) => closeFileInternal(status.file.path));

                // Check if any dirty files remain
                const dirtyFiles = currentStatuses.filter((status) => status.dirty);
                if (dirtyFiles.length > 0) {
                    for (const { file, revision } of dirtyFiles) {
                        if (revision !== undefined) discardRevisions.current.set(file.path, revision);
                    }
                    setFilesToClose(dirtyFiles.map((status) => status.file.path));
                    setShowLocalUnsavedDialog(true);
                    return;
                }
            });
        };

        const handleLocalFileTabSelect = (file: EditorFile) => {
            setActiveEditorFile(file);
            setSelectedFilePath(file.path);
        };

        const updateLocalFileContent = (filePath: string, content: string) => {
            if (draftOwner && currentOwner.current !== draftOwner) return;
            const updatedFiles = openedEditorFilesRef.current.map((file) =>
                pathsEqual(file.path, filePath) ? { ...file, content } : file,
            );
            openedEditorFilesRef.current = updatedFiles;
            approvedContent.current.set(filePath, content);
            setOpenedEditorFiles(updatedFiles);

            // Update active file if it's the one being updated
            if (activeEditorFile && pathsEqual(activeEditorFile.path, filePath)) {
                const updatedActiveFile = { ...activeEditorFile, content };
                setActiveEditorFile(updatedActiveFile);
            }
        };

        // Centralized function to close a file and clean up resources
        const closeFileInternal = (filePath: string) => {
            const editorView = editorViewsRef.current.get(filePath);
            if (editorView) {
                editorView.destroy();
                editorViewsRef.current.delete(filePath);
            }

            // Remember this path for Mod+Shift+T reopen (LIFO, cap 10).
            recentlyClosedRef.current = [
                filePath,
                ...recentlyClosedRef.current.filter((p) => !pathsEqual(p, filePath)),
            ].slice(0, 10);

            const updatedFiles = openedEditorFilesRef.current.filter((f) => !pathsEqual(f.path, filePath));
            openedEditorFilesRef.current = updatedFiles;
            setOpenedEditorFiles(updatedFiles);

            // Update active file if we're closing it.
            setActiveEditorFile((currentActive) => {
                if (currentActive && pathsEqual(currentActive.path, filePath)) {
                    return updatedFiles.length > 0 ? (updatedFiles[updatedFiles.length - 1] ?? null) : null;
                }
                return currentActive;
            });

            // Clear selected file path if the closed file was selected
            setSelectedFilePath((prev) => {
                if (prev && pathsEqual(prev, filePath)) return null;
                return prev;
            });
        };

        const discardLocalFileChanges = () => {
            filesToClose.forEach((filePath) => {
                if (draftOwner) {
                    try {
                        assertDraftOwner();
                        const revision = discardRevisions.current.get(filePath);
                        if (revision === undefined || !protection.session?.discard(currentOwner.current, filePath, revision)) return;
                    } catch { setDraftError(true); return; }
                }
                closeFileInternal(filePath);
            });
            setFilesToClose([]);
            setShowLocalUnsavedDialog(false);
        };

        const handleRenameFile = async (oldPath: string, newPath: string) => {
            if (!branchData?.codeEditor) return;

            const fileName = oldPath.split('/').pop() || 'file';
            const newFileName = newPath.split('/').pop() || 'file';

            const opened = openedEditorFilesRef.current.find((f) => pathsEqual(f.path, oldPath));
            if (opened && (await isDirty(opened))) {
                toast.error(
                    `Cannot rename "${fileName}" with unsaved changes. Save or discard first.`,
                );
                return;
            }

            // Guard against clobbering an existing file. `moveFile` does a raw
            // rename with no collision check, so renaming onto an existing path
            // would silently overwrite/destroy that file. Skip the check for a
            // no-op rename to the same path.
            if (!pathsEqual(oldPath, newPath) && (await branchData.codeEditor.fileExists(newPath))) {
                toast.error(`A file named "${newFileName}" already exists.`);
                return;
            }

            const movePromise = branchData.codeEditor.moveFile(oldPath, newPath);
            toast.promise(movePromise, {
                loading: `Renaming ${fileName}...`,
                success: `Renamed to ${newFileName}`,
                error: (error) =>
                    `Failed to rename: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
            try {
                await movePromise;
            } catch {
                return;
            }

            const view = editorViewsRef.current.get(oldPath);
            if (view) {
                editorViewsRef.current.delete(oldPath);
                editorViewsRef.current.set(newPath, view);
            }

            setOpenedEditorFiles((prev) =>
                prev.map((f) => (pathsEqual(f.path, oldPath) ? { ...f, path: newPath } : f)),
            );
            setActiveEditorFile((prev) =>
                prev && pathsEqual(prev.path, oldPath) ? { ...prev, path: newPath } : prev,
            );
            setSelectedFilePath((prev) => (prev && pathsEqual(prev, oldPath) ? newPath : prev));
        };

        const handleDeleteFile = (path: string) => {
            if (!branchData?.codeEditor) return;

            const fileName = path.split('/').pop() || 'item';
            const isDirectory = fileEntries.some((entry) => {
                const checkPath = (e: (typeof fileEntries)[0]): boolean => {
                    if (pathsEqual(e.path, path)) return e.isDirectory;
                    if (e.children) return e.children.some(checkPath);
                    return false;
                };
                return checkPath(entry);
            });

            const deletion = branchData.codeEditor.deleteFile(path);
            // Close any open tab for the deleted file (or any descendant of a
            // deleted directory). Otherwise the tab's EditorView keeps pointing
            // at a path that no longer exists on disk and Save / read-back /
            // dirty-check all silently fail.
            void deletion
                .then(() => {
                    const prefix = `${path}/`;
                    const orphaned = openedEditorFilesRef.current
                        .map((f) => f.path)
                        .filter((p) => pathsEqual(p, path) || p.startsWith(prefix));
                    orphaned.forEach((p) => closeFileInternal(p));
                })
                .catch(() => {
                    // Delete failed — toast.promise surfaces the error; leave
                    // the tabs open so the user doesn't lose unsaved work.
                });

            toast.promise(deletion, {
                loading: `Deleting ${fileName}...`,
                success: `${isDirectory ? 'Folder' : 'File'} "${fileName}" deleted`,
                error: (error) =>
                    `Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
        };

        const handleCreateFile = async (filePath: string, content: string | Uint8Array = '') => {
            if (!branchData) {
                throw new Error('Branch data not found');
            }

            const fileName = filePath.split('/').pop() || 'file';

            await toast.promise(branchData.codeEditor.writeFile(filePath, content), {
                loading: `Creating ${fileName}...`,
                success: `File "${fileName}" created`,
                error: (error) =>
                    `Failed to create file: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
        };

        const handleCreateFolder = async (folderPath: string) => {
            if (!branchData?.codeEditor) {
                throw new Error('Code editor not available');
            }

            const folderName = folderPath.split('/').pop() || 'folder';

            await toast.promise(branchData.codeEditor.createDirectory(folderPath), {
                loading: `Creating ${folderName}...`,
                success: `Folder "${folderName}" created`,
                error: (error) =>
                    `Failed to create folder: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
        };

        // Expose functions through ref. This won't be needed once we move the code controls
        useImperativeHandle(
            ref,
            (): CodeTabRef => ({
                hasUnsavedChanges,
                getCurrentPath,
                handleSaveFile,
                refreshFileTree,
                handleCreateFile,
                handleCreateFolder,
            }),
            [
                hasUnsavedChanges,
                getCurrentPath,
                handleSaveFile,
                refreshFileTree,
                handleCreateFile,
                handleCreateFolder,
            ],
        );

        // Handle adding selection to chat
        const handleAddSelectionToChat = useCallback(
            (selection: { from: number; to: number; text: string }) => {
                if (!selection || !selectedFilePath || !activeEditorFile?.content) return;

                try {
                    // Calculate line numbers from character positions
                    const content =
                        typeof activeEditorFile.content === 'string'
                            ? activeEditorFile.content
                            : '';

                    // Validate selection indices
                    if (typeof selection.from !== 'number' || typeof selection.to !== 'number') {
                        console.error('Invalid selection: from and to must be numbers', selection);
                        toast.error('Invalid selection');
                        return;
                    }

                    // Ensure from < to
                    if (selection.from >= selection.to) {
                        console.error('Invalid selection: from must be less than to', selection);
                        toast.error('Invalid selection range');
                        return;
                    }

                    // Clamp indices to valid range [0, content.length]
                    const from = Math.max(0, Math.min(selection.from, content.length));
                    const to = Math.max(0, Math.min(selection.to, content.length));

                    // Double-check after clamping
                    if (from >= to) {
                        console.error('Invalid selection after clamping', {
                            from,
                            to,
                            contentLength: content.length,
                        });
                        toast.error('Selection is out of bounds');
                        return;
                    }

                    const beforeSelection = content.substring(0, from);
                    const selectionContent = content.substring(from, to);
                    const startLine = beforeSelection.split('\n').length;
                    const endLine = startLine + selectionContent.split('\n').length - 1;

                    const fileName = selectedFilePath.split('/').pop() || selectedFilePath;
                    // Add highlight context (selected code snippet)
                    editorEngine.chat.context.addContexts([
                        {
                            type: MessageContextType.HIGHLIGHT,
                            path: selectedFilePath,
                            content: selection.text,
                            displayName: fileName + ' (' + startLine + ':' + endLine + ')',
                            start: startLine,
                            end: endLine,
                            branchId: branchId,
                        },
                    ]);

                    toast.success('Selection added to chat context');
                } catch (error) {
                    console.error('Error adding selection to chat:', error);
                    toast.error('Failed to add selection to chat');
                }
            },
            [selectedFilePath, activeEditorFile, branchId, editorEngine.chat.context],
        );

        // Cleanup editor instances when component unmounts
        useEffect(() => {
            return () => {
                editorViewsRef.current.forEach((view) => view.destroy());
                editorViewsRef.current.clear();
            };
        }, []);

        // Code-tab keyboard shortcuts. Browser-reserved chords (Cmd+W, Cmd+T)
        // are deliberately avoided — we use Cmd+\ to close and Cmd+Shift+T
        // (works while focus is in the editor; the browser ignores it then).
        useEffect(() => {
            const handler = (e: KeyboardEvent) => {
                if (editorEngine.state.editorMode !== EditorMode.CODE) return;
                // Don't fight typing inside non-code inputs (modals, search).
                const target = e.target as HTMLElement | null;
                const inFreeInput =
                    target &&
                    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') &&
                    !target.closest('.cm-editor');
                const mod = e.metaKey || e.ctrlKey;
                if (!mod) return;

                // Cmd+\ — close active tab
                if (!e.shiftKey && !e.altKey && e.key === '\\') {
                    const active = activeEditorFile;
                    if (!active) return;
                    e.preventDefault();
                    closeLocalFile(active.path);
                    return;
                }
                // Cmd+Shift+T — reopen most recently closed
                if (e.shiftKey && !e.altKey && (e.key === 'T' || e.key === 't')) {
                    const next = recentlyClosedRef.current.shift();
                    if (!next) return;
                    e.preventDefault();
                    setSelectedFilePath(next);
                    return;
                }
                // Cmd+Alt+ArrowRight / ArrowLeft — next / prev tab
                if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
                    if (inFreeInput) return;
                    const files = openedEditorFilesRef.current;
                    if (files.length < 2 || !activeEditorFile) return;
                    e.preventDefault();
                    const idx = files.findIndex((f) => pathsEqual(f.path, activeEditorFile.path));
                    const delta = e.key === 'ArrowRight' ? 1 : -1;
                    const next = files[(idx + delta + files.length) % files.length];
                    if (next) handleLocalFileTabSelect(next);
                }
            };
            window.addEventListener('keydown', handler);
            return () => window.removeEventListener('keydown', handler);
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [activeEditorFile, editorEngine.state.editorMode]);

        // Handle adding file to chat
        const handleAddFileToChat = useCallback(
            async (filePath: string) => {
                if (!branchData) return;

                try {
                    const fileName = filePath.split('/').pop() || filePath;

                    // Load the file content
                    const fileContent = await branchData.codeEditor.readFile(filePath);
                    if (!fileContent) {
                        throw new Error('Failed to load file');
                    }

                    // Convert content to string (handle both string and Uint8Array)
                    const contentString =
                        typeof fileContent === 'string'
                            ? fileContent
                            : new TextDecoder().decode(fileContent);

                    editorEngine.chat.context.addContexts([
                        {
                            type: MessageContextType.FILE,
                            path: filePath,
                            displayName: fileName,
                            branchId: branchId,
                            content: contentString,
                        },
                    ]);

                    toast.success('File added to chat');
                } catch (error) {
                    console.error('Failed to add file to chat:', error);
                    toast.error('Failed to add file to chat');
                }
            },
            [branchId, branchData, editorEngine.chat.context],
        );

        return (
            <div className="flex size-full flex-col">
                {draftOwner && <div className="border-b border-border px-3 py-2 text-xs">
                    <p role={draftError || draftConflict ? 'alert' : 'status'} className="text-foreground-secondary">
                        {draftError ? tDraft('storageFailed') : draftConflict ? tDraft('sourceChanged') : tDraft('protected')}
                    </p>
                    {protection.records.length > 0 && <details className="mt-1">
                        <summary className="cursor-pointer">{tDraft('recover')}</summary>
                        <div className="mt-2 max-h-32 space-y-1 overflow-auto">
                            {protection.records.map((record) => record.files.map((file) => <div key={`${record.writerId}:${file.path}`} className="flex items-center justify-between gap-2">
                                <span className="min-w-0 truncate">{file.path} · {new Date(record.updatedAt).toLocaleString()}</span>
                                <div className="flex gap-1">
                                    <Button size="sm" variant="outline" onClick={() => void recoverFile(record, file.path)}>{tDraft('recoverVersion')}</Button>
                                    {file.previous && <Button size="sm" variant="outline" onClick={() => void recoverFile(record, file.path, true)}>{tDraft('recoverPrevious')}</Button>}
                                </div>
                            </div>))}
                        </div>
                    </details>}
                    {(draftConflict || draftError) && activeEditorFile?.type === 'text' && <Button size="sm" variant="ghost" onClick={() => {
                        const content = editorViewsRef.current.get(activeEditorFile.path)?.state.doc.toString() ?? activeEditorFile.content;
                        if (typeof content === 'string') void navigator.clipboard.writeText(content).catch(() => toast.error(tDraft('copyFailed')));
                    }}>{tDraft('copy')}</Button>}
                </div>}
                <CodeControls
                    isDirty={hasUnsavedChanges}
                    currentPath={getCurrentPath()}
                    fileEntries={fileEntries}
                    onSave={handleSaveFile}
                    onRefresh={refreshFileTree}
                    onCreateFile={handleCreateFile}
                    onCreateFolder={handleCreateFolder}
                    isSidebarOpen={isSidebarOpen}
                    setIsSidebarOpen={setIsSidebarOpen}
                />
                <div className="flex min-h-0 flex-1 overflow-auto">
                    <motion.div
                        initial={false}
                        animate={{
                            width: isSidebarOpen ? 'auto' : 0,
                            opacity: isSidebarOpen ? 1 : 0,
                        }}
                        transition={{
                            duration: 0.3,
                            ease: [0.4, 0.0, 0.2, 1],
                        }}
                        className="min-h-0 flex-shrink-0 overflow-y-auto"
                        style={{ minWidth: 0 }}
                    >
                        <FileTree
                            key={refreshKey}
                            onFileSelect={handleFileTreeSelect}
                            fileEntries={fileEntries}
                            isLoading={filesLoading}
                            selectedFilePath={selectedFilePath}
                            onDeleteFile={handleDeleteFile}
                            onRenameFile={handleRenameFile}
                            onRefresh={() => {}}
                            onAddToChat={handleAddFileToChat}
                        />
                    </motion.div>
                    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                        <FileTabs
                            openedFiles={openedEditorFiles}
                            activeFile={activeEditorFile}
                            onFileSelect={handleLocalFileTabSelect}
                            onCloseFile={closeLocalFile}
                            onCloseAllFiles={closeAllLocalFiles}
                        />
                        <FileBreadcrumb activeFile={activeEditorFile} />
                        <CodeEditorArea
                            editorViewsRef={editorViewsRef}
                            openedFiles={openedEditorFiles}
                            activeFile={activeEditorFile}
                            showUnsavedDialog={showLocalUnsavedDialog}
                            navigationTarget={navigationTarget}
                            onSaveFile={handleSaveFile}
                            onSaveAndCloseFiles={handleSaveAndCloseFiles}
                            onUpdateFileContent={updateLocalFileContent}
                            onBeforeUpdateFileContent={acceptDraftChange}
                            onDraftDispatchFailed={() => setDraftError(true)}
                            onDiscardChanges={discardLocalFileChanges}
                            onCancelUnsaved={() => {
                                setFilesToClose([]);
                                setShowLocalUnsavedDialog(false);
                            }}
                            fileCountToClose={filesToClose.length}
                            onSelectionChange={setEditorSelection}
                            onCursorChange={setCursorInfo}
                            onAddSelectionToChat={handleAddSelectionToChat}
                            onFocusChatInput={() => editorEngine.chat.focusChatInput()}
                        />
                        <StatusBar
                            activeFile={activeEditorFile}
                            cursorInfo={cursorInfo}
                            hasUnsavedChanges={hasUnsavedChanges}
                            lastSavedAt={lastSavedAt}
                        />
                    </div>
                </div>
            </div>
        );
    }),
);

export const CodeTab = memo(forwardRef<CodeTabRef, CodeTabProps>((props, ref) => {
    const level = useWorkingLevel();
    // A retained old editor never adopts the next signed-in user's storage key.
    const engine = useEditorEngine();
    const cloud = isCloudEditorRuntime(engine.branches.getBranchDataById(props.branchId)?.branch.runtime);
    const owner = useRef(level.native || cloud ? level.userId : null);
    return <BufferedCodeTab {...props} ref={ref} draftOwner={owner.current}
        key={owner.current ? JSON.stringify([owner.current, props.projectId, props.branchId]) : 'hosted'} />;
}));
