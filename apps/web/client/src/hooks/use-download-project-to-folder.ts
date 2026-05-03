'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { EXCLUDED_SYNC_PATHS } from '@weblab/constants';

import { useEditorEngine } from '@/components/store/editor';
import {
    isDirectoryEmpty,
    isFsAccessSupported,
    pickDirectory,
    writeFileToHandle,
} from '@/services/local-fs/directory-handle';

export interface DownloadProgress {
    filesWritten: number;
    totalFiles: number;
    phase: 'idle' | 'picking' | 'writing' | 'done';
}

const INITIAL_PROGRESS: DownloadProgress = {
    filesWritten: 0,
    totalFiles: 0,
    phase: 'idle',
};

/**
 * Pick a folder via the File System Access API and write the active sandbox's
 * files into it. Sourced from the editor's already-synced ZenFS layer (in
 * IndexedDB), so the export is local and fast — no extra cloud bandwidth.
 *
 * Excludes the same paths the sync engine excludes (`node_modules`, `.next`,
 * `.git`, etc.) plus any hidden top-level entries the picker walks past.
 */
export function useDownloadProjectToFolder() {
    const editorEngine = useEditorEngine();
    const [progress, setProgress] = useState<DownloadProgress>(INITIAL_PROGRESS);
    const isDownloading = progress.phase === 'picking' || progress.phase === 'writing';

    const handleDownloadToFolder = async () => {
        if (!isFsAccessSupported()) {
            toast.error('Local folder access not supported', {
                description: 'Use a Chromium-based browser like Chrome, Edge, or Arc.',
            });
            return;
        }

        const sandbox = editorEngine.activeSandbox;
        if (!sandbox) {
            toast.error('No active project to download');
            return;
        }

        setProgress({ ...INITIAL_PROGRESS, phase: 'picking' });

        try {
            const folderHandle = await pickDirectory({ mode: 'readwrite' });
            if (!folderHandle) {
                setProgress(INITIAL_PROGRESS);
                return;
            }

            // Warn before merging into a non-empty folder.
            if (!(await isDirectoryEmpty(folderHandle))) {
                const ok = window.confirm(
                    `"${folderHandle.name}" already has files in it. Continue and merge? Files with the same name will be overwritten.`,
                );
                if (!ok) {
                    setProgress(INITIAL_PROGRESS);
                    return;
                }
            }

            // Pull the file list from the local ZenFS mirror.
            const allPaths = await sandbox.listFilesRecursively('/');
            const filtered = allPaths.filter((p) => !isExcluded(p, EXCLUDED_SYNC_PATHS));

            setProgress({
                filesWritten: 0,
                totalFiles: filtered.length,
                phase: 'writing',
            });

            let filesWritten = 0;
            for (const path of filtered) {
                const content = await sandbox.readFile(path);
                // Strip leading slash for the directory-handle write helper.
                const relativePath = path.replace(/^\/+/, '');
                await writeFileToHandle(folderHandle, relativePath, content);
                filesWritten += 1;
                if (filesWritten % 25 === 0) {
                    setProgress({
                        filesWritten,
                        totalFiles: filtered.length,
                        phase: 'writing',
                    });
                }
            }

            setProgress({
                filesWritten,
                totalFiles: filtered.length,
                phase: 'done',
            });
            toast.success(`Downloaded ${filesWritten} files to ${folderHandle.name}`, {
                description: 'You can now open the folder with Claude Code, Codex, or any editor.',
            });
            // Reset shortly after so the menu state returns to idle.
            setTimeout(() => setProgress(INITIAL_PROGRESS), 1500);
        } catch (error) {
            console.error('Failed to download project to folder:', error);
            const message = error instanceof Error ? error.message : String(error);
            toast.error('Failed to download to folder', { description: message });
            setProgress(INITIAL_PROGRESS);
        }
    };

    return {
        handleDownloadToFolder,
        isDownloading,
        progress,
        isFsAccessSupported: isFsAccessSupported(),
    };
}

function isExcluded(path: string, excludeSegments: ReadonlyArray<string>): boolean {
    const normalized = path.replace(/^\/+/, '');
    const segments = normalized.split('/');
    return excludeSegments.some((excluded) => segments.includes(excluded));
}
