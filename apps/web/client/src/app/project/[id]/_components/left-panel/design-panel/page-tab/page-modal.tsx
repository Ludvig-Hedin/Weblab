import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import { RouterType } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@weblab/ui/dialog';
import { Input } from '@weblab/ui/input';
import { toast } from '@weblab/ui/sonner';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';
import {
    doesRouteExist,
    getNestedPagePath,
    getParentPagePath,
    normalizePagePath,
    validateNextJsRoute,
} from '@/components/store/editor/pages/helper';

interface PageModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mode: 'create' | 'rename';
    itemType?: 'page' | 'folder';
    baseRoute?: string;
    initialName?: string;
    supportsFolderOperations?: boolean;
}

export function PageModal({
    open,
    onOpenChange,
    mode = 'create',
    itemType = 'page',
    baseRoute = '/',
    initialName = '',
    supportsFolderOperations,
}: PageModalProps) {
    const t = useTranslations('editor.leftPanel.pages');
    const editorEngine = useEditorEngine();
    const [pageName, setPageName] = useState('');
    const [warning, setWarning] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const fullPath = useMemo(() => {
        if (mode === 'rename') {
            return getNestedPagePath(getParentPagePath(baseRoute), pageName);
        }
        return getNestedPagePath(baseRoute, pageName);
    }, [baseRoute, pageName, mode]);
    const [isComposing, setIsComposing] = useState(false);

    const canManageFolders =
        supportsFolderOperations ??
        editorEngine.activeSandbox.routerConfig?.type === RouterType.APP;
    const title =
        mode === 'create'
            ? itemType === 'folder'
                ? t('createNewFolder')
                : t('createNewPage')
            : itemType === 'folder'
              ? t('renameFolder')
              : t('renamePage');
    const buttonText =
        mode === 'create'
            ? itemType === 'folder'
                ? t('createFolder')
                : t('createPage')
            : itemType === 'folder'
              ? t('renameFolder')
              : t('renamePage');
    const loadingText = mode === 'create' ? t('creatingPage') : t('renamingPage');

    // Reset page name when modal opens
    useEffect(() => {
        if (open) {
            setPageName(initialName);
        }
    }, [open, initialName]);

    useEffect(() => {
        if (!pageName) {
            setWarning('');
            return;
        }

        if (itemType === 'folder' && !canManageFolders) {
            setWarning(t('foldersAppRouterOnly'));
            return;
        }

        const { valid, error } = validateNextJsRoute(pageName);
        if (!valid) {
            setWarning(error ?? 'Invalid page name');
            return;
        }

        const currentPath = mode === 'rename' ? normalizePagePath(baseRoute) : null;
        const normalizedTargetPath = normalizePagePath(fullPath);

        if (
            currentPath !== normalizedTargetPath &&
            doesRouteExist(editorEngine.pages.tree, fullPath, itemType)
        ) {
            setWarning(`This ${itemType} already exists`);
            return;
        }

        setWarning('');
    }, [pageName, fullPath, editorEngine.pages.tree, mode, baseRoute, itemType, canManageFolders]);

    const handleSubmit = async () => {
        if (isLoading || warning || !pageName) {
            return;
        }

        if (itemType === 'folder' && !canManageFolders) {
            setWarning(t('foldersAppRouterOnly'));
            return;
        }

        try {
            setIsLoading(true);

            if (itemType === 'folder') {
                if (mode === 'create') {
                    await editorEngine.pages.createFolder(baseRoute, pageName);
                    toast('Folder created!');
                } else {
                    await editorEngine.pages.renameFolder(baseRoute, pageName);
                    toast('Folder renamed!');
                }
            } else {
                if (mode === 'create') {
                    await editorEngine.pages.createPage(baseRoute, pageName);
                    toast('Page created!');
                } else {
                    await editorEngine.pages.renamePage(baseRoute, pageName);
                    toast('Page renamed!');
                }
            }

            setPageName('');
            onOpenChange(false);
        } catch (error) {
            console.error(`Failed to ${mode} page:`, error);
            setWarning(`Failed to ${mode} page. Please try again.`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>
                        {itemType === 'folder'
                            ? t('folderWillBe', { path: fullPath })
                            : t('pageWillBe', { path: fullPath })}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="col-span-3 space-y-2">
                        <Input
                            id="pageName"
                            value={pageName}
                            onChange={(e) => {
                                setPageName(e.target.value.toLowerCase());
                            }}
                            className={cn(warning && 'border-destructive')}
                            placeholder={
                                itemType === 'folder'
                                    ? t('folderPlaceholder')
                                    : t('pagePlaceholder')
                            }
                            disabled={isLoading}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !isComposing) {
                                    void handleSubmit();
                                }
                            }}
                            onCompositionStart={() => setIsComposing(true)}
                            onCompositionEnd={() => setIsComposing(false)}
                        />
                        {warning && (
                            <p className="text-small text-foreground-warning flex items-center gap-2">
                                {warning}
                            </p>
                        )}
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        disabled={isLoading}
                    >
                        {t('cancelPage')}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => void handleSubmit()}
                        disabled={isLoading || !!warning || !pageName}
                    >
                        {isLoading ? <>{loadingText}</> : buttonText}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
