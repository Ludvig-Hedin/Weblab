import type { FunctionArgs } from 'convex/server';
import type { cloudEditorApi } from '@/lib/cloud-editor/api';
import type { CloudImagePrepared, CloudImagePrepareTarget } from '@/components/store/editor/sandbox/cloud-source';
import { freezeCloudImageApproval, validCloudImageApproval, validCloudImageValue } from '@/components/store/editor/sandbox/cloud-image-approval';
import type { CloudImageApproval } from '@weblab/models/actions';

export type ImageInspectionTarget = Pick<CloudImagePrepareTarget, 'projectId' | 'branchId' | 'actorId' | 'expectedRevision'> & { path: string; expectedHash: string };
type Inspection = FunctionArgs<typeof cloudEditorApi.approveImage>['inspection'];
type Options = { session: { getToken: () => Promise<string | null> }; current: () => boolean; signal: AbortSignal;
    fetch?: (input: string, init: RequestInit) => Promise<Response> };
const keys = (value: unknown, expected: string): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === expected;
const hash = (value: unknown): value is string => typeof value === 'string' && value.length === 64 && !/[^a-f0-9]/.test(value);
const positive = (value: unknown, max: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= max;
const dimensions = (value: Record<string, unknown>) => positive(value.width, 8192) && positive(value.height, 8192) && value.width * value.height <= 16_000_000;

export type ImportedImageDraft = { pin: CloudImageApproval; value: string; previous: string; revision: number };
export type ImageDraftIdentity = { projectId: string; branchId: string; actorId: string; mappingId: string; oid: string };
/** Draft storage can recover text for copying. It never resolves a live selection or proves permission. */
export function readImportedImageDraft(raw: string, identity: ImageDraftIdentity): ImportedImageDraft {
    if (raw.length > 50_000) throw new Error('Invalid image draft');
    const value: unknown = JSON.parse(raw);
    if (!keys(value, 'pin,previous,revision,value') || !validCloudImageApproval(value.pin) || !value.pin.binding.fields.includes('alt') ||
        value.pin.projectId !== identity.projectId || value.pin.branchId !== identity.branchId || value.pin.actorId !== identity.actorId ||
        value.pin.binding.renderMapping.mappingId !== identity.mappingId || value.pin.binding.renderMapping.renderer.oid !== identity.oid ||
        !positive(value.revision, Number.MAX_SAFE_INTEGER) ||
        !validCloudImageValue({ src: value.pin.binding.originalAsset.path.slice('public'.length), alt: value.value }) ||
        !validCloudImageValue({ src: value.pin.binding.originalAsset.path.slice('public'.length), alt: value.previous })) throw new Error('Invalid image draft');
    return { pin: freezeCloudImageApproval(value.pin), revision: value.revision, value: value.value as string, previous: value.previous as string };
}

/** The session object is captured at the click, never replaced with the currently signed-in account. */
export class ImportedImageClient {
    constructor(private readonly options: Options) {}
    private guard(current: () => boolean) {
        if (this.options.signal.aborted || !this.options.current() || !current()) throw new Error('CLOUD_IMAGE_SELECTION_CHANGED');
    }
    private async request(path: string, body: BodyInit, headers: Record<string, string>, maxBytes: number, current: () => boolean) {
        this.guard(current);
        const token = await this.options.session.getToken(); this.guard(current);
        if (!token) throw new Error('CLOUD_IMAGE_SESSION_CHANGED');
        const response = await (this.options.fetch ?? fetch)(path, { method: 'POST', body, credentials: 'omit', redirect: 'error',
            cache: 'no-store', signal: this.options.signal, headers: { ...headers, authorization: `Bearer ${token}`, 'x-weblab-image-protocol': '2' } });
        try { this.guard(current); } catch (error) { void response.body?.cancel().catch(() => {}); throw error; }
        if (!response.ok || response.redirected || !response.body) { void response.body?.cancel().catch(() => {}); throw new Error('CLOUD_IMAGE_REQUEST_FAILED'); }
        const length = response.headers.get('content-length');
        if (length !== null && (!length.length || /[^0-9]/.test(length) || !positive(Number(length), maxBytes))) {
            void response.body.cancel().catch(() => {}); throw new Error('CLOUD_IMAGE_RESPONSE_INVALID');
        }
        const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
        const abort = () => { void reader.cancel().catch(() => {}); };
        this.options.signal.addEventListener('abort', abort, { once: true });
        try {
            while (true) {
                this.guard(current); const part = await reader.read(); this.guard(current);
                if (part.done) break;
                size += part.value.byteLength; if (size > maxBytes) throw new Error('CLOUD_IMAGE_RESPONSE_INVALID'); chunks.push(part.value);
            }
        } finally { this.options.signal.removeEventListener('abort', abort); void reader.cancel().catch(() => {}); reader.releaseLock(); }
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        const result: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); this.guard(current); return result;
    }
    async inspect(target: ImageInspectionTarget, expectedBytes: number): Promise<Inspection> {
        const result = await this.request('/api/cloud-editor/images/inspect', JSON.stringify(target), { 'content-type': 'application/json' }, 2048, () => true);
        this.guard(() => true);
        if (!keys(result, 'bytes,hash,height,path,proof,width') || result.path !== target.path || result.hash !== target.expectedHash ||
            !hash(result.hash) || !hash(result.proof) || result.bytes !== expectedBytes || !positive(result.bytes, 32 * 1024 * 1024) || !dimensions(result)) throw new Error('CLOUD_IMAGE_RESPONSE_INVALID');
        return result as Inspection;
    }
    async prepare(target: CloudImagePrepareTarget, file: File, current: () => boolean): Promise<CloudImagePrepared> {
        this.guard(current);
        if (!validCloudImageApproval({ ...target.pin, projectId: target.projectId, branchId: target.branchId, actorId: target.actorId }) ||
            !positive(file.size, 4_000_000) || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('CLOUD_IMAGE_INPUT_INVALID');
        const result = await this.request('/api/cloud-editor/images', file, { 'content-type': 'application/octet-stream',
            'x-weblab-image-target': JSON.stringify(target) }, 805_000, current);
        this.guard(current);
        if (!keys(result, 'assetPath,attemptId,bytes,hash,height,width') || typeof result.attemptId !== 'string' || !result.attemptId.length || result.attemptId.length > 128 ||
            /[^A-Za-z0-9_:-]/.test(result.attemptId) || !hash(result.hash) || result.assetPath !== `public/weblab-upload-${result.hash}.webp` || !dimensions(result) ||
            (result.width as number) * target.pin.binding.aspectRatio.height !== (result.height as number) * target.pin.binding.aspectRatio.width ||
            typeof result.bytes !== 'string' || !result.bytes.length || result.bytes.length > 800_000 || /[^A-Za-z0-9+/=]/.test(result.bytes)) throw new Error('CLOUD_IMAGE_RESPONSE_INVALID');
        const raw = atob(result.bytes);
        if (btoa(raw) !== result.bytes || !positive(raw.length, 600_000)) throw new Error('CLOUD_IMAGE_RESPONSE_INVALID');
        const bytes = Uint8Array.from(raw, char => char.charCodeAt(0));
        this.guard(current); const digest = await crypto.subtle.digest('SHA-256', bytes); this.guard(current);
        if (Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') !== result.hash) throw new Error('CLOUD_IMAGE_RESPONSE_INVALID');
        return { attemptId: result.attemptId as CloudImagePrepared['attemptId'], assetPath: result.assetPath, hash: result.hash, bytes };
    }
}
