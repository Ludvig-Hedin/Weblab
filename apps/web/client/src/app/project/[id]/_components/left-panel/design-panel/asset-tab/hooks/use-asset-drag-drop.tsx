import { useCallback, useState } from 'react';
import { usePostHog } from 'posthog-js/react';

import type { ImageContentData } from '@weblab/models';
import { EditorMode, InsertMode } from '@weblab/models';

import { useEditorEngine } from '@/components/store/editor';

export const useAssetDragDrop = (onUpload?: (files: FileList) => Promise<void>) => {
    const editorEngine = useEditorEngine();
    const posthog = usePostHog();
    const [isDragging, setIsDragging] = useState(false);

    const handleDragStateChange = useCallback(
        (isDragging: boolean, e: React.DragEvent<HTMLDivElement>) => {
            // Any external file drag counts — the Assets panel accepts every file type.
            const hasFiles =
                e.dataTransfer.types.includes('Files') ||
                Array.from(e.dataTransfer.items).some((item) => item.kind === 'file');
            if (hasFiles) {
                setIsDragging(isDragging);
                e.currentTarget.setAttribute('data-weblab-dragging-image', isDragging.toString());
            }
        },
        [],
    );

    const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
    }, []);

    const handleDragEnter = useCallback(
        (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            handleDragStateChange(true, e);
        },
        [handleDragStateChange],
    );

    const handleDragLeave = useCallback(
        (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                handleDragStateChange(false, e);
            }
        },
        [handleDragStateChange],
    );

    const onImageDragStart = useCallback(
        (e: React.DragEvent<HTMLDivElement>, image: ImageContentData) => {
            e.dataTransfer.setData(
                'application/json',
                JSON.stringify({
                    type: 'image',
                    fileName: image.fileName,
                    content: image.content,
                    mimeType: image.mimeType,
                    originPath: image.originPath,
                }),
            );

            editorEngine.state.setInsertMode(InsertMode.INSERT_IMAGE);
            for (const frame of editorEngine.frames.getAll()) {
                if (!frame.view) {
                    console.error('No frame view found');
                    continue;
                }
                frame.view.style.pointerEvents = 'none';
            }
            posthog.capture('image_drag_start');
        },
        [editorEngine, posthog],
    );

    const onImageMouseDown = useCallback(() => {
        editorEngine.state.setInsertMode(InsertMode.INSERT_IMAGE);
    }, [editorEngine.state]);

    const onImageMouseUp = useCallback(() => {
        editorEngine.state.setEditorMode(EditorMode.DESIGN);
        editorEngine.state.setInsertMode(null);
    }, [editorEngine.state]);

    const onImageDragEnd = useCallback(() => {
        for (const frame of editorEngine.frames.getAll()) {
            if (!frame.view) {
                console.error('No frame view found');
                continue;
            }
            frame.view.style.pointerEvents = 'auto';
        }
        editorEngine.state.setEditorMode(EditorMode.DESIGN);
    }, [editorEngine]);

    const handleDrop = useCallback(
        (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            setIsDragging(false);
            e.currentTarget.removeAttribute('data-weblab-dragging-image');

            const files = e.dataTransfer.files;
            if (files.length > 0 && onUpload) {
                void onUpload(files);
            }
        },
        [onUpload],
    );

    return {
        isDragging,
        handleDragOver,
        handleDragEnter,
        handleDragLeave,
        handleDrop,
        onImageDragStart,
        onImageMouseDown,
        onImageMouseUp,
        onImageDragEnd,
    };
};
