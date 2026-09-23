import { makeAutoObservable } from 'mobx';

import type { CodeFileSystem } from '@weblab/file-system';
import type { BreakpointId } from '@weblab/models';
import type { BreakpointEntry } from '@weblab/parser';
import { type Action, type CodeDiffRequest, type FileToRequests } from '@weblab/models';
import { getAstFromContent, selectPipeline } from '@weblab/parser';
import { toast } from '@weblab/ui/sonner';
import { assertNever } from '@weblab/utility';

import { type EditorEngine } from '@/components/store/editor/engine';
import { getOrCreateCodeDiffRequest } from './helpers';
import {
    getEditTextRequests,
    getGroupRequests,
    getInsertImageRequests,
    getInsertRequests,
    getMoveRequests,
    getRemoveImageRequests,
    getRemoveRequests,
    getStyleRequests,
    getUngroupRequests,
    getWriteCodeRequests,
    processGroupedRequests,
} from './requests';
import { addResponsiveTailwindToRequest, tailwindPrefixForWidth } from './tailwind';
import { hasUnsupportedResponsiveStyleValue } from '../style/local-style-writer';

export class CodeManager {
    constructor(private editorEngine: EditorEngine) {
        makeAutoObservable(this);
        this.attachBeforeUnload();
    }

    /**
     * Number of writes currently queued/running on `writeChain`. Reloading
     * while this is non-zero can truncate the file mid-transport (the user
     * hit exactly this: a rapid element-delete burst + reload left
     * `page.tsx` ending in `</m` — unparseable, preview dead, later writes
     * failing at parse). The beforeunload guard below warns instead.
     */
    private pendingWrites = 0;

    get hasPendingWrites(): boolean {
        return this.pendingWrites > 0;
    }

    async waitForPendingWrites(): Promise<void> {
        await this.writeChain;
    }

    private beforeUnloadHandler: ((e: BeforeUnloadEvent) => void) | null = null;

    private attachBeforeUnload() {
        if (typeof window === 'undefined') return;
        if (this.beforeUnloadHandler) return;
        const handler = (e: BeforeUnloadEvent) => {
            // Fire any debounced source rebases NOW so they at least enqueue
            // before the page goes away (best effort — unload won't await).
            this.editorEngine.action.flushPendingRebases();
            if (!this.hasPendingWrites && !this.editorEngine.action.hasPendingRebases) return;
            // In-flight source write: ask the browser to confirm leaving.
            // An aborted write can persist a truncated, unparseable file.
            e.preventDefault();
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

    /**
     * Apply an action's code changes to the file system. Returns `true` on
     * success and `false` if the write failed (the error is surfaced to the
     * user here via toast + the Errors console). Callers use the result to
     * keep history in sync — see `HistoryManager.push`, which drops an action
     * from the undo stack when its write fails so a later undo can't emit the
     * inverse of an edit that never landed.
     */
    async write(action: Action): Promise<boolean> {
        try {
            if (action.type === 'update-style' && this.editorEngine.framework === 'static-html') {
                throw new Error('Visual style editing of static HTML requires a CSS source writer. No project file was changed.');
            }
            if (action.type === 'update-style' && action.targets.some((target) =>
                this.editorEngine.branches.getStyleWriterForBranch(target.branchId) === 'none')) {
                throw new Error('Visual style editing requires a wired Tailwind v4 App Router stylesheet. No project file was changed.');
            }
            if (action.type === 'update-style' && hasUnsupportedResponsiveStyleValue(
                action.targets, this.editorEngine.frames?.getAll() ?? [])) {
                throw new Error('Breakpoint font stacks are not supported yet. No project file was changed.');
            }
            // TODO: This is a hack to write code, we should refactor this
            if (action.type === 'write-code') {
                if (action.diffs.length === 0) {
                    throw new Error('write-code action has no diffs');
                }
                if (
                    this.editorEngine.branches.activeBranch.runtime.type === 'local' &&
                    action.diffs.length > 1
                ) {
                    throw new Error('Multi-file local edits need a transaction and are unavailable');
                }
                // Write-code actions don't have branch context, use active
                // editor. Apply EVERY diff — reverseWriteCodeAction reverses all
                // of them, so writing only diffs[0] would make the inverse
                // asymmetric (undo restores files the redo never wrote) and
                // silently drop every file after the first on a multi-diff write.
                //
                // Routed through the serialized write chain so these raw
                // writes (a) count toward `pendingWrites` for the
                // beforeunload truncation guard and (b) can't interleave
                // with an in-flight AST read-modify-write on the same files.
                // The re-parse corruption guard in `processWriteRequest`
                // deliberately does NOT apply here: write-code diffs are
                // whole-file AI-apply outputs that may target non-JSX files
                // (css, json, md, …) the JSX re-parse would falsely reject.
                await this.enqueueWrite(async () => {
                    for (const diff of action.diffs) {
                        await this.editorEngine.fileSystem.writeFile(diff.path, diff.generated);
                    }
                });
            } else if (
                action.type === 'add-interaction' ||
                action.type === 'update-interaction' ||
                action.type === 'remove-interaction'
            ) {
                await this.editorEngine.interactions.applyHistoryAction(action);
            } else {
                const requests = await this.collectRequests(action);
                await this.writeRequest(requests);
            }
            return true;
        } catch (error) {
            console.error('Error writing requests:', error);
            const message = error instanceof Error ? error.message : 'Unknown error';
            // Stable id: rapid repeat failures (e.g. arrow-key nudges while the
            // sandbox is broken) update one toast instead of stacking dozens.
            toast.error("Couldn't save this edit", {
                id: 'code-write-error',
                description: message,
                action: message.includes('File changed on disk:') && typeof window !== 'undefined'
                    ? { label: 'Reload from disk', onClick: () => window.location.reload() }
                    : undefined,
            });
            this.editorEngine.branches.activeError.addCodeApplicationError(
                message,
                action,
            );
            return false;
        }
    }

    // Serializes source writes. Every write is a read-modify-write (read file →
    // parse → transform AST → regenerate → write file). The immediate write
    // (`code.write`) and the debounced responsive write (`writeResponsiveStyle`)
    // — plus undo/redo — all target the same files with no shared lock, so on a
    // rapid slider drag they interleave: a later write reads stale content and
    // clobbers an earlier one, or two regenerations race and leave the file
    // syntactically broken ("No ast found for file" on the next parse). Chaining
    // them guarantees each completes before the next reads.
    private writeChain: Promise<void> = Promise.resolve();

    async writeRequest(requests: CodeDiffRequest[]): Promise<void> {
        return this.enqueueWrite(() => this.processWriteRequest(requests));
    }

    /**
     * Enqueue a write task on the serialized write chain with `pendingWrites`
     * accounting. EVERY source write must go through here: a direct
     * `fileSystem.writeFile` bypasses both the serialization (interleaved
     * read-modify-writes clobber each other) and the beforeunload truncation
     * guard (a reload mid-write can persist a truncated, unparseable file).
     */
    private enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
        this.pendingWrites += 1;
        const run = this.writeChain.then(task).finally(() => {
            this.pendingWrites -= 1;
        });
        // Swallow errors on the chain itself so one failed write doesn't wedge
        // every subsequent write; the real result/rejection is returned to the
        // caller via `run`.
        this.writeChain = run.then(
            () => undefined,
            () => undefined,
        );
        return run;
    }

    private async processWriteRequest(requests: CodeDiffRequest[]) {
        const groupedRequests = await this.groupRequestByFile(requests);
        const codeDiffs = await processGroupedRequests(groupedRequests);

        // Validate EVERY diff before writing ANY file. A multi-file action
        // (multi-select edit across components) that failed validation on
        // file 2 used to leave file 1 already written — and history then
        // dropped the whole action, so the landed half was un-undoable and
        // the UI diverged from disk. All-or-nothing: reject up front.
        const validated: { codeEditor: CodeFileSystem; path: string; generated: string }[] = [];
        for (const diff of codeDiffs) {
            const fileGroup = groupedRequests.get(diff.path);
            if (!fileGroup) {
                throw new Error(`No request group found for file: ${diff.path}`);
            }

            const firstRequest = Array.from(fileGroup.oidToRequest.values())[0];
            if (!firstRequest) {
                throw new Error(`No requests found in group for file: ${diff.path}`);
            }

            const branchData = this.editorEngine.branches.getBranchDataById(firstRequest.branchId);
            if (!branchData) {
                throw new Error(`Branch not found for ID: ${firstRequest.branchId}`);
            }

            // Corruption guard: editor-action output comes from Babel
            // `generate()` and must re-parse. If it doesn't, something
            // upstream (stale snapshot, interrupted transform) produced
            // garbage — refuse to persist it. CodeFileSystem.writeFile
            // intentionally writes unparseable content for the code-mode
            // editor (devs may save WIP), so the guard must live HERE on
            // the action path, not down there. Without it a bad diff
            // overwrites the user's source with a syntactically broken
            // file and every subsequent action write fails at parse.
            {
                // Re-parse with the pipeline that produced the content —
                // HTML output is valid parse5 but not valid JSX.
                const pipeline = selectPipeline(diff.path);
                const reparses =
                    pipeline && pipeline.id !== 'jsx'
                        ? pipeline.parse(diff.generated) !== null
                        : getAstFromContent(diff.generated) !== null;
                if (!reparses) {
                    throw new Error(
                        `Refusing to write ${diff.path}: generated content does not parse. The edit was not saved — your source files are untouched.`,
                    );
                }
            }

            validated.push({
                codeEditor: branchData.codeEditor,
                path: diff.path,
                generated: diff.generated,
            });
        }

        if (
            validated.length > 1 &&
            requests.some(
                (request) =>
                    this.editorEngine.branches.getBranchById(request.branchId)?.runtime.type ===
                    'local',
            )
        ) {
            throw new Error('Multi-file local edits need a transaction and are unavailable');
        }
        for (const { codeEditor, path, generated } of validated) {
            await codeEditor.writeFile(path, generated);
        }
    }

    private async collectRequests(action: Action): Promise<CodeDiffRequest[]> {
        switch (action.type) {
            case 'update-style':
                return await getStyleRequests(action, (target) =>
                    this.responsivePrefixFor(target.branchId, target.breakpoint?.minWidth));
            case 'insert-element':
                return await getInsertRequests(action);
            case 'move-element':
                return await getMoveRequests(action);
            case 'remove-element':
                return await getRemoveRequests(action);
            case 'edit-text':
                return await getEditTextRequests(action);
            case 'group-elements':
                return await getGroupRequests(action);
            case 'ungroup-elements':
                return await getUngroupRequests(action);
            case 'insert-image':
                return getInsertImageRequests(action);
            case 'remove-image':
                return getRemoveImageRequests(action);
            case 'write-code':
                return await getWriteCodeRequests(action);
            case 'add-interaction':
            case 'update-interaction':
            case 'remove-interaction':
                // Interaction writes are handled by InteractionsManager via a
                // dedicated CodeManager path (Phase D). They produce no
                // standard CodeDiffRequest entries.
                return [];
            default:
                assertNever(action);
        }
    }

    async groupRequestByFile(requests: CodeDiffRequest[]): Promise<FileToRequests> {
        const requestByFile: FileToRequests = new Map();

        for (const request of requests) {
            const branchData = this.editorEngine.branches.getBranchDataById(request.branchId);
            const codeEditor = branchData?.codeEditor ?? this.editorEngine.fileSystem;

            const metadata = await codeEditor.getJsxElementMetadata(request.oid);
            if (!metadata) {
                throw new Error(`Metadata not found for oid: ${request.oid}`);
            }
            const fileContent = await codeEditor.readFile(metadata.path);
            if (fileContent instanceof Uint8Array) {
                throw new Error(`File is binary: ${metadata.path}`);
            }
            const path = metadata.path;

            let groupedRequest = requestByFile.get(path);
            groupedRequest ??= { oidToRequest: new Map(), content: fileContent };
            groupedRequest.oidToRequest.set(request.oid, request);
            requestByFile.set(path, groupedRequest);
        }
        return requestByFile;
    }

    /**
     * Persist a responsive style override to source for one `(oid, property)`.
     *
     * `valuesByBreakpoint` is keyed by the user's stable breakpoint id. We
     * resolve each id's `minWidth` from the FramesManager, rebase to mobile-
     * first, and let the existing tailwind/CodeDiffRequest pipeline write the
     * resulting className tokens (`p-4 md:p-2 lg:p-6`) into the JSX source.
     *
     * Static HTML has no Tailwind build step, so reject that path until a
     * CSS source writer can persist its breakpoint rules.
     *
     * The ActionManager owns one cancellable debounce per `(oid, property)`.
     */
    writeResponsiveStyleNow(args: {
        oid: string;
        property: string;
        valuesByBreakpoint: Partial<Record<BreakpointId, string>>;
        removedByBreakpoint?: Partial<Record<BreakpointId, string>>;
    }): Promise<void> {
        if (this.editorEngine.framework === 'static-html') {
            return Promise.reject(new Error('Responsive style editing of static HTML requires a CSS source writer.'));
        }
        return this.undebouncedWriteResponsiveStyle(args);
    }

    private async undebouncedWriteResponsiveStyle({
        oid,
        property,
        valuesByBreakpoint,
        removedByBreakpoint = {},
    }: {
        oid: string;
        property: string;
        valuesByBreakpoint: Partial<Record<BreakpointId, string>>;
        removedByBreakpoint?: Partial<Record<BreakpointId, string>>;
    }): Promise<void> {
        // Resolve breakpoint widths (and active branch) from the canvas.
        const allFrames = this.editorEngine.frames.getAll();
        if (allFrames.length === 0) return;

        const widthById = new Map<string, number>();
        let branchIdForOid: string | null = null;
        for (const f of allFrames) {
            const id = f.frame.breakpoint?.id;
            if (!id) continue;
            if (!widthById.has(id)) widthById.set(id, f.frame.breakpoint.width);
            if (!branchIdForOid && f.selected) branchIdForOid = f.frame.branchId;
        }
        branchIdForOid ??= allFrames[0]!.frame.branchId;
        if (this.editorEngine.branches.getStyleWriterForBranch(branchIdForOid) === 'none') {
            throw new Error('Responsive style editing requires a wired Tailwind v4 App Router stylesheet.');
        }

        // The smallest frame is the unprefixed base, matching the main style
        // write (see responsivePrefixFor). Its width maps to 0 for the rebase.
        const base = this.baseFrameWidth(branchIdForOid);
        const rebaseWidth = (width: number) => (base !== null && width <= base ? 0 : width);
        const entries: BreakpointEntry[] = [];
        for (const [id, value] of Object.entries(valuesByBreakpoint)) {
            if (value === undefined) continue;
            // Skip ids that don't map to a frame breakpoint, but keep
            // ids whose width is legitimately 0 (mobile-first base).
            const minWidth = widthById.get(id);
            if (minWidth === undefined) continue;
            entries.push({ id, minWidth: rebaseWidth(minWidth), value });
        }
        const removals: BreakpointEntry[] = [];
        for (const [id, value] of Object.entries(removedByBreakpoint)) {
            if (value === undefined) continue;
            const minWidth = widthById.get(id);
            if (minWidth === undefined) continue;
            removals.push({ id, minWidth: rebaseWidth(minWidth), value });
        }
        if (entries.length === 0 && removals.length === 0) return;

        const requests = new Map<string, CodeDiffRequest>();
        const request = await getOrCreateCodeDiffRequest(oid, branchIdForOid, requests);
        addResponsiveTailwindToRequest(request, property, entries, removals);

        try {
            await this.writeRequest(Array.from(requests.values()));
            await this.editorEngine.branches.getBranchDataById(branchIdForOid)?.history.noteOwnSourceWrite();
        } catch (error) {
            console.error('writeResponsiveStyle failed', { oid, property, error });
            toast.error("Couldn't save the responsive style", {
                id: 'code-write-error',
                description: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }

    /** Smallest frame width in the branch; edits there are the unprefixed base. */
    private baseFrameWidth(branchId: string): number | null {
        const widths = (this.editorEngine.frames?.getAll() ?? [])
            .filter((f) => f.frame.branchId === branchId)
            .map((f) => f.frame.breakpoint?.width)
            .filter((width): width is number => width !== undefined);
        return widths.length > 0 ? Math.min(...widths) : null;
    }

    /** Tailwind prefix matching the preview's `@media (min-width)` scope. */
    private responsivePrefixFor(branchId: string, minWidth: number | undefined): string {
        if (minWidth === undefined) return '';
        const base = this.baseFrameWidth(branchId);
        if (base === null || minWidth <= base) return '';
        return tailwindPrefixForWidth(minWidth);
    }

    clear() {
        this.detachBeforeUnload();
    }

    async updateElementMetadata({
        oid,
        branchId,
        attributes,
        tagName = null,
        overrideClasses = null,
    }: {
        oid: string;
        branchId: string;
        attributes?: Record<string, string>;
        tagName?: string | null;
        overrideClasses?: boolean | null;
    }) {
        const requests = new Map<string, CodeDiffRequest>();
        const request = await getOrCreateCodeDiffRequest(oid, branchId, requests);

        if (attributes) {
            request.attributes = {
                ...request.attributes,
                ...attributes,
            };
        }
        request.tagName = tagName;
        request.overrideClasses = overrideClasses;

        await this.writeRequest(Array.from(requests.values()));
    }
}
