import { useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { motion } from 'motion/react';

import type { PageNode } from '@weblab/models/pages';
import { RouterType } from '@weblab/models';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from '@weblab/ui/context-menu';
import { Icons } from '@weblab/ui/icons';
import { toast } from '@weblab/ui/sonner';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';
import {
    getParentPagePath,
    isFolderNode,
    isPageNode,
} from '@/components/store/editor/pages/helper';
import { useStateManager } from '@/components/store/state';
import { PageModal } from '../../page-tab/page-modal';

interface PageTreeNodeProps {
    node: {
        data: PageNode;
        toggle: () => void;
        select: () => void;
        isOpen: boolean;
    };
    style: React.CSSProperties;
}

export const PageTreeNode: React.FC<PageTreeNodeProps> = observer(({ node, style }) => {
    const editorEngine = useEditorEngine();
    const stateManager = useStateManager();
    const supportsFolderOperations =
        editorEngine.activeSandbox.routerConfig?.type === RouterType.APP;
    const [modalState, setModalState] = useState<{
        open: boolean;
        mode: 'create' | 'rename';
        itemType: 'page' | 'folder';
    }>({
        open: false,
        mode: 'create',
        itemType: 'page',
    });

    const hasChildren = node.data.children && node.data.children.length > 0;
    const isActive = editorEngine.pages.isNodeActive(node.data);

    const getBaseName = (fullPath: string) => {
        return fullPath.split('/').pop() ?? '';
    };

    const handleClick = async (e: React.MouseEvent) => {
        if (hasChildren) {
            node.toggle();
        }

        editorEngine.pages.setCurrentPath(node.data.path);
        node.select();

        if (!isPageNode(node.data)) {
            return;
        }

        const webviewId = editorEngine.frames.selected[0]?.frame.id;
        if (webviewId) {
            editorEngine.pages.setActivePath(webviewId, node.data.path);
        }

        await editorEngine.pages.navigateTo(node.data.path);
    };

    const handleRename = () => {
        setModalState({
            open: true,
            mode: 'rename',
            itemType: node.data.kind,
        });
    };

    const handleCreatePage = () => {
        setModalState({
            open: true,
            mode: 'create',
            itemType: 'page',
        });
    };

    const handleCreateFolder = () => {
        if (!supportsFolderOperations) {
            return;
        }

        setModalState({
            open: true,
            mode: 'create',
            itemType: 'folder',
        });
    };

    const handleDelete = async () => {
        try {
            if (isFolderNode(node.data)) {
                await editorEngine.pages.deleteFolder(node.data.path);
                return;
            }

            await editorEngine.pages.deletePage(node.data.path);
        } catch (error) {
            console.error('Failed to delete page:', error);
            toast.error('Failed to delete page', {
                description: error instanceof Error ? error.message : String(error),
            });
        }
    };

    const handleDuplicate = async () => {
        if (!isPageNode(node.data)) {
            return;
        }
        try {
            await editorEngine.pages.duplicatePage(node.data.path, node.data.path);

            toast('Page duplicated!');
        } catch (error) {
            console.error('Failed to duplicate page:', error);
            toast.error('Failed to duplicate page', {
                description: error instanceof Error ? error.message : String(error),
            });
        }
    };

    const openPageSettings = (event: React.MouseEvent) => {
        event.stopPropagation();
        if (!isPageNode(node.data)) {
            return;
        }

        stateManager.settingsTab = node.data.path;
        stateManager.isSettingsModalOpen = true;
    };

    const icon = useMemo(() => {
        if (node.data.isRoot) {
            return (
                <svg viewBox="0 0 16 16" className="mr-2 h-4 w-4 flex-none" fill="currentColor">
                    <path d="M8 1.5 1.5 6.7v7.8h4.2V10h4.6v4.5h4.2V6.7z" />
                </svg>
            );
        }

        if (isFolderNode(node.data)) {
            return <Icons.Directory className="mr-2 h-4 w-4 flex-none" />;
        }

        switch (node.data.settings?.editorIcon) {
            case 'globe':
                return <Icons.Globe className="mr-2 h-4 w-4 flex-none" />;
            case 'image':
                return <Icons.Image className="mr-2 h-4 w-4 flex-none" />;
            case 'button':
                return <Icons.Button className="mr-2 h-4 w-4 flex-none" />;
            default:
                return <Icons.File className="mr-2 h-4 w-4 flex-none" />;
        }
    }, [node.data]);

    const createBaseRoute = isFolderNode(node.data)
        ? node.data.path
        : editorEngine.pages.getFolderByPath(node.data.path)?.path === node.data.path
          ? node.data.path
          : getParentPagePath(node.data.path);

    const menuItems = [
        {
            label: 'Create New Page',
            action: handleCreatePage,
            icon: <Icons.File className="mr-2 h-4 w-4" />,
        },
        {
            label: 'Duplicate Page',
            action: handleDuplicate,
            icon: <Icons.Copy className="mr-2 h-4 w-4" />,
            disabled: node.data.isRoot || isFolderNode(node.data),
        },
        {
            label: 'Rename',
            action: handleRename,
            icon: <Icons.Pencil className="mr-2 h-4 w-4" />,
            disabled: node.data.isRoot,
        },
        {
            label: 'Delete',
            action: handleDelete,
            icon: <Icons.Trash className="mr-2 h-4 w-4" />,
            destructive: true,
            disabled: node.data.isRoot,
        },
    ];
    if (supportsFolderOperations) {
        menuItems.splice(1, 0, {
            label: 'Create New Folder',
            action: handleCreateFolder,
            icon: <Icons.DirectoryPlus className="mr-2 h-4 w-4" />,
        });
    }

    return (
        <>
            <ContextMenu>
                <ContextMenuTrigger>
                    <div
                        style={style}
                        className={cn(
                            'hover:bg-background-hover group flex h-6 cursor-pointer items-center rounded pr-1',
                            isActive && 'text-foreground-primary bg-blue-400 hover:bg-blue-400/90',
                        )}
                        onClick={handleClick}
                    >
                        <span className="relative h-4 w-4 flex-none">
                            {hasChildren && (
                                <div className="absolute z-50 flex h-4 w-4 items-center justify-center">
                                    <motion.div
                                        initial={false}
                                        animate={{ rotate: node.isOpen ? 90 : 0 }}
                                    >
                                        <Icons.ChevronRight className="h-2.5 w-2.5" />
                                    </motion.div>
                                </div>
                            )}
                        </span>
                        {icon}
                        <span className="truncate">{node.data.name}</span>
                        {isPageNode(node.data) && (
                            <button
                                type="button"
                                onClick={openPageSettings}
                                className={cn(
                                    'ml-auto flex h-5 w-5 items-center justify-center rounded opacity-0 transition-opacity',
                                    'group-hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10',
                                    isActive && 'hover:bg-white/15',
                                )}
                                aria-label="Open page settings"
                            >
                                <Icons.Gear className="h-3 w-3" />
                            </button>
                        )}
                    </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                    {menuItems.map((item) => (
                        <ContextMenuItem
                            key={item.label}
                            onClick={item.action}
                            className="cursor-pointer"
                            disabled={item.disabled}
                        >
                            <span
                                className={cn(
                                    'flex w-full items-center gap-1',
                                    item.destructive && 'text-red',
                                )}
                            >
                                {item.icon}

                                {item.label}
                            </span>
                        </ContextMenuItem>
                    ))}
                </ContextMenuContent>
            </ContextMenu>

            <PageModal
                open={modalState.open}
                onOpenChange={(open) => setModalState((prev) => ({ ...prev, open }))}
                mode={modalState.mode}
                itemType={modalState.itemType}
                baseRoute={modalState.mode === 'create' ? createBaseRoute : node.data.path}
                initialName={modalState.mode === 'rename' ? getBaseName(node.data.path) : ''}
                supportsFolderOperations={supportsFolderOperations}
            />
        </>
    );
});
