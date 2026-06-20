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
import { getFileTemplate } from '../shared/file-templates';

interface FileModalProps {
    basePath: string;
    fileEntries: FileEntry[];
    show: boolean;
    setShow: (show: boolean) => void;
    onSuccess?: () => void;
    onCreateFile: (filePath: string, content?: string) => Promise<void>;
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

export const FileModal = ({
    basePath,
    fileEntries,
    show,
    setShow,
    onSuccess,
    onCreateFile,
}: FileModalProps) => {
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

    // Reject illegal / path-traversal names up front so the raw
    // "Path escapes basePath" filesystem error never leaks to the user.
    const nameWarning = useMemo(() => {
        if (!name) return '';
        if (name.trim() !== name) return "Name can't start or end with spaces.";
        if (name.startsWith('/')) return "Name can't start with '/'.";
        if (name.endsWith('/')) return "Name can't end with '/'.";
        if (name.split('/').some((seg) => seg === '..' || seg === '.')) {
            return "Name can't contain '.' or '..' path segments.";
        }
        // eslint-disable-next-line no-control-regex
        if (/[\\:*?"<>|\x00-\x1f]/.test(name)) return 'Name contains an invalid character.';
        return '';
    }, [name]);

    const effectiveWarning = warning || nameWarning || collisionWarning;

    const handleSubmit = async () => {
        if (!name || effectiveWarning) return;

        try {
            setIsLoading(true);
            const content = getFileTemplate(name);
            await onCreateFile(fullPath, content);
            setName('');
            setCurrentPath(basePath);
            setWarning('');
            setShow(false);
            onSuccess?.();
        } catch (error) {
            console.error('Failed to create file:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to create file';
            setWarning(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={show} onOpenChange={(isOpen) => setShow(isOpen)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t(transKeys.editor.panels.code.fileModal.title)}</DialogTitle>
                    <DialogDescription>
                        {t(transKeys.editor.panels.code.fileModal.description)}
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
                            {t(transKeys.editor.panels.code.fileModal.fileName)}
                        </Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className={cn(effectiveWarning && 'border-destructive')}
                            placeholder={t(transKeys.editor.panels.code.fileModal.namePlaceholder)}
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
                            ? t(transKeys.editor.panels.code.fileModal.creating)
                            : t(transKeys.editor.panels.code.fileModal.create)}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
