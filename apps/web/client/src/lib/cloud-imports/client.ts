const MAX_IMPORTED_ASSET_BYTES = 32 * 1024 * 1024;
const invalidAsset = () => new Error('CLOUD_IMPORT_ASSET_INVALID');

/** Same-origin authenticated bytes only; the browser never receives a storage URL. */
export async function readImportedAsset(
    scope: { projectId: string; branchId: string },
    file: { path: string; hash: string; bytes: number },
    signal: AbortSignal,
): Promise<Uint8Array> {
    signal.throwIfAborted();
    if (!Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > MAX_IMPORTED_ASSET_BYTES ||
        file.hash.length !== 64 || !/^[a-f0-9]{64}$/.test(file.hash)) throw invalidAsset();
    const query = new URLSearchParams({ projectId: scope.projectId, branchId: scope.branchId,
        path: file.path, expectedHash: file.hash });
    const response = await fetch(`/api/cloud-imports/asset?${query}`, {
        credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal,
    });
    const reader = response.body?.getReader();
    const onAbort = () => { void reader?.cancel(signal.reason).catch(() => {}); };
    signal.addEventListener('abort', onAbort, { once: true });
    let bytes: Uint8Array<ArrayBuffer>;
    try {
        signal.throwIfAborted();
        if (!response.ok) throw new Error('CLOUD_IMPORT_ASSET_UNAVAILABLE');
        const contentLength = response.headers.get('content-length');
        if (contentLength !== null && (!/^(?:0|[1-9][0-9]*)$/.test(contentLength) || Number(contentLength) !== file.bytes)) throw invalidAsset();
        if (!reader && file.bytes !== 0) throw invalidAsset();
        bytes = new Uint8Array(file.bytes);
        let received = 0;
        if (reader) {
            while (true) {
                const part = await reader.read();
                signal.throwIfAborted();
                if (part.done) break;
                if (part.value.byteLength > file.bytes - received) throw invalidAsset();
                bytes.set(part.value, received);
                received += part.value.byteLength;
            }
        }
        if (received !== file.bytes) throw invalidAsset();
    } finally {
        signal.removeEventListener('abort', onAbort);
        await reader?.cancel().catch(() => {});
    }
    signal.throwIfAborted();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    signal.throwIfAborted();
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    if (hash !== file.hash) throw invalidAsset();
    return bytes;
}
