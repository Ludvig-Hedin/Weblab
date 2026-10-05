/** Legacy CMS rows have revision zero. Unknown revisions cannot be overwritten. */
export function cmsRevision(row: { revision?: number }): number {
    const revision = row.revision ?? 0;
    if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER) {
        throw new Error('CONFLICT: Content revision is unavailable. Reload this item.');
    }
    return revision;
}

export function nextCmsRevision(row: { revision?: number }, expected: number): number {
    const current = cmsRevision(row);
    if (!Number.isSafeInteger(expected) || expected < 0 || expected !== current) {
        throw new Error('CONFLICT: This item changed. Reload it before saving.');
    }
    return current + 1;
}
