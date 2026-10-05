import debounce from 'lodash.debounce';

import {
    EditorAttributes,
    WEBLAB_CACHE_DIRECTORY,
    WEBLAB_IX_RUNTIME_FILE,
    WEBLAB_PRELOAD_SCRIPT_FILE,
} from '@weblab/constants';
import type { ComponentDef } from '@weblab/models';
import { RouterType } from '@weblab/models';
import {
    addOidsToAst,
    createTemplateNodeMap,
    discoverComponentsInAst,
    formatContent,
    getAstFromContent,
    getContentFromAst,
    getContentFromTemplateNode,
    getOidToIxIdMap,
    HTML_COMPONENT_DIR,
    htmlPipeline,
    injectWeblabBootstrapScripts,
    parseComponentManifest,
    preserveIxIds,
    t,
    traverse,
} from '@weblab/parser';
import { isRootLayoutFile, pathsEqual } from '@weblab/utility';

import type { JsxElementMetadata } from './index-cache';
import {
    clearComponentIndexCache,
    getComponentIndexFromCache,
    getOrLoadComponentIndex,
    onComponentIndexChanged,
    saveComponentIndexToCache,
} from './component-index';
import { FileSystem } from './fs';
import {
    applyDurableChanges, cloneDurableContent, DurableCacheError, durableDiff,
    durablePath, durableRemove, durableSnapshot, durableTransfer, isDurableCachePath,
    type DurableCommitHandler, type DurableRecoveryHandler, type DurableSourceChange, type DurableSourceFile, type DurableTree,
} from './durable-source';
export type { DurableCommitHandler, DurableRecoveryHandler, DurableSourceChange, DurableSourceFile } from './durable-source';
export { DurableCacheError } from './durable-source';
import {
    clearIndexCache,
    getIndexFromCache,
    getOrLoadIndex,
    saveIndexToCache,
} from './index-cache';

export type { JsxElementMetadata } from './index-cache';

export interface CodeEditorOptions {
    routerType?: RouterType;
    localProject?: boolean;
    durableCloud?: boolean;
}

// Durable instances share storage and indexes by scope. Serialize their work
// across reopen, while ownership fences a superseded instance's publication.
const durableOwners = new Map<string, symbol>();
const durableScopeQueues = new Map<string, Promise<void>>();

export class CodeFileSystem extends FileSystem {
    private projectId: string;
    private branchId: string;
    private options: Required<CodeEditorOptions>;
    private localWrite: ((path: string, content: string) => Promise<void>) | null = null;
    private durableCommit: DurableCommitHandler | null = null;
    private durableRecovery: DurableRecoveryHandler | null = null;
    private durableTree: DurableTree | null = null;
    private durableNeedsHydration = false;
    private readonly durableOwner = Symbol('durable-source');
    private durableClosed = false;
    private durableCacheErrorHandler: ((error: DurableCacheError) => void) | null = null;
    private stagedIndexes: {
        elements: Record<string, JsxElementMetadata>;
        components: Record<string, ComponentDef>;
        rewrites: Array<{ path: string; rewrites: Map<string, string> }>;
    } | null = null;
    private indexPath = `${WEBLAB_CACHE_DIRECTORY}/index.json`;
    private componentIndexPath = `${WEBLAB_CACHE_DIRECTORY}/components.json`;
    private debouncedRebuild = debounce(() => void this.rebuildIndex(), 2000);

    constructor(projectId: string, branchId: string, options: CodeEditorOptions = {}) {
        super(`/${projectId}/${branchId}`, { ephemeral: options.durableCloud === true });
        if (options.localProject && options.durableCloud) throw new Error('Local and durable cloud modes are exclusive');
        this.projectId = projectId;
        this.branchId = branchId;
        this.options = {
            routerType: options.routerType ?? RouterType.APP,
            localProject: options.localProject ?? false,
            durableCloud: options.durableCloud ?? false,
        };
        if (this.options.durableCloud) durableOwners.set(this.getCacheKey(), this.durableOwner);
    }

    private assertDurableOwner(): void {
        if (this.durableClosed || durableOwners.get(this.getCacheKey()) !== this.durableOwner) {
            throw new Error('This durable source session is closed or superseded.');
        }
    }

    setDurableCommitHandler(handler: DurableCommitHandler): void {
        if (!this.options.durableCloud) throw new Error('Not a durable cloud project');
        this.assertDurableOwner();
        this.durableCommit = handler;
    }

    setDurableRecoveryHandler(handler: DurableRecoveryHandler): void {
        if (!this.options.durableCloud) throw new Error('Not a durable cloud project');
        this.assertDurableOwner();
        this.durableRecovery = handler;
    }

    setDurableCacheErrorHandler(handler: (error: DurableCacheError) => void): void {
        if (!this.options.durableCloud) throw new Error('Not a durable cloud project');
        this.assertDurableOwner();
        this.durableCacheErrorHandler = handler;
    }

    private durableCacheFailure(cause: unknown): DurableCacheError {
        this.durableNeedsHydration = true;
        const error = new DurableCacheError(cause);
        try {
            this.durableCacheErrorHandler?.(error);
        } catch (observerError) {
            console.error('Durable cache error observer failed', observerError);
        }
        return error;
    }

    /** Cache-only, verbatim hydration. Never instruments source or echoes writes remotely. */
    async hydrateDurableSnapshot(files: DurableSourceFile[]): Promise<void> {
        if (!this.options.durableCloud) throw new Error('Not a durable cloud project');
        const next = durableSnapshot(files);
        return this.withWriteLock(async () => {
            this.durableNeedsHydration = true;
            // readDirectory propagates IO errors; listAll silently swallows them.
            const visit = async (directory: string): Promise<void> => {
                const entries = await super.readDirectory(directory);
                const removeStale = async (items: typeof entries): Promise<void> => {
                    for (const item of items) {
                        const path = durablePath(item.path);
                        if (isDurableCachePath(path)) continue;
                        if (item.isDirectory) {
                            await removeStale(item.children ?? []);
                            // Keep .weblab itself because it can contain local recovery/index data.
                            if ((!next.has(path) || !next.get(path)?.directory) && path !== '.weblab') await super.deleteDirectory(path);
                        } else if (!next.has(path) || next.get(path)?.directory) {
                            await super.deleteFile(path);
                        }
                    }
                };
                await removeStale(entries);
            };
            await visit('/');
            for (const file of Array.from(next.values()).sort((a, b) => a.path.length - b.path.length)) {
                if (file.directory) await super.createDirectory(file.path);
                else await super.writeFile(file.path, file.content);
            }
            await this.rebuildDurableIndexes(next);
            this.durableTree = next;
            this.durableNeedsHydration = false;
        });
    }

    private requireDurableTree(): DurableTree {
        this.assertDurableOwner();
        if (!this.durableTree || this.durableNeedsHydration || !this.durableCommit) {
            throw new Error('Durable source is not ready. Reload the saved source before editing.');
        }
        return this.durableTree;
    }

    private async rebuildDurableIndexes(tree: DurableTree): Promise<void> {
        const staged = {
            elements: {} as Record<string, JsxElementMetadata>,
            components: {} as Record<string, ComponentDef>,
            rewrites: [] as Array<{ path: string; rewrites: Map<string, string> }>,
        };
        this.stagedIndexes = staged;
        try {
            for (const file of tree.values()) {
                if (typeof file.content === 'string') await this.reindexLocalFile(file.path, file.content);
            }
        } finally {
            this.stagedIndexes = null;
        }
        await this.saveIndex(staged.elements);
        await this.saveComponentIndex(staged.components);
    }

    /** Caller owns the write lock; all source bytes reach one atomic remote commit. */
    private async commitDurableChanges(changes: DurableSourceChange[], instrument = true, copied = false, reindexUnchanged: string[] = []): Promise<void> {
        // Capture raw bytes and recovery identity before any async parser/index work.
        if (!this.durableRecovery) throw new Error('Durable recovery is not ready');
        const preserve = this.durableRecovery(changes.map((change) => ({ ...change, content: cloneDurableContent(change.content) })));
        let before!: DurableTree;
        let next!: DurableTree;
        let prepared!: DurableSourceChange[];
        let staged!: NonNullable<CodeFileSystem['stagedIndexes']>;
        try {
            before = this.requireDurableTree();
            const proposed = applyDurableChanges(before, changes);
            prepared = durableDiff(before, proposed);
            if (copied) {
                const preparedPaths = new Set(prepared.map(change => change.path));
                prepared.push(...changes.filter(change => typeof change.content === 'string' &&
                    this.isJsxFile(change.path) && !preparedPaths.has(change.path)).map(change => ({ ...change })));
            }
            if (!prepared.length) return;
            staged = {
                elements: { ...await this.loadIndex() },
                components: { ...await this.loadComponentIndex() },
                rewrites: [],
            };
            this.stagedIndexes = staged;
            for (const change of prepared) {
                await this.dropFileFromIndexes(change.path);
            }
            // Repair the original's metadata when an older duplicate had
            // claimed its IDs. Stage this too, so a rejected copy changes none.
            for (const path of reindexUnchanged) {
                const content = before.get(path)?.content;
                if (typeof content === 'string') await this.reindexLocalFile(path, content);
            }
            for (const change of prepared) {
                if (typeof change.content !== 'string') continue;
                if (instrument && this.isJsxFile(change.path)) change.content = await this.processJsxFile(change.path, change.content, copied);
                else if (instrument && this.isHtmlFile(change.path)) change.content = await this.processHtmlFile(change.path, change.content);
                else await this.reindexLocalFile(change.path, change.content);
            }
            next = applyDurableChanges(before, prepared);
            prepared = durableDiff(before, next);
            this.assertDurableOwner();
        } catch (error) {
            this.stagedIndexes = null;
            await this.preserveDurableAttempt(preserve, error);
            throw error;
        } finally {
            this.stagedIndexes = null;
        }
        // No staged metadata or source is visible while the network commit is pending.
        if (!prepared.length) return;
        // CloudSource owns recovery after transport admission, including preflight rejection.
        await this.durableCommit!(prepared.map((change) => ({ ...change, content: cloneDurableContent(change.content) })));
        // The acknowledged revision is authoritative even if the local cache fails next.
        this.durableTree = next;
        try {
            this.assertDurableOwner();
            for (const change of prepared.filter((change) => change.content === null && !change.directory).sort((a, b) => b.path.length - a.path.length)) {
                if (before.get(change.path)?.directory) {
                    if (change.path !== '.weblab') await super.deleteDirectory(change.path);
                }
                else await super.deleteFile(change.path);
            }
            for (const change of prepared.filter((change) => change.directory).sort((a, b) => a.path.length - b.path.length)) {
                await super.createDirectory(change.path);
            }
            for (const change of prepared) {
                if (change.content !== null) await super.writeFile(change.path, change.content);
            }
            await this.saveIndex(staged.elements);
            await this.saveComponentIndex(staged.components);
            this.pendingIxIdRewrites.push(...staged.rewrites);
        } catch (error) {
            throw this.durableCacheFailure(error);
        }
    }

    private async preserveDurableAttempt(preserve: () => Promise<void>, originalError: unknown): Promise<void> {
        try {
            await preserve();
        } catch (recoveryError) {
            throw new AggregateError([originalError, recoveryError], 'Source save failed and its recovery copy could not be stored. Keep the editor open and download your changes.');
        }
    }

    /**
     * A local project is backed by the selected disk folder. Opening it must
     * load source verbatim: the normal writeFile path instruments JSX/HTML and
     * would change the apparent source before the user chose to edit it.
     */
    async replaceLocalSnapshot(files: Array<{ path: string; content: string }>): Promise<void> {
        if (!this.options.localProject) throw new Error('Not a local project');
        return this.withWriteLock(async () => {
            const incoming = new Map(files.map((file) => [file.path.replace(/^\/+/, ''), file.content]));
            const oldFiles = (await this.listAll()).filter(
                (entry) => entry.type === 'file' && !entry.path.replace(/^\/+/, '').startsWith(`${WEBLAB_CACHE_DIRECTORY}/`),
            );
            for (const old of oldFiles) {
                const oldPath = old.path.replace(/^\/+/, '');
                const prior = await this.readFile(old.path);
                const next = incoming.get(oldPath);
                if (typeof prior === 'string' && prior !== next) {
                    await this.saveRecoveryCopy(oldPath, prior);
                }
                // The desktop text bridge cannot round-trip binary files yet.
                // Leave a prior binary cache entry intact until that transport
                // exists rather than silently discarding a possibly unsynced
                // asset from an older local session.
                if (next === undefined && typeof prior === 'string') {
                    await super.deleteFile(old.path);
                }
            }
            for (const file of files) {
                await super.writeFile(file.path, file.content);
            }
            await this.performRebuildIndex();
        });
    }

    async replaceLocalFile(path: string, content: string): Promise<void> {
        if (!this.options.localProject) throw new Error('Not a local project');
        return this.withWriteLock(async () => {
            await super.writeFile(path, content);
            await this.reindexLocalFile(path, content);
        });
    }

    async removeLocalFile(path: string): Promise<void> {
        if (!this.options.localProject) throw new Error('Not a local project');
        return this.withWriteLock(async () => {
            if (await this.fileExists(path)) await super.deleteFile(path);
            await this.dropFileFromIndexes(path);
        });
    }

    /**
     * Local saves and watcher events touch one file. Re-index only that file:
     * a full rebuild re-parses every source file on the main thread under the
     * write lock, which made each style edit in a local project feel laggy.
     */
    private async reindexLocalFile(path: string, content: string): Promise<void> {
        if (this.isJsxFile(path)) {
            await this.updateMetadataForFile(path, content);
        } else if (this.isHtmlFile(path)) {
            await this.updateHtmlMetadataForFile(path, content);
        }
    }

    /** Copy-on-write removal of one file's entries from both indexes. */
    private async dropFileFromIndexes(path: string): Promise<void> {
        if (!this.isJsxFile(path) && !this.isHtmlFile(path)) return;
        const index = await this.loadIndex();
        const nextIndex: Record<string, JsxElementMetadata> = {};
        let indexChanged = false;
        for (const [oid, metadata] of Object.entries(index)) {
            if (pathsEqual(metadata.path, path)) indexChanged = true;
            else nextIndex[oid] = metadata;
        }
        if (indexChanged) await this.saveIndex(nextIndex);

        const componentIndex = await this.loadComponentIndex();
        const nextComponentIndex: Record<string, ComponentDef> = {};
        let componentsChanged = false;
        for (const [key, def] of Object.entries(componentIndex)) {
            if (pathsEqual(def.filePath, path)) componentsChanged = true;
            else nextComponentIndex[key] = def;
        }
        if (componentsChanged) await this.saveComponentIndex(nextComponentIndex);
    }

    setLocalWriteHandler(write: (path: string, content: string) => Promise<void>): void {
        if (!this.options.localProject) throw new Error('Not a local project');
        this.localWrite = write;
    }

    private async saveRecoveryCopy(path: string, content: string): Promise<string> {
        const name = path.split('/').pop()?.replace(/[^a-zA-Z0-9._-]/g, '_') ?? 'source';
        const recoveryPath = `${WEBLAB_CACHE_DIRECTORY}/recovery/${Date.now()}-${Math.random().toString(36).slice(2)}-${name}.txt`;
        await super.writeFile(recoveryPath, content);
        return recoveryPath;
    }

    // Serializes every operation that reads-then-writes the shared in-memory
    // OID index (writeFile / deleteFile / moveFile / rebuildIndex). Without it,
    // the editor's writes and the sandbox sync watcher's writes interleave:
    // both read the index, both transform, and the second clobbers the first or
    // reads it mid-mutation — surfacing as "No metadata found for OID" and, in
    // the worst case, a corrupted source file. All four entry points below
    // funnel through `withWriteLock`; none of them call back into a locked
    // method, so the chain can't deadlock.
    private writeLock: Promise<void> = Promise.resolve();

    private withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
        if (this.options.durableCloud) {
            this.assertDurableOwner();
            const key = this.getCacheKey();
            const preceding = durableScopeQueues.get(key) ?? Promise.resolve();
            const run = preceding.then(() => {
                this.assertDurableOwner();
                return fn();
            });
            const settled = run.then(() => undefined, () => undefined);
            durableScopeQueues.set(key, settled);
            this.writeLock = settled;
            void settled.then(() => {
                if (durableScopeQueues.get(key) === settled) durableScopeQueues.delete(key);
            });
            return run;
        }
        const run = this.writeLock.then(fn);
        // Keep the chain alive past a rejection so one failed op doesn't wedge
        // every later op; the real result/error returns to the caller via `run`.
        this.writeLock = run.then(
            () => undefined,
            () => undefined,
        );
        return run;
    }

    async writeFile(path: string, content: string | Uint8Array): Promise<void> {
        if (this.options.durableCloud) return this.writeFiles([{ path, content }]);
        return this.withWriteLock(async () => {
            if (this.options.localProject && (!this.localWrite || typeof content !== 'string')) {
                throw new Error('Local source is not ready for a text write');
            }
            if (this.options.localProject) {
                // Local source remains byte-for-byte as the editor supplied it.
                // The cloud path below stamps OIDs, injects scripts, and formats
                // whole JSX files. Those broad changes require a separate
                // reviewed preparation step for an existing Git project.
                try {
                    await this.localWrite!(path, content as string);
                } catch (error) {
                    const recoveryPath = await this.saveRecoveryCopy(path, content as string);
                    throw new Error(
                        `Local write failed for ${path}. Your attempted source is saved in ${recoveryPath}. ${error instanceof Error ? error.message : String(error)}`,
                    );
                }
                await super.writeFile(path, content);
                await this.reindexLocalFile(path, content as string);
                return;
            }
            let processedContent: string | Uint8Array = content;
            if (this.isJsxFile(path) && typeof content === 'string') {
                processedContent = await this.processJsxFile(path, content);
            } else if (this.isHtmlFile(path) && typeof content === 'string') {
                processedContent = await this.processHtmlFile(path, content);
            }
            await super.writeFile(path, processedContent);
        });
    }

    async writeFiles(files: Array<{ path: string; content: string | Uint8Array }>): Promise<void> {
        if (this.options.durableCloud) {
            const copies = files.map((file) => ({ path: durablePath(file.path), content: cloneDurableContent(file.content)! }));
            return this.withWriteLock(async () => {
                const source = copies.filter((file) => !isDurableCachePath(file.path));
                if (source.length) await this.commitDurableChanges(source);
                try {
                    for (const file of copies.filter((file) => isDurableCachePath(file.path))) await super.writeFile(file.path, file.content);
                } catch (error) {
                    if (!source.length) throw error;
                    throw this.durableCacheFailure(error);
                }
            });
        }
        // Write files sequentially to avoid race conditions to metadata file
        for (const { path, content } of files) {
            await this.writeFile(path, content);
        }
    }

    async createFile(path: string, content = ''): Promise<void> {
        if (this.options.durableCloud) return this.writeFile(path, content);
        if (this.options.localProject) {
            throw new Error('Creating local files from the editor is not ready');
        }
        await super.createFile(path, content);
    }

    async createDirectory(path: string): Promise<void> {
        if (this.options.durableCloud) {
            const normalized = durablePath(path);
            return this.withWriteLock(async () => {
                if (isDurableCachePath(normalized)) return super.createDirectory(normalized);
                await this.commitDurableChanges([{ path: normalized, content: null, directory: true }]);
            });
        }
        if (this.options.localProject) throw new Error('Creating local folders from the editor is not ready');
        await super.createDirectory(path);
    }

    async copyDirectory(from: string, to: string): Promise<void> {
        if (this.options.durableCloud) return this.withWriteLock(() => {
            if (isDurableCachePath(durablePath(from)) && isDurableCachePath(durablePath(to))) return super.copyDirectory(from, to);
            return this.commitDurableChanges(durableTransfer(this.requireDurableTree(), from, to, true, false), true, true);
        });
        if (this.options.localProject) throw new Error('Copying local folders from the editor is not ready');
        await super.copyDirectory(from, to);
    }

    async copyFile(from: string, to: string, options: { overwrite?: boolean } = {}): Promise<void> {
        if (this.options.durableCloud) return this.withWriteLock(async () => {
            if (isDurableCachePath(durablePath(from)) && isDurableCachePath(durablePath(to))) return super.writeFile(to, await super.readFile(from));
            const tree = this.requireDurableTree();
            const fromPath = durablePath(from), toPath = durablePath(to);
            let transferTree = tree;
            if (options.overwrite && tree.has(toPath)) {
                if (fromPath === toPath || toPath.startsWith(`${fromPath}/`) || fromPath.startsWith(`${toPath}/`)) throw new Error('Source and destination overlap');
                if (tree.get(toPath)?.directory) throw new Error(`Directory exists: ${toPath}`);
                // Only the proposed transfer ignores the target. The original
                // source, target and indexes stay intact until the save succeeds.
                transferTree = new Map(tree);
                transferTree.delete(toPath);
            }
            return this.commitDurableChanges(durableTransfer(transferTree, fromPath, toPath, false, false), true, true, [fromPath]);
        });
        if (this.options.localProject) throw new Error('Copying local files from the editor is not ready');
        await super.copyFile(from, to);
    }

    private async processJsxFile(path: string, content: string, copied = false): Promise<string> {
        let processedContent = content;
        let ixIdRewrites = new Map<string, string>();

        const ast = getAstFromContent(content);
        if (ast) {
            if (copied) {
                // addOidsToAst preserves valid IDs by default. Copies need new
                // identity before indexing, or their nodes replace the original.
                traverse(ast, {
                    JSXOpeningElement(nodePath) {
                        nodePath.node.attributes = nodePath.node.attributes.filter((attribute) =>
                            !t.isJSXAttribute(attribute) || attribute.name.name !== EditorAttributes.DATA_WEBLAB_ID);
                    },
                });
            }
            if (!this.options.durableCloud && isRootLayoutFile(path, this.options.routerType)) {
                injectWeblabBootstrapScripts(ast);
            }

            // Pass OTHER files' oids as the global set so a freshly-generated
            // oid is unique across the whole project, not just within this
            // file. Passing only this file's own oids (the old behavior) meant
            // a duplicated file kept its source's oids — two files sharing an
            // oid, so edits routed to the wrong file. Existing valid oids in
            // THIS file are still preserved (addOidsToAst only regenerates on
            // an in-AST `localOids` collision), so this is safe for re-writes;
            // it only tightens uniqueness for new/duplicated elements. Mirrors
            // the HTML pipeline's `getOidsExcludingFile` guard above.
            const existingOids = await this.getOidsExcludingFile(path);
            const { ast: oidAst } = addOidsToAst(ast, existingOids);

            const existingIxIds = await this.getGlobalIxIdsExcludingFile(path);
            const { ast: processedAst, rewrites } = preserveIxIds(oidAst, existingIxIds);
            ixIdRewrites = rewrites;

            processedContent = await getContentFromAst(processedAst, content);
        } else {
            console.warn(`Failed to parse ${path}, skipping OID injection but will still format`);
        }

        const formattedContent = await formatContent(path, processedContent);
        await this.updateMetadataForFile(path, formattedContent);

        if (ixIdRewrites.size > 0) {
            (this.stagedIndexes?.rewrites ?? this.pendingIxIdRewrites).push({ path, rewrites: ixIdRewrites });
        }

        return formattedContent;
    }

    /**
     * `.html` counterpart of `processJsxFile`: stamps `data-oid` attributes via
     * the parse5 pipeline and refreshes the element index for the file so
     * static-HTML projects support canvas editing (resolves the long-standing
     * "always-empty index" gap for scaffoldStaticHtmlProject projects).
     *
     * Unlike the JSX path, existing oids in *this* file must NOT be passed as
     * `globalOids` — the HTML pipeline regenerates any oid found in that set,
     * which would churn ids on every write. Pass only the other files' oids
     * to guard cross-file uniqueness.
     */
    private async processHtmlFile(path: string, content: string): Promise<string> {
        const ast = htmlPipeline.parse(content);
        if (!ast) {
            console.warn(`Failed to parse ${path}, skipping OID injection`);
            return content;
        }

        const globalOids = await this.getOidsExcludingFile(path);
        const { ast: oidAst, modified } = htmlPipeline.injectOids(ast, { globalOids });
        const processedContent = modified
            ? await htmlPipeline.generate(oidAst, content)
            : content;

        await this.updateHtmlMetadataForFile(path, processedContent);
        return processedContent;
    }

    private async updateHtmlMetadataForFile(path: string, content: string): Promise<void> {
        const index = await this.loadIndex();

        const next: Record<string, JsxElementMetadata> = {};
        for (const [oid, metadata] of Object.entries(index)) {
            if (!pathsEqual(metadata.path, path)) {
                next[oid] = metadata;
            }
        }

        // Re-parse the serialized output: injectOids mutates the tree, so the
        // original parse's source positions are stale.
        const ast = htmlPipeline.parse(content);
        if (!ast) {
            await this.dropFileFromIndexes(path);
            return;
        }

        const templateNodeMap = htmlPipeline.buildTemplateNodeMap({
            ast,
            filename: path,
            branchId: this.branchId,
        });

        for (const [oid, node] of templateNodeMap.entries()) {
            const code = await getContentFromTemplateNode(node, content);
            next[oid] = { ...node, oid, code: code || '' };
        }

        await this.saveIndex(next);
        await this.updateHtmlComponentIndexForFile(path, content);
    }

    /**
     * HTML component discovery: partials under `weblab/components/` carry an
     * in-file manifest; a content hash is attached so the editor can detect
     * master edits in index updates and re-stamp instances.
     */
    private async updateHtmlComponentIndexForFile(path: string, content: string): Promise<void> {
        if (!path.includes(HTML_COMPONENT_DIR)) return;
        try {
            const def = parseComponentManifest(content, path);
            const componentIndex = await this.loadComponentIndex();
            const next: Record<string, ComponentDef> = {};
            for (const [key, existing] of Object.entries(componentIndex)) {
                if (!pathsEqual(existing.filePath, path)) {
                    next[key] = existing;
                }
            }
            if (def) {
                next[def.key] = { ...def, version: hashContent(content) };
            }
            await this.saveComponentIndex(next);
        } catch (error) {
            console.error(`[CodeEditorApi] HTML component discovery failed for ${path}:`, error);
        }
    }

    private async getOidsExcludingFile(path: string): Promise<Set<string>> {
        const index = await this.loadIndex();
        const oids = new Set<string>();
        for (const [oid, metadata] of Object.entries(index)) {
            if (!pathsEqual(metadata.path, path)) {
                oids.add(oid);
            }
        }
        return oids;
    }

    /**
     * IX-id rewrites discovered during JSX processing. Consumed by the editor
     * to remap `.weblab/interactions.json` entries that referenced the
     * rewritten ids. Cleared after caller reads via `consumePendingIxIdRewrites`.
     */
    private pendingIxIdRewrites: Array<{ path: string; rewrites: Map<string, string> }> = [];

    consumePendingIxIdRewrites(): Array<{ path: string; rewrites: Map<string, string> }> {
        const list = this.pendingIxIdRewrites;
        this.pendingIxIdRewrites = [];
        return list;
    }

    private async getGlobalIxIdsExcludingFile(path: string): Promise<Set<string>> {
        const index = await this.loadIndex();
        const ids = new Set<string>();
        for (const metadata of Object.values(index)) {
            if (!metadata.ixId) continue;
            if (pathsEqual(metadata.path, path)) continue;
            ids.add(metadata.ixId);
        }
        return ids;
    }

    private async updateMetadataForFile(path: string, content: string): Promise<void> {
        const index = await this.loadIndex();

        // Copy-on-write: the cache hands out the live index object by
        // reference, so mutating it in place across the awaits below would let
        // unlocked readers (getJsxElementMetadata) observe a half-updated
        // index — this file's OIDs vanish mid-rebuild and "No metadata found
        // for OID" fires spuriously. Build the next index in a fresh object
        // and swap it in atomically via saveIndex.
        const next: Record<string, JsxElementMetadata> = {};
        for (const [oid, metadata] of Object.entries(index)) {
            if (!pathsEqual(metadata.path, path)) {
                next[oid] = metadata;
            }
        }

        const ast = getAstFromContent(content);
        if (!ast) {
            // Match a full rebuild: an unparsable file has no entries.
            // Keeping the old ones would point edits at stale source ranges.
            await this.dropFileFromIndexes(path);
            return;
        }

        const templateNodeMap = createTemplateNodeMap({
            ast,
            filename: path,
            branchId: this.branchId,
        });

        const oidToIxId = getOidToIxIdMap(ast);

        for (const [oid, node] of templateNodeMap.entries()) {
            const code = await getContentFromTemplateNode(node, content);
            const ixId = oidToIxId.get(oid);
            const metadata: JsxElementMetadata = {
                ...node,
                oid,
                code: code || '',
                ...(ixId ? { ixId } : {}),
            };
            next[oid] = metadata;
        }

        await this.saveIndex(next);
        await this.updateComponentIndexForFile(path, ast);
    }

    /**
     * Re-derives the component definitions exported by `path` and swaps them
     * into the component index. Same copy-on-write discipline as the oid
     * index: defs from other files are kept, this file's defs are replaced.
     */
    private async updateComponentIndexForFile(
        path: string,
        ast: ReturnType<typeof getAstFromContent>,
    ): Promise<void> {
        if (!ast) return;
        try {
            const componentIndex = await this.loadComponentIndex();
            const next: Record<string, ComponentDef> = {};
            for (const [key, def] of Object.entries(componentIndex)) {
                if (!pathsEqual(def.filePath, path)) {
                    next[key] = def;
                }
            }
            for (const def of discoverComponentsInAst(ast, path)) {
                next[def.key] = def;
            }
            await this.saveComponentIndex(next);
        } catch (error) {
            console.error(`[CodeEditorApi] Component discovery failed for ${path}:`, error);
        }
    }

    async getJsxElementMetadata(oid: string): Promise<JsxElementMetadata | undefined> {
        const index = await this.loadIndex(false);
        const metadata = index[oid];
        if (!metadata) {
            console.warn(
                `[CodeEditorApi] No metadata found for OID: ${oid}. Total index size: ${Object.keys(index).length}`,
            );
            this.debouncedRebuild();
        }
        return metadata;
    }

    async getJsxElementMetadataByIxId(ixId: string): Promise<JsxElementMetadata | undefined> {
        const index = await this.loadIndex(false);
        for (const metadata of Object.values(index)) {
            if (metadata.ixId === ixId) {
                return metadata;
            }
        }
        return undefined;
    }

    async rebuildIndex(): Promise<void> {
        // Under the same lock as writeFile/deleteFile/moveFile so a full rebuild
        // can't race a concurrent single-file index update.
        return this.withWriteLock(() => this.options.durableCloud
            ? this.rebuildDurableIndexes(this.requireDurableTree())
            : this.performRebuildIndex());
    }

    private async performRebuildIndex(): Promise<void> {
        const startTime = Date.now();
        const index: Record<string, JsxElementMetadata> = {};
        const componentIndex: Record<string, ComponentDef> = {};

        const entries = await this.listAll();
        const sourceFiles = entries.filter(
            (entry) =>
                entry.type === 'file' &&
                (!this.options.durableCloud || !isDurableCachePath(entry.path.replace(/^\/+/, ''))) &&
                (this.isJsxFile(entry.path) || this.isHtmlFile(entry.path)),
        );

        const BATCH_SIZE = 10;
        let processedCount = 0;

        for (let i = 0; i < sourceFiles.length; i += BATCH_SIZE) {
            const batch = sourceFiles.slice(i, i + BATCH_SIZE);
            await Promise.all(
                batch.map(async (entry) => {
                    try {
                        const content = await this.readFile(entry.path);
                        if (typeof content !== 'string') return;

                        if (this.isHtmlFile(entry.path)) {
                            const htmlAst = htmlPipeline.parse(content);
                            if (!htmlAst) return;
                            const templateNodeMap = htmlPipeline.buildTemplateNodeMap({
                                ast: htmlAst,
                                filename: entry.path,
                                branchId: this.branchId,
                            });
                            for (const [oid, node] of templateNodeMap.entries()) {
                                const code = await getContentFromTemplateNode(node, content);
                                index[oid] = { ...node, oid, code: code || '' };
                            }
                            if (entry.path.includes(HTML_COMPONENT_DIR)) {
                                const def = parseComponentManifest(content, entry.path);
                                if (def) {
                                    componentIndex[def.key] = {
                                        ...def,
                                        version: hashContent(content),
                                    };
                                }
                            }
                            processedCount++;
                            return;
                        }

                        const ast = getAstFromContent(content);
                        if (!ast) return;

                        const templateNodeMap = createTemplateNodeMap({
                            ast,
                            filename: entry.path,
                            branchId: this.branchId,
                        });

                        const oidToIxId = getOidToIxIdMap(ast);

                        for (const [oid, node] of templateNodeMap.entries()) {
                            const code = await getContentFromTemplateNode(node, content);
                            const ixId = oidToIxId.get(oid);
                            index[oid] = {
                                ...node,
                                oid,
                                code: code || '',
                                ...(ixId ? { ixId } : {}),
                            };
                        }

                        for (const def of discoverComponentsInAst(ast, entry.path)) {
                            componentIndex[def.key] = def;
                        }

                        processedCount++;
                    } catch (error) {
                        console.error(`Error indexing ${entry.path}:`, error);
                    }
                }),
            );
        }

        await this.saveIndex(index);
        await this.saveComponentIndex(componentIndex);

        const duration = Date.now() - startTime;
        console.log(
            `[CodeEditorApi] Index built: ${Object.keys(index).length} elements, ${Object.keys(componentIndex).length} components from ${processedCount} files in ${duration}ms`,
        );
    }

    async deleteFile(path: string): Promise<void> {
        if (this.options.durableCloud) return this.withWriteLock(() => {
            if (isDurableCachePath(durablePath(path))) return super.deleteFile(path);
            return this.commitDurableChanges(durableRemove(this.requireDurableTree(), path, false));
        });
        if (this.options.localProject) {
            throw new Error('Deleting local files from the editor is not ready');
        }
        return this.withWriteLock(async () => {
            await super.deleteFile(path);

            if (this.isJsxFile(path) || this.isHtmlFile(path)) {
                const index = await this.loadIndex();
                let hasChanges = false;

                for (const [oid, metadata] of Object.entries(index)) {
                    if (pathsEqual(metadata.path, path)) {
                        delete index[oid];
                        hasChanges = true;
                    }
                }

                if (hasChanges) {
                    await this.saveIndex(index);
                }

                // Copy-on-write, matching updateComponentIndexForFile —
                // mutating the live cached object would let unlocked readers
                // observe a half-updated index.
                const componentIndex = await this.loadComponentIndex();
                const nextComponentIndex: Record<string, ComponentDef> = {};
                let hasComponentChanges = false;
                for (const [key, def] of Object.entries(componentIndex)) {
                    if (pathsEqual(def.filePath, path)) {
                        hasComponentChanges = true;
                    } else {
                        nextComponentIndex[key] = def;
                    }
                }
                if (hasComponentChanges) {
                    await this.saveComponentIndex(nextComponentIndex);
                }
            }
        });
    }

    async moveFile(oldPath: string, newPath: string): Promise<void> {
        if (this.options.durableCloud) return this.withWriteLock(() => {
            if (isDurableCachePath(durablePath(oldPath)) && isDurableCachePath(durablePath(newPath))) return super.moveFile(oldPath, newPath);
            return this.commitDurableChanges(durableTransfer(this.requireDurableTree(), oldPath, newPath, false, true), false);
        });
        if (this.options.localProject) {
            throw new Error('Moving local files from the editor is not ready');
        }
        return this.withWriteLock(async () => {
            await super.moveFile(oldPath, newPath);

            const isSourcePair =
                (this.isJsxFile(oldPath) && this.isJsxFile(newPath)) ||
                (this.isHtmlFile(oldPath) && this.isHtmlFile(newPath));
            if (isSourcePair) {
                const index = await this.loadIndex();
                let hasChanges = false;

                for (const metadata of Object.values(index)) {
                    if (pathsEqual(metadata.path, oldPath)) {
                        metadata.path = newPath;
                        hasChanges = true;
                    }
                }

                if (hasChanges) {
                    await this.saveIndex(index);
                }

                // Component keys embed the file path — re-key on move.
                const componentIndex = await this.loadComponentIndex();
                const next: Record<string, ComponentDef> = {};
                let hasComponentChanges = false;
                for (const [key, def] of Object.entries(componentIndex)) {
                    if (pathsEqual(def.filePath, oldPath)) {
                        const newKey = key.includes('#')
                            ? `${newPath}#${key.split('#').pop()}`
                            : newPath;
                        next[newKey] = { ...def, key: newKey, filePath: newPath };
                        hasComponentChanges = true;
                    } else {
                        next[key] = def;
                    }
                }
                if (hasComponentChanges) {
                    await this.saveComponentIndex(next);
                }
            }
        });
    }

    /**
     * Normalize a path for prefix comparison: strip a leading slash and any
     * trailing slash, then POSIX-normalize. Mirrors `pathsEqual`'s
     * normalization so directory-prefix checks line up with the per-file
     * equality checks used elsewhere in this class.
     */
    private normalizeDirPrefix(dir: string): string {
        const clean = dir.startsWith('/') ? dir.substring(1) : dir;
        const trimmed = clean.endsWith('/') ? clean.slice(0, -1) : clean;
        return trimmed;
    }

    /** True when `filePath` sits inside (or equals) directory `dir`. */
    private isUnderDirectory(filePath: string, dir: string): boolean {
        const normFile = (filePath.startsWith('/') ? filePath.substring(1) : filePath).replace(
            /\/+$/,
            '',
        );
        const normDir = this.normalizeDirPrefix(dir);
        if (!normDir) return true; // root dir → everything is under it
        return normFile === normDir || normFile.startsWith(`${normDir}/`);
    }

    /**
     * Recursively delete a directory AND prune every OID / component-index
     * entry whose source file lived under it. Without this override the base
     * `deleteDirectory` removed the files from ZenFS but left their index
     * entries behind — stale OIDs that resolve to deleted files surface as
     * "No metadata found for OID" and route edits at nothing. Runs under the
     * same write lock as deleteFile/moveFile so it can't interleave with a
     * concurrent single-file index update.
     */
    async deleteDirectory(path: string): Promise<void> {
        if (this.options.durableCloud) return this.withWriteLock(() => {
            if (isDurableCachePath(durablePath(path))) return super.deleteDirectory(path);
            return this.commitDurableChanges(durableRemove(this.requireDurableTree(), path, true));
        });
        if (this.options.localProject) throw new Error('Deleting local folders from the editor is not ready');
        return this.withWriteLock(async () => {
            await super.deleteDirectory(path);

            const index = await this.loadIndex();
            let hasChanges = false;
            for (const [oid, metadata] of Object.entries(index)) {
                if (this.isUnderDirectory(metadata.path, path)) {
                    delete index[oid];
                    hasChanges = true;
                }
            }
            if (hasChanges) {
                await this.saveIndex(index);
            }

            const componentIndex = await this.loadComponentIndex();
            const nextComponentIndex: Record<string, ComponentDef> = {};
            let hasComponentChanges = false;
            for (const [key, def] of Object.entries(componentIndex)) {
                if (this.isUnderDirectory(def.filePath, path)) {
                    hasComponentChanges = true;
                } else {
                    nextComponentIndex[key] = def;
                }
            }
            if (hasComponentChanges) {
                await this.saveComponentIndex(nextComponentIndex);
            }
        });
    }

    /**
     * Move/rename a directory AND re-key every index entry whose source file
     * lived under the old prefix to the new prefix. Mirrors `moveFile` for the
     * directory case; without it, moved files keep their old indexed `path`
     * and component keys, so edits route to the now-nonexistent old location.
     */
    async moveDirectory(oldPath: string, newPath: string): Promise<void> {
        if (this.options.durableCloud) return this.withWriteLock(() => {
            if (isDurableCachePath(durablePath(oldPath)) && isDurableCachePath(durablePath(newPath))) return super.moveDirectory(oldPath, newPath);
            return this.commitDurableChanges(durableTransfer(this.requireDurableTree(), oldPath, newPath, true, true), false);
        });
        if (this.options.localProject) throw new Error('Moving local folders from the editor is not ready');
        return this.withWriteLock(async () => {
            await super.moveDirectory(oldPath, newPath);

            const oldPrefix = this.normalizeDirPrefix(oldPath);
            const newPrefix = this.normalizeDirPrefix(newPath);

            const rekey = (p: string): string => {
                const norm = (p.startsWith('/') ? p.substring(1) : p).replace(/\/+$/, '');
                if (norm === oldPrefix) return newPrefix;
                if (norm.startsWith(`${oldPrefix}/`)) {
                    return `${newPrefix}${norm.slice(oldPrefix.length)}`;
                }
                return p;
            };

            const index = await this.loadIndex();
            let hasChanges = false;
            for (const metadata of Object.values(index)) {
                if (this.isUnderDirectory(metadata.path, oldPath)) {
                    metadata.path = rekey(metadata.path);
                    hasChanges = true;
                }
            }
            if (hasChanges) {
                await this.saveIndex(index);
            }

            // Component keys embed the file path — re-key on directory move.
            const componentIndex = await this.loadComponentIndex();
            const next: Record<string, ComponentDef> = {};
            let hasComponentChanges = false;
            for (const [key, def] of Object.entries(componentIndex)) {
                if (this.isUnderDirectory(def.filePath, oldPath)) {
                    const newFilePath = rekey(def.filePath);
                    const newKey = key.includes('#')
                        ? `${newFilePath}#${key.split('#').pop()}`
                        : newFilePath;
                    next[newKey] = { ...def, key: newKey, filePath: newFilePath };
                    hasComponentChanges = true;
                } else {
                    next[key] = def;
                }
            }
            if (hasComponentChanges) {
                await this.saveComponentIndex(next);
            }
        });
    }

    private async loadIndex(useStaged = true): Promise<Record<string, JsxElementMetadata>> {
        if (this.options.durableCloud) this.assertDurableOwner();
        if (useStaged && this.stagedIndexes) return this.stagedIndexes.elements;
        return getOrLoadIndex(this.getCacheKey(), this.indexPath, (path) => this.readFile(path));
    }

    // ── Component index (master/instance component system) ──

    /** All component definitions discovered in the project source. */
    async listComponents(): Promise<ComponentDef[]> {
        const index = await this.loadComponentIndex(false);
        return Object.values(index);
    }

    async getComponent(key: string): Promise<ComponentDef | undefined> {
        const index = await this.loadComponentIndex(false);
        return index[key];
    }

    /** Subscribe to component-index changes. Returns an unsubscribe fn. */
    onComponentsChanged(cb: (defs: ComponentDef[]) => void): () => void {
        return onComponentIndexChanged(this.getCacheKey(), cb);
    }

    /**
     * Counts JSX usage sites of a component across the indexed source. The
     * usage element (`<Card …>`) carries its own oid, so its indexed code
     * snippet starts with the component tag.
     */
    async countComponentUsages(componentName: string): Promise<number> {
        const index = await this.loadIndex(false);
        const usagePattern = new RegExp(`^<${componentName}[\\s/>]`);
        let count = 0;
        for (const metadata of Object.values(index)) {
            if (usagePattern.test(metadata.code)) count++;
        }
        return count;
    }

    private async loadComponentIndex(useStaged = true): Promise<Record<string, ComponentDef>> {
        if (this.options.durableCloud) this.assertDurableOwner();
        if (useStaged && this.stagedIndexes) return this.stagedIndexes.components;
        return getOrLoadComponentIndex(this.getCacheKey(), this.componentIndexPath, (path) =>
            this.readFile(path),
        );
    }

    private async saveComponentIndex(index: Record<string, ComponentDef>): Promise<void> {
        if (this.options.durableCloud) this.assertDurableOwner();
        if (this.stagedIndexes) {
            this.stagedIndexes.components = index;
            return;
        }
        saveComponentIndexToCache(this.getCacheKey(), index);
        if (!this.options.durableCloud) void this.debouncedSaveComponentIndexToFile();
    }

    private async undebouncedSaveComponentIndexToFile(): Promise<void> {
        if (!this.initialized) {
            return;
        }
        try {
            // In-memory cache folder only. The local-project override blocks
            // user folder creation, and .weblab is never mirrored to disk.
            await super.createDirectory(WEBLAB_CACHE_DIRECTORY);
        } catch {
            console.warn(`[CodeEditorApi] Failed to create ${WEBLAB_CACHE_DIRECTORY} directory`);
        }
        const index = getComponentIndexFromCache(this.getCacheKey());
        if (index) {
            await super.writeFile(this.componentIndexPath, JSON.stringify(index));
        }
    }

    private debouncedSaveComponentIndexToFile = debounce(
        () => void this.undebouncedSaveComponentIndexToFile(),
        1000,
    );

    private async saveIndex(index: Record<string, JsxElementMetadata>): Promise<void> {
        if (this.options.durableCloud) this.assertDurableOwner();
        if (this.stagedIndexes) {
            this.stagedIndexes.elements = index;
            return;
        }
        saveIndexToCache(this.getCacheKey(), index);
        if (!this.options.durableCloud) void this.debouncedSaveIndexToFile();
    }

    private async undobounceSaveIndexToFile(): Promise<void> {
        if (!this.initialized) {
            return;
        }
        try {
            // In-memory cache folder only. The local-project override blocks
            // user folder creation, and .weblab is never mirrored to disk.
            await super.createDirectory(WEBLAB_CACHE_DIRECTORY);
        } catch {
            console.warn(`[CodeEditorApi] Failed to create ${WEBLAB_CACHE_DIRECTORY} directory`);
        }
        const index = getIndexFromCache(this.getCacheKey());
        if (index) {
            await super.writeFile(this.indexPath, JSON.stringify(index));
        }
    }

    private debouncedSaveIndexToFile = debounce(() => void this.undobounceSaveIndexToFile(), 1000);

    private isJsxFile(path: string): boolean {
        // Exclude the weblab preload script and the IX runtime bundle from JSX
        // processing — they're hand-authored JS that lives in `public/` and
        // must not be parsed as user JSX.
        if (path.endsWith(WEBLAB_PRELOAD_SCRIPT_FILE)) {
            return false;
        }
        if (path.endsWith(WEBLAB_IX_RUNTIME_FILE)) {
            return false;
        }
        return /\.(jsx?|tsx?)$/i.test(path);
    }

    private isHtmlFile(path: string): boolean {
        return /\.html?$/i.test(path);
    }

    async cleanup(): Promise<void> {
        if (this.options.durableCloud) {
            this.durableClosed = true;
            this.beginClose();
            this.debouncedRebuild.cancel();
            this.debouncedSaveIndexToFile.cancel();
            this.debouncedSaveComponentIndexToFile.cancel();
            // Let already-sent commits settle truthfully. Their ownership check
            // prevents stale cache publication; reopened hydration queues after them.
            await this.writeLock;
            this.durableCommit = null;
            this.durableRecovery = null;
            this.durableCacheErrorHandler = null;
            this.durableTree = null;
            await super.cleanup();
            const cacheKey = this.getCacheKey();
            if (durableOwners.get(cacheKey) === this.durableOwner) {
                durableOwners.delete(cacheKey);
                clearIndexCache(cacheKey);
                clearComponentIndexCache(cacheKey);
            }
            return;
        }
        // Tear down the base FileSystem first: it closes all ZenFS watchers and
        // clears pending watcher debounce timeouts. The override previously
        // skipped this, leaking a watcher + timeout per CodeFileSystem instance
        // (one per branch) for the life of the page.
        super.cleanup();

        const cacheKey = this.getCacheKey();
        if (getIndexFromCache(cacheKey)) {
            await this.undobounceSaveIndexToFile();
        }
        if (getComponentIndexFromCache(cacheKey)) {
            await this.undebouncedSaveComponentIndexToFile();
        }

        clearIndexCache(cacheKey);
        clearComponentIndexCache(cacheKey);
    }

    private getCacheKey(): string {
        return `${this.projectId}/${this.branchId}`;
    }
}

/** djb2 — cheap, stable content hash for master-edit detection. */
function hashContent(content: string): string {
    let hash = 5381;
    for (let i = 0; i < content.length; i++) {
        hash = ((hash << 5) + hash + content.charCodeAt(i)) | 0;
    }
    return (hash >>> 0).toString(36);
}
