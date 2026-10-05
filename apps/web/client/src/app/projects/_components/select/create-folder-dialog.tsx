'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@weblab/ui/dialog';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';

interface CreateFolderDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreateFolder: (name: string) => void | boolean | Promise<void | boolean>;
    existingNames: string[];
}

export const CreateFolderDialog = ({
    open,
    onOpenChange,
    onCreateFolder,
    existingNames,
}: CreateFolderDialogProps) => {
    const t = useTranslations('projects.createFolderDialog');
    const [folderName, setFolderName] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        if (!open) {
            setFolderName('');
        }
    }, [open]);

    const normalizedExistingNames = useMemo(
        () => new Set(existingNames.map((name) => name.trim().toLowerCase())),
        [existingNames],
    );
    const trimmedName = folderName.trim();
    const alreadyExists = normalizedExistingNames.has(trimmedName.toLowerCase());
    const isInvalid = trimmedName.length === 0 || alreadyExists;

    const handleCreate = async () => {
        if (isInvalid || isCreating) {
            return;
        }

        setIsCreating(true);
        try {
            if ((await onCreateFolder(trimmedName)) !== false) onOpenChange(false);
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('title')}</DialogTitle>
                </DialogHeader>

                <div className="flex flex-col gap-2">
                    <Label htmlFor="folder-name">{t('folderNameLabel')}</Label>
                    <Input
                        id="folder-name"
                        value={folderName}
                        onChange={(event) => setFolderName(event.currentTarget.value)}
                        placeholder={t('folderNamePlaceholder')}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                void handleCreate();
                            }
                        }}
                    />
                    {alreadyExists && (
                        <p className="text-destructive text-xs">{t('alreadyExists')}</p>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        {t('cancel')}
                    </Button>
                    <Button onClick={() => void handleCreate()} disabled={isInvalid || isCreating}>
                        {t('createFolder')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
