import path from 'path';
import { useEffect, useMemo, useState } from 'react';

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

import { getFileTemplate } from '../shared/file-templates';

interface FileModalProps {
    basePath: string;
    show: boolean;
    setShow: (show: boolean) => void;
    onSuccess?: () => void;
    onCreateFile: (filePath: string, content?: string) => Promise<void>;
}

export const FileModal = ({ basePath, show, setShow, onSuccess, onCreateFile }: FileModalProps) => {
    const [name, setName] = useState('');
    const [currentPath, setCurrentPath] = useState(basePath);
    const [warning, setWarning] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isComposing, setIsComposing] = useState(false);

    // Update currentPath when basePath prop changes
    useEffect(() => {
        setCurrentPath(basePath);
    }, [basePath]);

    const fullPath = useMemo(() => {
        if (!name) return '';
        return path.join(currentPath, name).replace(/\\/g, '/');
    }, [currentPath, name]);

    const title = 'Create New File';
    const buttonText = 'Create File';
    const loadingText = 'Creating file...';
    const placeholder = 'component.tsx';

    const handleSubmit = async () => {
        if (!name || warning) return;

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

    const displayPath = currentPath === '' ? '/' : `/${currentPath}`;

    return (
        <Dialog open={show} onOpenChange={(isOpen) => setShow(isOpen)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>Create a new file</DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="path">Directory Path</Label>
                        <Input
                            id="path"
                            value={currentPath}
                            onChange={(e) => setCurrentPath(e.target.value)}
                            placeholder="/"
                            disabled={isLoading}
                            className="text-sm"
                        />
                        <p className="text-muted-foreground text-xs">
                            Path where the file will be created
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="name">File Name</Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className={cn(
                                warning && 'border-yellow-300 focus-visible:ring-yellow-300',
                            )}
                            placeholder={placeholder}
                            disabled={isLoading}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !isComposing && !warning && name) {
                                    handleSubmit();
                                }
                            }}
                            onCompositionStart={() => setIsComposing(true)}
                            onCompositionEnd={() => setIsComposing(false)}
                        />
                        {warning && (
                            <p className="flex items-center gap-2 text-sm text-yellow-300">
                                {warning}
                            </p>
                        )}
                        {fullPath && !warning && (
                            <p className="text-muted-foreground text-sm">
                                Full path:{' '}
                                <code className="bg-background-secondary rounded px-1 py-0.5 text-xs">
                                    {fullPath}
                                </code>
                            </p>
                        )}
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => setShow(false)} disabled={isLoading}>
                        Cancel
                    </Button>
                    <Button
                        variant="outline"
                        onClick={handleSubmit}
                        disabled={isLoading || !!warning || !name}
                    >
                        {isLoading ? loadingText : buttonText}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
