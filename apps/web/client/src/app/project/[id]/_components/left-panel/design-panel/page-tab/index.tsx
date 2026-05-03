import { useEditorEngine } from '@/components/store/editor';
import {
    getNestedPagePath,
    isFolderNode,
    isPageNode,
} from '@/components/store/editor/pages/helper';
import { RouterType } from '@weblab/models';
import type { PageNode } from '@weblab/models/pages';
import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { toast } from '@weblab/ui/sonner';
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from '@weblab/ui/tooltip';
import { observer } from 'mobx-react-lite';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type NodeApi, type RowRendererProps, Tree, type TreeApi } from 'react-arborist';
import useResizeObserver from 'use-resize-observer';
import { PageTreeNode } from '../layers-tab/tree/page-tree-node';
import { PageTreeRow } from '../layers-tab/tree/page-tree-row';
import { PageModal } from './page-modal';

export const PagesTab = observer(() => {
    const editorEngine = useEditorEngine();
    const { ref, width, height } = useResizeObserver();
    const [searchQuery, setSearchQuery] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
    const [modalState, setModalState] = useState<{
        open: boolean;
        mode: 'create' | 'rename';
        itemType: 'page' | 'folder';
        baseRoute: string;
        initialName: string;
    }>({
        open: false,
        mode: 'create',
        itemType: 'page',
        baseRoute: '/',
        initialName: '',
    });
    const treeRef = useRef<TreeApi<PageNode>>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // TODO: use file system like code tab
    useEffect(() => {
        editorEngine.pages.scanPages();
    }, []);

    const filteredPages = useMemo(() => {
        if (!searchQuery.trim()) {
            return editorEngine.pages.tree;
        }

        const searchLower = searchQuery.toLowerCase();

        const getDisplayName = (node: PageNode) => {
            return node.name;
        };

        const filterNodes = (nodes: PageNode[]): PageNode[] => {
            return nodes.reduce<PageNode[]>((filtered, node) => {
                const displayName = getDisplayName(node);
                const matches = displayName.toLowerCase().includes(searchLower);
                const childMatches = node.children ? filterNodes(node.children) : [];

                if (matches || childMatches.length > 0) {
                    const newNode = { ...node };
                    if (childMatches.length > 0) {
                        newNode.children = childMatches;
                    }
                    filtered.push(newNode);
                }

                return filtered;
            }, []);
        };

        return filterNodes(editorEngine.pages.tree);
    }, [editorEngine.pages.tree, searchQuery]);

    const supportsAppRouterPageStructure =
        editorEngine.activeSandbox.routerConfig?.type === RouterType.APP;

    const handleKeyDown = async (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            setSearchQuery('');
            inputRef.current?.blur();
            setHighlightedIndex(null);
            return;
        }

        const flattenedNodes = treeRef.current?.visibleNodes ?? [];

        if (flattenedNodes.length === 0) {
            return;
        }

        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();

            if (highlightedIndex === null) {
                setHighlightedIndex(e.key === 'ArrowDown' ? 0 : flattenedNodes.length - 1);
                return;
            }

            const newIndex =
                e.key === 'ArrowDown'
                    ? Math.min(highlightedIndex + 1, flattenedNodes.length - 1)
                    : Math.max(highlightedIndex - 1, 0);

            setHighlightedIndex(newIndex);

            // Ensure highlighted item is visible
            const node = flattenedNodes[newIndex];
            if (node) {
                treeRef.current?.scrollTo(node.id);
            }
        }

        if (e.key === 'Enter' && highlightedIndex !== null) {
            const selectedNode = flattenedNodes[highlightedIndex];
            if (selectedNode && isPageNode(selectedNode.data)) {
                try {
                    await editorEngine.pages.navigateTo(selectedNode.data.path);
                    setHighlightedIndex(null);
                } catch (error) {
                    console.error('Failed to navigate to page:', error);
                }
            }
        }
    };

    const dimensions = useMemo(
        () => ({
            height: Math.max((height ?? 8) - 32, 100),
            width: width ?? 365,
        }),
        [height, width],
    );

    const pageTreeProps = useMemo(
        () => ({
            data: filteredPages,
            idAccessor: (node: PageNode) => node.id,
            childrenAccessor: (node: PageNode) =>
                node.children && node.children.length > 0 ? node.children : null,
            onSelect: async (nodes: NodeApi<PageNode>[]) => {
                if (nodes.length > 0) {
                    const selectedNode = nodes[0];
                    if (!selectedNode || !isPageNode(selectedNode.data)) {
                        return;
                    }
                    try {
                        await editorEngine.pages.navigateTo(selectedNode.data.path);
                        setHighlightedIndex(null);
                    } catch (error) {
                        console.error('Failed to navigate to page:', error);
                    }
                }
            },
            onMove: async ({
                dragNodes,
                parentNode,
            }: {
                dragNodes: NodeApi<PageNode>[];
                parentNode: NodeApi<PageNode> | null;
                index: number;
            }) => {
                if (!supportsAppRouterPageStructure) {
                    return;
                }

                const dragNode = dragNodes[0];
                if (!dragNode) {
                    return;
                }

                const targetParentPath = parentNode?.data && isFolderNode(parentNode.data)
                    ? parentNode.data.path
                    : '/';
                const targetPath = getNestedPagePath(targetParentPath, dragNode.data.slug);

                try {
                    if (dragNode.data.kind === 'folder') {
                        await editorEngine.pages.moveFolderToPath(dragNode.data.path, targetPath);
                    } else {
                        await editorEngine.pages.movePageToPath(dragNode.data.path, targetPath);
                    }
                } catch (error) {
                    console.error('Failed to move page tree node:', error);
                    toast.error('Failed to move item', {
                        description: error instanceof Error ? error.message : String(error),
                    });
                }
            },
            disableDrop: ({
                parentNode,
                dragNodes,
            }: {
                parentNode: NodeApi<PageNode> | null;
                dragNodes: NodeApi<PageNode>[];
            }) => {
                const dragNode = dragNodes[0];
                if (!dragNode || dragNodes.length !== 1) {
                    return true;
                }

                if (dragNode.data.isRoot) {
                    return true;
                }

                if (!supportsAppRouterPageStructure) {
                    return true;
                }

                if (parentNode && isPageNode(parentNode.data)) {
                    return true;
                }

                if (
                    dragNode.data.kind === 'folder' &&
                    parentNode?.data &&
                    parentNode.data.path.startsWith(`${dragNode.data.path}/`)
                ) {
                    return true;
                }

                return false;
            },
            height: dimensions.height,
            width: dimensions.width,
            indent: 8,
            rowHeight: 24,
            openByDefault: true,
            renderRow: (props: RowRendererProps<PageNode>) => (
                <PageTreeRow
                    {...props}
                    isHighlighted={
                        highlightedIndex !== null &&
                        treeRef.current?.visibleNodes[highlightedIndex]?.id === props.node.id
                    }
                />
            ),
            animationDuration: 200,
        }),
        [
            filteredPages,
            dimensions.height,
            dimensions.width,
            highlightedIndex,
            editorEngine.pages,
            supportsAppRouterPageStructure,
        ],
    );

    const openCreateModal = (itemType: 'page' | 'folder') => {
        if (itemType === 'folder' && !supportsAppRouterPageStructure) {
            return;
        }

        setModalState({
            open: true,
            mode: 'create',
            itemType,
            baseRoute: '/',
            initialName: '',
        });
    };

    return (
        <div
            ref={ref}
            className="text-active flex h-full w-full flex-grow flex-col gap-2 overflow-hidden p-3 text-xs"
        >
            <div className="m-0 flex flex-row items-center justify-between gap-2">
                <div className="relative flex-grow">
                    <Input
                        ref={inputRef}
                        className="h-8 pr-8 text-xs"
                        placeholder="Search pages"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    {searchQuery && (
                        <button
                            className="hover:bg-background-onlook group absolute top-[1px] right-[1px] bottom-[1px] flex aspect-square items-center justify-center rounded-r-[calc(theme(borderRadius.md)-1px)] active:bg-transparent"
                            onClick={() => setSearchQuery('')}
                        >
                            <Icons.CrossS className="text-foreground-primary/50 group-hover:text-foreground-primary h-3 w-3" />
                        </button>
                    )}
                </div>
                <DropdownMenu>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant={'default'}
                                    size={'icon'}
                                    className="text-foreground-primary border-border-primary hover:border-border-onlook bg-background-secondary hover:bg-background-onlook h-fit w-fit border p-2"
                                >
                                    <Icons.Plus />
                                </Button>
                            </DropdownMenuTrigger>
                        </TooltipTrigger>
                        <TooltipPortal>
                            <TooltipContent>
                                <p>Create a new page or folder</p>
                            </TooltipContent>
                        </TooltipPortal>
                    </Tooltip>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openCreateModal('page')}>
                            <Icons.FilePlus className="mr-2 h-4 w-4" />
                            New Page
                        </DropdownMenuItem>
                        {supportsAppRouterPageStructure && (
                            <DropdownMenuItem onClick={() => openCreateModal('folder')}>
                                <Icons.DirectoryPlus className="mr-2 h-4 w-4" />
                                New Folder
                            </DropdownMenuItem>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {filteredPages.length === 0 ? (
                <div
                    style={{ width: dimensions.width }}
                    className="text-foreground-primary/50 flex h-32 items-center justify-center"
                >
                    No pages found
                </div>
            ) : (
                <Tree ref={treeRef} {...pageTreeProps}>
                    {(props) => <PageTreeNode {...props} />}
                </Tree>
            )}
            <PageModal
                mode={modalState.mode}
                itemType={modalState.itemType}
                open={modalState.open}
                onOpenChange={(open) => setModalState((prev) => ({ ...prev, open }))}
                baseRoute={modalState.baseRoute}
                initialName={modalState.initialName}
                supportsFolderOperations={supportsAppRouterPageStructure}
            />
        </div>
    );
});
