'use client';

import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import { openFilePicker } from './utils/open-file-picker';

interface AssetDropzoneProps {
    isDragging: boolean;
    hasSearch: boolean;
    onUpload: (files: FileList) => Promise<void>;
}

/** Empty-state drop zone shown when the active folder has no assets. */
export const AssetDropzone = ({ isDragging, hasSearch, onUpload }: AssetDropzoneProps) => {
    if (hasSearch && !isDragging) {
        return (
            <div className="text-foreground-tertiary flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center">
                <Icons.MagnifyingGlass className="h-6 w-6" />
                <div className="text-small">No assets match your search</div>
            </div>
        );
    }

    return (
        <button
            type="button"
            onClick={() => openFilePicker((files) => void onUpload(files))}
            className={cn(
                'flex h-full w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed transition-colors duration-150',
                isDragging
                    ? 'border-border-weblab bg-background-weblab/40'
                    : 'border-border-primary hover:border-border-weblab hover:bg-background-secondary/50',
            )}
        >
            <div className="bg-background-secondary flex h-10 w-10 items-center justify-center rounded-full">
                <Icons.Upload className="text-foreground-secondary h-4 w-4" />
            </div>
            <div className="text-foreground-primary text-small font-medium">
                {isDragging ? 'Drop to upload' : 'Drag files here'}
            </div>
            <div className="text-foreground-tertiary text-mini">or click to upload</div>
        </button>
    );
};

/** Overlay shown over a populated grid while files are being dragged onto it. */
export const AssetDragOverlay = () => {
    return (
        <div className="border-border-weblab bg-background-weblab/70 pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed backdrop-blur-sm">
            <div className="bg-background-secondary flex h-10 w-10 items-center justify-center rounded-full">
                <Icons.Upload className="text-foreground-primary h-4 w-4" />
            </div>
            <div className="text-foreground-primary text-small font-medium">Drop to upload</div>
        </div>
    );
};
