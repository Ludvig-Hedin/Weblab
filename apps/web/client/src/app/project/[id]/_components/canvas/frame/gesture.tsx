import { useCallback, useEffect, useMemo } from 'react';
import throttle from 'lodash/throttle';
import { observer } from 'mobx-react-lite';

import type { DomElement, ElementPosition, Frame } from '@weblab/models';
import { EditorMode, InsertMode, MouseAction } from '@weblab/models';
import { toast } from '@weblab/ui/sonner';
import { cn } from '@weblab/ui/utils';

import type { FrameData } from '@/components/store/editor/frames';
import { useEditorEngine } from '@/components/store/editor';
import { getRelativeMousePositionToFrameView } from '@/components/store/editor/overlay/utils';
import { RightClickMenu } from '../../right-click-menu';

export const GestureScreen = observer(
    ({ frame, isResizing }: { frame: Frame; isResizing: boolean }) => {
        const editorEngine = useEditorEngine();

        const getFrameData: () => FrameData | null = useCallback(() => {
            return editorEngine.frames.get(frame.id);
        }, [editorEngine.frames, frame.id]);

        const getRelativeMousePosition = useCallback(
            (e: React.MouseEvent<HTMLDivElement>): ElementPosition => {
                const frameData = getFrameData();
                if (!frameData?.view) {
                    return { x: 0, y: 0 };
                }
                return getRelativeMousePositionToFrameView(e, frameData.view);
            },
            [getFrameData],
        );

        const handleMouseEvent = useCallback(
            async (e: React.MouseEvent<HTMLDivElement>, action: MouseAction) => {
                try {
                    const frameData = getFrameData();
                    if (!frameData?.view) {
                        return;
                    }
                    if (!frameData.view.isPenpalReady()) {
                        if (action === MouseAction.MOVE) {
                            editorEngine.elements.clearHoveredElement();
                            editorEngine.overlay.removeMeasurement();
                        }
                        return;
                    }
                    const pos = getRelativeMousePosition(e);
                    const shouldGetStyle = [
                        MouseAction.MOUSE_DOWN,
                        MouseAction.DOUBLE_CLICK,
                    ].includes(action);
                    if (typeof frameData.view.getElementAtLoc !== 'function') {
                        return;
                    }
                    const el: DomElement = await frameData.view.getElementAtLoc(
                        pos.x,
                        pos.y,
                        shouldGetStyle,
                    );
                    if (!el) {
                        if (action === MouseAction.MOVE) {
                            editorEngine.elements.clearHoveredElement();
                            editorEngine.overlay.removeMeasurement();
                        }
                        return;
                    }

                    switch (action) {
                        case MouseAction.MOVE:
                            if (editorEngine.move.state?.dragTarget.frameId === frame.id) {
                                await editorEngine.move.drag(e, getRelativeMousePosition);
                                return;
                            }
                            editorEngine.elements.mouseover(el);
                            if (e.altKey) {
                                if (editorEngine.state.insertMode !== InsertMode.INSERT_IMAGE) {
                                    editorEngine.overlay.showMeasurement();
                                }
                            } else {
                                editorEngine.overlay.removeMeasurement();
                            }
                            break;
                        case MouseAction.MOUSE_DOWN:
                            if (el.tagName.toLocaleLowerCase() === 'body') {
                                if (editorEngine.text.isEditing) {
                                    await editorEngine.text.end();
                                }
                                editorEngine.frames.select([frame], e.shiftKey);
                                return;
                            }
                            // Ignore right-clicks
                            if (e.button == 2) {
                                break;
                            }
                            const wasTextEditing = editorEngine.text.isEditing;
                            if (wasTextEditing) {
                                // Triple-click: third mousedown lands on the same element
                                // the user just double-clicked into — don't destroy the editor.
                                // ProseMirror handles the native text selection itself.
                                if (editorEngine.text.targetElement?.domId === el.domId) {
                                    break;
                                }
                                await editorEngine.text.end();
                            }

                            const isAlreadySingleSelected =
                                editorEngine.elements.selected.length === 1 &&
                                editorEngine.elements.selected[0]?.domId === el.domId;

                            if (e.shiftKey) {
                                editorEngine.move.cancelDragPreparation();
                                editorEngine.elements.shiftClick(el);
                            } else {
                                if (!isAlreadySingleSelected) {
                                    editorEngine.move.cancelDragPreparation();
                                    editorEngine.elements.click([el]);
                                }

                                if (
                                    isAlreadySingleSelected &&
                                    !wasTextEditing &&
                                    editorEngine.state.editorMode === EditorMode.DESIGN &&
                                    !isResizing &&
                                    !editorEngine.state.isDragSelecting &&
                                    !editorEngine.insert.isDrawing
                                ) {
                                    editorEngine.move.startDragPreparation(
                                        el,
                                        pos,
                                        frameData,
                                        e.altKey,
                                    );
                                }
                            }
                            break;
                        case MouseAction.DOUBLE_CLICK:
                            if (
                                el.oid &&
                                (await frameData.view.isChildTextEditable(el.oid)) === true
                            ) {
                                await editorEngine.text.start(el, frameData.view);
                            } else if (el.oid) {
                                editorEngine.ide.openCodeBlock(el.oid);
                            } else {
                                toast.error('Cannot find element in code panel');
                                return;
                            }
                            break;
                    }
                } catch (error) {
                    if (action !== MouseAction.MOVE) {
                        console.error('Error handling mouse event:', error);
                    }
                    return;
                }
            },
            [getRelativeMousePosition, editorEngine, isResizing, frame],
        );

        const throttledMouseMove = useMemo(
            () =>
                throttle(async (e: React.MouseEvent<HTMLDivElement>) => {
                    // Skip hover events during drag selection
                    if (editorEngine.state.isDragSelecting) {
                        return;
                    }
                    if (editorEngine.move.state?.dragTarget.frameId === frame.id) {
                        await editorEngine.move.drag(e, getRelativeMousePosition);
                        return;
                    }
                    if (
                        editorEngine.state.editorMode === EditorMode.DESIGN ||
                        editorEngine.state.editorMode === EditorMode.CODE ||
                        ((editorEngine.state.insertMode === InsertMode.INSERT_DIV ||
                            editorEngine.state.insertMode === InsertMode.INSERT_FLEX_DIV ||
                            editorEngine.state.insertMode === InsertMode.INSERT_BUTTON ||
                            editorEngine.state.insertMode === InsertMode.INSERT_HEADING ||
                            editorEngine.state.insertMode === InsertMode.INSERT_LINK ||
                            editorEngine.state.insertMode === InsertMode.INSERT_INPUT ||
                            editorEngine.state.insertMode === InsertMode.INSERT_TEXT ||
                            editorEngine.state.insertMode === InsertMode.INSERT_IMAGE) &&
                            !editorEngine.insert.isDrawing)
                    ) {
                        await handleMouseEvent(e, MouseAction.MOVE);
                    } else if (editorEngine.insert.isDrawing) {
                        editorEngine.insert.draw(e);
                    }
                }, 16),
            [
                editorEngine.state.isDragSelecting,
                editorEngine.state.editorMode,
                editorEngine.insert.isDrawing,
                getRelativeMousePosition,
                handleMouseEvent,
                frame,
            ],
        );

        useEffect(() => {
            return () => {
                throttledMouseMove.cancel();
            };
        }, [throttledMouseMove]);

        useEffect(() => {
            const handleGlobalMouseUp = () => {
                void editorEngine.move.end();
            };

            window.addEventListener('mouseup', handleGlobalMouseUp);
            return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
        }, [editorEngine.move]);

        const handleClick = useCallback(
            async (e: React.MouseEvent<HTMLDivElement>) => {
                if (editorEngine.move.consumeSuppressedClick()) {
                    return;
                }

                if (editorEngine.state.pendingInsertComponent) {
                    const frameData = getFrameData();
                    if (!frameData) {
                        toast.error('Unable to insert component', {
                            description: 'Frame data not available',
                        });
                        editorEngine.state.setPendingInsertComponent(null);
                        return;
                    }

                    try {
                        const dropPosition = getRelativeMousePosition(e);
                        await editorEngine.insert.insertDroppedComponent(
                            frameData,
                            dropPosition,
                            editorEngine.state.pendingInsertComponent,
                        );
                        editorEngine.state.setPendingInsertComponent(null);
                        editorEngine.state.setEditorMode(EditorMode.DESIGN);
                        editorEngine.state.setInsertMode(null);
                    } catch (error) {
                        console.error('Failed to insert component from panel:', error);
                        toast.error('Failed to insert component', {
                            description: error instanceof Error ? error.message : 'Unknown error',
                        });
                        editorEngine.state.setPendingInsertComponent(null);
                    }
                    return;
                }

                if (editorEngine.state.pendingInsertBlock) {
                    const frameData = getFrameData();
                    if (!frameData) {
                        toast.error('Unable to insert block', {
                            description: 'Frame data not available',
                        });
                        editorEngine.state.setPendingInsertBlock(null);
                        return;
                    }

                    try {
                        const dropPosition = getRelativeMousePosition(e);
                        await editorEngine.insert.insertDroppedBlock(
                            frameData,
                            dropPosition,
                            editorEngine.state.pendingInsertBlock,
                        );
                        editorEngine.state.setPendingInsertBlock(null);
                        editorEngine.state.setEditorMode(EditorMode.DESIGN);
                        editorEngine.state.setInsertMode(null);
                    } catch (error) {
                        console.error('Failed to insert block from palette:', error);
                        toast.error('Failed to insert block', {
                            description: error instanceof Error ? error.message : 'Unknown error',
                        });
                        editorEngine.state.setPendingInsertBlock(null);
                    }
                    return;
                }

                if (editorEngine.state.pendingInsertElement) {
                    const frameData = getFrameData();
                    if (!frameData) {
                        toast.error('Unable to insert element', {
                            description: 'Frame data not available',
                        });
                        editorEngine.state.setPendingInsertElement(null);
                        return;
                    }

                    try {
                        const dropPosition = getRelativeMousePosition(e);
                        await editorEngine.insert.insertDroppedElement(
                            frameData,
                            dropPosition,
                            editorEngine.state.pendingInsertElement,
                        );
                        editorEngine.state.setPendingInsertElement(null);
                        editorEngine.state.setEditorMode(EditorMode.DESIGN);
                        editorEngine.state.setInsertMode(null);
                    } catch (error) {
                        console.error('Failed to insert element from palette:', error);
                        toast.error('Failed to insert element', {
                            description: error instanceof Error ? error.message : 'Unknown error',
                        });
                        editorEngine.state.setPendingInsertElement(null);
                    }
                    return;
                }

                editorEngine.frames.select([frame]);
            },
            [
                editorEngine.frames,
                editorEngine.insert,
                editorEngine.move,
                editorEngine.state,
                frame,
                getFrameData,
                getRelativeMousePosition,
            ],
        );

        async function handleDoubleClick(e: React.MouseEvent<HTMLDivElement>) {
            if (editorEngine.state.editorMode === EditorMode.PREVIEW) {
                return;
            }
            await handleMouseEvent(e, MouseAction.DOUBLE_CLICK);
        }

        async function handleMouseDown(e: React.MouseEvent<HTMLDivElement>) {
            if (
                editorEngine.state.pendingInsertElement ||
                editorEngine.state.pendingInsertBlock ||
                editorEngine.state.pendingInsertComponent
            ) {
                return;
            }
            if (
                editorEngine.state.editorMode === EditorMode.DESIGN ||
                editorEngine.state.editorMode === EditorMode.CODE
            ) {
                await handleMouseEvent(e, MouseAction.MOUSE_DOWN);
            } else if (
                editorEngine.state.insertMode === InsertMode.INSERT_DIV ||
                editorEngine.state.insertMode === InsertMode.INSERT_FLEX_DIV ||
                editorEngine.state.insertMode === InsertMode.INSERT_BUTTON ||
                editorEngine.state.insertMode === InsertMode.INSERT_HEADING ||
                editorEngine.state.insertMode === InsertMode.INSERT_LINK ||
                editorEngine.state.insertMode === InsertMode.INSERT_INPUT ||
                editorEngine.state.insertMode === InsertMode.INSERT_TEXT ||
                editorEngine.state.insertMode === InsertMode.INSERT_IMAGE
            ) {
                editorEngine.insert.start(e);
            }
        }

        async function handleMouseUp(e: React.MouseEvent<HTMLDivElement>) {
            await editorEngine.move.end();

            const frameData = getFrameData();
            if (!frameData) {
                return;
            }

            await editorEngine.insert.end(e, frameData.view);
        }

        const handleDragOver = async (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.stopPropagation();
            await handleMouseEvent(e, MouseAction.MOVE);
        };

        const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.stopPropagation();

            try {
                const componentData = e.dataTransfer.getData('application/weblab-component');
                if (componentData) {
                    const frameData = editorEngine.frames.get(frame.id);
                    if (!frameData) {
                        throw new Error('Frame data not found');
                    }
                    const dropPosition = getRelativeMousePosition(e);
                    await editorEngine.insert.insertDroppedComponent(
                        frameData,
                        dropPosition,
                        JSON.parse(componentData),
                    );
                    editorEngine.state.setEditorMode(EditorMode.DESIGN);
                    editorEngine.state.setInsertMode(null);
                    return;
                }

                const propertiesData = e.dataTransfer.getData('application/json');
                if (!propertiesData) {
                    throw new Error('No element properties in drag data');
                }

                const properties = JSON.parse(propertiesData);

                if (properties.type === 'image') {
                    const frameData = editorEngine.frames.get(frame.id);
                    if (!frameData) {
                        throw new Error('Frame data not found');
                    }
                    const dropPosition = getRelativeMousePosition(e);
                    await editorEngine.insert.insertDroppedImage(
                        frameData,
                        dropPosition,
                        properties,
                        e.altKey,
                    );
                } else if (properties.type === 'shadcn-block') {
                    const frameData = editorEngine.frames.get(frame.id);
                    if (!frameData) {
                        throw new Error('Frame data not found');
                    }
                    const dropPosition = getRelativeMousePosition(e);
                    await editorEngine.insert.insertDroppedBlock(
                        frameData,
                        dropPosition,
                        properties.block,
                    );
                } else {
                    const frameData = editorEngine.frames.get(frame.id);
                    if (!frameData) {
                        throw new Error('Frame data not found');
                    }
                    const dropPosition = getRelativeMousePosition(e);
                    await editorEngine.insert.insertDroppedElement(
                        frameData,
                        dropPosition,
                        properties,
                    );
                }

                editorEngine.state.setEditorMode(EditorMode.DESIGN);
                editorEngine.state.setInsertMode(null);
            } catch (error) {
                console.error('drop operation failed:', error);
                toast.error('Failed to drop element', {
                    description: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        };

        const gestureScreenClassName = useMemo(() => {
            return cn(
                'absolute inset-0 bg-transparent',
                editorEngine.state.editorMode === EditorMode.PREVIEW && !isResizing
                    ? 'hidden'
                    : 'visible',
                (editorEngine.state.insertMode === InsertMode.INSERT_DIV ||
                    editorEngine.state.insertMode === InsertMode.INSERT_FLEX_DIV ||
                    editorEngine.state.insertMode === InsertMode.INSERT_BUTTON ||
                    editorEngine.state.insertMode === InsertMode.INSERT_HEADING ||
                    editorEngine.state.insertMode === InsertMode.INSERT_LINK ||
                    editorEngine.state.insertMode === InsertMode.INSERT_INPUT) &&
                    'cursor-crosshair',
                editorEngine.state.insertMode === InsertMode.INSERT_TEXT && 'cursor-text',
                (editorEngine.state.pendingInsertElement ||
                    editorEngine.state.pendingInsertBlock ||
                    editorEngine.state.pendingInsertComponent) &&
                    'cursor-crosshair',
            );
        }, [
            editorEngine.state.editorMode,
            editorEngine.state.insertMode,
            editorEngine.state.pendingInsertElement,
            editorEngine.state.pendingInsertBlock,
            editorEngine.state.pendingInsertComponent,
            isResizing,
        ]);

        const handleMouseOut = () => {
            if (editorEngine.move.isPreparing) {
                editorEngine.move.cancelDragPreparation();
            }
            editorEngine.elements.clearHoveredElement();
            editorEngine.overlay.state.removeHoverRect();
        };

        return (
            <RightClickMenu>
                <div
                    className={gestureScreenClassName}
                    onClick={handleClick}
                    onMouseOut={handleMouseOut}
                    onMouseLeave={handleMouseUp}
                    onMouseMove={throttledMouseMove}
                    onMouseDown={handleMouseDown}
                    onMouseUp={handleMouseUp}
                    onDoubleClick={handleDoubleClick}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                ></div>
            </RightClickMenu>
        );
    },
);
