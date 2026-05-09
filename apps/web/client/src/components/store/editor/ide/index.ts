import { makeAutoObservable } from 'mobx';

import type { CodeNavigationTarget } from '@weblab/models';
import { EditorMode } from '@weblab/models';

import type { EditorEngine } from '../engine';

/**
 * A request to open a Cmd+K-style inline edit at a navigation target. Set by
 * the canvas (when the user presses Cmd+K on a selected element) and consumed
 * by the code editor once the file is open and CodeMirror has scrolled to the
 * range.
 */
export interface PendingInlineEditRequest {
    /** Pre-fill the prompt with this instruction (empty = blank prompt). */
    instruction?: string;
    /** Monotonic counter — bumped each time so the editor can dedupe. */
    nonce: number;
}

export class IdeManager {
    private _codeNavigationOverride: CodeNavigationTarget | null = null;
    private _pendingInlineEdit: PendingInlineEditRequest | null = null;

    constructor(private readonly editorEngine: EditorEngine) {
        makeAutoObservable(this);
    }

    get codeNavigationOverride() {
        return this._codeNavigationOverride;
    }

    get pendingInlineEdit() {
        return this._pendingInlineEdit;
    }

    /**
     * Open the JSX source for `oid` in the code editor and request an
     * inline-edit prompt at that range as soon as it's mounted.
     */
    async openInlineEditFromCanvas(oid: string, instruction?: string) {
        await this.openCodeBlock(oid);
        if (!this._codeNavigationOverride) return;
        this._pendingInlineEdit = {
            instruction,
            nonce: (this._pendingInlineEdit?.nonce ?? 0) + 1,
        };
    }

    consumePendingInlineEdit() {
        const value = this._pendingInlineEdit;
        this._pendingInlineEdit = null;
        return value;
    }

    async openCodeBlock(oid: string) {
        try {
            // Get the current branch data
            const activeBranchId = this.editorEngine.branches.activeBranch?.id;
            if (!activeBranchId) {
                console.warn('[IdeManager] No active branch found');
                return;
            }

            const branchData = this.editorEngine.branches.getBranchDataById(activeBranchId);
            if (!branchData) {
                console.warn(`[IdeManager] No branch data found for branchId: ${activeBranchId}`);
                return;
            }

            // Get element metadata
            const metadata = await branchData.codeEditor.getJsxElementMetadata(oid);
            if (!metadata) {
                console.warn(`[IdeManager] No metadata found for OID: ${oid}`);
                return;
            }

            // Create navigation target
            const startLine = metadata.startTag.start.line;
            const startColumn = metadata.startTag.start.column;
            const endTag = metadata.endTag || metadata.startTag;
            const endLine = endTag.end.line;
            const endColumn = endTag.end.column;

            const target: CodeNavigationTarget = {
                filePath: metadata.path,
                range: {
                    start: { line: startLine, column: startColumn },
                    end: { line: endLine, column: endColumn },
                },
            };

            // Set the override to trigger navigation
            this._codeNavigationOverride = target;

            // Switch to code tab
            this.editorEngine.state.setEditorMode(EditorMode.CODE);
        } catch (error) {
            console.error('[IdeManager] Error opening code block:', error);
        }
    }

    clearCodeNavigationOverride() {
        this._codeNavigationOverride = null;
    }

    hasCodeNavigationOverride(): boolean {
        return this._codeNavigationOverride !== null;
    }

    /**
     * Open a file in the code editor without an associated JSX element.
     * Used by the quick-open file finder (cmd+p). The line/col-1 range is
     * a no-op navigation target — sufficient to drive the existing
     * code-tab opener without scrolling to a specific symbol.
     */
    openFile(filePath: string) {
        this._codeNavigationOverride = {
            filePath,
            range: {
                start: { line: 1, column: 1 },
                end: { line: 1, column: 1 },
            },
        };
        this.editorEngine.state.setEditorMode(EditorMode.CODE);
    }
}
