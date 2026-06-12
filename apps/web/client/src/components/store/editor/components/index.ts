import { makeAutoObservable, reaction, runInAction } from 'mobx';

import type { ComponentDef, DomElement, LayerNode, RectDimensions } from '@weblab/models';
import { EditorMode } from '@weblab/models';

import type { EditorEngine } from '../engine';
import { adaptRectToCanvas } from '../overlay/utils';

/**
 * Active in-context master editing session. Master editing is a focus scope
 * inside DESIGN mode (not a separate EditorMode): selection and hover are
 * restricted to the entry instance's subtree, everything else is dimmed, and
 * a banner makes "changes apply to all instances" explicit.
 */
export interface ComponentEditSession {
    def: ComponentDef;
    /** The instance that was double-clicked to enter the session. */
    entryInstanceId: string;
    frameId: string;
    branchId: string;
    /** domId of the instance root in the entry frame; recomputed after DOM updates. */
    scopeRootDomId: string;
    /** Usage count across the project at session start. */
    instanceCount: number;
}

/**
 * Master/instance component system manager.
 *
 * Code is the source of truth: `definitions` mirrors the component index that
 * `CodeFileSystem` derives on every file write (see
 * `packages/file-system/src/component-index.ts`). This manager only observes
 * that index and exposes lookups for the editor UI; all structural knowledge
 * (props, slots, variants, bindings) lives in the parsed code.
 */
export class ComponentsManager {
    definitions: ComponentDef[] = [];
    editing: ComponentEditSession | null = null;
    /** Scope-root rect in canvas coordinates, kept fresh by overlay refresh. */
    editingScopeRect: RectDimensions | null = null;

    private unsubscribeIndex: (() => void) | null = null;
    private branchReactionDisposer: (() => void) | null = null;
    private modeReactionDisposer: (() => void) | null = null;

    constructor(private editorEngine: EditorEngine) {
        makeAutoObservable(this);
    }

    init() {
        // Re-subscribe whenever the active branch (and therefore the active
        // CodeFileSystem) changes; each branch has its own component index.
        this.branchReactionDisposer?.();
        this.branchReactionDisposer = reaction(
            () => {
                try {
                    return this.editorEngine.branches.activeBranch.id;
                } catch {
                    return null;
                }
            },
            () => {
                this.exitEditMode();
                this.subscribeToActiveFileSystem();
            },
            { fireImmediately: true },
        );

        // Leaving DESIGN mode (preview, code, cms, comment…) ends the session.
        this.modeReactionDisposer?.();
        this.modeReactionDisposer = reaction(
            () => this.editorEngine.state.editorMode,
            (mode) => {
                if (mode !== EditorMode.DESIGN) {
                    this.exitEditMode();
                }
            },
        );
    }

    private subscribeToActiveFileSystem() {
        this.unsubscribeIndex?.();
        this.unsubscribeIndex = null;

        let fileSystem;
        try {
            fileSystem = this.editorEngine.fileSystem;
        } catch {
            return;
        }
        if (!fileSystem) return;

        this.unsubscribeIndex = fileSystem.onComponentsChanged((defs) => {
            runInAction(() => {
                this.definitions = defs;
            });
        });

        void fileSystem
            .listComponents()
            .then((defs) => {
                runInAction(() => {
                    this.definitions = defs;
                });
            })
            .catch((error) => {
                console.error('[ComponentsManager] Failed to load components', error);
            });
    }

    get(key: string): ComponentDef | undefined {
        return this.definitions.find((def) => def.key === key);
    }

    /**
     * Resolves the component definition an element belongs to, i.e. the
     * master whose file the element's oid lives in. Returns null for plain
     * page elements (covers slot content too — that's authored in the page).
     */
    async getDefinitionForElement(el: DomElement): Promise<ComponentDef | null> {
        if (!el.oid) return null;
        let fileSystem;
        try {
            fileSystem = this.editorEngine.branches.getBranchDataById(el.branchId)?.codeEditor;
        } catch {
            return null;
        }
        if (!fileSystem) return null;

        const metadata = await fileSystem.getJsxElementMetadata(el.oid);
        if (!metadata?.component) return null;
        return this.get(`${metadata.path}#${metadata.component}`) ?? null;
    }

    /**
     * Resolves the definition for a component *instance* — an element whose
     * `instanceId` points at the usage site (`<Card />`) in another file.
     */
    async getDefinitionForInstance(el: DomElement): Promise<ComponentDef | null> {
        if (!el.instanceId) return null;
        if (!el.oid) return null;
        let fileSystem;
        try {
            fileSystem = this.editorEngine.branches.getBranchDataById(el.branchId)?.codeEditor;
        } catch {
            return null;
        }
        if (!fileSystem) return null;

        // The element's own oid lives inside the master file; its enclosing
        // component name + path identify the definition.
        const metadata = await fileSystem.getJsxElementMetadata(el.oid);
        if (metadata?.component) {
            const def = this.get(`${metadata.path}#${metadata.component}`);
            if (def) return def;
        }

        // Fallback: match by component name from the usage site.
        const usage = await fileSystem.getJsxElementMetadata(el.instanceId);
        if (usage?.component) {
            return this.definitions.find((d) => d.name === usage.component) ?? null;
        }
        return null;
    }

    // ── In-context master editing ──

    /**
     * Enters master editing from a component instance (an element whose
     * `instanceId` points at the usage site). Returns false when the element
     * doesn't resolve to an editable project component (e.g. node_modules).
     */
    async enterEditMode(el: DomElement): Promise<boolean> {
        if (!el.instanceId) return false;
        if (this.editing?.entryInstanceId === el.instanceId) return true;

        const def = await this.getDefinitionForInstance(el);
        if (!def?.editable) return false;

        const fileSystem = this.editorEngine.branches.getBranchDataById(el.branchId)?.codeEditor;
        const instanceCount = fileSystem ? await fileSystem.countComponentUsages(def.name) : 1;

        runInAction(() => {
            this.editing = {
                def,
                entryInstanceId: el.instanceId!,
                frameId: el.frameId,
                branchId: el.branchId,
                scopeRootDomId: el.domId,
                instanceCount,
            };
        });

        // Select the instance root so the user starts at the master's root.
        this.editorEngine.elements.click([el]);
        await this.refreshScopeRect();
        this.editorEngine.posthog.capture('component_edit_mode_entered', {
            component: def.name,
        });
        return true;
    }

    exitEditMode() {
        if (!this.editing) return;
        this.editing = null;
        this.editingScopeRect = null;
        this.editorEngine.overlay.state.removeHoverRect();
    }

    /**
     * True when the dom node is inside the active edit scope (the entry
     * instance's subtree in the entry frame). Walks the layer-map parents.
     */
    isInEditScope(frameId: string, domId: string): boolean {
        const session = this.editing;
        if (!session) return true;
        if (frameId !== session.frameId) return false;

        let current: LayerNode | null =
            this.editorEngine.ast.mappings.getLayerNode(frameId, domId) ?? null;
        while (current) {
            if (current.domId === session.scopeRootDomId) return true;
            current = current.parent
                ? (this.editorEngine.ast.mappings.getLayerNode(frameId, current.parent) ?? null)
                : null;
        }
        return false;
    }

    /**
     * Finds the nearest instance boundary (a layer node carrying an
     * `instanceId`) at or above the given node. Used to enter master editing
     * when the user double-clicks deep inside an instance.
     */
    findInstanceBoundary(frameId: string, domId: string): LayerNode | null {
        let current: LayerNode | null =
            this.editorEngine.ast.mappings.getLayerNode(frameId, domId) ?? null;
        while (current) {
            if (current.instanceId) return current;
            current = current.parent
                ? (this.editorEngine.ast.mappings.getLayerNode(frameId, current.parent) ?? null)
                : null;
        }
        return null;
    }

    /**
     * Recomputes the scope-root rect (canvas coordinates) and re-resolves the
     * scope-root domId after DOM reprocessing. Called from the overlay
     * refresh pipeline so it tracks pan/zoom and post-edit DOM updates.
     */
    async refreshScopeRect(): Promise<void> {
        const session = this.editing;
        if (!session) return;

        const frameData = this.editorEngine.frames.get(session.frameId);
        if (!frameData?.view) return;

        let el: DomElement | null = null;
        try {
            el = await frameData.view.getElementByDomId(session.scopeRootDomId, false);
        } catch {
            el = null;
        }

        if (!el) {
            // DOM was reprocessed and the domId changed — re-resolve the
            // boundary by its instanceId in the layer map.
            const layerMap = this.editorEngine.ast.mappings.getMapping(session.frameId);
            const match = layerMap
                ? [...layerMap.values()].find((n) => n.instanceId === session.entryInstanceId)
                : null;
            if (!match) return;
            runInAction(() => {
                if (this.editing) this.editing.scopeRootDomId = match.domId;
            });
            try {
                el = await frameData.view.getElementByDomId(match.domId, false);
            } catch {
                el = null;
            }
            if (!el) return;
        }

        const rect = adaptRectToCanvas(el.rect, frameData.view);
        runInAction(() => {
            this.editingScopeRect = rect;
        });
    }

    clear() {
        this.unsubscribeIndex?.();
        this.unsubscribeIndex = null;
        this.branchReactionDisposer?.();
        this.branchReactionDisposer = null;
        this.modeReactionDisposer?.();
        this.modeReactionDisposer = null;
        this.definitions = [];
        this.editing = null;
        this.editingScopeRect = null;
    }
}
