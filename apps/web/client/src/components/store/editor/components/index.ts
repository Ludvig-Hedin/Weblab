import { makeAutoObservable, reaction, runInAction } from 'mobx';

import type { ComponentDef, DomElement, LayerNode, RectDimensions } from '@weblab/models';
import type { CreatablePropKind, PropExtraction } from '@weblab/parser';
import { EditorMode } from '@weblab/models';
import {
    addVariantProp,
    addVariant as addVariantToMap,
    createPropFromElement,
    detachInstance,
    extractComponent,
    extractHtmlComponent,
    getAstFromContent,
    getContentFromAst,
    HTML_COMPONENT_DIR,
    parseInstancePropValues,
    restampPage,
    suggestPropExtractions,
} from '@weblab/parser';

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
    /** False until the component index has loaded for the active branch. */
    indexReady = false;
    editing: ComponentEditSession | null = null;
    /** Scope-root rect in canvas coordinates, kept fresh by overlay refresh. */
    editingScopeRect: RectDimensions | null = null;
    /** Dotted green outlines for prop-bound elements while editing a master. */
    propBoundRects: Array<{ propName: string; rect: RectDimensions }> = [];
    /** Element targeted by the open "Create component" dialog, if any. */
    createDialogTarget: DomElement | null = null;

    openCreateDialog(el: DomElement) {
        this.createDialogTarget = el;
    }

    closeCreateDialog() {
        this.createDialogTarget = null;
    }

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
        this.indexReady = false;

        let fileSystem;
        try {
            fileSystem = this.editorEngine.fileSystem;
        } catch {
            return;
        }
        if (!fileSystem) return;

        this.unsubscribeIndex = fileSystem.onComponentsChanged((defs) => {
            const previous = this.definitions;
            runInAction(() => {
                this.definitions = defs;
                this.indexReady = true;
            });
            // HTML masters: a changed content hash means the partial was
            // edited — re-stamp every instance across the project's pages.
            const changedMasters = defs.filter(
                (def) =>
                    def.kind === 'html' &&
                    def.version &&
                    previous.some(
                        (p) => p.key === def.key && p.version && p.version !== def.version,
                    ),
            );
            for (const master of changedMasters) {
                void this.restampHtmlMaster(master);
            }
        });

        void fileSystem
            .listComponents()
            .then((defs) => {
                runInAction(() => {
                    this.definitions = defs;
                    this.indexReady = true;
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
        const session = this.editing;
        if (!session) return;
        this.editing = null;
        this.editingScopeRect = null;
        this.propBoundRects = [];
        this.editorEngine.overlay.state.removeHoverRect();

        // Re-select the entry instance (Webflow behavior). Leaving an inner
        // master-file element selected is a footgun: the next style edit
        // would silently write the master — all instances — with no banner.
        void this.selectEntryInstance(session);
    }

    private async selectEntryInstance(session: ComponentEditSession): Promise<void> {
        try {
            const frameData = this.editorEngine.frames.get(session.frameId);
            const layerMap = this.editorEngine.ast.mappings.getMapping(session.frameId);
            if (!frameData?.view || !layerMap) return;
            const boundary = [...layerMap.values()].find(
                (n) => n.instanceId === session.entryInstanceId,
            );
            if (!boundary) {
                this.editorEngine.elements.clear();
                this.editorEngine.overlay.state.removeClickRects();
                return;
            }
            const el: DomElement = await frameData.view.getElementByDomId(boundary.domId, false);
            if (el) this.editorEngine.elements.click([el]);
        } catch {
            // Selection restore is best-effort.
        }
    }

    /**
     * True when the dom node is inside the active edit scope (the entry
     * instance's subtree in the entry frame). Walks the layer-map parents.
     *
     * Stale-map tolerance: right after a master edit, HMR regenerates domIds
     * while the layer map rebuilds on a ~1s debounce. Unknown nodes (or a
     * stale scope root) are treated as IN scope — exiting the session on an
     * undecidable node would dump the user out of component editing on the
     * first click after every edit.
     */
    isInEditScope(frameId: string, domId: string): boolean {
        const session = this.editing;
        if (!session) return true;
        if (frameId !== session.frameId) return false;

        const mappings = this.editorEngine.ast.mappings;
        const node = mappings.getLayerNode(frameId, domId);
        if (!node) return true; // undecided — stale map
        if (!mappings.getLayerNode(frameId, session.scopeRootDomId)) {
            // Scope root itself is stale; membership is undecidable.
            return true;
        }

        let current: LayerNode | null = node;
        while (current) {
            if (current.domId === session.scopeRootDomId) return true;
            current = current.parent
                ? (mappings.getLayerNode(frameId, current.parent) ?? null)
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

        await this.refreshPropBoundRects();
    }

    /**
     * Recomputes the dotted green outlines for prop-bound elements inside the
     * active edit scope. The session definition is re-read from the index so
     * freshly created props light up immediately.
     */
    private async refreshPropBoundRects(): Promise<void> {
        const session = this.editing;
        if (!session) {
            runInAction(() => {
                this.propBoundRects = [];
            });
            return;
        }

        const def = this.get(session.def.key) ?? session.def;
        const frameData = this.editorEngine.frames.get(session.frameId);
        const layerMap = this.editorEngine.ast.mappings.getMapping(session.frameId);
        if (!frameData?.view || !layerMap) return;

        const boundOids = new Map<string, string>(); // oid -> propName
        for (const prop of def.props) {
            for (const binding of prop.bindings) {
                if ('oid' in binding && binding.oid) {
                    boundOids.set(binding.oid, prop.name);
                }
            }
        }

        const rects: Array<{ propName: string; rect: RectDimensions }> = [];
        for (const node of layerMap.values()) {
            if (!node.oid) continue;
            const propName = boundOids.get(node.oid);
            if (!propName) continue;
            if (!this.isInEditScope(session.frameId, node.domId)) continue;
            try {
                const el: DomElement = await frameData.view.getElementByDomId(node.domId, false);
                if (!el) continue;
                rects.push({ propName, rect: adaptRectToCanvas(el.rect, frameData.view) });
            } catch {
                // Element vanished between layer-map snapshot and DOM read.
            }
        }

        runInAction(() => {
            this.propBoundRects = rects;
        });
    }

    // ── Instance properties ──

    /** Statically-known prop values set on the instance usage site. */
    async getInstancePropValues(
        el: DomElement,
    ): Promise<Record<string, string | number | boolean | null>> {
        if (!el.instanceId) return {};
        const fileSystem = this.editorEngine.branches.getBranchDataById(el.branchId)?.codeEditor;
        if (!fileSystem) return {};
        const metadata = await fileSystem.getJsxElementMetadata(el.instanceId);
        if (!metadata?.code) return {};
        return parseInstancePropValues(metadata.code);
    }

    /**
     * Writes a per-instance prop override at the usage site. Setting a value
     * equal to the component default removes the attribute so usage sites
     * stay clean.
     */
    async setInstanceProp(
        el: DomElement,
        propName: string,
        value: string | number | boolean | null,
    ): Promise<void> {
        if (!el.instanceId) return;
        const def = await this.getDefinitionForInstance(el);
        const spec = def?.props.find((p) => p.name === propName);
        const isDefault = value === spec?.defaultValue;
        const attrValue = value === null || isDefault ? { __remove: true } : value;

        await this.editorEngine.code.writeRequest([
            {
                oid: el.instanceId,
                branchId: el.branchId,
                attributes: { [propName]: attrValue },
                tagName: null,
                textContent: null,
                overrideClasses: null,
                structureChanges: [],
            },
        ]);
    }

    async resetInstanceProp(el: DomElement, propName: string): Promise<void> {
        await this.setInstanceProp(el, propName, null);
    }

    async resetAllInstanceProps(el: DomElement): Promise<void> {
        if (!el.instanceId) return;
        const values = await this.getInstancePropValues(el);
        const names = Object.keys(values);
        if (names.length === 0) return;
        await this.editorEngine.code.writeRequest([
            {
                oid: el.instanceId,
                branchId: el.branchId,
                attributes: Object.fromEntries(names.map((name) => [name, { __remove: true }])),
                tagName: null,
                textContent: null,
                overrideClasses: null,
                structureChanges: [],
            },
        ]);
    }

    /**
     * Creates a prop on the master from an element inside it (current literal
     * becomes the default). Writes the master file; discovery re-derives the
     * definition on the same write.
     */
    async createProp(params: {
        def: ComponentDef;
        elementOid: string;
        propName: string;
        kind: CreatablePropKind;
        branchId: string;
    }): Promise<{ ok: boolean; error?: string }> {
        const { def, elementOid, propName, kind, branchId } = params;
        const fileSystem = this.editorEngine.branches.getBranchDataById(branchId)?.codeEditor;
        if (!fileSystem) return { ok: false, error: 'Branch file system unavailable' };

        const content = await fileSystem.readFile(def.filePath);
        if (typeof content !== 'string') {
            return { ok: false, error: `Cannot read ${def.filePath}` };
        }
        const ast = getAstFromContent(content);
        if (!ast) return { ok: false, error: `Cannot parse ${def.filePath}` };

        const result = createPropFromElement(ast, {
            componentName: def.name,
            elementOid,
            propName,
            kind,
        });
        if (!result.modified) {
            return { ok: false, error: result.error ?? 'Could not create property' };
        }

        const generated = await getContentFromAst(ast, content);
        if (getAstFromContent(generated) === null) {
            return { ok: false, error: 'Generated code does not parse — edit aborted' };
        }
        await fileSystem.writeFile(def.filePath, generated);
        this.editorEngine.posthog.capture('component_prop_created', {
            component: def.name,
            kind,
        });
        await this.refreshPropBoundRects();
        return { ok: true };
    }

    // ── HTML stamping orchestration ──

    /**
     * Re-renders every stamped instance of an edited HTML master across the
     * project's pages, preserving per-instance props and slot content.
     * Unchanged pages are skipped to avoid write amplification.
     */
    private async restampHtmlMaster(def: ComponentDef): Promise<void> {
        let fileSystem;
        try {
            fileSystem = this.editorEngine.fileSystem;
        } catch {
            return;
        }
        if (!fileSystem) return;

        try {
            const masterContent = await fileSystem.readFile(def.filePath);
            if (typeof masterContent !== 'string') return;

            const entries = await fileSystem.listAll();
            const pages = entries.filter(
                (entry) =>
                    entry.type === 'file' &&
                    /\.html?$/i.test(entry.path) &&
                    !entry.path.includes(HTML_COMPONENT_DIR),
            );

            const writes: Array<{ path: string; content: string }> = [];
            for (const page of pages) {
                const pageContent = await fileSystem.readFile(page.path);
                if (typeof pageContent !== 'string') continue;
                const result = restampPage(pageContent, masterContent, def.key);
                if (result.changed) {
                    writes.push({ path: page.path, content: result.content });
                }
            }
            if (writes.length > 0) {
                await fileSystem.writeFiles(writes);
                await this.editorEngine.refreshLayers();
            }
        } catch (error) {
            console.error(`[ComponentsManager] Re-stamp failed for ${def.key}:`, error);
        }
    }

    // ── Create component from selection / unlink / variants ──

    /** Suggested prop extractions for the create-component dialog. */
    async getSuggestedExtractions(el: DomElement): Promise<PropExtraction[]> {
        if (!el.oid) return [];
        const fileSystem = this.editorEngine.branches.getBranchDataById(el.branchId)?.codeEditor;
        if (!fileSystem) return [];
        const metadata = await fileSystem.getJsxElementMetadata(el.oid);
        if (!metadata) return [];
        const content = await fileSystem.readFile(metadata.path);
        if (typeof content !== 'string') return [];
        const ast = getAstFromContent(content);
        if (!ast) return [];
        return suggestPropExtractions(ast, el.oid);
    }

    /**
     * Extracts the selected element's subtree into a new component file and
     * replaces it with an instance. Chosen extractions become props with the
     * current literals as defaults.
     */
    async createFromSelection(
        el: DomElement,
        componentName: string,
        extractions: PropExtraction[],
    ): Promise<{ ok: boolean; error?: string }> {
        if (!el.oid) return { ok: false, error: 'Selection has no source mapping' };
        if (this.definitions.some((d) => d.name === componentName)) {
            return { ok: false, error: `A component named "${componentName}" already exists` };
        }
        const fileSystem = this.editorEngine.branches.getBranchDataById(el.branchId)?.codeEditor;
        if (!fileSystem) return { ok: false, error: 'Branch file system unavailable' };

        const metadata = await fileSystem.getJsxElementMetadata(el.oid);
        if (!metadata) return { ok: false, error: 'Source metadata not found' };
        const content = await fileSystem.readFile(metadata.path);
        if (typeof content !== 'string') return { ok: false, error: 'Cannot read source file' };

        // Static HTML pages: editor-managed stamping instead of JSX extraction.
        if (/\.html?$/i.test(metadata.path)) {
            return this.createHtmlComponentFromSelection(el, componentName, {
                fileSystem,
                pagePath: metadata.path,
                pageContent: content,
                selectedHtml: metadata.code,
            });
        }

        const ast = getAstFromContent(content);
        if (!ast) return { ok: false, error: 'Cannot parse source file' };

        const usesSrcDir = metadata.path.startsWith('src/');
        const componentFilePath = usesSrcDir
            ? `src/components/${componentName}.tsx`
            : `components/${componentName}.tsx`;

        // Refuse to overwrite an existing file — the duplicate check above
        // only covers components that DISCOVERY recognized.
        const existing = await fileSystem.readFile(componentFilePath).catch(() => null);
        if (existing != null) {
            return { ok: false, error: `${componentFilePath} already exists` };
        }

        const importPath = await this.resolveImportPath(
            fileSystem,
            metadata.path,
            componentFilePath,
            componentName,
        );

        const result = extractComponent(ast, {
            rootOid: el.oid,
            componentName,
            importPath,
            propExtractions: extractions,
        });
        if (!result.ok) return { ok: false, error: result.error };

        const updatedSource = await getContentFromAst(ast, content);
        if (getAstFromContent(updatedSource) === null) {
            return { ok: false, error: 'Generated code does not parse — edit aborted' };
        }

        // Component file first so the import target exists when the page
        // rebuilds; both writes share the FS write lock.
        await fileSystem.writeFiles([
            { path: componentFilePath, content: result.componentFileContent },
            { path: metadata.path, content: updatedSource },
        ]);

        this.editorEngine.posthog.capture('component_created_from_selection', {
            component: componentName,
            props: extractions.length,
        });
        return { ok: true };
    }

    /**
     * Resolves the import path for a new component: `@/components/<Name>`
     * when the project's tsconfig declares the `@/*` alias (the Weblab
     * scaffold convention), otherwise a relative path — imported repos
     * without the alias would fail to compile on an `@/` import.
     */
    private async resolveImportPath(
        fileSystem: NonNullable<
            ReturnType<EditorEngine['branches']['getBranchDataById']>
        >['codeEditor'],
        pagePath: string,
        componentFilePath: string,
        componentName: string,
    ): Promise<string> {
        try {
            const raw = await fileSystem.readFile('tsconfig.json');
            if (typeof raw === 'string') {
                // tsconfig allows comments — strip line/block comments first.
                const json = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
                const parsed = JSON.parse(json) as {
                    compilerOptions?: { paths?: Record<string, unknown> };
                };
                const paths = parsed.compilerOptions?.paths ?? {};
                if (Object.keys(paths).some((key) => key.startsWith('@/'))) {
                    return `@/components/${componentName}`;
                }
            }
        } catch {
            // No tsconfig / unparseable — fall through to relative.
        }

        // Relative import from the page's directory to the component file.
        const pageSegments = pagePath.split('/').slice(0, -1);
        const targetSegments = componentFilePath.replace(/\.tsx?$/, '').split('/');
        let common = 0;
        while (
            common < pageSegments.length &&
            common < targetSegments.length - 1 &&
            pageSegments[common] === targetSegments[common]
        ) {
            common++;
        }
        const ups = pageSegments.length - common;
        const prefix = ups === 0 ? './' : '../'.repeat(ups);
        return `${prefix}${targetSegments.slice(common).join('/')}`;
    }

    /**
     * HTML create-from-selection: serializes the subtree into a partial under
     * `weblab/components/` and replaces the page element with a stamped
     * instance (marker attrs on the root, `${oid}~${instanceId}` oids).
     */
    private async createHtmlComponentFromSelection(
        el: DomElement,
        componentName: string,
        context: {
            fileSystem: NonNullable<
                ReturnType<EditorEngine['branches']['getBranchDataById']>
            >['codeEditor'];
            pagePath: string;
            pageContent: string;
            selectedHtml: string;
        },
    ): Promise<{ ok: boolean; error?: string }> {
        const { fileSystem, pagePath, pageContent, selectedHtml } = context;
        const kebab = componentName.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
        const componentKey = `${HTML_COMPONENT_DIR}/${kebab}.html`;

        const extraction = extractHtmlComponent({
            selectedHtml,
            componentKey,
            componentName,
        });
        if (!extraction) return { ok: false, error: 'Could not extract the selection' };

        // Replace the selected element with the stamped instance. The code
        // snippet equals the element's source range, so a single string
        // replacement is exact.
        if (!pageContent.includes(selectedHtml)) {
            return { ok: false, error: 'Source drifted — try again after the page reloads' };
        }
        const updatedPage = pageContent.replace(selectedHtml, extraction.stamped);

        // Page FIRST: its bare oids must leave the index before the master is
        // processed, otherwise oid injection sees them as cross-file
        // duplicates and regenerates the master's oids — severing the
        // `${masterOid}~${instanceId}` routing link at the moment of creation.
        await fileSystem.writeFiles([
            { path: pagePath, content: updatedPage },
            { path: componentKey, content: extraction.masterContent },
        ]);

        this.editorEngine.posthog.capture('component_created_from_selection', {
            component: componentName,
            kind: 'html',
        });
        return { ok: true };
    }

    /** Unlink instance: inline the master at the call site (Webflow detach). */
    async unlinkInstance(el: DomElement): Promise<{ ok: boolean; error?: string }> {
        if (!el.instanceId) return { ok: false, error: 'Not a component instance' };
        const def = await this.getDefinitionForInstance(el);
        if (!def) return { ok: false, error: 'Component definition not found' };

        const fileSystem = this.editorEngine.branches.getBranchDataById(el.branchId)?.codeEditor;
        if (!fileSystem) return { ok: false, error: 'Branch file system unavailable' };

        const usage = await fileSystem.getJsxElementMetadata(el.instanceId);
        if (!usage) return { ok: false, error: 'Usage site not found' };
        const pageContent = await fileSystem.readFile(usage.path);
        const masterContent = await fileSystem.readFile(def.filePath);
        if (typeof pageContent !== 'string' || typeof masterContent !== 'string') {
            return { ok: false, error: 'Cannot read source files' };
        }
        const pageAst = getAstFromContent(pageContent);
        if (!pageAst) return { ok: false, error: 'Cannot parse the page' };

        const result = detachInstance(pageAst, {
            instanceOid: el.instanceId,
            def,
            masterContent,
        });
        if (!result.ok) return { ok: false, error: result.error };

        const updated = await getContentFromAst(pageAst, pageContent);
        if (getAstFromContent(updated) === null) {
            return { ok: false, error: 'Generated code does not parse — edit aborted' };
        }
        await fileSystem.writeFile(usage.path, updated);
        this.editorEngine.posthog.capture('component_instance_unlinked', {
            component: def.name,
        });
        return { ok: true };
    }

    /**
     * Adds a variant: converts the component to variant-driven styling on
     * first use (class map + `variant` prop on the root), then appends
     * members to the existing map.
     */
    async addVariant(
        def: ComponentDef,
        branchId: string,
        variantName: string,
    ): Promise<{ ok: boolean; error?: string }> {
        const fileSystem = this.editorEngine.branches.getBranchDataById(branchId)?.codeEditor;
        if (!fileSystem) return { ok: false, error: 'Branch file system unavailable' };
        const content = await fileSystem.readFile(def.filePath);
        if (typeof content !== 'string') return { ok: false, error: 'Cannot read component file' };
        const ast = getAstFromContent(content);
        if (!ast) return { ok: false, error: 'Cannot parse component file' };

        let opResult;
        if (def.variants) {
            opResult = addVariantToMap(ast, {
                mapName: def.variants.mapName,
                variantName,
                copyFrom: def.variants.defaultVariant,
            });
        } else {
            if (!def.rootOid) {
                return { ok: false, error: 'Component root not resolvable' };
            }
            opResult = addVariantProp(ast, {
                componentName: def.name,
                elementOid: def.rootOid,
                initialVariants: ['default', variantName],
            });
        }
        if (!opResult.modified) {
            return { ok: false, error: opResult.error ?? 'Could not add variant' };
        }

        const generated = await getContentFromAst(ast, content);
        if (getAstFromContent(generated) === null) {
            return { ok: false, error: 'Generated code does not parse — edit aborted' };
        }
        await fileSystem.writeFile(def.filePath, generated);
        this.editorEngine.posthog.capture('component_variant_added', {
            component: def.name,
            variant: variantName,
        });
        return { ok: true };
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
        this.propBoundRects = [];
    }
}
