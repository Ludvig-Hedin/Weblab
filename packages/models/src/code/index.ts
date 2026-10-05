import { type CodeAction } from '../actions/code';

export interface CodeDiffRequest {
    oid: string;
    branchId: string;
    attributes: Record<string, any>;
    tagName: string | null;
    textContent: string | null;
    /**
     * Whole-block text edit runs for this element (see TextSlotEdit). Applied
     * instead of `textContent`: only the listed gaps between element children
     * are rewritten, and only if each still renders `oldText`.
     */
    textSlots?: { index: number; oldText: string; newText: string }[] | null;
    overrideClasses: boolean | null;
    /** Remove only this utility family at exactly this variant scope. */
    classRemovals?: { prefix: string; probeClass: string }[];
    requireClassRemoval?: boolean;
    structureChanges: CodeAction[];
}

export interface CodeDiff {
    original: string;
    generated: string;
    path: string;
}

export type FileToRequests = Map<
    string,
    {
        oidToRequest: Map<string, CodeDiffRequest>;
        content: string;
    }
>;

export interface CodePosition {
    line: number;
    column: number;
}

export interface CodeRange {
    start: CodePosition;
    end: CodePosition;
}

export interface CodeNavigationTarget {
    filePath: string;
    range: CodeRange;
}
