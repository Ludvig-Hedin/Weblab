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

export class StateManager {
    private _canvasScrolling = false;
    hotkeysOpen = false;
    elementPaletteOpen = false;
    publishOpen = false;
    leftPanelLocked = false;
    canvasPanning = false;
    isDragSelecting = false;

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
    cmsBindTargetOid: string | null = null;
    cmsCurrentItemId: string | null = null;
    cmsRoutingDialogOpen = false;

    constructor() {
        makeAutoObservable(this);
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
        this.cmsSelectedCollectionId = id;
        if (id !== this.cmsSelectedCollectionId) {
            this.cmsEditingItemId = null;
        }
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
            this.cmsCreateCollectionOpen = false;
            this.cmsBindDialogOpen = false;
            this.cmsBindTargetOid = null;
            this.cmsRoutingDialogOpen = false;
        });
        this.resetCanvasScrollingDebounced.cancel();
    }
}
