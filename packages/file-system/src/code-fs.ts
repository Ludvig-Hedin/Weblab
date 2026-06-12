import debounce from 'lodash.debounce';

import {
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
    clearIndexCache,
    getIndexFromCache,
    getOrLoadIndex,
    saveIndexToCache,
} from './index-cache';

export type { JsxElementMetadata } from './index-cache';

export interface CodeEditorOptions {
    routerType?: RouterType;
}

export class CodeFileSystem extends FileSystem {
    private projectId: string;
    private branchId: string;
    private options: Required<CodeEditorOptions>;
    private indexPath = `${WEBLAB_CACHE_DIRECTORY}/index.json`;
    private componentIndexPath = `${WEBLAB_CACHE_DIRECTORY}/components.json`;
    private debouncedRebuild = debounce(() => void this.rebuildIndex(), 2000);

    constructor(projectId: string, branchId: string, options: CodeEditorOptions = {}) {
        super(`/${projectId}/${branchId}`);
        this.projectId = projectId;
        this.branchId = branchId;
        this.options = {
            routerType: options.routerType ?? RouterType.APP,
        };
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
        return this.withWriteLock(async () => {
            if (this.isJsxFile(path) && typeof content === 'string') {
                const processedContent = await this.processJsxFile(path, content);
                await super.writeFile(path, processedContent);
            } else if (this.isHtmlFile(path) && typeof content === 'string') {
                const processedContent = await this.processHtmlFile(path, content);
                await super.writeFile(path, processedContent);
            } else {
                await super.writeFile(path, content);
            }
        });
    }

    async writeFiles(files: Array<{ path: string; content: string | Uint8Array }>): Promise<void> {
        // Write files sequentially to avoid race conditions to metadata file
        for (const { path, content } of files) {
            await this.writeFile(path, content);
        }
    }

    private async processJsxFile(path: string, content: string): Promise<string> {
        let processedContent = content;
        let ixIdRewrites = new Map<string, string>();

        const ast = getAstFromContent(content);
        if (ast) {
            if (isRootLayoutFile(path, this.options.routerType)) {
                injectWeblabBootstrapScripts(ast);
            }

            const existingOids = await this.getFileOids(path);
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
            this.pendingIxIdRewrites.push({ path, rewrites: ixIdRewrites });
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
        if (!ast) return;

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

    private async getFileOids(path: string): Promise<Set<string>> {
        const index = await this.loadIndex();

        const oids = new Set<string>();
        for (const [oid, metadata] of Object.entries(index)) {
            if (pathsEqual(metadata.path, path)) {
                oids.add(oid);
            }
        }
        return oids;
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
        if (!ast) return;

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
        const index = await this.loadIndex();
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
        const index = await this.loadIndex();
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
        return this.withWriteLock(() => this.performRebuildIndex());
    }

    private async performRebuildIndex(): Promise<void> {
        const startTime = Date.now();
        const index: Record<string, JsxElementMetadata> = {};
        const componentIndex: Record<string, ComponentDef> = {};

        const entries = await this.listAll();
        const sourceFiles = entries.filter(
            (entry) =>
                entry.type === 'file' && (this.isJsxFile(entry.path) || this.isHtmlFile(entry.path)),
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

    private async loadIndex(): Promise<Record<string, JsxElementMetadata>> {
        return getOrLoadIndex(this.getCacheKey(), this.indexPath, (path) => this.readFile(path));
    }

    // ── Component index (master/instance component system) ──

    /** All component definitions discovered in the project source. */
    async listComponents(): Promise<ComponentDef[]> {
        const index = await this.loadComponentIndex();
        return Object.values(index);
    }

    async getComponent(key: string): Promise<ComponentDef | undefined> {
        const index = await this.loadComponentIndex();
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
        const index = await this.loadIndex();
        const usagePattern = new RegExp(`^<${componentName}[\\s/>]`);
        let count = 0;
        for (const metadata of Object.values(index)) {
            if (usagePattern.test(metadata.code)) count++;
        }
        return count;
    }

    private async loadComponentIndex(): Promise<Record<string, ComponentDef>> {
        return getOrLoadComponentIndex(this.getCacheKey(), this.componentIndexPath, (path) =>
            this.readFile(path),
        );
    }

    private async saveComponentIndex(index: Record<string, ComponentDef>): Promise<void> {
        saveComponentIndexToCache(this.getCacheKey(), index);
        void this.debouncedSaveComponentIndexToFile();
    }

    private async undebouncedSaveComponentIndexToFile(): Promise<void> {
        if (!this.initialized) {
            return;
        }
        try {
            await this.createDirectory(WEBLAB_CACHE_DIRECTORY);
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
        saveIndexToCache(this.getCacheKey(), index);
        void this.debouncedSaveIndexToFile();
    }

    private async undobounceSaveIndexToFile(): Promise<void> {
        if (!this.initialized) {
            return;
        }
        try {
            await this.createDirectory(WEBLAB_CACHE_DIRECTORY);
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
