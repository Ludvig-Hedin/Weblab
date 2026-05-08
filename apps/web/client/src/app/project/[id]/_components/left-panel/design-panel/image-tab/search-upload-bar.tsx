'use client';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from '@weblab/ui/tooltip';

interface SearchUploadBarProps {
    search: string;
    setSearch: (value: string) => void;
    isUploading: boolean;
    onUpload: (files: FileList) => Promise<void>;
}

export const SearchUploadBar = ({
    search,
    setSearch,
    isUploading,
    onUpload,
}: SearchUploadBarProps) => {
    const handleUploadClick = () => {
        try {
            const input = document.createElement('input');
            input.type = 'file';
            input.multiple = true;
            input.accept = 'image/*,video/*';
            input.onchange = (e) => {
                const files = (e.target as HTMLInputElement).files;
                if (files) onUpload(files);
            };
            input.click();
        } catch (error) {
            console.error('Error uploading images and videos', error);
        }
    };

    return (
        <div className="flex gap-2">
            <div className="relative flex-1">
                <Input
                    placeholder="Search images and videos..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="text-mini h-8 pr-8"
                />
                {search && (
                    <button
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
                        className="text-foreground-primary border-border-primary hover:border-border-weblab bg-background-secondary hover:bg-background-weblab h-8 w-8 border"
                        onClick={handleUploadClick}
                        disabled={isUploading}
                    >
                        {isUploading ? (
                            <Icons.Reload className="h-4 w-4 animate-spin" />
                        ) : (
                            <Icons.Plus className="h-4 w-4" />
                        )}
                    </Button>
                </TooltipTrigger>
                <TooltipPortal>
                    <TooltipContent>
                        <p>Upload images and videos{isUploading ? '...' : ''}</p>
                    </TooltipContent>
                </TooltipPortal>
            </Tooltip>
        </div>
    );
};
