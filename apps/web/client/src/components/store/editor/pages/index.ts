import { makeAutoObservable } from 'mobx';

import type { PageEditorSettings, PageMetadata, PageNode } from '@weblab/models/pages';

import type { EditorEngine } from '../engine';
import type { FrameData } from '../frames';
import {
    applyPageSettingsToNodes,
    deletePageSettingsByPrefixInSandbox,
    deletePageSettingsInSandbox,
    getPageSettingsMap,
    movePageSettingsByPrefixInSandbox,
    updatePageSettingsInSandbox,
} from './editor-settings';
import {
    createFolderInSandbox,
    createPageInSandbox,
    deleteFolderInSandbox,
    deletePageInSandbox,
    doesRouteExist,
    duplicatePageInSandbox,
    findFolderNodeByPath,
    findPageNodeByPath,
    getFolderNodes,
    getNestedPagePath,
    getPageNodes,
    getParentPagePath,
    isPageNode,
    moveFolderInSandbox,
    movePageInSandbox,
    normalizePagePath,
    normalizeRoute,
    renameFolderInSandbox,
    renamePageInSandbox,
    scanPagesFromSandbox,
    updatePageMetadataInSandbox,
    validateNextJsRoute,
} from './helper';

export class PagesManager {
    private pages: PageNode[] = [];
    private activeRoutesByFrameId: Record<string, string> = {};
    private currentPath = '';
    private groupedRoutes = '';
    private _isScanning = false;

    constructor(private editorEngine: EditorEngine) {
        makeAutoObservable(this);
    }

    init() {}

    async scanPages() {
        try {
            if (this._isScanning) {
                return;
            }
            this._isScanning = true;
            const realPages = await scanPagesFromSandbox(this.editorEngine.activeSandbox);
            const settingsMap = await getPageSettingsMap(this.editorEngine.activeSandbox);
            this.setPages(applyPageSettingsToNodes(realPages, settingsMap));
            return;
        } catch (error) {
            console.error('Failed to scan pages from sandbox:', error);
            this.setPages([]);
        } finally {
            this._isScanning = false;
        }
    }

    get isScanning() {
        return this._isScanning;
    }

    get tree() {
        return this.pages;
    }

    get flatPages() {
        return getPageNodes(this.pages);
    }

    get flatFolders() {
        return getFolderNodes(this.pages);
    }

    get activeRoute(): string | undefined {
        const frame = this.getActiveFrame();
        return frame ? this.activeRoutesByFrameId[frame.frame.id] : undefined;
    }

    private getActiveFrame(): FrameData | undefined {
        if (!this.editorEngine?.frames) {
            return undefined;
        }
        return this.editorEngine.frames.selected[0] ?? this.editorEngine.frames.getAll()[0];
    }

    public isNodeActive(node: PageNode): boolean {
        const frameView = this.getActiveFrame();
        if (!frameView) {
            return false;
        }

        const activePath = this.activeRoute;
        if (!activePath) {
            return false;
        }

        const normalizedNodePath = node.path.replace(/\\/g, '/');
        const normalizedActivePath = activePath.replace(/\\/g, '/');

        const nodeSegments = normalizedNodePath.split('/').filter(Boolean);
        const activeSegments = normalizedActivePath.split('/').filter(Boolean);

        // Handle root path
        if (nodeSegments.length === 0 && activeSegments.length === 0) {
            return true;
        }
        if (nodeSegments.length !== activeSegments.length) {
            return false;
        }

        return nodeSegments.every((nodeSegment, index) => {
            const activeSegment = activeSegments[index];
            if (!activeSegment) {
                return false;
            }
            const isDynamic = nodeSegment.startsWith('[') && nodeSegment.endsWith(']');

            // For dynamic segments, just verify the active segment exists
            if (isDynamic) {
                return activeSegment.length > 0;
            }

            // For static segments, do exact match after cleaning escapes
            return nodeSegment.replace(/\\/g, '') === activeSegment.replace(/\\/g, '');
        });
    }

    public setActivePath(frameId: string, path: string) {
        this.activeRoutesByFrameId[frameId] = path;
        if (frameId === this.getActiveFrame()?.frame.id) {
            this.currentPath = path;
        }
        this.updateActiveStates(this.pages, path);
    }

    private updateActiveStates(nodes: PageNode[], activePath: string) {
        nodes.forEach((node) => {
            node.isActive = this.isNodeActive(node);

            if (node.children?.length) {
                this.updateActiveStates(node.children, activePath);
            }
        });
    }

    private setPages(pages: PageNode[]) {
        this.pages = pages;
        if (this.editorEngine?.frames) {
            // If no pages, clear active states by using empty path
            const pathToUse = pages.length === 0 ? '' : this.currentPath;
            this.updateActiveStates(this.pages, pathToUse);
        }
    }

    public async createPage(baseRoute: string, pageName: string): Promise<void> {
        const { valid, error } = validateNextJsRoute(pageName);
        if (!valid) {
            throw new Error(error);
        }

        const normalizedPath = getNestedPagePath(baseRoute, pageName);

        if (doesRouteExist(this.pages, normalizedPath)) {
            throw new Error('This page already exists');
        }

        try {
            await createPageInSandbox(this.editorEngine.activeSandbox, normalizedPath);
            await this.scanPages();
            this.editorEngine.posthog.capture('page_create');
        } catch (error) {
            console.error('Failed to create page:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(errorMessage);
        }
    }

    public async createFolder(baseRoute: string, folderName: string): Promise<void> {
        const { valid, error } = validateNextJsRoute(folderName);
        if (!valid) {
            throw new Error(error);
        }

        const normalizedPath = getNestedPagePath(baseRoute, folderName);

        if (doesRouteExist(this.pages, normalizedPath, 'folder')) {
            throw new Error('This folder already exists');
        }

        try {
            await createFolderInSandbox(this.editorEngine.activeSandbox, normalizedPath);
            await this.scanPages();
            this.editorEngine.posthog.capture('page_folder_create');
        } catch (error) {
            console.error('Failed to create folder:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(errorMessage);
        }
    }

    public async renamePage(oldPath: string, newName: string): Promise<void> {
        const { valid, error } = validateNextJsRoute(newName);
        if (!valid) {
            throw new Error(error);
        }

        const normalizedOldPath = normalizePagePath(oldPath);
        const nextPath = getNestedPagePath(getParentPagePath(oldPath), newName);

        if (doesRouteExist(this.pages, nextPath)) {
            throw new Error('A page with this name already exists');
        }

        try {
            const indexPageFolder = this.getIndexPageFolder(normalizedOldPath);
            if (indexPageFolder) {
                await renameFolderInSandbox(this.editorEngine.activeSandbox, oldPath, newName);
            } else {
                await renamePageInSandbox(this.editorEngine.activeSandbox, oldPath, newName);
            }
            await movePageSettingsByPrefixInSandbox(
                this.editorEngine.activeSandbox,
                normalizedOldPath,
                nextPath,
            );
            this.replacePathPrefixInState(normalizedOldPath, nextPath);
            await this.scanPages();
            this.editorEngine.posthog.capture('page_rename');
        } catch (error) {
            console.error('Failed to rename page:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(errorMessage);
        }
    }

    public async renameFolder(oldPath: string, newName: string): Promise<void> {
        const { valid, error } = validateNextJsRoute(newName);
        if (!valid) {
            throw new Error(error);
        }

        const nextPath = getNestedPagePath(getParentPagePath(oldPath), newName);
        if (doesRouteExist(this.pages, nextPath, 'folder')) {
            throw new Error('A folder with this name already exists');
        }

        try {
            await renameFolderInSandbox(this.editorEngine.activeSandbox, oldPath, newName);
            await movePageSettingsByPrefixInSandbox(
                this.editorEngine.activeSandbox,
                oldPath,
                nextPath,
            );
            this.replacePathPrefixInState(oldPath, nextPath);
            await this.scanPages();
            this.editorEngine.posthog.capture('page_folder_rename');
        } catch (error) {
            console.error('Failed to rename folder:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(errorMessage);
        }
    }

    public async duplicatePage(sourcePath: string, targetPath: string): Promise<void> {
        try {
            await duplicatePageInSandbox(
                this.editorEngine.activeSandbox,
                normalizeRoute(sourcePath),
                normalizeRoute(targetPath),
            );
            await this.scanPages();
            this.editorEngine.posthog.capture('page_duplicate');
        } catch (error) {
            console.error('Failed to duplicate page:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(errorMessage);
        }
    }

    public async deletePage(pageName: string, isDir = false): Promise<void> {
        const normalizedPath = normalizePagePath(pageName);
        if (normalizedPath === '' || normalizedPath === '/') {
            throw new Error('Cannot delete root page');
        }

        try {
            await deletePageInSandbox(this.editorEngine.activeSandbox, normalizedPath, isDir);
            await deletePageSettingsInSandbox(this.editorEngine.activeSandbox, normalizedPath);
            await this.scanPages();
            this.editorEngine.posthog.capture('page_delete');
        } catch (error) {
            console.error('Failed to delete page:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(errorMessage);
        }
    }

    public async deleteFolder(folderPath: string): Promise<void> {
        const normalizedPath = normalizePagePath(folderPath);
        if (normalizedPath === '/') {
            throw new Error('Cannot delete root folder');
        }

        try {
            await deleteFolderInSandbox(this.editorEngine.activeSandbox, normalizedPath);
            await deletePageSettingsByPrefixInSandbox(
                this.editorEngine.activeSandbox,
                normalizedPath,
            );
            await this.scanPages();
            this.editorEngine.posthog.capture('page_folder_delete');
        } catch (error) {
            console.error('Failed to delete folder:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(errorMessage);
        }
    }

    public async movePageToPath(sourcePath: string, targetPath: string): Promise<string> {
        const normalizedSourcePath = normalizePagePath(sourcePath);
        const normalizedTargetPath = normalizePagePath(targetPath);

        if (normalizedSourcePath === normalizedTargetPath) {
            return normalizedTargetPath;
        }

        const page = findPageNodeByPath(this.pages, normalizedSourcePath);
        if (!page) {
            throw new Error('Source page not found');
        }

        if (page.isRoot) {
            throw new Error('Home cannot be moved');
        }

        if (doesRouteExist(this.pages, normalizedTargetPath)) {
            throw new Error('A page with this path already exists');
        }

        const indexPageFolder = this.getIndexPageFolder(normalizedSourcePath);
        if (indexPageFolder) {
            await moveFolderInSandbox(
                this.editorEngine.activeSandbox,
                normalizedSourcePath,
                normalizedTargetPath,
            );
        } else {
            await movePageInSandbox(
                this.editorEngine.activeSandbox,
                normalizedSourcePath,
                normalizedTargetPath,
            );
        }
        await movePageSettingsByPrefixInSandbox(
            this.editorEngine.activeSandbox,
            normalizedSourcePath,
            normalizedTargetPath,
        );
        this.replacePathPrefixInState(normalizedSourcePath, normalizedTargetPath);
        await this.scanPages();
        this.editorEngine.posthog.capture('page_move');

        return normalizedTargetPath;
    }

    public async moveFolderToPath(sourcePath: string, targetPath: string): Promise<string> {
        const normalizedSourcePath = normalizePagePath(sourcePath);
        const normalizedTargetPath = normalizePagePath(targetPath);

        if (normalizedSourcePath === normalizedTargetPath) {
            return normalizedTargetPath;
        }

        if (
            normalizedTargetPath.startsWith(`${normalizedSourcePath}/`) ||
            normalizedTargetPath === normalizedSourcePath
        ) {
            throw new Error('Cannot move a folder inside itself');
        }

        const folder = findFolderNodeByPath(this.pages, normalizedSourcePath);
        if (!folder) {
            throw new Error('Source folder not found');
        }

        if (doesRouteExist(this.pages, normalizedTargetPath, 'folder')) {
            throw new Error('A folder with this path already exists');
        }

        await moveFolderInSandbox(
            this.editorEngine.activeSandbox,
            normalizedSourcePath,
            normalizedTargetPath,
        );
        await movePageSettingsByPrefixInSandbox(
            this.editorEngine.activeSandbox,
            normalizedSourcePath,
            normalizedTargetPath,
        );
        this.replacePathPrefixInState(normalizedSourcePath, normalizedTargetPath);
        await this.scanPages();
        this.editorEngine.posthog.capture('page_folder_move');

        return normalizedTargetPath;
    }

    public async updatePageEditorSettings(
        pagePath: string,
        settings: PageEditorSettings,
    ): Promise<void> {
        const normalizedPath = normalizePagePath(pagePath);
        if (!doesRouteExist(this.pages, normalizedPath)) {
            throw new Error('Page not found');
        }

        await updatePageSettingsInSandbox(
            this.editorEngine.activeSandbox,
            normalizedPath,
            settings,
        );
        await this.scanPages();
    }

    public async savePageConfiguration(
        pagePath: string,
        data: {
            nextPath?: string;
            metadata: PageMetadata;
            settings: PageEditorSettings;
        },
    ): Promise<string> {
        const normalizedCurrentPath = normalizePagePath(pagePath);
        const normalizedNextPath = normalizePagePath(data.nextPath ?? pagePath);
        const page = findPageNodeByPath(this.pages, normalizedCurrentPath);

        if (!page) {
            throw new Error('Page not found');
        }

        if (page.isRoot && normalizedNextPath !== '/') {
            throw new Error('Home cannot be moved');
        }

        if (!page.isRoot) {
            const nextSlug = normalizedNextPath.split('/').filter(Boolean).pop() ?? '';
            const slugValidation = validateNextJsRoute(nextSlug);
            if (!slugValidation.valid) {
                throw new Error(slugValidation.error);
            }
        }

        if (!page.isRoot && normalizedCurrentPath !== normalizedNextPath) {
            if (doesRouteExist(this.pages, normalizedNextPath)) {
                throw new Error('A page with this path already exists');
            }

            const indexPageFolder = this.getIndexPageFolder(normalizedCurrentPath);
            if (indexPageFolder) {
                await moveFolderInSandbox(
                    this.editorEngine.activeSandbox,
                    normalizedCurrentPath,
                    normalizedNextPath,
                );
            } else {
                await movePageInSandbox(
                    this.editorEngine.activeSandbox,
                    normalizedCurrentPath,
                    normalizedNextPath,
                );
            }
            await movePageSettingsByPrefixInSandbox(
                this.editorEngine.activeSandbox,
                normalizedCurrentPath,
                normalizedNextPath,
            );
            this.replacePathPrefixInState(normalizedCurrentPath, normalizedNextPath);
        }

        await updatePageMetadataInSandbox(
            this.editorEngine.activeSandbox,
            normalizedNextPath,
            data.metadata,
        );
        await updatePageSettingsInSandbox(
            this.editorEngine.activeSandbox,
            normalizedNextPath,
            data.settings,
        );
        await this.scanPages();

        return normalizedNextPath;
    }

    public async updateMetadataPage(pagePath: string, metadata: PageMetadata) {
        if (!doesRouteExist(this.pages, pagePath)) {
            throw new Error('A page with this name does not exist');
        }

        try {
            await updatePageMetadataInSandbox(this.editorEngine.activeSandbox, pagePath, metadata);
            await this.scanPages();
        } catch (error) {
            console.error('Failed to update metadata:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(errorMessage);
        }
    }

    async navigateTo(path: string, addToHistory = true) {
        const frameData = this.getActiveFrame();

        if (!frameData?.view) {
            console.warn('No frameView available');
            return;
        }

        path = path.startsWith('/') ? path : `/${path}`;
        const originalPath = path;

        const normalizedPath = path.replace(/\\/g, '/');
        const splitPath = normalizedPath.split('/').filter(Boolean);
        const removedGroupedRoutes = splitPath.filter(
            (val) => !(val.startsWith('(') && val.endsWith(')')),
        );
        const isGroupedRoutes = splitPath.length !== removedGroupedRoutes.length;

        if (isGroupedRoutes) {
            path = '/' + removedGroupedRoutes.join('/');
            this.groupedRoutes = originalPath;
        } else {
            this.groupedRoutes = '';
        }

        await this.editorEngine.frames.navigateToPath(frameData.frame.id, path, addToHistory);
        this.setActivePath(frameData.frame.id, originalPath);
    }

    public setCurrentPath(path: string) {
        this.currentPath = path;
    }

    public getPageByPath(path: string): PageNode | null {
        return findPageNodeByPath(this.pages, path);
    }

    public getFolderByPath(path: string): PageNode | null {
        return findFolderNodeByPath(this.pages, path);
    }

    private getIndexPageFolder(path: string): PageNode | null {
        const folder = findFolderNodeByPath(this.pages, path);
        if (!folder?.children?.length) {
            return null;
        }

        const hasIndexPage = folder.children.some(
            (child) =>
                isPageNode(child) && normalizePagePath(child.path) === normalizePagePath(path),
        );
        const hasNestedRouteChildren = folder.children.some(
            (child) => normalizePagePath(child.path) !== normalizePagePath(path),
        );

        return hasIndexPage && hasNestedRouteChildren ? folder : null;
    }

    private replacePathPrefixInState(oldPathPrefix: string, newPathPrefix: string) {
        const normalizedOldPrefix = normalizePagePath(oldPathPrefix);
        const normalizedNewPrefix = normalizePagePath(newPathPrefix);
        const replacePath = (value: string): string => {
            const normalizedValue = normalizePagePath(value);
            if (normalizedValue === normalizedOldPrefix) {
                return normalizedNewPrefix;
            }
            if (
                normalizedOldPrefix !== '/' &&
                normalizedValue.startsWith(`${normalizedOldPrefix}/`)
            ) {
                return normalizePagePath(
                    `${normalizedNewPrefix}${normalizedValue.slice(normalizedOldPrefix.length)}`,
                );
            }
            return value;
        };

        Object.entries(this.activeRoutesByFrameId).forEach(([frameId, route]) => {
            this.activeRoutesByFrameId[frameId] = replacePath(route);
        });
        this.currentPath = replacePath(this.currentPath);
        if (this.groupedRoutes) {
            this.groupedRoutes = replacePath(this.groupedRoutes);
        }
    }

    public handleFrameUrlChange(frameId: string) {
        if (!this.editorEngine?.frames) {
            return;
        }

        const frameData = this.editorEngine.frames.get(frameId);
        if (!frameData?.view) {
            console.error('No frame view found');
            return;
        }

        try {
            const url = frameData.view.src;
            if (!url) {
                return;
            }

            const urlObj = new URL(url);
            const path = urlObj.pathname;
            const activePath = this.groupedRoutes ? this.groupedRoutes : path;
            this.setActivePath(frameId, activePath);
        } catch (error) {
            console.error('Failed to parse URL:', error);
        }
    }

    clear() {
        this.pages = [];
        this.currentPath = '';
        this.activeRoutesByFrameId = {};
        this.groupedRoutes = '';
    }
}
