import { imageHash, imageMetadataProof, MAX_CLOUD_IMAGE_INPUT, MAX_CLOUD_IMAGE_BYTES, CLOUD_IMAGE_PIXELS } from '@convex/lib/cloudContentImage';
import type * as Images from '@convex/cloudEditorContentImages';
import type * as Actions from '@convex/cloudEditorContentImageActions';
import type { ApiFromModules, FunctionArgs, FunctionReturnType } from 'convex/server';
import { validCloudImageApproval } from '@/components/store/editor/sandbox/cloud-image-approval';
import { importSessionToken, type ImportSessionVerifier } from '@/lib/cloud-imports/auth';
import { imageUploadOriginAllowed } from './origin';

type API = ApiFromModules<{ images: typeof Images; actions: typeof Actions }>;
export type ImageUploadTargetV2 = FunctionArgs<API['images']['reserveV2']>;
export type ImageInspectionTargetV2 = Omit<FunctionArgs<API['images']['_inspectionAssetV2']>, 'secret'>;
type Prepared = FunctionReturnType<API['actions']['prepareV2']>;
type AttemptId = FunctionReturnType<API['images']['reserveV2']>;
type Asset = FunctionReturnType<API['images']['_inspectionAssetV2']>;
type Dimensions = { width: number; height: number };
type Common = {
    siteUrl: string; secret?: string;
    verify: ImportSessionVerifier;
    timer?: (callback: () => void, milliseconds: number) => () => void;
};
export type ImageUploadDependenciesV2 = Common & {
    reserve: (args: ImageUploadTargetV2, token: string) => Promise<AttemptId>;
    prepare: (args: FunctionArgs<API['actions']['prepareV2']>, token: string) => Promise<Prepared>;
    cancel: (args: FunctionArgs<API['images']['cancelPreparationV2']>, token: string) => Promise<unknown>;
    decode: (input: Buffer, limits: { maxBytes: number; maxPixels: number }) => Promise<Dimensions & { bytes: Buffer }>;
};
export type ImageInspectionDependenciesV2 = Common & {
    convexUrl?: string;
    asset: (args: FunctionArgs<API['images']['_inspectionAssetV2']>, token: string) => Promise<Asset>;
    inspect: (input: Buffer) => Promise<Dimensions>;
    fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
};

const MAX_ORIGINAL = 32 * 1024 * 1024;
const MAX_TARGET = 32 * 1024;
const TIMEOUT = 25_000;
const privateHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" };
// Shared across upload and inspection. A timed-out native decode retains its slot until it settles.
let receiving = 0;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const keys = (value: unknown, names: string): value is Record<string, unknown> => object(value) && Object.keys(value).sort().join(',') === names;
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[^A-Za-z0-9_:-]/.test(value);
const hash = (value: unknown): value is string => typeof value === 'string' && value.length === 64 && !/[^a-f0-9]/.test(value);
const positive = (value: unknown, max = Number.MAX_SAFE_INTEGER): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= max;
function failure(status = 400) { return Response.json({ error: 'CLOUD_IMAGE_UPLOAD_FAILED' }, { status, headers: privateHeaders }); }
function mime(request: Request, expected: string) { return request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() === expected; }
function uploadTarget(value: unknown): value is ImageUploadTargetV2 {
    if (!keys(value, 'actorId,branchId,expectedRevision,operationId,pin,projectId') ||
        ![value.projectId, value.branchId, value.actorId].every(id) || !positive(value.expectedRevision) ||
        typeof value.operationId !== 'string' || value.operationId.length < 16 || value.operationId.length > 80 || /[^A-Za-z0-9_-]/.test(value.operationId) ||
        !keys(value.pin, 'binding,designRevision,fingerprint,generation,path,version')) return false;
    return validCloudImageApproval({ ...value.pin, projectId: value.projectId, branchId: value.branchId, actorId: value.actorId });
}
function inspectionTarget(value: unknown): value is ImageInspectionTargetV2 {
    if (!keys(value, 'actorId,branchId,expectedHash,expectedRevision,path,projectId') ||
        ![value.projectId, value.branchId, value.actorId].every(id) || !positive(value.expectedRevision) || !hash(value.expectedHash) ||
        typeof value.path !== 'string' || value.path.length > 240 || !value.path.startsWith('public/') ||
        !/\.(?:png|jpe?g|webp)$/i.test(value.path) || /[\\\s\u0000-\u0020\u007f?#%]/.test(value.path) ||
        !value.path.split('/').every(part => part.length > 0 && !part.startsWith('.'))) return false;
    // Reject lone surrogates before any lookup or signing.
    return Buffer.from(value.path).toString('utf8') === value.path;
}

/** Cookie sessions cannot replace the initiating browser's explicitly supplied bearer. */
export async function imageBearerToken(request: Request, siteUrl: string, verify: ImportSessionVerifier) {
    const authorization = request.headers.get('authorization');
    if (!authorization || authorization.length > 8192 || !authorization.startsWith('Bearer ') ||
        authorization.length <= 7 || /[^A-Za-z0-9._~-]/.test(authorization.slice(7))) return null;
    const headers = new Headers({ authorization });
    for (const name of ['origin', 'sec-fetch-dest']) {
        const value = request.headers.get(name); if (value !== null) headers.set(name, value);
    }
    try { return await importSessionToken(new Request(request.url, { method: 'HEAD', headers }), siteUrl, verify); }
    catch { return null; }
}
function timer(callback: () => void, milliseconds: number) {
    const handle = setTimeout(callback, milliseconds); handle.unref?.(); return () => clearTimeout(handle);
}
function guarded<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) { void promise.catch(() => {}); return Promise.reject(new Error('Image request aborted')); }
    return new Promise((resolve, reject) => {
        const abort = () => reject(new Error('Image request aborted'));
        signal.addEventListener('abort', abort, { once: true });
        promise.then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => {
            signal.removeEventListener('abort', abort); reject(error);
        });
    });
}
function deadline(request: Request, deps: Common, milliseconds = TIMEOUT) {
    const controller = new AbortController(), abort = () => controller.abort();
    const clear = (deps.timer ?? timer)(abort, milliseconds);
    request.signal.addEventListener('abort', abort, { once: true }); if (request.signal.aborted) abort();
    return { signal: controller.signal, close: () => { abort(); clear(); request.signal.removeEventListener('abort', abort); } };
}
function length(response: Request | Response, limit: number, exact?: number) {
    const raw = response.headers.get('content-length'); if (raw === null) return;
    if (!raw.length || /[^0-9]/.test(raw) || (raw.length > 1 && raw[0] === '0') || !positive(Number(raw), limit) ||
        (exact !== undefined && Number(raw) !== exact)) throw new Error('Invalid image length');
}
async function read(response: Request | Response, limit: number, signal: AbortSignal, exact = false): Promise<Buffer> {
    length(response, limit, exact ? limit : undefined);
    if (!response.body) throw new Error('Missing image body');
    const reader = response.body.getReader(), output = Buffer.alloc(limit); let offset = 0;
    const abort = () => { void reader.cancel().catch(() => {}); };
    signal.addEventListener('abort', abort, { once: true });
    try {
        while (true) {
            const chunk = await guarded(reader.read(), signal); if (chunk.done) break;
            if (!(chunk.value instanceof Uint8Array) || offset + chunk.value.length > limit) throw new Error('Image body too large');
            output.set(chunk.value, offset); offset += chunk.value.length;
        }
        if (!offset || (exact && offset !== limit)) throw new Error('Invalid image body');
        return output.subarray(0, offset);
    } finally { signal.removeEventListener('abort', abort); void reader.cancel().catch(() => {}); reader.releaseLock(); }
}
function storageUrl(value: string, configured: string | undefined) {
    if (!configured) throw new Error('Missing backend');
    const backend = new URL(configured), url = new URL(value);
    if (backend.protocol !== 'https:' || !/^[a-z0-9-]+\.convex\.cloud$/.test(backend.hostname) || backend.port ||
        backend.username || backend.password || backend.pathname !== '/' || backend.search || backend.hash ||
        url.origin !== backend.origin || url.username || url.password || url.hash ||
        !url.pathname.startsWith('/api/storage/') || !id(url.pathname.slice('/api/storage/'.length)) ||
        /[^A-Za-z0-9_-]/.test(url.pathname.slice('/api/storage/'.length))) throw new Error('Invalid storage origin');
    return url.href;
}
function dimensions(value: Dimensions) {
    if (!positive(value.width, 8192) || !positive(value.height, 8192) || value.width * value.height > CLOUD_IMAGE_PIXELS) throw new Error('Invalid image dimensions');
}
function admitted(request: Request, deps: Common, contentType: string) {
    if (!imageUploadOriginAllowed(request, deps.siteUrl)) return failure(403);
    if (!deps.secret || deps.secret.length < 32) return failure(503);
    if (request.method !== 'POST' || request.headers.get('x-weblab-image-protocol') !== '2' || !mime(request, contentType)) return failure();
    if (receiving >= 2) return failure(429);
    return null;
}

export function createImageUploadV2Handler(deps: ImageUploadDependenciesV2) {
    return async (request: Request): Promise<Response> => {
        const refused = admitted(request, deps, 'application/octet-stream'); if (refused) return refused;
        let target: ImageUploadTargetV2;
        try {
            const raw = request.headers.get('x-weblab-image-target');
            if (!raw || Buffer.byteLength(raw) > MAX_TARGET) return failure();
            const parsed: unknown = JSON.parse(raw); if (!uploadTarget(parsed)) return failure(); target = parsed;
            length(request, MAX_CLOUD_IMAGE_INPUT);
        } catch { return failure(); }
        receiving++;
        const work = deadline(request, deps);
        let token: string | null = null, attemptId: AttemptId | undefined, decoder: Promise<unknown> | undefined;
        const cancel = async (pending: AttemptId, capturedToken: string) => {
            const cleanup = deadline(new Request('https://cleanup.invalid'), deps, 3_000);
            try { await guarded(deps.cancel({ attemptId: pending, actorId: target.actorId }, capturedToken), cleanup.signal); }
            catch { /* The existing attempt expiry retains cleanup ownership. */ }
            finally { cleanup.close(); }
        };
        try {
            token = await guarded(imageBearerToken(request, deps.siteUrl, deps.verify), work.signal);
            if (!token) return failure(401);
            const capturedToken = token;
            attemptId = await guarded(deps.reserve(target, capturedToken).then(pending => {
                // A late reserve still belongs to the original actor and session.
                if (work.signal.aborted) void cancel(pending, capturedToken); return pending;
            }), work.signal);
            if (!id(attemptId)) throw new Error('Invalid attempt');
            const input = await read(request, MAX_CLOUD_IMAGE_INPUT, work.signal);
            const decoding = deps.decode(input, { maxBytes: MAX_CLOUD_IMAGE_BYTES, maxPixels: CLOUD_IMAGE_PIXELS }); decoder = decoding;
            const normalized = await guarded(decoding, work.signal);
            dimensions(normalized);
            if (!Buffer.isBuffer(normalized.bytes) || !positive(normalized.bytes.length, MAX_CLOUD_IMAGE_BYTES)) throw new Error('Invalid normalized image');
            if (normalized.width * target.pin.binding.aspectRatio.height !== normalized.height * target.pin.binding.aspectRatio.width) throw new Error('Image ratio mismatch');
            const hash = imageHash(normalized.bytes), { width, height } = normalized;
            const proof = imageMetadataProof(deps.secret!, { kind: 'upload', attemptId, hash, bytes: normalized.bytes.length, width, height });
            const prepared = await guarded(deps.prepare({ attemptId, actorId: target.actorId, bytes: Uint8Array.from(normalized.bytes).buffer, width, height, proof }, capturedToken), work.signal);
            if (prepared.attemptId !== attemptId || prepared.hash !== hash || prepared.assetPath !== `public/weblab-upload-${hash}.webp` ||
                prepared.width !== width || prepared.height !== height) throw new Error('Invalid preparation');
            return Response.json({ attemptId, assetPath: prepared.assetPath, hash, width, height, bytes: normalized.bytes.toString('base64') }, { headers: privateHeaders });
        } catch {
            if (attemptId && token) await cancel(attemptId, token);
            return failure();
        } finally {
            work.close(); const release = () => { receiving--; };
            if (decoder) void decoder.then(release, release); else release();
        }
    };
}

export function createImageInspectionV2Handler(deps: ImageInspectionDependenciesV2) {
    return async (request: Request): Promise<Response> => {
        const refused = admitted(request, deps, 'application/json'); if (refused) return refused;
        if (!deps.convexUrl) return failure(503);
        receiving++;
        const work = deadline(request, deps); let decoder: Promise<unknown> | undefined;
        try {
            const token = await guarded(imageBearerToken(request, deps.siteUrl, deps.verify), work.signal);
            if (!token) return failure(401);
            const parsed: unknown = JSON.parse((await read(request, 2048, work.signal)).toString('utf8'));
            if (!inspectionTarget(parsed)) return failure();
            const target = { ...parsed, secret: deps.secret! };
            const initial = await guarded(deps.asset(target, token), work.signal);
            if (!positive(initial.bytes, MAX_ORIGINAL) || initial.hash !== parsed.expectedHash) throw new Error('Invalid saved image');
            const response = await guarded((deps.fetch ?? fetch)(storageUrl(initial.url, deps.convexUrl), {
                method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store', signal: work.signal,
            }), work.signal);
            if (!response.ok || response.redirected) { void response.body?.cancel().catch(() => {}); throw new Error('Image unavailable'); }
            const bytes = await read(response, initial.bytes, work.signal, true);
            if (imageHash(bytes) !== initial.hash) throw new Error('Saved image changed');
            const decoding = deps.inspect(bytes); decoder = decoding;
            const size = await guarded(decoding, work.signal); dimensions(size);
            const current = await guarded(deps.asset(target, token), work.signal);
            if (current.url !== initial.url || current.hash !== initial.hash || current.bytes !== initial.bytes) throw new Error('Saved image changed');
            const facts = { path: parsed.path, hash: initial.hash, bytes: initial.bytes, width: size.width, height: size.height };
            const proof = imageMetadataProof(deps.secret!, { kind: 'approval', projectId: parsed.projectId, branchId: parsed.branchId,
                actorId: parsed.actorId, revision: parsed.expectedRevision, ...facts });
            return Response.json({ ...facts, proof }, { headers: privateHeaders });
        } catch { return failure(); }
        finally {
            work.close(); const release = () => { receiving--; };
            if (decoder) void decoder.then(release, release); else release();
        }
    };
}
