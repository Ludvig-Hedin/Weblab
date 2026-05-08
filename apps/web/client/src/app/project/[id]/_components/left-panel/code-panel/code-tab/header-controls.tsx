import { useState } from 'react';

import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import { FileModal } from './modals/file-modal';
import { FolderModal } from './modals/folder-modal';
import { UploadModal } from './modals/upload-modal';

interface CodeControlsProps {
    isDirty: boolean;
    currentPath: string;
    onSave: () => Promise<void>;
    onRefresh: () => void;
    onCreateFile: (filePath: string, content?: string | Uint8Array) => Promise<void>;
    onCreateFolder: (folderPath: string) => Promise<void>;
    isSidebarOpen: boolean;
    setIsSidebarOpen: (isSidebarOpen: boolean) => void;
}

export const CodeControls = ({
    isDirty,
    currentPath,
    onSave,
    onRefresh,
    onCreateFile,
    onCreateFolder,
    isSidebarOpen,
    setIsSidebarOpen,
}: CodeControlsProps) => {
    const [showFileModal, setShowFileModal] = useState(false);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [showFolderModal, setShowFolderModal] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        if (!isDirty || isSaving) return;

        try {
            setIsSaving(true);
            await onSave();
        } catch (error) {
            console.error('Failed to save file:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleModalSuccess = () => {
        onRefresh();
    };

    return (
        <div className="border-border flex h-10 w-full flex-row items-center justify-between border-b p-1">
            <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="text-foreground-secondary hover:text-foreground-primary h-fit w-fit cursor-pointer bg-transparent px-2 py-1 hover:!bg-transparent"
            >
                {isSidebarOpen ? (
                    <Icons.SidebarLeftCollapse className="h-4 w-4" />
                ) : (
                    <Icons.MoveToFolder className="h-4 w-4" />
                )}
                <span className="text-small ml-0.5">{isSidebarOpen ? '' : 'View Files'}</span>
            </Button>
            <div className="ml-auto flex flex-row items-center transition-opacity duration-200">
                <Tooltip>
                    <DropdownMenu>
                        <TooltipTrigger asChild>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-foreground-secondary hover:text-foreground-primary h-fit w-fit cursor-pointer bg-transparent px-2 py-1 hover:!bg-transparent"
                                >
                                    <Icons.FilePlus className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                        </TooltipTrigger>
                        <DropdownMenuContent align="start">
                            <DropdownMenuItem
                                className="cursor-pointer"
                                onClick={() => setShowFileModal(true)}
                            >
                                <Icons.FilePlus className="mr-2 h-4 w-4" />
                                Create new file
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                className="cursor-pointer"
                                onClick={() => setShowUploadModal(true)}
                            >
                                <Icons.Upload className="mr-2 h-4 w-4" />
                                Upload file
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <TooltipContent side="bottom" hideArrow>
                        <p>Create or Upload File</p>
                    </TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setShowFolderModal(true)}
                            className="text-foreground-secondary hover:text-foreground-primary h-fit w-fit cursor-pointer bg-transparent px-2 py-1 hover:!bg-transparent"
                        >
                            <Icons.DirectoryPlus className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" hideArrow>
                        <p>New Folder</p>
                    </TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="secondary"
                            size="icon"
                            onClick={handleSave}
                            disabled={!isDirty || isSaving}
                            className={cn(
                                'group mr-0.5 ml-1 h-fit w-fit cursor-pointer px-2 py-1',
                                isDirty
                                    ? 'text-background-primary bg-foreground-primary hover:bg-foreground-primary/80'
                                    : 'hover:bg-background-tertiary hover:text-foreground-primary',
                            )}
                        >
                            {isSaving ? (
                                <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                            ) : (
                                <Icons.Save
                                    className={cn(
                                        'h-4 w-4',
                                        isDirty && 'text-blue-200 group-hover:text-blue-100',
                                    )}
                                />
                            )}
                            <span className="text-small">{isSaving ? 'Saving...' : 'Save'}</span>
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" hideArrow>
                        <p>{isSaving ? 'Saving changes...' : 'Save changes'}</p>
                    </TooltipContent>
                </Tooltip>
            </div>
            <FileModal
                basePath={currentPath}
                show={showFileModal}
                setShow={setShowFileModal}
                onSuccess={handleModalSuccess}
                onCreateFile={onCreateFile}
            />
            <FolderModal
                basePath={currentPath}
                show={showFolderModal}
                setShow={setShowFolderModal}
                onSuccess={handleModalSuccess}
                onCreateFolder={onCreateFolder}
            />
            <UploadModal
                basePath={currentPath}
                show={showUploadModal}
                setShow={setShowUploadModal}
                onSuccess={handleModalSuccess}
                onCreateFile={onCreateFile}
            />
        </div>
    );
};
