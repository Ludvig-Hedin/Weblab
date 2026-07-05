import { debounce } from 'lodash';
import { makeAutoObservable, runInAction } from 'mobx';

import type { ShadcnBlockManifestItem } from '@weblab/constants';
import type {
    BranchTabValue,
    BrandTabValue,
    ComponentInsertData,
    DropElementProperties,
    InsertMode,
    LeftPanelTabValue,
} from '@weblab/models';
import { ChatType, CmsTabValue, EditorMode } from '@weblab/models';

export type PreviewTheme = 'system' | 'light' | 'dark';

export class StateManager {
    private _canvasScrolling = false;
    hotkeysOpen = false;
    elementPaletteOpen = false;
    publishOpen = false;
    leftPanelLocked = false;
    canvasPanning = false;
    isDragSelecting = false;
    /**
     * Webflow-style "Lock canvas": pins the focused frame fit-to-width between
     * the side panels, disables free pan/zoom-roam, and shows gutter resize
     * handles. Composed on top of DESIGN mode (not a separate EditorMode) so all
     * chrome stays. Persisted per-project via the editor-state localStorage.
     */
    canvasLocked = false;
    /**
     * When true, the left and right panels are fully hidden (collapsed off-canvas).
     * Used by the panel-collapse buttons and surfaces that need to temporarily
     * un-hide the chrome (e.g. opening fix flow from the bottom-bar).
     */
    panelsHidden = false;
    /** Theme override broadcast to the previewed site (iframe). */
    previewTheme: PreviewTheme = 'system';

    editorMode: EditorMode = EditorMode.DESIGN;
    insertMode: InsertMode | null = null;
    pendingInsertElement: DropElementProperties | null = null;
    pendingInsertBlock: ShadcnBlockManifestItem | null = null;
    pendingInsertComponent: ComponentInsertData | null = null;
    leftPanelTab: LeftPanelTabValue | null = null;
    brandTab: BrandTabValue | null = null;
    branchTab: BranchTabValue | null = null;
    manageBranchId: string | null = null;

    chatMode: ChatType = ChatType.EDIT;

    /** CMS workspace UI state. The workspace is shown when editorMode is CMS. */
    cmsTab: CmsTabValue = CmsTabValue.COLLECTIONS;
    cmsSelectedCollectionId: string | null = null;
    cmsEditingItemId: string | null = null;
    cmsCreateCollectionOpen = false;
    cmsBindDialogOpen = false;
    /** When the bind dialog is open, the oid of the element being bound. */
    cmsBindTargetOid: string | null = null;
    /** v4: editor-picked "current item" for PAGE_ITEM_FIELD bindings. The
     *  data pusher resolves this id against the snapshot and pushes the
     *  matching item as `currentItem` in the CMS payload. URL-based
     *  resolution arrives in v4.1. */
    cmsCurrentItemId: string | null = null;
    /** v4: routing dialog open flag (set/clear collection-page mapping). */
    cmsRoutingDialogOpen = false;

    /**
     * Per-page settings drawer. Opened from the cog on a page row in the
     * left-panel Pages tab; renders a Webflow-style resizable surface scoped
     * to one page. `pagePath` re-points when switching pages; `width` persists
     * across opens within a session.
     */
    pageSettingsOpen = false;
    pageSettingsPagePath: string | null = null;
    pageSettingsWidth = 420;

    constructor() {
        // Exclude the debounced field: makeAutoObservable wraps function-valued
        // fields as actions, stripping lodash's `.cancel` — clear()'s
        // `resetCanvasScrollingDebounced.cancel()` would then throw TypeError
        // (same trap already fixed for saveCanvas / persistDebounced).
        makeAutoObservable<this, 'resetCanvasScrollingDebounced'>(this, {
            resetCanvasScrollingDebounced: false,
        });
    }

    setEditorMode(mode: EditorMode) {
        this.editorMode = mode;
    }

    setInsertMode(mode: InsertMode | null) {
        this.insertMode = mode;
    }

    setPendingInsertElement(properties: DropElementProperties | null) {
        this.pendingInsertElement = properties;
    }

    setPendingInsertBlock(block: ShadcnBlockManifestItem | null) {
        this.pendingInsertBlock = block;
    }

    setPendingInsertComponent(data: ComponentInsertData | null) {
        this.pendingInsertComponent = data;
    }

    setLeftPanelTab(tab: LeftPanelTabValue | null) {
        this.leftPanelTab = tab;
    }

    setLeftPanelLocked(locked: boolean) {
        this.leftPanelLocked = locked;
    }

    setCanvasLocked(locked: boolean) {
        this.canvasLocked = locked;
    }

    toggleCanvasLocked() {
        this.canvasLocked = !this.canvasLocked;
    }

    togglePanelsHidden() {
        this.panelsHidden = !this.panelsHidden;
    }

    setPreviewTheme(theme: PreviewTheme) {
        this.previewTheme = theme;
    }

    setHotkeysOpen(open: boolean) {
        this.hotkeysOpen = open;
    }

    setElementPaletteOpen(open: boolean) {
        this.elementPaletteOpen = open;
    }

    setPublishOpen(open: boolean) {
        this.publishOpen = open;
    }

    setCanvasPanning(panning: boolean) {
        this.canvasPanning = panning;
    }

    setIsDragSelecting(selecting: boolean) {
        this.isDragSelecting = selecting;
    }

    setBrandTab(tab: BrandTabValue | null) {
        this.brandTab = tab;
    }

    setBranchTab(tab: BranchTabValue | null) {
        this.branchTab = tab;
    }

    setManageBranchId(id: string | null) {
        this.manageBranchId = id;
    }

    setChatMode(mode: ChatType) {
        this.chatMode = mode;
    }

    setCmsTab(tab: CmsTabValue) {
        this.cmsTab = tab;
    }

    setCmsSelectedCollectionId(id: string | null) {
        // Selecting a different collection closes any open item editor.
        // Compare BEFORE the assignment — otherwise the check is a no-op.
        if (id !== this.cmsSelectedCollectionId) {
            this.cmsEditingItemId = null;
        }
        this.cmsSelectedCollectionId = id;
    }

    setCmsEditingItemId(id: string | null) {
        this.cmsEditingItemId = id;
    }

    setCmsCreateCollectionOpen(open: boolean) {
        this.cmsCreateCollectionOpen = open;
    }

    openCmsBindDialog(oid: string) {
        this.cmsBindTargetOid = oid;
        this.cmsBindDialogOpen = true;
    }

    closeCmsBindDialog() {
        this.cmsBindDialogOpen = false;
        this.cmsBindTargetOid = null;
    }

    setCmsCurrentItemId(id: string | null) {
        this.cmsCurrentItemId = id;
    }

    setCmsRoutingDialogOpen(open: boolean) {
        this.cmsRoutingDialogOpen = open;
    }

    openPageSettings(path: string) {
        this.pageSettingsPagePath = path;
        this.pageSettingsOpen = true;
    }

    setPageSettingsPagePath(path: string) {
        this.pageSettingsPagePath = path;
    }

    closePageSettings() {
        this.pageSettingsOpen = false;
        this.pageSettingsPagePath = null;
    }

    setPageSettingsWidth(width: number) {
        this.pageSettingsWidth = width;
    }

    set canvasScrolling(value: boolean) {
        this._canvasScrolling = value;
        this.resetCanvasScrolling();
    }

    get shouldHideOverlay() {
        return this._canvasScrolling || this.canvasPanning;
    }

    private resetCanvasScrolling() {
        this.resetCanvasScrollingDebounced();
    }

    private resetCanvasScrollingDebounced = debounce(() => {
        runInAction(() => {
            this._canvasScrolling = false;
        });
    }, 150);

    clear() {
        runInAction(() => {
            this.hotkeysOpen = false;
            this.elementPaletteOpen = false;
            this.publishOpen = false;
            this.branchTab = null;
            this.manageBranchId = null;
            this.pendingInsertElement = null;
            this.pendingInsertBlock = null;
            this.pendingInsertComponent = null;
            this.leftPanelTab = null;
            this.brandTab = null;
            this.cmsTab = CmsTabValue.COLLECTIONS;
            this.cmsSelectedCollectionId = null;
            this.cmsEditingItemId = null;
            this.cmsCurrentItemId = null;
            this.cmsCreateCollectionOpen = false;
            this.cmsBindDialogOpen = false;
            this.cmsBindTargetOid = null;
            this.cmsRoutingDialogOpen = false;
            this.pageSettingsOpen = false;
            this.pageSettingsPagePath = null;
        });
        this.resetCanvasScrollingDebounced.cancel();
    }
}
