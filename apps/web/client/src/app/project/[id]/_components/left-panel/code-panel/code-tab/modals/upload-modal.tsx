import { useCallback, useEffect, useRef, useState } from 'react';

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
import { toast } from '@weblab/ui/sonner';
import { cn } from '@weblab/ui/utils';
import { isBinaryFile } from '@weblab/utility';

const joinPath = (...parts: string[]): string => {
    return parts.join('/').replace(/\/+/g, '/').replace(/\/$/, '') || '/';
};

interface UploadModalProps {
    basePath: string;
    show: boolean;
    setShow: (show: boolean) => void;
    onSuccess?: () => void;
    onCreateFile: (filePath: string, content?: string | Uint8Array) => Promise<void>;
}

export const UploadModal = ({
    basePath,
    show,
    setShow,
    onSuccess,
    onCreateFile,
}: UploadModalProps) => {
    const [currentPath, setCurrentPath] = useState(basePath);
    const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    // dragenter/dragleave fire for every descendant; a counter is the only
    // way to know when the drag truly left the drop zone without flicker.
    const dragDepthRef = useRef(0);

    // Update currentPath when basePath prop changes
    useEffect(() => {
        setCurrentPath(basePath);
    }, [basePath]);

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        setSelectedFiles(event.target.files);
    };

    const handleDrop = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        dragDepthRef.current = 0;
        setIsDragging(false);
        const files = event.dataTransfer.files;
        if (files.length > 0) {
            setSelectedFiles(files);
        }
    }, []);

    const handleDragOver = useCallback((event: React.DragEvent) => {
        // dragover must be prevented to allow drop; do NOT toggle state here
        // (fires every ~16ms and causes the flicker we're trying to kill).
        event.preventDefault();
    }, []);

    const handleDragEnter = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        dragDepthRef.current += 1;
        if (dragDepthRef.current === 1) setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setIsDragging(false);
    }, []);

    const handleSubmit = async () => {
        if (!selectedFiles || selectedFiles.length === 0) return;

        try {
            setIsLoading(true);

            for (let i = 0; i < selectedFiles.length; i++) {
                const file = selectedFiles[i];
                if (!file) continue;

                const fileName = file.name;
                const fullPath = joinPath(currentPath, fileName);
                const isBinary = isBinaryFile(fileName);

                const content = await new Promise<string | Uint8Array>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                        if (isBinary) {
                            // For binary files, convert ArrayBuffer to Uint8Array
                            resolve(new Uint8Array(reader.result as ArrayBuffer));
                        } else {
                            // For text files, use string result
                            resolve(reader.result as string);
                        }
                    };
                    reader.onerror = () => reject(reader.error);

                    // Use appropriate read method
                    if (isBinary) {
                        reader.readAsArrayBuffer(file);
                    } else {
                        reader.readAsText(file);
                    }
                });

                await onCreateFile(fullPath, content);
            }

            const fileCount = selectedFiles.length;
            toast(`${fileCount} file${fileCount > 1 ? 's' : ''} uploaded successfully!`);

            setSelectedFiles(null);
            setCurrentPath(basePath);
            setShow(false);
            onSuccess?.();
        } catch (error) {
            console.error('Failed to upload files:', error);
            toast.error(
                `Failed to upload files: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
        } finally {
            setIsLoading(false);
        }
    };

    const clearSelection = () => {
        setSelectedFiles(null);
        // Reset file input
        const fileInput = document.getElementById('file-upload') as HTMLInputElement;
        if (fileInput) {
            fileInput.value = '';
        }
    };

    return (
        <Dialog
            open={show}
            onOpenChange={(isOpen) => {
                setShow(isOpen);
                if (!isOpen) {
                    clearSelection();
                }
            }}
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Upload Files</DialogTitle>
                    <DialogDescription>Upload files to your project</DialogDescription>
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
                            className="text-small"
                        />
                        <p className="text-muted-foreground text-mini">
                            Path where files will be uploaded
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="file-upload">Select Files</Label>
                        <div
                            className={cn(
                                'hover:border-primary/50 cursor-pointer rounded-lg border-2 border-dashed p-6 transition-colors',
                                isDragging
                                    ? 'border-primary bg-primary/5'
                                    : 'border-muted-foreground/25',
                                selectedFiles && selectedFiles.length > 0 ? 'border-success' : '',
                            )}
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                            onDragEnter={handleDragEnter}
                            onDragLeave={handleDragLeave}
                            onClick={() => document.getElementById('file-upload')?.click()}
                        >
                            <input
                                id="file-upload"
                                type="file"
                                multiple
                                onChange={handleFileSelect}
                                className="hidden"
                                disabled={isLoading}
                            />

                            <div className="text-center">
                                {selectedFiles && selectedFiles.length > 0 ? (
                                    <div className="space-y-2">
                                        <p className="text-small text-foreground-success font-medium">
                                            {selectedFiles.length} file
                                            {selectedFiles.length > 1 ? 's' : ''} selected
                                        </p>
                                        <div className="text-muted-foreground text-mini space-y-1">
                                            {Array.from(selectedFiles).map((file, index) => (
                                                <div key={index}>
                                                    {file.name} ({(file.size / 1024).toFixed(1)} KB)
                                                </div>
                                            ))}
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                clearSelection();
                                            }}
                                            disabled={isLoading}
                                        >
                                            Clear Selection
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <p className="text-small">
                                            Drag and drop files here, or click to select
                                        </p>
                                        <p className="text-muted-foreground text-mini">
                                            Multiple files can be selected
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => setShow(false)} disabled={isLoading}>
                        Cancel
                    </Button>
                    <Button
                        variant="outline"
                        onClick={handleSubmit}
                        disabled={isLoading || !selectedFiles || selectedFiles.length === 0}
                    >
                        {isLoading
                            ? 'Uploading...'
                            : `Upload ${selectedFiles?.length ?? 0} file${selectedFiles?.length !== 1 ? 's' : ''}`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
