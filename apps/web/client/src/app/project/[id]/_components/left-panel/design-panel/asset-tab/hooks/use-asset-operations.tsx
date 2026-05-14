import path from 'path';
import { useState } from 'react';

import type { CodeFileSystem } from '@weblab/file-system';
import { IGNORED_UPLOAD_FILES } from '@weblab/constants';
import { getAssetType, sanitizeFilename } from '@weblab/utility';

import type { EditorEngine } from '@/components/store/editor/engine';
import { updateImageReferences } from '../utils/image-references';

/**
 * Mutation handlers for the Assets panel — upload, create folder, rename, move,
 * delete. The browse state and asset listing live in `useAssetBrowse`.
 */
export const useAssetOperations = (
    activeFolder: string,
    codeEditor?: CodeFileSystem,
    editorEngine?: EditorEngine,
) => {
    const [isUploading, setIsUploading] = useState(false);

    // Move a file to a new path, keeping JSX image references in sync. Non-image
    // assets are not referenced through the parser, so they are moved directly.
    const relocateAsset = async (oldPath: string, newPath: string) => {
        if (!codeEditor) throw new Error('Code editor not available');
        if (oldPath === newPath) return;

        if (await codeEditor.fileExists(newPath)) {
            throw new Error(`"${path.basename(newPath)}" already exists in that folder`);
        }

        if (getAssetType(path.basename(oldPath)) === 'image') {
            const allFiles = await codeEditor.listFiles('**/*');
            const jsFiles = allFiles.filter((f) => {
                const ext = path.extname(f);
                return (
                    ['.js', '.jsx', '.ts', '.tsx'].includes(ext) &&
                    !f.includes('node_modules') &&
                    !f.includes('.next') &&
                    !f.includes('dist') &&
                    !f.endsWith('.test.ts') &&
                    !f.endsWith('.test.tsx')
                );
            });

            const oldFileName = path.basename(oldPath);
            await Promise.all(
                jsFiles.map(async (file) => {
                    const filePath = path.join('/', file);
                    try {
                        const content = await codeEditor.readFile(filePath);
                        if (typeof content !== 'string' || !content.includes(oldFileName)) {
                            return;
                        }
                        const updatedContent = await updateImageReferences(
                            content,
                            oldPath,
                            newPath,
                        );
                        if (updatedContent !== content) {
                            await codeEditor.writeFile(filePath, updatedContent);
                        }
                    } catch (error) {
                        console.warn(`Failed to update references in ${filePath}:`, error);
                    }
                }),
            );
        }

        await codeEditor.moveFile(oldPath, newPath);

        // Refresh frame views so updated references render.
        setTimeout(() => {
            editorEngine?.frames.reloadAllViews();
        }, 500);
    };

    // Upload any file type into the active folder.
    const handleUpload = async (files: FileList) => {
        if (!codeEditor || !files.length) return;

        setIsUploading(true);
        try {
            for (const file of Array.from(files)) {
                if (IGNORED_UPLOAD_FILES.includes(file.name)) {
                    continue;
                }

                const sanitizedName = sanitizeFilename(file.name);
                const arrayBuffer = await file.arrayBuffer();
                const uint8Array = new Uint8Array(arrayBuffer);

                const filePath = path.join(activeFolder, sanitizedName);
                await codeEditor.writeFile(filePath, uint8Array);
            }
        } catch (error) {
            console.error('Failed to upload files:', error);
            throw error; // Re-throw for error handling in component
        } finally {
            setIsUploading(false);
        }
    };

    // Create a new sub-folder inside the active folder.
    const handleCreateFolder = async (name: string) => {
        if (!codeEditor) throw new Error('Code editor not available');
        const sanitized = sanitizeFilename(name).trim();
        if (!sanitized) throw new Error('Folder name cannot be empty');
        await codeEditor.createDirectory(path.join(activeFolder, sanitized));
    };

    // Rename an asset within its current folder.
    const handleRename = async (oldPath: string, newName: string) => {
        const sanitizedName = sanitizeFilename(newName);
        const newPath = path.join(path.dirname(oldPath), sanitizedName);
        await relocateAsset(oldPath, newPath);
    };

    // Move an asset into a different folder.
    const handleMove = async (assetPath: string, targetFolder: string) => {
        if (path.dirname(assetPath) === targetFolder) return;
        const newPath = path.join(targetFolder, path.basename(assetPath));
        await relocateAsset(assetPath, newPath);
    };

    // Overwrite an asset's bytes in place — used by compression and undo.
    const handleReplaceAsset = async (assetPath: string, bytes: Uint8Array) => {
        if (!codeEditor) throw new Error('Code editor not available');
        await codeEditor.writeFile(assetPath, bytes);
        setTimeout(() => {
            editorEngine?.frames.reloadAllViews();
        }, 300);
    };

    // Delete an asset.
    const handleDelete = async (filePath: string) => {
        if (!codeEditor) throw new Error('Code editor not available');
        await codeEditor.deleteFile(filePath);
    };

    return {
        isUploading,
        handleUpload,
        handleCreateFolder,
        handleRename,
        handleMove,
        handleReplaceAsset,
        handleDelete,
    };
};
