'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@weblab/ui/dialog';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from '@weblab/ui/tooltip';

import { openFilePicker } from './utils/open-file-picker';

interface AssetToolbarProps {
    search: string;
    setSearch: (value: string) => void;
    isUploading: boolean;
    onUpload: (files: FileList) => Promise<void>;
    onCreateFolder: (name: string) => Promise<void>;
}

const iconButtonClass =
    'text-foreground-primary border-border-primary hover:border-border-weblab bg-background-secondary hover:bg-background-weblab h-8 w-8 border';

export const AssetToolbar = ({
    search,
    setSearch,
    isUploading,
    onUpload,
    onCreateFolder,
}: AssetToolbarProps) => {
    const t = useTranslations('editor.leftPanel.assets');
    const [folderDialogOpen, setFolderDialogOpen] = useState(false);
    const [folderName, setFolderName] = useState('');
    const [creating, setCreating] = useState(false);

    const submitCreateFolder = async () => {
        const name = folderName.trim();
        if (!name || creating) return;
        setCreating(true);
        try {
            await onCreateFolder(name);
            setFolderDialogOpen(false);
            setFolderName('');
        } catch (error) {
            // onCreateFolder surfaces its own error toast; keep the dialog open.
            console.error('Failed to create folder:', error);
        } finally {
            setCreating(false);
        }
    };

    return (
        <>
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Icons.MagnifyingGlass className="text-foreground-tertiary pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
                    <Input
                        placeholder={t('searchPlaceholder')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="text-mini h-8 pr-8 pl-8"
                    />
                    {search && (
                        <button
                            type="button"
                            aria-label={t('clearSearch')}
                            onClick={() => setSearch('')}
                            className="text-foreground-secondary hover:text-foreground-primary absolute top-1/2 right-2 -translate-y-1/2"
                        >
                            <Icons.CrossS className="h-3 w-3" />
                        </button>
                    )}
                </div>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="default"
                            size="icon"
                            className={iconButtonClass}
                            onClick={() => setFolderDialogOpen(true)}
                        >
                            <Icons.DirectoryPlus className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipPortal>
                        <TooltipContent>
                            <p>{t('newFolder')}</p>
                        </TooltipContent>
                    </TooltipPortal>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="default"
                            size="icon"
                            className={iconButtonClass}
                            onClick={() => openFilePicker((files) => void onUpload(files))}
                            disabled={isUploading}
                        >
                            {isUploading ? (
                                <Icons.Reload className="h-4 w-4 animate-spin" />
                            ) : (
                                <Icons.Upload className="h-4 w-4" />
                            )}
                        </Button>
                    </TooltipTrigger>
                    <TooltipPortal>
                        <TooltipContent>
                            <p>{isUploading ? t('uploadingAssets') : t('uploadAssets')}</p>
                        </TooltipContent>
                    </TooltipPortal>
                </Tooltip>
            </div>

            <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>{t('newFolderTitle')}</DialogTitle>
                        <DialogDescription>
                            {t('newFolderDescription')}
                        </DialogDescription>
                    </DialogHeader>
                    <Input
                        placeholder={t('folderNamePlaceholder')}
                        value={folderName}
                        onChange={(e) => setFolderName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                void submitCreateFolder();
                            }
                        }}
                        className="h-8"
                    />
                    <DialogFooter>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setFolderDialogOpen(false)}
                        >
                            {t('cancel')}
                        </Button>
                        <Button
                            variant="default"
                            size="sm"
                            onClick={() => void submitCreateFolder()}
                            disabled={!folderName.trim() || creating}
                        >
                            {t('create')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};
