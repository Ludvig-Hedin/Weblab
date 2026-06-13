import { useState } from 'react';

import { useTranslations } from 'next-intl';

import { Icons } from '@weblab/ui/icons';

import type { FrameData } from '@/components/store/editor/frames';
import { useEditorEngine } from '@/components/store/editor';
import { HoverOnlyTooltip } from '../hover-tooltip';
import { ToolbarButton } from '../toolbar-button';

export function WindowActionsGroup({ frameData }: { frameData: FrameData }) {
    const t = useTranslations('editor.editorBar');
    const editorEngine = useEditorEngine();
    const [isDeleting, setIsDeleting] = useState(false);
    const [isDuplicating, setIsDuplicating] = useState(false);
    const [isCopyingFigma, setIsCopyingFigma] = useState(false);

    const copyToFigma = async () => {
        if (!frameData?.frame.id) return;
        setIsCopyingFigma(true);
        try {
            await editorEngine.figma.copyFrameToFigma(frameData.frame.id);
        } catch (error) {
            console.error(error);
        } finally {
            setIsCopyingFigma(false);
        }
    };

    const duplicateWindow = async () => {
        setIsDuplicating(true);
        try {
            if (frameData?.frame.id) {
                await editorEngine.frames.duplicate(frameData.frame.id);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsDuplicating(false);
        }
    };

    const deleteWindow = async () => {
        setIsDeleting(true);
        try {
            if (frameData?.frame.id) {
                await editorEngine.frames.delete(frameData.frame.id);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <>
            <HoverOnlyTooltip content={t('copyToFigma')} side="bottom" sideOffset={10}>
                <ToolbarButton
                    className="flex w-9 items-center"
                    onClick={copyToFigma}
                    disabled={isCopyingFigma}
                >
                    {isCopyingFigma ? (
                        <Icons.LoadingSpinner className="min-size-4 size-4 animate-spin" />
                    ) : (
                        <Icons.Figma className="min-size-4 size-4" />
                    )}
                </ToolbarButton>
            </HoverOnlyTooltip>
            <HoverOnlyTooltip content={t('duplicateFrame')} side="bottom" sideOffset={10}>
                <ToolbarButton
                    className="flex w-9 items-center"
                    onClick={duplicateWindow}
                    disabled={isDuplicating}
                >
                    {isDuplicating ? (
                        <Icons.LoadingSpinner className="min-size-4 size-4 animate-spin" />
                    ) : (
                        <Icons.Copy className="min-size-4 size-4" />
                    )}
                </ToolbarButton>
            </HoverOnlyTooltip>
            {editorEngine.frames.canDelete() && (
                <HoverOnlyTooltip content={t('deleteFrame')} side="bottom" sideOffset={10}>
                    <ToolbarButton
                        className="flex w-9 items-center"
                        disabled={!editorEngine.frames.canDelete() || isDeleting}
                        onClick={deleteWindow}
                    >
                        {isDeleting ? (
                            <Icons.LoadingSpinner className="min-size-4 size-4 animate-spin" />
                        ) : (
                            <Icons.Trash className="min-size-4 size-4" />
                        )}
                    </ToolbarButton>
                </HoverOnlyTooltip>
            )}
        </>
    );
}
