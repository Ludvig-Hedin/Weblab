import type { NodeApi, RowRendererProps, TreeApi } from 'react-arborist';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';
import { Tree } from 'react-arborist';
import useResizeObserver from 'use-resize-observer';

import { type LayerNode } from '@weblab/models/element';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';

import { useEditorEngine } from '@/components/store/editor';
import { RightClickMenu } from '../../../right-click-menu';
import { TreeNode } from './tree/tree-node';
import { TreeRow } from './tree/tree-row';

const getLayerTreeNodeId = (node: Pick<LayerNode, 'frameId' | 'domId'>) =>
    `${node.frameId}:${node.domId}`;

export const LayersTab = observer(() => {
    const t = useTranslations('editor.leftPanel.layers');
    const treeRef = useRef<TreeApi<LayerNode>>(null);
    const editorEngine = useEditorEngine();
    const [treeHovered, setTreeHovered] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const { ref, width, height } = useResizeObserver();

    useEffect(handleSelectChange, [
        editorEngine.elements.selected,
        editorEngine.ast.mappings.filteredLayers,
    ]);

    const handleMouseLeaveTree = useCallback(() => {
        setTreeHovered(false);
        editorEngine.overlay.state.updateHoverRect(null);
    }, [editorEngine.overlay.state]);

    function handleSelectChange() {
        if (editorEngine.elements.selected.length > 0 && editorEngine.elements.selected[0]) {
            treeRef.current?.scrollTo(getLayerTreeNodeId(editorEngine.elements.selected[0]));
        }
    }

    const handleDragEnd = useCallback(
        async ({
            dragNodes,
            parentNode,
            index,
        }: {
            dragNodes: NodeApi<LayerNode>[];
            parentNode: NodeApi<LayerNode> | null;
            index: number;
        }) => {
            if (!parentNode) {
                console.error('No parent found');
                return;
            }
            if (dragNodes.length !== 1) {
                console.error('Only one element can be dragged at a time');
                return;
            }
            const dragNode = dragNodes[0];
            if (!dragNode) {
                console.error('No drag node found');
                return;
            }
            const frameData = editorEngine.frames.get(dragNode.data.frameId);
            if (!frameData) {
                console.error('No frame data found');
                return;
            }
            const { view } = frameData;

            if (!view) {
                console.error('No frame view found');
                return;
            }

            const originalIndex: number | undefined = await view.getElementIndex(
                dragNode.data.domId,
            );

            if (originalIndex === undefined) {
                console.error('No original index found');
                return;
            }

            const childEl = await view.getElementByDomId(dragNode.data.domId, false);
            if (!childEl) {
                console.error('Failed to get element');
                return;
            }
            const parentEl = await view.getElementByDomId(parentNode.data.domId, false);
            if (!parentEl) {
                console.error('Failed to get parent element');
                return;
            }

            const newIndex = index > originalIndex ? index - 1 : index;

            if (newIndex === originalIndex) {
                return;
            }

            const moveAction = editorEngine.move.createMoveAction(
                view.id,
                childEl,
                parentEl,
                newIndex,
                originalIndex,
            );
            editorEngine.action.run(moveAction);
        },
        [editorEngine.action, editorEngine.frames, editorEngine.move],
    );

    const disableDrop = useCallback(
        ({
            parentNode,
            dragNodes,
        }: {
            parentNode: NodeApi<LayerNode> | null;
            dragNodes: NodeApi<LayerNode>[];
        }) => {
            return !dragNodes.every((node) => node?.parent?.id === parentNode?.id);
        },
        [],
    );

    const layers = editorEngine.ast.mappings.filteredLayers;

    const filteredTree = useMemo(() => {
        if (!searchQuery.trim()) {
            return {
                roots: layers,
                clonedNodeMap: null as Map<string, LayerNode> | null,
            };
        }

        const query = searchQuery.toLowerCase();
        const clonedNodeMap = new Map<string, LayerNode>();

        const matchesNode = (node: LayerNode): boolean => {
            const searchBlob = [
                node.tagName,
                node.textContent,
                node.component ?? '',
                node.htmlId ?? '',
                node.hasCustomAttributes ? 'attribute attributes attr attrs' : '',
                node.isInteractive ? 'interactive interaction action button click' : '',
            ]
                .join(' ')
                .toLowerCase();

            return searchBlob.includes(query);
        };

        const filterNode = (node: LayerNode): LayerNode | null => {
            const childNodes = (node.children ?? [])
                .map((childId) => editorEngine.ast.mappings.getLayerNode(node.frameId, childId))
                .filter((child): child is LayerNode => Boolean(child));
            const filteredChildren = childNodes
                .map((child) => filterNode(child))
                .filter((child): child is LayerNode => Boolean(child));

            if (!matchesNode(node) && filteredChildren.length === 0) {
                return null;
            }

            const clone: LayerNode = {
                ...node,
                children:
                    filteredChildren.length > 0
                        ? filteredChildren.map((child) => child.domId)
                        : null,
            };
            clonedNodeMap.set(getLayerTreeNodeId(clone), clone);
            return clone;
        };

        return {
            roots: layers
                .map((layer) => filterNode(layer))
                .filter((layer): layer is LayerNode => Boolean(layer)),
            clonedNodeMap,
        };
    }, [editorEngine.ast.mappings, layers, searchQuery]);

    const childrenAccessor = useCallback(
        (node: LayerNode) => {
            const sourceMap = filteredTree.clonedNodeMap;
            const children = node.children
                ?.map((child) =>
                    sourceMap
                        ? sourceMap.get(getLayerTreeNodeId({ frameId: node.frameId, domId: child }))
                        : editorEngine.ast.mappings.getLayerNode(node.frameId, child),
                )
                .filter((child): child is LayerNode => child !== undefined && child !== null);

            return children?.length ? children : null;
        },
        [editorEngine.ast.mappings, filteredTree.clonedNodeMap],
    );

    return (
        <div
            id="layer-tab-id"
            ref={ref}
            className="text-active text-mini flex h-full w-full flex-col overflow-hidden p-3"
            onMouseOver={() => setTreeHovered(true)}
            onMouseLeave={handleMouseLeaveTree}
        >
            <div className="mb-2 flex items-center gap-2">
                <div className="relative flex-1">
                    <Input
                        className="text-mini h-8 pr-8"
                        placeholder={t('searchLayers')}
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            className="group absolute top-[1px] right-[1px] bottom-[1px] flex aspect-square items-center justify-center rounded-r-[calc(theme(borderRadius.md)-1px)]"
                            onClick={() => setSearchQuery('')}
                        >
                            <Icons.CrossS className="text-foreground-primary/50 group-hover:text-foreground-primary h-3 w-3" />
                        </button>
                    )}
                </div>
            </div>
            <RightClickMenu>
                {filteredTree.roots.length === 0 ? (
                    <div className="text-foreground-primary/50 flex h-full w-full items-center justify-center">
                        {searchQuery ? t('noMatchingLayers') : t('noLayersAvailable')}
                    </div>
                ) : (
                    <Tree
                        idAccessor={getLayerTreeNodeId}
                        childrenAccessor={childrenAccessor}
                        ref={treeRef}
                        data={filteredTree.roots}
                        openByDefault={true}
                        overscanCount={0}
                        indent={8}
                        padding={0}
                        rowHeight={24}
                        height={Math.max((height ?? 8) - 40, 100)}
                        width={width ?? 365}
                        renderRow={(props: RowRendererProps<LayerNode>) => <TreeRow {...props} />}
                        onActivate={async (node) => {
                            const frameData = editorEngine.frames.get(node.data.frameId);
                            if (!frameData?.view) return;
                            const el = await frameData.view.getElementByDomId(
                                node.data.domId,
                                true,
                            );
                            if (el) {
                                editorEngine.elements.click([el]);
                            }
                        }}
                        onMove={handleDragEnd}
                        // While a search filter is active the tree shows a pruned
                        // subset, so react-arborist's drop index is a filtered
                        // index that doesn't map to the real DOM index — dragging
                        // would reorder to the wrong position. Disable drag until
                        // the filter is cleared.
                        disableDrag={!!searchQuery.trim()}
                        disableDrop={disableDrop}
                        className="overflow-auto"
                    >
                        {(props) => <TreeNode {...props} treeHovered={treeHovered} />}
                    </Tree>
                )}
            </RightClickMenu>
        </div>
    );
});
