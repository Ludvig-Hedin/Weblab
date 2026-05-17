import { debounce } from 'lodash';
import { makeAutoObservable } from 'mobx';

import type { BreakpointId } from '@weblab/models';
import type { BreakpointEntry } from '@weblab/parser';
import { type Action, type CodeDiffRequest, type FileToRequests } from '@weblab/models';
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
import { addResponsiveTailwindToRequest } from './tailwind';

export class CodeManager {
    constructor(private editorEngine: EditorEngine) {
        makeAutoObservable(this);
    }

    async write(action: Action) {
        try {
            // TODO: This is a hack to write code, we should refactor this
            if (action.type === 'write-code' && action.diffs[0]) {
                // Write-code actions don't have branch context, use active editor
                await this.editorEngine.fileSystem.writeFile(
                    action.diffs[0].path,
                    action.diffs[0].generated,
                );
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
        } catch (error) {
            console.error('Error writing requests:', error);
            toast.error('Error writing requests', {
                description: error instanceof Error ? error.message : 'Unknown error',
            });
            this.editorEngine.branches.activeError.addCodeApplicationError(
                error instanceof Error ? error.message : 'Unknown error',
                action,
            );
        }
    }

    async writeRequest(requests: CodeDiffRequest[]) {
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
            const codeEditor = branchData?.codeEditor || this.editorEngine.fileSystem;

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
            if (!groupedRequest) {
                groupedRequest = { oidToRequest: new Map(), content: fileContent };
            }
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
     * Debounced upstream by `ActionManager.scheduleSourceRebase` per
     * `(oid, property)` so a slider drag doesn't thrash files. The 600ms
     * debounce here is a single shared timer — if you call this directly
     * (outside the action pipeline) for two different keys in quick
     * succession, only the last call within the window will fire. The
     * action pipeline is the only high-frequency caller; one-shot callers
     * (alt-click clear) are safe.
     */
    writeResponsiveStyle = debounce(this.undebouncedWriteResponsiveStyle.bind(this), 600);

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
        if (!branchIdForOid) {
            branchIdForOid = allFrames[0]!.frame.branchId;
        }

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
