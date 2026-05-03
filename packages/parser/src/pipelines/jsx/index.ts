import type { TemplateNode } from '@weblab/models';
import type { CodeDiffRequest } from '@weblab/models/code';

import type { T } from '../../packages';
import type { EditorPipeline, OidInjectionResult } from '../types';
import { transformAst } from '../../code-edit/transform';
import { addOidsToAst } from '../../ids';
import { getAstFromContent, getContentFromAst } from '../../parse';
import { createTemplateNodeMap } from '../../template-node/map';

/**
 * JSX/TSX editor pipeline. Wraps the existing Babel-based parser and edit
 * functions behind the {@link EditorPipeline} interface. Behavior is
 * intentionally identical to direct callers of `getAstFromContent`,
 * `addOidsToAst`, `createTemplateNodeMap`, `transformAst`, and
 * `getContentFromAst`; this is purely an indirection layer so the HTML
 * pipeline (Phase 4) can plug in alongside it.
 */
export const jsxPipeline: EditorPipeline<T.File> = {
    id: 'jsx',
    /**
     * Mirrors `JSX_FILE_EXTENSIONS` from `@weblab/constants/files`. Kept
     * inline here so the parser package doesn't depend on constants for a
     * single regex; if it ever drifts, update both places.
     */
    fileMatcher: /\.(jsx?|tsx?)$/i,

    parse(content) {
        return getAstFromContent(content);
    },

    injectOids(ast, options): OidInjectionResult<T.File> {
        return addOidsToAst(
            ast,
            options?.globalOids,
            options?.branchOidMap,
            options?.currentBranchId,
        );
    },

    buildTemplateNodeMap({ ast, filename, branchId }): Map<string, TemplateNode> {
        return createTemplateNodeMap({ ast, filename, branchId });
    },

    applyEdits(ast, edits: Map<string, CodeDiffRequest>) {
        transformAst(ast, edits);
    },

    async generate(ast, originalContent) {
        return getContentFromAst(ast, originalContent);
    },
};
