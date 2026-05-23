import { makeAutoObservable } from 'mobx';

import type {
    AddInteractionAction,
    Interaction,
    InteractionAction,
    InteractionsDocument,
    RemoveInteractionAction,
    UpdateInteractionAction,
} from '@weblab/models';
import {
    WEBLAB_INTERACTIONS_CACHE_PATH,
    WEBLAB_INTERACTIONS_PUBLIC_INITIAL_CSS_PATH,
    WEBLAB_INTERACTIONS_PUBLIC_PATH,
    WEBLAB_INTERACTIONS_STATIC_HTML_INITIAL_CSS_PATH,
    WEBLAB_INTERACTIONS_STATIC_HTML_PATH,
} from '@weblab/constants';
import { EMPTY_INTERACTIONS_DOCUMENT } from '@weblab/models';
import {
    createIxId,
    ensureIxIdOnElement,
    getAstFromContent,
    getContentFromAst,
    getOidFromJsxElement,
    removeIxIdFromElement,
    traverse,
} from '@weblab/parser';

import type { EditorEngine } from '../engine';
import { emitInitialCss } from './css-emitter';

export class InteractionsManager {
    private _doc: InteractionsDocument = cloneDoc(EMPTY_INTERACTIONS_DOCUMENT);
    private _loaded = false;
    private _isDirty = false;
    private _lastSavedAt: number | null = null;
    private flushTimer: ReturnType<typeof setTimeout> | null = null;
    private beforeUnloadHandler: (() => void) | null = null;

    constructor(private editorEngine: EditorEngine) {
        makeAutoObservable(this);
    }

    get isDirty(): boolean {
        return this._isDirty;
    }

    get lastSavedAt(): number | null {
        return this._lastSavedAt;
    }

    get document(): InteractionsDocument {
        return this._doc;
    }

    get interactions(): Interaction[] {
        return this._doc.interactions;
    }

    get isLoaded(): boolean {
        return this._loaded;
    }

    forSource(ixId: string): Interaction[] {
        return this._doc.interactions.filter((ix) => ix.trigger.sourceIxId === ixId);
    }

    forElement(ixId: string): Interaction[] {
        return this._doc.interactions.filter(
            (ix) => ix.trigger.sourceIxId === ixId || matchesTarget(ix, ixId),
        );
    }

    getInteraction(id: string): Interaction | null {
        return this._doc.interactions.find((i) => i.id === id) ?? null;
    }

    async init(): Promise<void> {
        await this.loadFromDisk();
        await this.flushNow();
        this._loaded = true;
        this.attachBeforeUnload();
    }

    /**
     * Browsers GC the page between the last edit and `clear()` if the user
     * closes the tab or navigates away. With a 600ms debounce on disk writes,
     * any edit within that window is lost. Register a beforeunload handler
     * that synchronously fires the pending flush so the JSON file is on disk
     * before the tab unloads. The handler is a no-op when nothing is pending.
     */
    private attachBeforeUnload() {
        if (typeof window === 'undefined') return;
        if (this.beforeUnloadHandler) return;
        const handler = () => {
            if (!this._isDirty) return;
            // Cancel debounce, fire synchronous write path. The disk write
            // itself is still async (CodeFileSystem.writeFile returns a
            // Promise) and the browser may not await it before unload — but
            // the request is enqueued in ZenFS / the provider before navigate.
            if (this.flushTimer) {
                clearTimeout(this.flushTimer);
                this.flushTimer = null;
            }
            // Cannot await — beforeunload is sync. Fire-and-forget.
            void this.flushNow();
        };
        window.addEventListener('beforeunload', handler);
        this.beforeUnloadHandler = handler;
    }

    private detachBeforeUnload() {
        if (typeof window === 'undefined') return;
        if (!this.beforeUnloadHandler) return;
        window.removeEventListener('beforeunload', this.beforeUnloadHandler);
        this.beforeUnloadHandler = null;
    }

    // TODO(bug-hunt): wire `CodeFileSystem.consumePendingIxIdRewrites` so that
    // when `preserveIxIds` regenerates a duplicated `data-wb-ix` during a JSX
    // write (e.g. copy-paste of a JSX element across files), the matching
    // `interactions.json` entries (`trigger.sourceIxId`, `target.value` for
    // `kind === 'ix-id'`, and per-animation `targetOverride.value`) are
    // remapped to the new id. Without this, animations on the copied element
    // silently fail because the runtime can't find an element matching the
    // stale ix-id. Out of v1 scope (copy-paste of interactive elements is
    // rare), but should land before any aggressive paste flows are added.

    clear(): void {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
        this.detachBeforeUnload();
        this._doc = cloneDoc(EMPTY_INTERACTIONS_DOCUMENT);
        this._loaded = false;
        this._isDirty = false;
        this._lastSavedAt = null;
    }

    async loadFromDisk(): Promise<void> {
        const branchData = this.editorEngine.branches.activeBranchData;
        const codeEditor = branchData?.codeEditor;
        if (!codeEditor) return;
        let needsPublicSeed = false;
        try {
            const raw = await codeEditor.readFile(WEBLAB_INTERACTIONS_CACHE_PATH);
            if (typeof raw !== 'string' || raw.trim().length === 0) {
                this._doc = cloneDoc(EMPTY_INTERACTIONS_DOCUMENT);
                needsPublicSeed = true;
            } else {
                const parsed = JSON.parse(raw) as InteractionsDocument;
                if (parsed.version !== 1 || !Array.isArray(parsed.interactions)) {
                    console.warn('[InteractionsManager] Unsupported document shape');
                    this._doc = cloneDoc(EMPTY_INTERACTIONS_DOCUMENT);
                    needsPublicSeed = true;
                } else {
                    this._doc = parsed;
                }
            }
        } catch {
            // No file yet — empty doc.
            this._doc = cloneDoc(EMPTY_INTERACTIONS_DOCUMENT);
            needsPublicSeed = true;
        }

        // CSB BLANK template ships without `public/_weblab/interactions.json`,
        // so every fresh sandbox preview burns repeated 404s on the IX runtime
        // fetch until the user creates their first interaction. Seed the public
        // path with the empty document on first load so the runtime gets a
        // clean 200 instead. Best-effort — a write failure is harmless (the
        // runtime treats 404 as "no interactions").
        if (needsPublicSeed) {
            try {
                const emptyJson = JSON.stringify(EMPTY_INTERACTIONS_DOCUMENT, null, 2);
                await codeEditor.writeFile(WEBLAB_INTERACTIONS_PUBLIC_PATH, emptyJson);
            } catch (err) {
                // EEXIST is normal when `public/` already exists in the
                // template (the underlying recursive-mkdir collides). The
                // runtime still treats a 404 on the JSON as "no interactions"
                // so this is purely best-effort. Only log unexpected errors.
                const message = err instanceof Error ? err.message : String(err);
                if (!/EEXIST|file exists/i.test(message)) {
                    console.warn(
                        '[InteractionsManager] Failed to seed empty interactions.json:',
                        err,
                    );
                }
            }
        }
    }

    async addInteraction(interaction: Interaction, branchId: string): Promise<void> {
        this._doc.interactions.push(interaction);
        this.scheduleDiskFlush();
        this.pushToAllIframes();
        const action: AddInteractionAction = {
            type: 'add-interaction',
            next: cloneInteraction(interaction),
            prev: null,
            branchId,
        };
        await this.editorEngine.action.run(action);
    }

    async updateInteraction(next: Interaction, branchId: string): Promise<void> {
        const idx = this._doc.interactions.findIndex((i) => i.id === next.id);
        if (idx === -1) return;
        const prev = this._doc.interactions[idx];
        if (!prev) return;
        this._doc.interactions[idx] = next;
        this.scheduleDiskFlush();
        this.pushToAllIframes();
        const action: UpdateInteractionAction = {
            type: 'update-interaction',
            next: cloneInteraction(next),
            prev: cloneInteraction(prev),
            branchId,
        };
        await this.editorEngine.action.run(action);
    }

    async removeInteraction(id: string, branchId: string): Promise<void> {
        const idx = this._doc.interactions.findIndex((i) => i.id === id);
        if (idx === -1) return;
        const removed = this._doc.interactions[idx];
        if (!removed) return;
        this._doc.interactions.splice(idx, 1);
        this.scheduleDiskFlush();
        this.pushToAllIframes();
        const action: RemoveInteractionAction = {
            type: 'remove-interaction',
            next: null,
            prev: cloneInteraction(removed),
            branchId,
        };
        await this.editorEngine.action.run(action);
    }

    /**
     * Push the current in-memory document into every preview iframe via
     * penpal. Coalesced into a microtask so a burst of mutations issues at
     * most one push per frame.
     */
    private pushScheduled = false;
    private pushToAllIframes(): void {
        if (this.pushScheduled) return;
        this.pushScheduled = true;
        queueMicrotask(() => {
            this.pushScheduled = false;
            const snapshot = cloneDoc(this._doc);
            for (const fd of this.editorEngine.frames.getAll()) {
                const view = fd.view as
                    | { applyInteractionsConfig?: (doc: InteractionsDocument) => Promise<void> }
                    | undefined;
                view?.applyInteractionsConfig?.(snapshot).catch(() => {
                    // Tolerate frames that haven't loaded the runtime yet.
                });
            }
        });
    }

    /** Play an animation in every preview iframe. */
    async play(ixId: string, animationId: string): Promise<void> {
        for (const fd of this.editorEngine.frames.getAll()) {
            const view = fd.view as
                | { playInteraction?: (a: string, b: string) => Promise<boolean> }
                | undefined;
            await view?.playInteraction?.(ixId, animationId);
        }
    }

    async scrub(ixId: string, animationId: string, tMs: number): Promise<void> {
        for (const fd of this.editorEngine.frames.getAll()) {
            const view = fd.view as
                | { scrubInteraction?: (a: string, b: string, t: number) => Promise<void> }
                | undefined;
            await view?.scrubInteraction?.(ixId, animationId, tMs);
        }
    }

    async reloadRuntime(): Promise<void> {
        for (const fd of this.editorEngine.frames.getAll()) {
            const view = fd.view as { reloadInteractions?: () => Promise<void> } | undefined;
            await view?.reloadInteractions?.();
        }
    }

    /**
     * Replays an interaction action onto the in-memory document during undo
     * or redo. Called from CodeManager.write when the action arrives via
     * history. State is mutated then persisted; no fresh history push.
     */
    async applyHistoryAction(action: InteractionAction): Promise<void> {
        switch (action.type) {
            case 'add-interaction':
                if (action.next) {
                    const exists = this._doc.interactions.some((i) => i.id === action.next.id);
                    if (!exists) this._doc.interactions.push(action.next);
                }
                break;
            case 'remove-interaction': {
                const id = action.prev?.id;
                if (id) {
                    this._doc.interactions = this._doc.interactions.filter((i) => i.id !== id);
                }
                break;
            }
            case 'update-interaction': {
                const idx = this._doc.interactions.findIndex((i) => i.id === action.next.id);
                if (idx >= 0) this._doc.interactions[idx] = action.next;
                break;
            }
        }
        this.pushToAllIframes();
        await this.flushNow();
    }

    /**
     * Stamp `data-wb-ix` onto the JSX element identified by `oid` if missing.
     * Returns the (existing or freshly minted) ix-id. Writes the JSX file
     * back through CodeFileSystem so the parser pipeline preserves all other
     * invariants (OIDs, formatting, metadata index).
     */
    async ensureIxIdForOid(oid: string, branchId: string): Promise<string | null> {
        const branchData = this.editorEngine.branches.getBranchDataById(branchId);
        const codeEditor = branchData?.codeEditor ?? this.editorEngine.fileSystem;
        if (!codeEditor) return null;

        const existing = await codeEditor.getJsxElementMetadata(oid);
        if (!existing) return null;
        if (existing.ixId) return existing.ixId;

        const fileContent = await codeEditor.readFile(existing.path);
        if (typeof fileContent !== 'string') return null;

        const ast = getAstFromContent(fileContent);
        if (!ast) return null;

        const newIxId = createIxId();
        let stamped = false;

        traverse(ast, {
            JSXElement(path) {
                if (stamped) return;
                const elOid = getOidFromJsxElement(path.node.openingElement);
                if (elOid === oid) {
                    ensureIxIdOnElement(path.node, newIxId);
                    stamped = true;
                    path.stop();
                }
            },
        });

        if (!stamped) return null;

        const modifiedContent = await getContentFromAst(ast, fileContent);
        await codeEditor.writeFile(existing.path, modifiedContent);
        return newIxId;
    }

    /**
     * Remove `data-wb-ix` from the JSX element with the given ixId. Called
     * when the last interaction referencing it is removed.
     */
    async removeIxIdFromSource(ixId: string, branchId: string): Promise<void> {
        const branchData = this.editorEngine.branches.getBranchDataById(branchId);
        const codeEditor = branchData?.codeEditor ?? this.editorEngine.fileSystem;
        if (!codeEditor) return;

        const meta = await codeEditor.getJsxElementMetadataByIxId(ixId);
        if (!meta) return;

        const fileContent = await codeEditor.readFile(meta.path);
        if (typeof fileContent !== 'string') return;

        const ast = getAstFromContent(fileContent);
        if (!ast) return;

        let stripped = false;
        traverse(ast, {
            JSXElement(path) {
                if (stripped) return;
                const elOid = getOidFromJsxElement(path.node.openingElement);
                if (elOid === meta.oid) {
                    removeIxIdFromElement(path.node);
                    stripped = true;
                    path.stop();
                }
            },
        });

        if (!stripped) return;
        const modified = await getContentFromAst(ast, fileContent);
        await codeEditor.writeFile(meta.path, modified);
    }

    private scheduleDiskFlush(): void {
        this._isDirty = true;
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
        }
        this.flushTimer = setTimeout(() => {
            this.flushTimer = null;
            void this.flushNow();
        }, 600);
    }

    async flushNow(): Promise<void> {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
        try {
            const branchData = this.editorEngine.branches.activeBranchData;
            const codeEditor = branchData?.codeEditor;
            if (!codeEditor) return;

            const json = JSON.stringify(this._doc, null, 2);
            const initialCss = emitInitialCss(this._doc);

            const isStaticHtml = this.editorEngine.framework === 'static-html';

            await codeEditor.writeFile(WEBLAB_INTERACTIONS_CACHE_PATH, json);

            // Mirror to publicly-served path so the runtime can fetch it.
            if (isStaticHtml) {
                await codeEditor.writeFile(WEBLAB_INTERACTIONS_STATIC_HTML_PATH, json);
                await codeEditor.writeFile(
                    WEBLAB_INTERACTIONS_STATIC_HTML_INITIAL_CSS_PATH,
                    initialCss,
                );
            } else {
                await codeEditor.writeFile(WEBLAB_INTERACTIONS_PUBLIC_PATH, json);
                await codeEditor.writeFile(WEBLAB_INTERACTIONS_PUBLIC_INITIAL_CSS_PATH, initialCss);
            }
            this._isDirty = false;
            this._lastSavedAt = Date.now();
        } catch (err) {
            console.warn('[InteractionsManager] Failed to persist interactions:', err);
        }
    }
}

function cloneDoc(doc: InteractionsDocument): InteractionsDocument {
    return JSON.parse(JSON.stringify(doc)) as InteractionsDocument;
}

function cloneInteraction(i: Interaction): Interaction {
    return JSON.parse(JSON.stringify(i)) as Interaction;
}

function matchesTarget(ix: Interaction, ixId: string): boolean {
    if (ix.target.kind === 'ix-id' && ix.target.value === ixId) return true;
    for (const animation of ix.animations) {
        if (animation.targetOverride?.kind === 'ix-id' && animation.targetOverride.value === ixId) {
            return true;
        }
    }
    return false;
}
