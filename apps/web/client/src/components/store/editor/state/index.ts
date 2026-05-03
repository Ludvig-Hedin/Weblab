import {
    type BranchTabValue,
    type BrandTabValue,
    ChatType,
    EditorMode,
    InsertMode,
    type ComponentInsertData,
    type DropElementProperties,
    type LeftPanelTabValue
} from '@weblab/models';
import type { ShadcnBlockManifestItem } from '@weblab/constants';
import { debounce } from 'lodash';
import { makeAutoObservable, runInAction } from 'mobx';

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
            this.pendingInsertComponent = null;
        });
        this.resetCanvasScrollingDebounced.cancel();
    }
}
