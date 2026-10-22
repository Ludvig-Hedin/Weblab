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

/** Callers must separately establish current project access. */
export function canUseImportedText(role: Role, authority: ImportedTextAuthority | null): boolean {
    return role !== null && authority !== null &&
        process.env.WEBLAB_CLOUD_EDITOR_ENABLED === 'true' &&
        process.env.WEBLAB_CLOUD_IMPORTED_CONTENT_ENABLED === 'true';
}

export function canReadImportedSource(role: Role, update: boolean, authority: ImportedTextAuthority | null): boolean {
    return ((role === 'responsible' || role === 'designer') && update) || canUseImportedText(role, authority);
}

/** Image edits retain the separate imported text/content prerequisite. */
export function canUseImportedImages(role: Role, authority: ImportedTextAuthority | null): boolean {
    return canUseImportedText(role, authority) && process.env.WEBLAB_CLOUD_IMPORTED_IMAGES_ENABLED === 'true';
}

/** Pages/blocks retain the separate imported text/content prerequisite. */
export function canUseImportedStudio(role: Role, authority: ImportedTextAuthority | null): boolean {
    return canUseImportedText(role, authority) && process.env.WEBLAB_CLOUD_IMPORTED_STUDIO_ENABLED === 'true';
}

/** Explicit approved property choices retain the imported content prerequisite. */
export function canUseImportedProperties(role: Role, authority: ImportedTextAuthority | null): boolean {
    return canUseImportedText(role, authority) && process.env.WEBLAB_CLOUD_IMPORTED_PROPERTIES_ENABLED === 'true';
}
