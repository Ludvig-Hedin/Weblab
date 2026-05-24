// Post-migration: Supabase Storage replaced by Convex File Storage. This
// shim keeps the import path alive so unmigrated call sites don't break.
// Returns null for legacy Supabase paths.
//
// New code MUST use `useQuery(api.storage.getFileUrl, { storageId })` from
// `convex/react` instead.

// One-shot warn so legacy traffic that still hits this stub surfaces in
// logs without spamming the console. Once the warning has fired we know
// the shim is still load-bearing; if it never fires across a release we
// can drop the shim and the four call-site imports together.
let warnedLegacyPath = false;
function warnLegacyOnce(fn: string): void {
    if (warnedLegacyPath) return;
    warnedLegacyPath = true;
    console.warn(
        `[utils/supabase/client] ${fn} called — legacy Supabase Storage path is no longer backed. ` +
            'Migrate the caller to Convex File Storage (api.storage.*). Returns null.',
    );
}

export function createClient() {
    throw new Error('[utils/supabase/client] Supabase removed. Use Convex hooks directly.');
}

export const getFileUrlFromStorage = (_bucket: string, _path: string): string | null => {
    warnLegacyOnce('getFileUrlFromStorage');
    return null;
};

export const getFileInfoFromStorage = async (_bucket: string, _path: string): Promise<null> => {
    warnLegacyOnce('getFileInfoFromStorage');
    return null;
};

export const uploadBlobToStorage = async (
    _bucket: string,
    _path: string,
    _file: Blob,
    _options?: { upsert?: boolean; contentType?: string; cacheControl?: string },
): Promise<null> => {
    warnLegacyOnce('uploadBlobToStorage');
    return null;
};
