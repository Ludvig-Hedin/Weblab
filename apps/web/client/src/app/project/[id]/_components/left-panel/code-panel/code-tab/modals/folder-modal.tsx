import path from 'path';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import type { FileEntry } from '@weblab/file-system/hooks';
import { Button } from '@weblab/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@weblab/ui/dialog';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { cn } from '@weblab/ui/utils';
import { pathsEqual } from '@weblab/utility';

import { transKeys } from '@/i18n/keys';
import { DirectoryPicker } from '../shared/directory-picker';

interface FolderModalProps {
    basePath: string;
    fileEntries: FileEntry[];
    show: boolean;
    setShow: (show: boolean) => void;
    onSuccess?: () => void;
    onCreateFolder: (folderPath: string) => Promise<void>;
}

function findEntryByPath(entries: FileEntry[], target: string): FileEntry | null {
    for (const entry of entries) {
        if (pathsEqual(entry.path, target)) return entry;
        if (entry.children) {
            const found = findEntryByPath(entry.children, target);
            if (found) return found;
        }
    }
    return null;
}

export const FolderModal = ({
    basePath,
    fileEntries,
    show,
    setShow,
    onSuccess,
    onCreateFolder,
}: FolderModalProps) => {
    const t = useTranslations();
    const [name, setName] = useState('');
    const [currentPath, setCurrentPath] = useState(basePath);
    const [warning, setWarning] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isComposing, setIsComposing] = useState(false);

    useEffect(() => {
        if (show) setCurrentPath(basePath);
    }, [basePath, show]);

    const fullPath = useMemo(() => {
        if (!name) return '';
        return path.join(currentPath, name).replace(/\\/g, '/');
    }, [currentPath, name]);

    const collisionWarning = useMemo(() => {
        if (!fullPath) return '';
        const existing = findEntryByPath(fileEntries, fullPath);
        if (!existing) return '';
        return existing.isDirectory
            ? `A folder named "${existing.name}" already exists here.`
            : `A file named "${existing.name}" already exists here.`;
    }, [fileEntries, fullPath]);

    const effectiveWarning = warning || collisionWarning;

    const handleSubmit = async () => {
        if (!name || effectiveWarning) return;

        try {
            setIsLoading(true);
            await onCreateFolder(fullPath);
            setName('');
            setCurrentPath(basePath);
            setWarning('');
            setShow(false);
            onSuccess?.();
        } catch (error) {
            console.error('Failed to create folder:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to create folder';
            setWarning(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={show} onOpenChange={(isOpen) => setShow(isOpen)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t(transKeys.editor.panels.code.folderModal.title)}</DialogTitle>
                    <DialogDescription>
                        {t(transKeys.editor.panels.code.folderModal.description)}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label>{t(transKeys.editor.panels.code.fileModal.location)}</Label>
                        <DirectoryPicker
                            entries={fileEntries}
                            selectedPath={currentPath}
                            onSelect={setCurrentPath}
                            disabled={isLoading}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="name">
                            {t(transKeys.editor.panels.code.folderModal.folderName)}
                        </Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className={cn(effectiveWarning && 'border-destructive')}
                            placeholder={t(
                                transKeys.editor.panels.code.folderModal.namePlaceholder,
                            )}
                            disabled={isLoading}
                            autoFocus
                            onKeyDown={(e) => {
                                if (
                                    e.key === 'Enter' &&
                                    !isComposing &&
                                    !effectiveWarning &&
                                    name
                                ) {
                                    handleSubmit();
                                }
                            }}
                            onCompositionStart={() => setIsComposing(true)}
                            onCompositionEnd={() => setIsComposing(false)}
                        />
                        {effectiveWarning && (
                            <p className="text-small text-foreground-warning flex items-center gap-2">
                                {effectiveWarning}
                            </p>
                        )}
                        {fullPath && !effectiveWarning && (
                            <p className="text-muted-foreground text-mini">
                                {t(transKeys.editor.panels.code.fileModal.fullPath)}{' '}
                                <code className="bg-background-secondary text-foreground-primary rounded px-1 py-0.5">
                                    /{fullPath}
                                </code>
                            </p>
                        )}
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => setShow(false)} disabled={isLoading}>
                        {t(transKeys.editor.panels.code.fileModal.cancel)}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={handleSubmit}
                        disabled={isLoading || !!effectiveWarning || !name}
                    >
                        {isLoading
                            ? t(transKeys.editor.panels.code.folderModal.creating)
                            : t(transKeys.editor.panels.code.folderModal.create)}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
