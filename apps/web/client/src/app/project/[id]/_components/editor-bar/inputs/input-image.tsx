'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';

import { useTranslations } from 'next-intl';

import type { ImageContentData } from '@weblab/models';
import { DefaultSettings } from '@weblab/constants';
import { LeftPanelTabValue } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { Separator } from '@weblab/ui/separator';
import { addImageFolderPrefix } from '@weblab/utility';

import type { ImageFit } from '../hooks/use-background-image-update';
import { useEditorEngine } from '@/components/store/editor';
import { useBackgroundImage } from '../hooks/use-background-image-update';
import { useDropdownControl } from '../hooks/use-dropdown-manager';
import { HoverOnlyTooltip } from '../hover-tooltip';
import { ToolbarButton } from '../toolbar-button';

export const InputImage = observer(() => {
    const t = useTranslations('editor.editorBar');
    const editorEngine = useEditorEngine();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

    const previewImage = editorEngine.image.previewImage ?? editorEngine.image.selectedImage;

    const {
        IMAGE_FIT_OPTIONS,
        fillOption,
        currentBackgroundImage,
        handleFillOptionChange,
        removeBackground,
    } = useBackgroundImage(editorEngine);

    const currentFillOptionLabel =
        IMAGE_FIT_OPTIONS.find((opt) => opt.value === fillOption)?.label ?? 'Fill';

    const { isOpen, onOpenChange } = useDropdownControl({
        id: 'input-image-dropdown',
    });

    const handleSelectFromLibrary = useCallback(() => {
        editorEngine.state.setLeftPanelTab(LeftPanelTabValue.IMAGES);
        editorEngine.state.setLeftPanelLocked(true);
    }, []);

    const handleUploadFromComputer = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file?.type.startsWith('image/')) {
            setUploadError('Please select a valid image file');
            return;
        }

        setIsUploading(true);
        setUploadError(null);

        try {
            const { filePath, fileName } = await editorEngine.image.upload(
                file,
                DefaultSettings.IMAGE_FOLDER,
            );

            const reader = new FileReader();
            reader.onload = (event) => {
                const result = event.target?.result as string;
                const imageData: ImageContentData = {
                    // Use the sanitized stored path returned by upload(). The
                    // raw `file.name` 404s when sanitizeFilename changed it, so
                    // the persisted background-image URL pointed at a missing
                    // file and the fill never rendered.
                    originPath: filePath,
                    content: result,
                    fileName,
                    mimeType: file.type,
                };

                editorEngine.image.setSelectedImage(imageData);
                editorEngine.image.setPreviewImage(imageData);
                setIsUploading(false);
            };
            reader.readAsDataURL(file);
        } catch (error) {
            console.error('Failed to upload image:', error);
            setUploadError(error instanceof Error ? error.message : 'Failed to upload image');
            setIsUploading(false);
        }

        e.target.value = '';
    }, []);

    const handleFillOptionChangeInternal = (option: ImageFit) => {
        handleFillOptionChange(option);
    };

    const handleClose = () => {
        editorEngine.image.setIsSelectingImage(false);
        editorEngine.image.setPreviewImage(null);
        editorEngine.image.setSelectedImage(null);
        onOpenChange(false);
    };

    const handleOpenChange = (open: boolean) => {
        if (open) {
            onOpenChange(true);
        }
    };

    const loadImage = async () => {
        editorEngine.image.setIsSelectingImage(true);
        if (currentBackgroundImage) {
            const absolutePath = addImageFolderPrefix(currentBackgroundImage);

            const content = await editorEngine.image.readImageContent(absolutePath);
            if (content) {
                editorEngine.image.setSelectedImage(content);
            }
        } else {
            editorEngine.image.setSelectedImage(null);
        }
    };

    useEffect(() => {
        if (isOpen) {
            loadImage();
        } else {
            editorEngine.image.setIsSelectingImage(false);
        }
    }, [isOpen]);

    return (
        <div className="flex flex-col gap-2">
            <DropdownMenu open={isOpen} onOpenChange={handleOpenChange} modal={false}>
                <HoverOnlyTooltip
                    content={t('imageFill')}
                    side="bottom"
                    className="mt-1"
                    hideArrow
                    disabled={isOpen}
                >
                    <DropdownMenuTrigger asChild>
                        <ToolbarButton
                            isOpen={isOpen}
                            className="relative flex w-9 flex-col items-center justify-center gap-0.5"
                            disabled={isUploading}
                        >
                            {isUploading ? (
                                <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                            ) : currentBackgroundImage ? (
                                <div
                                    className="h-6 w-6 bg-cover bg-center"
                                    style={{
                                        backgroundImage: currentBackgroundImage,
                                    }}
                                />
                            ) : (
                                <Icons.Image className="h-2 w-2" />
                            )}
                            {isUploading && (
                                <div className="bg-foreground/8 absolute inset-0 animate-pulse rounded" />
                            )}
                        </ToolbarButton>
                    </DropdownMenuTrigger>
                </HoverOnlyTooltip>
                <DropdownMenuContent
                    align="start"
                    side="bottom"
                    className="mt-1 w-[280px] overflow-hidden rounded-lg shadow-xl backdrop-blur-lg"
                >
                    <div className="flex flex-col">
                        {/* Header */}
                        <div className="flex items-center justify-between p-3">
                            <h3 className="text-foreground text-small font-medium">{t('imageFill')}</h3>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 p-0"
                                onClick={handleClose}
                                disabled={isUploading}
                            >
                                <Icons.CrossL className="h-4 w-4" />
                            </Button>
                        </div>
                        <Separator />
                        <div className="flex flex-col gap-3 p-3">
                            {/* Fill Options */}
                            <div className="flex items-center gap-4">
                                <DropdownMenu modal={false}>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            variant="outline"
                                            className="bg-background-tertiary/50 border-border hover:bg-background-tertiary/70 w-32 justify-between"
                                            disabled={isUploading}
                                        >
                                            <>
                                                {currentFillOptionLabel}
                                                <Icons.ChevronDown className="h-4 w-4 opacity-50" />
                                            </>
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start" className="w-32">
                                        {IMAGE_FIT_OPTIONS.map((option) => (
                                            <DropdownMenuItem
                                                key={option.value}
                                                onClick={() =>
                                                    handleFillOptionChangeInternal(option.value)
                                                }
                                                className="text-small"
                                                disabled={isUploading}
                                            >
                                                {option.label}
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>

                            {/* Image preview */}
                            <div className="bg-background-tertiary relative aspect-[4/3] w-full overflow-hidden rounded-lg">
                                {previewImage ? (
                                    <>
                                        <img
                                            src={previewImage.content}
                                            alt="Preview"
                                            className="h-full w-full object-cover"
                                        />
                                        {isUploading && (
                                            <div className="bg-background/50 absolute inset-0 flex items-center justify-center">
                                                <div className="bg-background-secondary rounded-full p-2">
                                                    <Icons.LoadingSpinner className="text-foreground-secondary h-4 w-4 animate-spin" />
                                                </div>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center">
                                        <Icons.Image className="text-foreground-tertiary/50 h-12 w-12" />
                                    </div>
                                )}
                            </div>

                            {/* Action buttons */}
                            <Button
                                onClick={handleSelectFromLibrary}
                                variant="outline"
                                className="!bg-background hover:bg-background-secondary text-foreground border-border hover:text-foreground w-full justify-start gap-2"
                                disabled={isUploading}
                            >
                                <div className="flex items-center gap-2">
                                    <Icons.Library className="h-4 w-4" />
                                    {t('selectFromLibrary')}
                                </div>
                            </Button>
                            <Button
                                onClick={handleUploadFromComputer}
                                variant="outline"
                                disabled={isUploading}
                                className="bg-background-secondary text-foreground border-border hover:bg-background w-full justify-start gap-2 disabled:opacity-50"
                            >
                                <div className="flex items-center gap-2">
                                    {isUploading ? (
                                        <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Icons.Upload className="h-4 w-4" />
                                    )}
                                    {isUploading ? t('uploading') : t('uploadFromComputer')}
                                </div>
                            </Button>

                            {uploadError && (
                                <div className="text-mini text-destructive mt-1 px-1">
                                    {uploadError}
                                </div>
                            )}

                            {currentBackgroundImage && (
                                <Button
                                    onClick={removeBackground}
                                    variant="outline"
                                    className="border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 w-full justify-start gap-2"
                                    disabled={isUploading}
                                >
                                    <div className="flex items-center gap-2">
                                        <Icons.CrossL className="h-4 w-4" />
                                        {t('removeBackground')}
                                    </div>
                                </Button>
                            )}
                        </div>
                    </div>
                </DropdownMenuContent>
            </DropdownMenu>

            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
            />
        </div>
    );
});
