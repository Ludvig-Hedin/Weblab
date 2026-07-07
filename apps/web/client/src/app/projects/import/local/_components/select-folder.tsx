'use client';

import { useCallback, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { APP_NAME, IGNORED_UPLOAD_DIRECTORIES, IGNORED_UPLOAD_FILES } from '@weblab/constants';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@weblab/ui/alert-dialog';
import { Button } from '@weblab/ui/button';
import { CardDescription, CardTitle } from '@weblab/ui/card';
import { Icons } from '@weblab/ui/icons';
import { isBinaryFile } from '@weblab/utility';

import type { NextJsProjectValidation, ProcessedFile } from '@/app/projects/types';
import { ProcessedFileType } from '@/app/projects/types';
import { useProjectCreation } from '../_context';
import { StepContent, StepFooter, StepHeader } from '../../steps';

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

declare module 'react' {
    interface InputHTMLAttributes<T> extends HTMLAttributes<T> {
        webkitdirectory?: string;
        directory?: string;
    }
}

export const NewSelectFolder = () => {
    const t = useTranslations('projects.importLocal');
    const {
        projectData,
        setProjectData,
        nextStep,
        resetProjectData,
        cancel,
        validateNextJsProject,
        autoDetectFramework,
    } = useProjectCreation();
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState('');
    const [validation, setValidation] = useState<NextJsProjectValidation | null>(null);
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const extractProjectName = (files: ProcessedFile[]): string | null => {
        const packageJsonFile = files.find(
            (f) => f.path.endsWith('package.json') && f.type === ProcessedFileType.TEXT,
        );

        if (packageJsonFile) {
            try {
                const packageJson = JSON.parse(packageJsonFile.content as string);
                return packageJson.name || null;
            } catch (error) {
                console.warn('Error parsing package.json for name:', error);
            }
        }

        return null;
    };

    const handleClickUpload = () => {
        fileInputRef.current?.click();
    };

    const filterAndProcessFiles = async (files: File[]): Promise<ProcessedFile[]> => {
        const processedFiles: ProcessedFile[] = [];
        // Track files skipped because they exceed MAX_FILE_SIZE_BYTES so we can
        // surface a toast at the end (issue #39).
        const skippedLargeFiles: string[] = [];

        // Find the common root path from all files
        const allPaths = files.map((file) => file.webkitRelativePath || file.name);

        if (!allPaths[0]) {
            return processedFiles;
        }

        const rootPath =
            allPaths.length > 0 && allPaths[0].includes('/') ? allPaths[0].split('/')[0] : '';

        for (const file of files) {
            // Get relative path from webkitRelativePath or name
            // Remove the root path from the relative path
            let relativePath = file.webkitRelativePath || file.name;
            if (!rootPath) {
                continue;
            }
            relativePath = relativePath.replace(rootPath, '').replace(/^\//, '');

            // Skip ignored directories
            if (
                IGNORED_UPLOAD_DIRECTORIES.some(
                    (dir) => relativePath.includes(`${dir}/`) || relativePath.startsWith(`${dir}/`),
                )
            ) {
                continue;
            }

            // Skip ignored files
            if (IGNORED_UPLOAD_FILES.includes(file.name)) {
                continue;
            }

            let processedFile: ProcessedFile;

            // Skip if file is too large — record it so the user gets a toast
            // instead of a silent drop (issue #39).
            if (file.size > MAX_FILE_SIZE_BYTES) {
                console.warn(`Skipping large file: ${file.name} (${file.size} bytes)`);
                skippedLargeFiles.push(file.name);
                continue;
            }

            // Determine if file is binary
            const type = isBinaryFile(file.name)
                ? ProcessedFileType.BINARY
                : ProcessedFileType.TEXT;
            try {
                if (type === ProcessedFileType.BINARY) {
                    processedFile = {
                        path: relativePath,
                        content: await file.arrayBuffer(),
                        type: ProcessedFileType.BINARY,
                    };
                } else {
                    processedFile = {
                        path: relativePath,
                        content: await file.text(),
                        type: ProcessedFileType.TEXT,
                    };
                }

                processedFiles.push(processedFile);
            } catch (error) {
                console.warn(`Error reading file ${file.name}:`, error);
            }
        }

        // Surface skipped large files so users aren't surprised by missing
        // pieces of their project (issue #39). package.json being too large is
        // fatal for the import — flag it as an error so the user understands.
        if (skippedLargeFiles.length > 0) {
            const previewNames = skippedLargeFiles.slice(0, 3).join(', ');
            const overflow = skippedLargeFiles.length > 3 ? ', …' : '';
            const message = `${skippedLargeFiles.length} file(s) skipped (over ${MAX_FILE_SIZE_MB}MB): ${previewNames}${overflow}`;

            if (skippedLargeFiles.includes('package.json')) {
                toast.error(
                    "package.json is too large to upload — Weblab can't import this project.",
                );
            } else {
                toast.warning(message);
            }
        }

        return processedFiles;
    };

    const processProjectFiles = async (fileList: FileList | File[]) => {
        setError('');
        setIsUploading(true);

        try {
            const files = Array.from(fileList);
            const fullPath = files[0]?.webkitRelativePath;

            // Normalize path by removing leading slash if present
            const normalizedPath = fullPath?.startsWith('/') ? fullPath.substring(1) : fullPath;
            const folderPath = normalizedPath?.substring(0, normalizedPath.indexOf('/'));

            const processedFiles = await filterAndProcessFiles(files);

            if (processedFiles.length === 0) {
                throw new Error('No valid files found in the selected folder');
            }

            // Fall back to the folder name for projects without package.json
            // (e.g. static HTML) so they aren't rejected before framework
            // detection even runs.
            const projectName = extractProjectName(processedFiles) ?? folderPath ?? 'New Project';

            // Auto-detect framework BEFORE validating so the validator runs
            // against the right adapter (e.g. an HTML folder validates via
            // static-html, not Next.js). Detection failure is non-fatal —
            // validation will surface a clearer error if no adapter matches.
            const detectedFramework = await autoDetectFramework(processedFiles);
            const validationResult = await validateNextJsProject(
                processedFiles,
                detectedFramework ?? undefined,
            );
            setValidation(validationResult);

            setProjectData({
                name: projectName,
                folderPath: folderPath,
                files: processedFiles,
            });
        } catch (error) {
            console.error('Error processing project:', error);
            setError(error instanceof Error ? error.message : 'Failed to process project');
        } finally {
            setIsUploading(false);
        }
    };

    const handleFileInputChange = useCallback(
        async (event: React.ChangeEvent<HTMLInputElement>) => {
            const files = event.target.files;
            if (files && files.length > 0) {
                await processProjectFiles(files);
            }
        },
        [],
    );

    // Helper function to recursively read directory entries
    const readDirectory = async (dirEntry: any): Promise<File[]> => {
        const files: File[] = [];

        return new Promise((resolve, reject) => {
            const reader = dirEntry.createReader();

            const readEntries = () => {
                reader.readEntries(async (entries: any[]) => {
                    if (entries.length === 0) {
                        resolve(files);
                        return;
                    }

                    for (const entry of entries) {
                        if (entry.isFile) {
                            const fileEntry = entry;
                            try {
                                const file = await new Promise<File>((resolve, reject) => {
                                    fileEntry.file(resolve, reject);
                                });

                                // Create a new File object with webkitRelativePath
                                const fileWithPath = new File([file], file.name, {
                                    type: file.type,
                                    lastModified: file.lastModified,
                                });
                                Object.defineProperty(fileWithPath, 'webkitRelativePath', {
                                    value: fileEntry.fullPath,
                                    writable: false,
                                    enumerable: true,
                                    configurable: false,
                                });

                                files.push(fileWithPath);
                            } catch (error) {
                                console.warn(`Error reading file ${entry.name}:`, error);
                            }
                        } else if (entry.isDirectory) {
                            const subFiles = await readDirectory(entry);
                            files.push(...subFiles);
                        }
                    }

                    // Continue reading entries (directories can have many entries)
                    readEntries();
                }, reject);
            };

            readEntries();
        });
    };

    const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);

        const items = e.dataTransfer.items;
        const files: File[] = [];

        for (let i = 0; i < items.length; i++) {
            const item = items[i];

            if (item?.kind === 'file') {
                const entry = item.webkitGetAsEntry();

                if (entry) {
                    if (entry.isFile) {
                        // Handle individual file
                        const fileEntry = entry as FileSystemFileEntry;
                        try {
                            const file = await new Promise<File>((resolve, reject) => {
                                fileEntry.file(resolve, reject);
                            });
                            files.push(file);
                        } catch (error) {
                            console.warn(`Error reading file ${entry.name}:`, error);
                        }
                    } else if (entry.isDirectory) {
                        // Handle directory
                        const dirFiles = await readDirectory(entry);
                        files.push(...dirFiles);
                    }
                } else {
                    // Fallback for browsers that don't support webkitGetAsEntry
                    const file = item.getAsFile();
                    if (file) {
                        files.push(file);
                    }
                }
            }
        }

        if (files.length > 0) {
            await processProjectFiles(files);
        } else {
            setError('No files found in the dropped folder');
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDragging(false);
        }
    }, []);

    const reset = () => {
        resetProjectData();
        // Reset all related states
        setError('');
        setIsUploading(false);
        setIsDragging(false);
    };

    /**
     * Inner-card Cancel handler (issue #38). Previously this routed through
     * `prevStep` which silently invoked `resetProjectData()`; now we route to
     * the explicit `cancel()` (navigates home) and warn first if the user has
     * uploaded files so we don't discard work without confirmation.
     */
    const handleCancelClick = () => {
        if ((projectData.files?.length ?? 0) > 0) {
            setShowCancelConfirm(true);
            return;
        }
        cancel();
    };

    const confirmCancel = () => {
        setShowCancelConfirm(false);
        cancel();
    };

    const renderHeader = () => {
        const headerConfig = {
            initial: {
                title: t('headerInitialTitle'),
                description: t('headerInitialDesc'),
            },
            validating: {
                title: t('headerValidatingTitle', { appName: APP_NAME }),
                description: t('headerValidatingDesc', { appName: APP_NAME }),
            },
            valid: {
                title: t('headerValidTitle'),
                description: t('headerValidDesc', { appName: APP_NAME }),
            },
            invalid: {
                title: t('headerInvalidTitle', { appName: APP_NAME }),
                description: t('headerInvalidDesc', { appName: APP_NAME }),
            },
        };

        let config = headerConfig.initial;
        if (projectData.folderPath) {
            if (!validation) {
                config = headerConfig.validating;
            } else if (validation.isValid) {
                config = headerConfig.valid;
            } else {
                config = headerConfig.invalid;
            }
        }

        return (
            <>
                <CardTitle>{config.title}</CardTitle>
                <CardDescription>{config.description}</CardDescription>
            </>
        );
    };

    const renderProjectInfo = () => {
        if (!projectData.folderPath) {
            return (
                <motion.div
                    key="selectFolder"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="w-full space-y-4"
                >
                    <div
                        className={`m-0 flex h-20 w-full cursor-pointer flex-col items-center justify-center gap-4 rounded-lg border duration-200 ${
                            isDragging
                                ? 'border-foreground-brand bg-background-positive'
                                : 'border-border bg-background-secondary hover:bg-background-tertiary'
                        } ${isUploading ? 'pointer-events-none opacity-50' : ''} `}
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onClick={handleClickUpload}
                    >
                        {isUploading ? (
                            <div className="text-center">
                                <div className="flex items-center justify-center gap-2">
                                    <Icons.LoadingSpinner className="text-foreground-secondary h-4 w-4 animate-spin" />
                                    <p className="text-foreground-secondary text-sm font-medium">
                                        {t('uploading')}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex gap-3">
                                <Icons.DirectoryOpen className="text-foreground-secondary h-5 w-5" />
                                <p className="text-foreground-secondary text-sm font-medium">
                                    {t('clickToSelectFolder')}
                                </p>
                            </div>
                        )}
                    </div>

                    <input
                        ref={fileInputRef}
                        type="file"
                        style={{ display: 'none' }}
                        onChange={handleFileInputChange}
                        {...({
                            directory: '',
                            webkitdirectory: '',
                        } as React.InputHTMLAttributes<HTMLInputElement>)}
                    />
                    {error && (
                        <div className="border-destructive/40 bg-destructive/10 text-destructive text-small rounded-md border px-3 py-2">
                            {error}
                        </div>
                    )}
                </motion.div>
            );
        }

        const statusConfig = {
            valid: {
                bgColor: 'bg-background-secondary',
                borderColor: 'border-border',
                iconBgColor: 'bg-background-tertiary',
                textColor: 'text-foreground-primary',
                subTextColor: 'text-foreground-secondary',
                icon: (
                    <Icons.CheckCircled className="text-foreground-secondary h-5 w-5 transition-opacity duration-200 group-hover:opacity-0" />
                ),
                showError: false,
            },
            invalid: {
                bgColor: 'bg-background-warning',
                borderColor: 'border-warning',
                iconBgColor: 'bg-foreground-warning',
                textColor: 'text-foreground-primary',
                subTextColor: 'text-foreground-warning',
                icon: <Icons.ExclamationTriangle className="text-foreground-warning h-5 w-5" />,
                showError: true,
            },
        };

        const config = validation?.isValid ? statusConfig.valid : statusConfig.invalid;

        return (
            <div className="space-y-4">
                <motion.div
                    key="folderPath"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className={`flex w-full flex-row items-center rounded-lg border p-4 ${config.bgColor} ${config.borderColor} group relative gap-2`}
                >
                    <div
                        className={`flex w-full flex-col gap-2 ${config.showError ? '' : 'flex-row items-center justify-between'}`}
                    >
                        <div className="flex w-full flex-row items-center justify-between gap-3">
                            <div className={`p-3 ${config.iconBgColor} rounded-lg`}>
                                <Icons.Directory className="h-5 w-5" />
                            </div>
                            <div className="flex w-full flex-col gap-1 break-all">
                                <p className={`text-regular ${config.textColor}`}>
                                    {projectData.name}
                                </p>
                                <p className={`text-mini ${config.subTextColor}`}>
                                    {projectData.folderPath}
                                </p>
                            </div>
                            {config.icon}
                        </div>
                        {config.showError && (
                            <p className={`${config.textColor} text-sm`}>
                                {validation?.error ??
                                    'This project does not match the supported stack'}
                            </p>
                        )}
                    </div>
                    <Button
                        className={`absolute top-1/2 right-4 size-10 -translate-y-1/2 p-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100 hover:bg-transparent ${config.bgColor}`}
                        variant="ghost"
                        size="icon"
                        onClick={reset}
                    >
                        <Icons.MinusCircled
                            className={`h-5 w-5 ${validation?.isValid ? 'text-foreground-secondary' : 'text-foreground-warning'}`}
                        />
                    </Button>
                </motion.div>
                {error && (
                    <div className="border-destructive/40 bg-destructive/10 text-small text-destructive rounded-md border px-3 py-2">
                        {error}
                    </div>
                )}
            </div>
        );
    };

    return (
        <>
            <StepHeader>{renderHeader()}</StepHeader>
            <StepContent>{renderProjectInfo()}</StepContent>
            <StepFooter>
                <Button
                    type="button"
                    onClick={handleCancelClick}
                    variant="outline"
                    className="px-3 py-2"
                >
                    {t('cancel')}
                </Button>
                {projectData.folderPath ? (
                    <Button
                        type="button"
                        onClick={validation?.isValid ? nextStep : reset}
                        className="px-3 py-2"
                        disabled={isUploading}
                    >
                        {validation?.isValid ? t('finishSetup') : t('selectDifferentFolder')}
                    </Button>
                ) : (
                    <Button
                        disabled={isUploading}
                        type="button"
                        onClick={handleClickUpload}
                        className="px-3 py-2"
                    >
                        {t('selectFolder')}
                    </Button>
                )}
            </StepFooter>
            <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('discardTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('discardDescription')}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('keepEditing')}</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmCancel}>{t('discard')}</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};
