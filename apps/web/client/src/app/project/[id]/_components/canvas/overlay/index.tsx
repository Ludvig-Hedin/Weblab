import { useMemo } from 'react';
import { observer } from 'mobx-react-lite';

import { EditorAttributes } from '@weblab/constants';
import { EditorMode } from '@weblab/models';
import { cn } from '@weblab/ui/utils';

import type { ClickRectState } from '@/components/store/editor/overlay/state';
import { useEditorEngine } from '@/components/store/editor';
import { CommentPins } from './comment-pins';
import { CommentPopover } from './comment-popover';
import { ComponentEditBanner } from './component-edit-banner';
import { EditModeDim } from './edit-mode-dim';
import { OverlayButtons } from './elements/buttons';
import { OverlayAiMenu } from './elements/buttons/ai-menu';
import { CmsPill } from './elements/cms-pill';
import { ComponentChip } from './elements/component-chip';
import { MeasurementOverlay } from './elements/measurement';
import { ClickRect } from './elements/rect/click';
import { HoverRect } from './elements/rect/hover';
import { InsertRect } from './elements/rect/insert';
import { SnapGuidelines } from './elements/snap-guidelines';
import { TextEditor } from './elements/text';
import { RemoteCursors } from './remote-cursors';

export const Overlay = observer(() => {
    const editorEngine = useEditorEngine();
    const overlayState = editorEngine.overlay.state;
    const isSingleSelection = editorEngine.elements.selected.length === 1;
    const isTextEditing = editorEngine.text.isEditing;

    const clickRectsElements = useMemo(
        () =>
            overlayState.clickRects.map((rectState: ClickRectState) => (
                <ClickRect
                    key={rectState.id}
                    width={rectState.width}
                    height={rectState.height}
                    top={rectState.top}
                    left={rectState.left}
                    isComponent={rectState.isComponent}
                    styles={rectState.styles}
                    shouldShowResizeHandles={isSingleSelection}
                />
            )),
        [overlayState.clickRects, isSingleSelection],
    );

    return (
        <div
            id={EditorAttributes.OVERLAY_CONTAINER_ID}
            className={cn(
                'pointer-events-none absolute top-0 left-0 h-0 w-0',
                editorEngine.state.shouldHideOverlay
                    ? 'opacity-0'
                    : 'opacity-100 transition-opacity duration-150',
                editorEngine.state.editorMode === EditorMode.PREVIEW && 'hidden',
            )}
        >
            <EditModeDim />
            {!isTextEditing && overlayState.hoverRect && (
                <HoverRect
                    rect={overlayState.hoverRect.rect}
                    isComponent={overlayState.hoverRect.isComponent}
                />
            )}
            {overlayState.insertRect && (
                <InsertRect rect={overlayState.insertRect} mode={editorEngine.state.insertMode} />
            )}
            {!isTextEditing && clickRectsElements}
            {isTextEditing && overlayState.textEditor && <TextEditor />}
            {overlayState.measurement && (
                <MeasurementOverlay
                    fromRect={overlayState.measurement.fromRect}
                    toRect={overlayState.measurement.toRect}
                />
            )}
            {overlayState.clickRects.length > 0 && <OverlayButtons />}
            {overlayState.clickRects.length > 0 && <OverlayAiMenu />}
            {overlayState.clickRects.length > 0 && <CmsPill />}
            {overlayState.clickRects.length > 0 && <ComponentChip />}
            <ComponentEditBanner />
            <SnapGuidelines />
            <CommentPins />
            <CommentPopover />
            <RemoteCursors />
        </div>
    );
});
