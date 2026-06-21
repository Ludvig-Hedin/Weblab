import type { NodeApi } from 'react-arborist';
import { memo, useCallback, useMemo, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { motion } from 'motion/react';

import type { DomElement, LayerNode } from '@weblab/models/element';
import { MouseAction } from '@weblab/models/editor';
import { Icons } from '@weblab/ui/icons';
import { NodeIcon } from '@weblab/ui/node-icon';
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';

import { getWindowLabel } from './window-label';

const isComponentAncestor = (node: NodeApi<LayerNode>): boolean => {
    if (!node) {
        return false;
    }
    if (node.data.instanceId) {
        return true;
    }
    return node.parent ? isComponentAncestor(node.parent) : false;
};

const parentSelected = (node: NodeApi<LayerNode>, selectedElements: DomElement[]) => {
    if (!node.parent) {
        return null;
    }
    if (selectedElements.some((el) => el.domId === node.parent?.data.domId)) {
        return node.parent;
    }
    return parentSelected(node.parent, selectedElements);
};

const allAncestorsLastAndOpen = (
    node: NodeApi<LayerNode>,
    selectedParentNode: NodeApi<LayerNode>,
) => {
    if (node.parent && node.parent !== selectedParentNode) {
        if (node.parent.nextSibling || node.parent.isClosed) {
            return false;
        }
        return allAncestorsLastAndOpen(node.parent, selectedParentNode);
    }
    return true;
};

const VisibilityButton = memo(
    ({ isVisible, onClick }: { isVisible: boolean; onClick: () => void }) => (
        <button
            onClick={onClick}
            style={{ position: 'absolute', right: '4px' }}
            className="h-4 w-4"
        >
            {isVisible ? <Icons.EyeOpen /> : <Icons.EyeClosed />}
        </button>
    ),
);

const LayerBadge = memo(
    ({ children, className }: { children: React.ReactNode; className?: string }) => (
        <span
            className={cn(
                'text-tiny flex h-4 min-w-4 items-center justify-center rounded border px-1 leading-none font-semibold',
                className,
            )}
        >
            {children}
        </span>
    ),
);

export const TreeNode = memo(
    observer(
        ({
            node,
            style,
            dragHandle,
        }: {
            node: NodeApi<LayerNode>;
            style: React.CSSProperties;
            treeHovered: boolean;
            dragHandle?: React.RefObject<HTMLDivElement> | any;
        }) => {
            const editorEngine = useEditorEngine();
            const isWindow = node.data.tagName.toLowerCase() === 'body';
            const nodeRef = useRef<HTMLDivElement>(null);
            // While a master component is edited in-context, rows outside the
            // edit scope are dimmed and inert (matching the canvas dim).
            const outOfEditScope =
                !!editorEngine.components.editing &&
                !editorEngine.components.isInEditScope(node.data.frameId, node.data.domId);
            const isText = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(
                node.data.tagName.toLowerCase(),
            );
            const isWindowSelected =
                isWindow &&
                editorEngine.elements.selected.length === 0 &&
                editorEngine.frames.selected.some((el) => el.frame.id === node.data.frameId);
            const showBadges = node.data.htmlId || node.data.isInteractive;

            const { hovered, selected, isParentSelected } = useMemo(
                () => ({
                    hovered: node.data.domId === editorEngine.elements.hovered?.domId,
                    selected: editorEngine.elements.selected.some(
                        (el) => el.domId === node.data.domId,
                    ),
                    isParentSelected: parentSelected(node, editorEngine.elements.selected),
                }),
                [
                    node.data.domId,
                    editorEngine.elements.hovered?.domId,
                    editorEngine.elements.selected,
                ],
            );

            const sendMouseEvent = useCallback(
                async (
                    e: React.MouseEvent<HTMLDivElement>,
                    node: LayerNode,
                    action: MouseAction,
                ) => {
                    const frameData = editorEngine.frames.get(node.frameId);
                    if (!frameData?.view) {
                        console.error('Failed to get frameView');
                        return;
                    }
                    const el: DomElement = await frameData.view.getElementByDomId(
                        node.domId,
                        action === MouseAction.MOUSE_DOWN,
                    );
                    // `getElementByDomId` falls back to <body> for a stale/removed
                    // domId instead of returning null, so the `!el` guard alone is
                    // dead. Bail when the resolved element isn't the row we're
                    // acting on — otherwise hover/click corrupts the selection onto
                    // <body> (mirrors the guard in layers-tab/index.tsx handleDrop).
                    if (!el || el.domId !== node.domId) {
                        return;
                    }

                    switch (action) {
                        case MouseAction.MOVE:
                            editorEngine.elements.mouseover(el);
                            break;
                        case MouseAction.MOUSE_DOWN:
                            if (isWindow) {
                                editorEngine.clearUI();
                                editorEngine.frames.select([frameData.frame], e.shiftKey);
                                return;
                            }
                            if (e.shiftKey) {
                                editorEngine.elements.shiftClick(el);
                                break;
                            }
                            editorEngine.elements.click([el]);
                            break;
                    }
                },
                [editorEngine, isWindow],
            );

            const handleHoverNode = useCallback(
                async (e: React.MouseEvent<HTMLDivElement>) => {
                    if (hovered) {
                        return;
                    }
                    await sendMouseEvent(e, node.data, MouseAction.MOVE);
                },
                [hovered, node.data, sendMouseEvent],
            );

            const handleSelectNode = useCallback(
                async (e: React.MouseEvent<HTMLDivElement>) => {
                    if (selected) {
                        return;
                    }
                    node.select();
                    await sendMouseEvent(e, node.data, MouseAction.MOUSE_DOWN);
                },
                [selected, node, sendMouseEvent],
            );

            const parentGroupEnd = useCallback(
                (node: NodeApi<LayerNode>) => {
                    if (node.nextSibling || node.isOpen) {
                        return false;
                    }
                    const selectedParent = parentSelected(node, editorEngine.elements.selected);
                    if (selectedParent && allAncestorsLastAndOpen(node, selectedParent)) {
                        return true;
                    }
                },
                [editorEngine.elements.selected],
            );

            const nodeClassName = useMemo(
                () =>
                    cn('flex h-6 w-full cursor-pointer flex-row items-center pr-1', {
                        'pointer-events-none opacity-40': outOfEditScope,
                        'text-foreground-skill/70':
                            isComponentAncestor(node) && !node.data.instanceId && !hovered,
                        'text-foreground-skill':
                            isComponentAncestor(node) && !node.data.instanceId && hovered,
                        'text-foreground-weblab':
                            !isComponentAncestor(node) &&
                            !node.data.instanceId &&
                            !selected &&
                            !hovered,
                        rounded:
                            (hovered && !isParentSelected && !selected) ||
                            (selected && node.isLeaf) ||
                            (selected && node.isClosed) ||
                            isWindowSelected,
                        'rounded-t': selected && node.isInternal,
                        'rounded-b': isParentSelected && parentGroupEnd(node),
                        'rounded-none': isParentSelected && node.nextSibling,
                        'bg-background-weblab': hovered,
                        'bg-foreground-brand dark:bg-foreground-brand/90': selected,
                        'bg-foreground-brand/10 dark:bg-foreground-brand/10': isParentSelected,
                        'bg-foreground-brand/20 dark:bg-foreground-brand/20':
                            hovered && isParentSelected,
                        'text-foreground-primary': node.data.instanceId && selected,
                        'text-foreground-tertiary italic': node.data.instanceId && !selected,
                        'text-foreground-secondary italic':
                            node.data.instanceId && !selected && hovered,
                        'bg-foreground/15':
                            node.data.instanceId && !selected && hovered && !isParentSelected,
                        'bg-foreground/5': isParentSelected?.data.instanceId,
                        'bg-foreground/10': hovered && isParentSelected?.data.instanceId,
                        'dark:text-primary text-foreground-primary':
                            (!node.data.instanceId && selected) || isWindowSelected,
                        'bg-foreground-brand': isWindowSelected,
                    }),
                [
                    hovered,
                    selected,
                    isParentSelected,
                    isWindowSelected,
                    parentGroupEnd,
                    node,
                    outOfEditScope,
                ],
            );

            function sideOffset() {
                const container = document.getElementById('layer-tab-id');
                const containerRect = container?.getBoundingClientRect();
                const nodeRect = nodeRef?.current?.getBoundingClientRect();
                if (!containerRect || !nodeRect) {
                    return 0;
                }
                const scrollLeft = container?.scrollLeft || 0;
                const nodeRightEdge = nodeRect.width + nodeRect.left - scrollLeft;
                const containerWidth = containerRect.width;
                return containerWidth - nodeRightEdge + 10;
            }

            // TODO(bug-hunt): the eye toggle mutates `node.data.isVisible`
            // locally for instant UI feedback, but that mutation isn't part of
            // the undo action. Undoing the visibility change reverts the style
            // but leaves the eye icon desynced from the actual DOM state. Drive
            // `isVisible` from the committed style (or refresh it on undo/redo)
            // instead of mutating the node directly.
            function toggleVisibility(): void {
                const visibility = node.data.isVisible ? 'hidden' : 'inherit';
                const action = editorEngine.style.getUpdateStyleAction({ visibility }, [
                    node.data.domId,
                ]);
                editorEngine.action.updateStyle(action);
                node.data.isVisible = !node.data.isVisible;
            }

            function getNodeName() {
                if (isWindow) {
                    // The window row represents a frame, so label it with the
                    // frame's breakpoint/device name (Desktop / Tablet / Phone)
                    // instead of the literal `<body>` tag.
                    return getWindowLabel(editorEngine.frames.get(node.data.frameId)?.frame);
                }
                return (
                    (node.data.component
                        ? node.data.component
                        : ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p'].includes(
                                node.data.tagName.toLowerCase(),
                            )
                          ? ''
                          : node.data.tagName.toLowerCase()) +
                    ' ' +
                    node.data.textContent
                );
            }

            return (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <div ref={nodeRef}>
                            <div
                                ref={dragHandle}
                                style={style}
                                onMouseDown={(e) => handleSelectNode(e)}
                                onMouseOver={(e) => handleHoverNode(e)}
                                className={nodeClassName}
                            >
                                <span className="relative h-4 w-4 flex-none">
                                    {!node.isLeaf && (
                                        <div
                                            className="absolute z-50 flex h-4 w-4 items-center justify-center"
                                            onMouseDown={(e) => {
                                                node.select();
                                                sendMouseEvent(
                                                    e,
                                                    node.data,
                                                    MouseAction.MOUSE_DOWN,
                                                );
                                                node.toggle();
                                            }}
                                        >
                                            <motion.div
                                                initial={false}
                                                animate={{ rotate: node.isOpen ? 90 : 0 }}
                                            >
                                                <Icons.ChevronRight className="h-2.5 w-2.5 opacity-80" />
                                            </motion.div>
                                        </div>
                                    )}
                                </span>
                                {node.data.instanceId ? (
                                    <Icons.Component
                                        className={cn(
                                            'mr-1.5 mb-[1px] ml-1 h-3 w-3 flex-none',
                                            hovered && !selected
                                                ? 'text-foreground-skill'
                                                : selected
                                                  ? 'text-foreground-skill dark:text-foreground-skill'
                                                  : 'text-foreground-skill',
                                        )}
                                    />
                                ) : (
                                    <NodeIcon
                                        iconClass={cn('mr-2 ml-1 h-3 w-3 flex-none', {
                                            'dark:fill-primary fill-white':
                                                !node.data.instanceId && selected,
                                            '[&_.letter]:!fill-foreground-brand/50 [&_.level]:!fill-foreground-brand [&_path]:!fill-foreground-brand':
                                                node.data.isInteractive &&
                                                !node.data.instanceId &&
                                                !selected &&
                                                !isComponentAncestor(node),
                                            '[&_path]:!fill-foreground-tertiary':
                                                isComponentAncestor(node) &&
                                                !node.data.instanceId &&
                                                !selected &&
                                                !hovered &&
                                                !isText,
                                            '[&_path]:!fill-foreground-secondary':
                                                isComponentAncestor(node) &&
                                                !node.data.instanceId &&
                                                !selected &&
                                                hovered &&
                                                !isText,
                                            '[&_path]:!dark:fill-primary [&_path]:!fill-white':
                                                isComponentAncestor(node) &&
                                                !node.data.instanceId &&
                                                selected,
                                            '[&_.letter]:!fill-foreground/50 [&_.level]:!fill-foreground dark:[&_.letter]:!fill-foreground/50 dark:[&_.level]:!fill-foreground':
                                                !isComponentAncestor(node) && !selected && isText,
                                            '[&_.letter]:!fill-foreground/40 [&_.level]:!fill-foreground-tertiary':
                                                isComponentAncestor(node) &&
                                                !selected &&
                                                !hovered &&
                                                isText,
                                            '[&_.letter]:!fill-foreground/50 [&_.level]:!fill-foreground-secondary':
                                                isComponentAncestor(node) &&
                                                !selected &&
                                                hovered &&
                                                isText,
                                        })}
                                        tagName={node.data.tagName}
                                    />
                                )}
                                <span
                                    className={cn(
                                        'space truncate',
                                        node.data.instanceId
                                            ? selected
                                                ? 'text-foreground-primary italic'
                                                : hovered
                                                  ? 'text-foreground-secondary italic'
                                                  : 'text-foreground-tertiary italic'
                                            : '',
                                        !node.data.isVisible && 'opacity-80',
                                        selected && (showBadges ? 'mr-8' : 'mr-5'),
                                    )}
                                >
                                    {getNodeName()}
                                </span>
                                {showBadges && (
                                    <div
                                        className={cn(
                                            'mr-1 ml-auto flex items-center gap-1',
                                            selected && 'pr-5',
                                        )}
                                    >
                                        {node.data.htmlId && (
                                            <LayerBadge
                                                className={cn(
                                                    selected
                                                        ? 'border-foreground/30 bg-foreground/10 text-foreground'
                                                        : 'border-border text-foreground-secondary',
                                                )}
                                            >
                                                #
                                            </LayerBadge>
                                        )}
                                        {node.data.isInteractive && (
                                            <LayerBadge
                                                className={cn(
                                                    selected
                                                        ? 'border-foreground/30 bg-foreground/10 text-foreground'
                                                        : 'border-foreground-brand/30 bg-foreground-brand/10 text-foreground-brand',
                                                )}
                                            >
                                                B
                                            </LayerBadge>
                                        )}
                                    </div>
                                )}
                                {node.data.instanceId && hovered && (
                                    <button
                                        type="button"
                                        title="Edit component"
                                        // Shifts left of the visibility eye when the
                                        // row is selected (both anchor right).
                                        style={{
                                            position: 'absolute',
                                            right: selected ? '24px' : '4px',
                                        }}
                                        className="hover:text-foreground-primary text-foreground-tertiary flex h-4 w-4 items-center justify-center"
                                        onMouseDown={(e) => {
                                            e.stopPropagation();
                                            void (async () => {
                                                const frameData = editorEngine.frames.get(
                                                    node.data.frameId,
                                                );
                                                if (!frameData?.view) return;
                                                const el: DomElement =
                                                    await frameData.view.getElementByDomId(
                                                        node.data.domId,
                                                        false,
                                                    );
                                                if (el) {
                                                    await editorEngine.components.enterEditMode(el);
                                                }
                                            })();
                                        }}
                                    >
                                        <Icons.Pencil className="h-2.5 w-2.5" />
                                    </button>
                                )}
                                {selected && (
                                    <VisibilityButton
                                        isVisible={node.data.isVisible}
                                        onClick={toggleVisibility}
                                    />
                                )}
                            </div>
                        </div>
                    </TooltipTrigger>
                    {node.data.textContent !== '' && (
                        <TooltipPortal container={document.getElementById('style-panel')}>
                            <TooltipContent
                                side="right"
                                align="center"
                                sideOffset={sideOffset()}
                                className="animation-none max-w-[200px] shadow"
                            >
                                <p>{node.data.textContent}</p>
                            </TooltipContent>
                        </TooltipPortal>
                    )}
                </Tooltip>
            );
        },
    ),
);
