import type { Doc, Id } from '../_generated/dataModel';

type Role = 'responsible' | 'designer' | 'content' | null;
export type ImportedTextAuthority = {
    preparationId: Id<'cloudEditorImportPreparations'>;
    designRevision: number;
};

/** Provenance is validated by getPreparedImport before deriving this epoch pin. */
export function importedTextAuthority(
    state: Doc<'cloudEditorStates'>,
    preparation: Doc<'cloudEditorImportPreparations'> | null,
): ImportedTextAuthority | null {
    const revision = state.designRevision;
    if (state.profile !== 'imported-next-v1' || state.version !== 1 || !preparation ||
        preparation._id !== state.preparationId || preparation.projectId !== state.projectId ||
        preparation.branchId !== state.branchId || preparation.workspaceId !== state.workspaceId ||
        revision === undefined || !Number.isSafeInteger(revision) || revision < 1 ||
        revision < preparation.preparedRevision || revision > state.revision) return null;
    return { preparationId: preparation._id, designRevision: revision };
}
