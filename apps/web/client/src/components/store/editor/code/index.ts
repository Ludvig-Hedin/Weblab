import { makeAutoObservable } from 'mobx';

import type { BreakpointId } from '@weblab/models';
import type { BreakpointEntry } from '@weblab/parser';
import { type Action, type CodeDiffRequest, type FileToRequests } from '@weblab/models';
import { getAstFromContent, selectPipeline } from '@weblab/parser';
import { toast } from '@weblab/ui/sonner';
import { assertNever } from '@weblab/utility';

import { type EditorEngine } from '@/components/store/editor/engine';
import { keyedDebounce } from '@/utils/keyed-debounce';
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
import { addResponsiveTailwindToRequest } from './tailwind';

export class CodeManager {
    constructor(private editorEngine: EditorEngine) {
        // Exclude `writeResponsiveStyle`: it's a function-valued field holding a
        // keyed debounce with a `.cancel` helper. makeAutoObservable would wrap
        // it as an action and strip `.cancel` (the same trap as `saveCanvas`),
        // making `clear()`'s teardown-cancel a silent no-op.
        makeAutoObservable(this, { writeResponsiveStyle: false });
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

    private beforeUnloadHandler: ((e: BeforeUnloadEvent) => void) | null = null;

    private attachBeforeUnload() {
        if (typeof window === 'undefined') return;
        if (this.beforeUnloadHandler) return;
        const handler = (e: BeforeUnloadEvent) => {
            // Fire any debounced source rebases NOW so they at least enqueue
            // before the page goes away (best effort — unload won't await).
            this.editorEngine.action.flushPendingRebases();
            if (!this.hasPendingWrites) return;
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
            // TODO: This is a hack to write code, we should refactor this
            if (action.type === 'write-code') {
                if (action.diffs.length === 0) {
                    throw new Error('write-code action has no diffs');
                }
                // Write-code actions don't have branch context, use active
                // editor. Apply EVERY diff — reverseWriteCodeAction reverses all
                // of them, so writing only diffs[0] would make the inverse
                // asymmetric (undo restores files the redo never wrote) and
                // silently drop every file after the first on a multi-diff write.
                for (const diff of action.diffs) {
                    await this.editorEngine.fileSystem.writeFile(diff.path, diff.generated);
                }
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
            // Stable id: rapid repeat failures (e.g. arrow-key nudges while the
            // sandbox is broken) update one toast instead of stacking dozens.
            toast.error("Couldn't save this edit", {
                id: 'code-write-error',
                description: error instanceof Error ? error.message : 'Unknown error',
            });
            this.editorEngine.branches.activeError.addCodeApplicationError(
                error instanceof Error ? error.message : 'Unknown error',
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
        this.pendingWrites += 1;
        const run = this.writeChain
            .then(() => this.processWriteRequest(requests))
            .finally(() => {
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
                        `Refusing to write ${diff.path}: generated content does not parse. The edit was not saved — your source file is untouched.`,
                    );
                }
            }

            await branchData.codeEditor.writeFile(diff.path, diff.generated);
        }
    }

    private async collectRequests(action: Action): Promise<CodeDiffRequest[]> {
        switch (action.type) {
            case 'update-style':
                return await getStyleRequests(action);
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
     * For non-Tailwind projects we currently fall back to the iframe-only
     * injection layer (no source write) — extending the writer to a
     * project-level overrides.css is a follow-up the parser modules already
     * have the rebase math for.
     *
     * Debounced per `(oid, property)` (600ms). A previous version used a single
     * shared `lodash.debounce`, so two different keys firing within the window
     * cancelled each other — editing two properties quickly on a non-default
     * breakpoint silently dropped the first property's responsive write. Keying
     * the debounce makes each `(oid, property)` independent. (The action
     * pipeline also debounces per key upstream in `scheduleSourceRebase`; that
     * stays — double-debouncing the same key is harmless, just delayed.)
     */
    writeResponsiveStyle = keyedDebounce(
        (args: {
            oid: string;
            property: string;
            valuesByBreakpoint: Record<BreakpointId, string>;
        }) => void this.undebouncedWriteResponsiveStyle(args),
        600,
        (args) => `${args.oid}::${args.property}`,
    );

    /**
     * Immediate (non-debounced) variant for callers that already debounced
     * upstream — the ActionManager's per-key `scheduleSourceRebase` — and for
     * the beforeunload flush path. `flushPendingRebases` previously routed
     * through the debounced field above, which re-armed a fresh 600ms timer
     * that never fired once the page unloaded, silently dropping the write.
     */
    writeResponsiveStyleNow(args: {
        oid: string;
        property: string;
        valuesByBreakpoint: Record<BreakpointId, string>;
    }): Promise<void> {
        return this.undebouncedWriteResponsiveStyle(args);
    }

    private async undebouncedWriteResponsiveStyle({
        oid,
        property,
        valuesByBreakpoint,
    }: {
        oid: string;
        property: string;
        valuesByBreakpoint: Record<BreakpointId, string>;
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

        const entries: BreakpointEntry[] = [];
        for (const [id, value] of Object.entries(valuesByBreakpoint)) {
            // Skip ids that don't map to a frame breakpoint, but keep
            // ids whose width is legitimately 0 (mobile-first base).
            const minWidth = widthById.get(id);
            if (minWidth === undefined) continue;
            entries.push({ id, minWidth, value });
        }
        if (entries.length === 0) return;

        const requests = new Map<string, CodeDiffRequest>();
        const request = await getOrCreateCodeDiffRequest(oid, branchIdForOid, requests);
        addResponsiveTailwindToRequest(request, property, entries);

        try {
            await this.writeRequest(Array.from(requests.values()));
        } catch (error) {
            console.error('writeResponsiveStyle failed', { oid, property, error });
        }
    }

    clear() {
        // Guard `.cancel()` because the debounced field can be reassigned or
        // shadowed by a subclass / hot-reload boundary, which strips the
        // lodash wrapper and turns this into `undefined.cancel()`.
        if (typeof this.writeResponsiveStyle?.cancel === 'function') {
            this.writeResponsiveStyle.cancel();
        }
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
