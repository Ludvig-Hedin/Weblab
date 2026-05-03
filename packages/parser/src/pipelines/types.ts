import type { TemplateNode } from '@weblab/models';
import type { CodeDiffRequest } from '@weblab/models/code';

/**
 * Identifier for an editor pipeline. Mirrors `EditorPipelineId` in
 * `@weblab/framework`. Adapters in the framework registry declare which
 * pipelines apply to their project shape; this module provides the
 * implementations.
 */
export type EditorPipelineId = 'jsx' | 'html' | 'astro';

/**
 * Result of injecting source-tracking ids (data-oid attrs in JSX, similar
 * attrs in HTML). `modified` indicates whether the AST was mutated and
 * therefore needs to be written back to disk.
 */
export interface OidInjectionResult<TAst> {
    ast: TAst;
    modified: boolean;
}

/**
 * Pluggable parser/editor strategy for a given source language. The JSX
 * pipeline uses Babel; the HTML pipeline (Phase 4) uses parse5; the Astro
 * pipeline (Phase 6) wraps both for `.astro` files.
 *
 * The interface is generic over `TAst` so each pipeline keeps its native
 * AST type internally. Callers route to a pipeline via {@link selectPipeline}
 * and never inspect the AST directly across pipeline boundaries.
 */
export interface EditorPipeline<TAst = unknown> {
    readonly id: EditorPipelineId;
    /** Test against a project-relative path to decide whether this pipeline applies. */
    readonly fileMatcher: RegExp;

    /** Parse source text to an AST. Returns null on parse failure. */
    parse(content: string): TAst | null;

    /**
     * Inject or refresh source-tracking ids (e.g. `data-oid`) so that DOM
     * elements rendered from this AST can be mapped back to source positions.
     */
    injectOids(
        ast: TAst,
        options?: {
            globalOids?: Set<string>;
            branchOidMap?: Map<string, string>;
            currentBranchId?: string;
        },
    ): OidInjectionResult<TAst>;

    /**
     * Build a map from oid → TemplateNode (file path + start/end positions)
     * so element clicks in the preview iframe can resolve back to source.
     */
    buildTemplateNodeMap(args: {
        ast: TAst;
        filename: string;
        branchId: string;
    }): Map<string, TemplateNode>;

    /**
     * Apply a batch of edits keyed by oid. Mutates the AST in place; the
     * caller is responsible for serializing via {@link generate}.
     */
    applyEdits(ast: TAst, edits: Map<string, CodeDiffRequest>): void | Promise<void>;

    /** Serialize an AST back to source. */
    generate(ast: TAst, originalContent: string): string | Promise<string>;
}
