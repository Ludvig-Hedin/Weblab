import { createHash } from 'node:crypto';
import { imageUploadOriginAllowed } from '../../app/api/cloud-editor/images/origin';

const MAX_ASSET_BYTES = 32 * 1024 * 1024;
const UPLOAD_TIMEOUT = 90_000;
const ASSET_TIMEOUT = 30_000;
const REAUTHORIZE_AFTER = 5_000;
const idPattern = /^[a-z0-9]{32}$/;
const hashPattern = /^[a-f0-9]{64}$/;
const privateHeaders = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};
type Claim = { nonce: string; url: string; bytes: number; hash: string };
type Receipt = { attemptId: string; fileIndex: number; nonce: string; secret: string };
export type AssetTarget = { projectId: string; branchId: string; path: string; expectedHash: string; secret: string };
export type Asset = { url: string; bytes: number; hash: string };
type CommonDependencies = {
    siteUrl: string; convexUrl?: string; secret?: string;
    authenticate: (request: Request) => Promise<string | null>;
    fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
    now?: () => number;
    // Fixed production deadlines; injection lets tests trigger timers without sleeping.
    timer?: (callback: () => void, milliseconds: number) => () => void;
};
export type UploadDependencies = CommonDependencies & {
    claimUpload: (args: { attemptId: string; fileIndex: number; expectedHash: string; secret: string }, token: string) => Promise<Claim>;
    markSending: (args: Receipt, token: string) => Promise<boolean>;
    recordOwned: (args: Receipt & { storageId: string; actualBytes: number; actualHash: string }) => Promise<{ valid: boolean }>;
    failUpload: (args: Receipt & { outcome: 'not-sent' | 'unknown' }) => Promise<null>;
};
export type AssetDependencies = CommonDependencies & {
    asset: (args: AssetTarget, token: string) => Promise<Asset>;
};

let receiving = 0;
function fault(status = 400) {
    return Response.json({ error: 'CLOUD_IMPORT_TRANSFER_FAILED' }, { status, headers: privateHeaders });
}
function timer(callback: () => void, milliseconds: number) {
    const handle = setTimeout(callback, milliseconds);
    handle.unref?.();
    return () => clearTimeout(handle);
}
function guarded<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) {
        void promise.catch(() => {});
        return Promise.reject(new Error('Transfer aborted'));
    }
    return new Promise((resolve, reject) => {
        const abort = () => { reject(new Error('Transfer aborted')); };
        signal.addEventListener('abort', abort, { once: true });
        promise.then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => {
            signal.removeEventListener('abort', abort); reject(error);
        });
    });
}
function deadline(request: Request, milliseconds: number, deps: CommonDependencies) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    const clear = (deps.timer ?? timer)(abort, milliseconds);
    request.signal.addEventListener('abort', abort, { once: true });
    if (request.signal.aborted) abort();
    return { controller, signal: controller.signal, close: () => { clear(); request.signal.removeEventListener('abort', abort); } };
}
function storageUrl(value: string, configured: string | undefined): string {
    if (!configured) throw new Error('Missing backend');
    const backend = new URL(configured);
    const url = new URL(value);
    if (backend.protocol !== 'https:' || !/^[a-z0-9-]+\.convex\.cloud$/.test(backend.hostname) ||
        backend.username || backend.password || backend.pathname !== '/' || backend.search || backend.hash ||
        url.origin !== backend.origin || url.username || url.password || url.hash ||
        !/^\/api\/storage\/[A-Za-z0-9_-]+$/.test(url.pathname)) throw new Error('Invalid storage origin');
    return url.href;
}
function byteCount(value: number): boolean { return Number.isSafeInteger(value) && value >= 0 && value <= MAX_ASSET_BYTES; }
function contentLength(response: Request | Response, expected?: number) {
    const raw = response.headers.get('content-length');
    if (raw === null) return;
    if (!/^(0|[1-9]\d*)$/.test(raw) || !byteCount(Number(raw)) || (expected !== undefined && Number(raw) !== expected)) throw new Error('Invalid length');
}
async function readBounded(response: Request | Response, limit: number, signal: AbortSignal, exact = false) {
    if (!response.body) throw new Error('Missing body');
    const reader = response.body.getReader();
    const buffer = Buffer.alloc(limit);
    const hash = createHash('sha256');
    let bytes = 0;
    const abort = () => { void reader.cancel().catch(() => {}); };
    signal.addEventListener('abort', abort, { once: true });
    try {
        while (true) {
            const chunk = await guarded(reader.read(), signal);
            if (chunk.done) break;
            if (!(chunk.value instanceof Uint8Array) || bytes + chunk.value.byteLength > limit) throw new Error('Invalid body');
            hash.update(chunk.value); buffer.set(chunk.value, bytes); bytes += chunk.value.byteLength;
        }
        if (exact && bytes !== limit) throw new Error('Invalid body');
        return { body: buffer.subarray(0, bytes), bytes, hash: hash.digest('hex') };
    } finally {
        signal.removeEventListener('abort', abort);
        void reader.cancel().catch(() => {});
        reader.releaseLock();
    }
}

export function createImportUploadHandler(deps: UploadDependencies) {
    return async (request: Request, target: { attemptId: string; fileIndex: string }): Promise<Response> => {
        if (!imageUploadOriginAllowed(request, deps.siteUrl)) return fault(403);
        if (!deps.secret || !hashPattern.test(deps.secret) || !deps.convexUrl) return fault(503);
        const expectedHash = request.headers.get('x-weblab-content-sha256') ?? '';
        if (!idPattern.test(target.attemptId) || !/^(0|[1-9]\d*)$/.test(target.fileIndex) ||
            !Number.isSafeInteger(Number(target.fileIndex)) || Number(target.fileIndex) >= 400 || !hashPattern.test(expectedHash) ||
            request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/octet-stream') return fault();
        let token: string | null;
        try { token = await deps.authenticate(request); } catch { return fault(401); }
        if (!token) return fault(401);
        if (receiving >= 2) return fault(429);
        receiving++;
        const transfer = deadline(request, UPLOAD_TIMEOUT, deps);
        let receipt: Receipt | undefined;
        let sent = false;
        try {
            contentLength(request);
            const claim = await guarded(deps.claimUpload({ attemptId: target.attemptId, fileIndex: Number(target.fileIndex), expectedHash, secret: deps.secret }, token), transfer.signal);
            receipt = { attemptId: target.attemptId, fileIndex: Number(target.fileIndex), nonce: claim.nonce, secret: deps.secret };
            if (!byteCount(claim.bytes) || claim.hash !== expectedHash || !claim.nonce || claim.nonce.length > 200) throw new Error('Invalid claim');
            const url = storageUrl(claim.url, deps.convexUrl);
            contentLength(request, claim.bytes);
            const bytes = await readBounded(request, claim.bytes, transfer.signal, true);
            if (bytes.hash !== claim.hash) throw new Error('Hash mismatch');
            if (!await guarded(deps.markSending(receipt, token), transfer.signal)) throw new Error('Admission changed');
            if (transfer.signal.aborted) throw new Error('Transfer aborted');
            sent = true;
            const response = await (deps.fetch ?? fetch)(url, {
                method: 'POST', body: bytes.body, headers: { 'Content-Type': 'application/octet-stream' },
                credentials: 'omit', redirect: 'error', cache: 'no-store', signal: transfer.signal,
            });
            if (!response.ok || response.redirected) { void response.body?.cancel().catch(() => {}); throw new Error('Upload refused'); }
            const result = JSON.parse((await readBounded(response, 4096, transfer.signal)).body.toString('utf8')) as { storageId?: unknown };
            if (typeof result.storageId !== 'string' || !idPattern.test(result.storageId)) throw new Error('Invalid receipt');
            // Record the server-observed ID even if the user's session was revoked
            // during the send. Retry this idempotent receipt only, never the upload.
            const acknowledgement = deadline(new Request('https://receipt.invalid'), 10_000, deps);
            try {
                let owned: { valid: boolean } | undefined;
                for (let attempt = 0; attempt < 3 && !acknowledgement.signal.aborted; attempt++) {
                    try {
                        owned = await guarded(deps.recordOwned({ ...receipt, storageId: result.storageId, actualBytes: bytes.bytes, actualHash: bytes.hash }), acknowledgement.signal);
                        break;
                    } catch { /* Keep the known ID server-side for this bounded retry. */ }
                }
                if (!owned?.valid) throw new Error('Receipt not accepted');
            } finally { acknowledgement.close(); }
            return Response.json({ received: true }, { headers: privateHeaders });
        } catch {
            if (receipt) {
                const cleanup = deadline(new Request('https://receipt.invalid'), 5_000, deps);
                try { await guarded(deps.failUpload({ ...receipt, outcome: sent ? 'unknown' : 'not-sent' }), cleanup.signal); } catch { /* Backend lease retains uncertainty. */ }
                finally { cleanup.close(); }
            }
            return fault(sent ? 502 : 400);
        } finally {
            transfer.controller.abort(); transfer.close(); receiving--;
        }
    };
}

function assetOriginAllowed(request: Request, siteUrl: string): boolean {
    if (request.headers.has('origin')) return imageUploadOriginAllowed(request, siteUrl);
    if (request.headers.get('sec-fetch-site') !== 'same-origin') return false;
    try {
        // Browser Fetch Metadata establishes the no-Origin GET's context.
        // Validate canonical configuration separately: a reverse proxy may
        // give Next an internal request URL that is not the browser's origin.
        const site = new URL(siteUrl);
        return imageUploadOriginAllowed(new Request(site, { headers: { origin: site.origin } }), siteUrl);
    } catch { return false; }
}
export function createImportAssetHandler(deps: AssetDependencies) {
    return async (request: Request): Promise<Response> => {
        if (!assetOriginAllowed(request, deps.siteUrl)) return fault(403);
        if (!deps.secret || !hashPattern.test(deps.secret) || !deps.convexUrl) return fault(503);
        const query = new URL(request.url).searchParams;
        const projectId = query.get('projectId') ?? ''; const branchId = query.get('branchId') ?? '';
        const path = query.get('path') ?? ''; const expectedHash = query.get('expectedHash') ?? '';
        if ([...query.keys()].some(key => !['projectId', 'branchId', 'path', 'expectedHash'].includes(key)) ||
            ['projectId', 'branchId', 'path', 'expectedHash'].some(key => query.getAll(key).length !== 1) ||
            !idPattern.test(projectId) || !idPattern.test(branchId) || !path || path.length > 240 || !hashPattern.test(expectedHash)) return fault();
        let token: string | null;
        try { token = await deps.authenticate(request); } catch { return fault(401); }
        if (!token) return fault(401);
        const target = { projectId, branchId, path, expectedHash, secret: deps.secret };
        const transfer = deadline(request, ASSET_TIMEOUT, deps);
        const now = deps.now ?? Date.now;
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
        try {
            let authorizedAt = now();
            const initial = await guarded(deps.asset(target, token), transfer.signal);
            if (now() - authorizedAt >= REAUTHORIZE_AFTER) throw new Error('Authorization expired');
            if (!byteCount(initial.bytes) || initial.hash !== expectedHash) throw new Error('Invalid asset');
            const url = storageUrl(initial.url, deps.convexUrl);
            const response = await (deps.fetch ?? fetch)(url, {
                method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store', signal: transfer.signal,
            });
            if (!response.ok || response.redirected || !response.body) { void response.body?.cancel().catch(() => {}); throw new Error('Asset unavailable'); }
            contentLength(response, initial.bytes);
            reader = response.body.getReader();
            const hash = createHash('sha256');
            let bytes = 0;
            let finished = false;
            const abortReader = () => { void reader?.cancel().catch(() => {}); };
            transfer.signal.addEventListener('abort', abortReader, { once: true });
            const close = () => {
                if (finished) return;
                finished = true;
                transfer.signal.removeEventListener('abort', abortReader);
                transfer.controller.abort(); transfer.close();
                void reader?.cancel().catch(() => {});
            };
            const body = new ReadableStream<Uint8Array>({
                async pull(controller) {
                    try {
                        const chunk = await guarded(reader!.read(), transfer.signal);
                        if (chunk.done) {
                            if (bytes !== initial.bytes || hash.digest('hex') !== initial.hash) throw new Error('Asset changed');
                            close(); controller.close(); return;
                        }
                        // Recheck after waiting for bytes, immediately before forwarding.
                        // Bytes already delivered before revocation cannot be withdrawn.
                        if (now() - authorizedAt >= REAUTHORIZE_AFTER) {
                            const checkedAt = now();
                            const current = await guarded(deps.asset(target, token), transfer.signal);
                            if (now() - checkedAt >= REAUTHORIZE_AFTER || current.url !== initial.url || current.bytes !== initial.bytes || current.hash !== initial.hash) throw new Error('Asset changed');
                            authorizedAt = checkedAt;
                        }
                        if (transfer.signal.aborted || !(chunk.value instanceof Uint8Array) || bytes + chunk.value.byteLength > initial.bytes) throw new Error('Asset changed');
                        bytes += chunk.value.byteLength; hash.update(chunk.value);
                        controller.enqueue(chunk.value);
                    } catch {
                        close(); controller.error(new Error('CLOUD_IMPORT_TRANSFER_FAILED'));
                    }
                },
                cancel() { close(); },
            }, { highWaterMark: 0 });
            return new Response(body, { headers: {
                ...privateHeaders, 'Content-Type': 'application/octet-stream', 'Content-Length': String(initial.bytes),
                'X-Weblab-Content-Sha256': initial.hash,
            } });
        } catch {
            void reader?.cancel().catch(() => {});
            transfer.controller.abort(); transfer.close(); return fault();
        }
    };
}
