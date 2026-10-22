import type { FunctionArgs, FunctionReturnType } from 'convex/server';
import { ConvexError } from 'convex/values';
import type { Id } from '@convex/_generated/dataModel';
import { importSourcePath, MAX_IMPORT_BYTES, MAX_IMPORT_ASSET_BYTES } from '@convex/lib/cloudImportManifest';
import { MAX_CLOUD_FILES, MAX_CLOUD_TEXT_BYTES } from '@convex/lib/cloudEditor';
import type { cloudImportApi, ImportStatus } from './api';
import { hashImportBytes, safeImportCode, type FolderReview, type ImportFileTuple } from './manifest';

export type ImportOwner = { backend: string; actorId: Id<'users'>; workspaceId: Id<'workspaces'>; sessionId: string; userId: string };
export type ImportRecovery = {
    version: 1; operationKey: string; name: string; manifestHash: string; files: ImportFileTuple[];
    cancelRequested: boolean; rejectedBeforeCreation?: true; attemptId?: Id<'cloudEditorImports'>; projectId?: Id<'projects'>; branchId?: Id<'branches'>;
};
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Endpoint<K extends keyof typeof cloudImportApi> = (args: FunctionArgs<(typeof cloudImportApi)[K]>) => Promise<FunctionReturnType<(typeof cloudImportApi)[K]>>;
export type ImportAdapters = {
    storage: Storage; current: () => boolean; enabled: () => boolean;
    begin: Endpoint<'begin'>; findAttempt: Endpoint<'findAttempt'>; status: Endpoint<'status'>;
    finalize: Endpoint<'finalize'>; cancel: Endpoint<'cancel'>;
    upload: (args: { attemptId: Id<'cloudEditorImports'>; index: number; hash: string; file: File; signal: AbortSignal }) => Promise<void>;
    changed: (state: ImportSessionState) => void; completed: (projectId: Id<'projects'>) => void;
    wait?: (signal: AbortSignal) => Promise<void>;
};
export type ImportSessionState = {
    phase: 'idle' | 'checking' | 'importing' | 'needs-folder' | 'uncertain' | 'canceled' | 'complete' | 'error';
    busy: boolean; recovery: ImportRecovery | null; status: ImportStatus | null; currentPath: string | null; error: string | null;
};
const invalid = () => new Error('CLOUD_IMPORT_RECOVERY_INVALID');
const identifier = (value: unknown): value is string => typeof value === 'string' && value.length >= 16 && value.length <= 80 && !/[^A-Za-z0-9_-]/.test(value);
const hash = (value: unknown): value is string => typeof value === 'string' && value.length === 64 && !/[^a-f0-9]/.test(value);
const opaqueId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\s\u0000-\u001f]/.test(value);
export function importRecoveryKey(owner: ImportOwner): string {
    return `weblab.cloud-import.v1:${JSON.stringify([owner.backend, owner.actorId, owner.workspaceId])}`;
}
/** Only tuple metadata can survive reload. Stored source text, tokens and unknown fields are refused. */
export async function readImportRecovery(raw: string): Promise<ImportRecovery> {
    if (raw.length > 180_000) throw invalid();
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
    const r = value as ImportRecovery;
    if (Object.keys(r).some(key => !['version', 'operationKey', 'name', 'manifestHash', 'files', 'cancelRequested', 'rejectedBeforeCreation', 'attemptId', 'projectId', 'branchId'].includes(key))
        || r.version !== 1 || !identifier(r.operationKey) || typeof r.name !== 'string' || !r.name || r.name !== r.name.trim() || r.name.length > 80
        || !hash(r.manifestHash) || typeof r.cancelRequested !== 'boolean' || !Array.isArray(r.files) || !r.files.length || r.files.length > MAX_CLOUD_FILES
        || (r.attemptId !== undefined && !opaqueId(r.attemptId)) || (r.projectId !== undefined && !opaqueId(r.projectId))
        || (r.branchId !== undefined && !opaqueId(r.branchId)) || (!!r.projectId !== !!r.branchId) || (r.projectId && !r.attemptId)
        || (r.rejectedBeforeCreation !== undefined && r.rejectedBeforeCreation !== true) || (r.rejectedBeforeCreation && r.attemptId)) throw invalid();
    let bytes = 0, previous = ''; const paths = new Set<string>();
    for (const file of r.files) {
        if (!file || typeof file !== 'object' || Object.keys(file).some(key => !['path', 'kind', 'bytes', 'hash'].includes(key))
            || typeof file.path !== 'string' || file.path <= previous || !['text', 'binary'].includes(file.kind)
            || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > (file.kind === 'text' ? MAX_CLOUD_TEXT_BYTES : MAX_IMPORT_ASSET_BYTES)
            || !hash(file.hash)) throw invalid();
        importSourcePath(file.path); previous = file.path; paths.add(file.path); bytes += file.bytes;
    }
    if (bytes > MAX_IMPORT_BYTES) throw invalid();
    for (const path of paths) for (let index = path.lastIndexOf('/'); index > 0; index = path.lastIndexOf('/', index - 1)) if (paths.has(path.slice(0, index))) throw invalid();
    const digest = await hashImportBytes(new TextEncoder().encode(JSON.stringify(r.files.map(file => [file.path, file.kind, file.bytes, file.hash]))));
    if (digest !== r.manifestHash) throw invalid();
    return r;
}
function sameTuple(left: ImportFileTuple, right: ImportFileTuple): boolean {
    return left.path === right.path && left.kind === right.kind && left.bytes === right.bytes && left.hash === right.hash;
}
function wait(signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        signal.throwIfAborted();
        const abort = () => { clearTimeout(timer); reject(signal.reason); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 2_000);
        signal.addEventListener('abort', abort, { once: true });
    });
}

/** One page/session owner; all writes use captured adapters rather than the app's reauthenticated singleton. */
export class CloudImportSession {
    private alive = true;
    private initialized = false;
    private running = false;
    private uploadAbort = new AbortController();
    private observationAbort = new AbortController();
    private review: FolderReview | null = null;
    private state: ImportSessionState = { phase: 'idle', busy: false, recovery: null, status: null, currentPath: null, error: null };
    constructor(readonly owner: ImportOwner, private readonly io: ImportAdapters) {}
    private guard() { if (!this.alive || !this.io.current()) throw new Error('CLOUD_IMPORT_SESSION_CHANGED'); }
    private emit(patch: Partial<ImportSessionState>) {
        this.guard(); this.state = { ...this.state, ...patch }; this.io.changed(this.state);
    }
    private persist(recovery: ImportRecovery) {
        this.guard();
        try { this.io.storage.setItem(importRecoveryKey(this.owner), JSON.stringify(recovery)); }
        catch { throw new Error('CLOUD_IMPORT_RECOVERY_STORAGE'); }
        this.state = { ...this.state, recovery };
    }
    private async owned<T>(work: () => Promise<T>): Promise<T> { this.guard(); const value = await work(); this.guard(); return value; }
    private async exclusive(work: () => Promise<void>) {
        if (this.running || !this.alive || !this.io.current()) return;
        this.running = true; this.emit({ busy: true, error: null });
        try { await work(); }
        catch (cause) { if (this.alive && this.io.current()) this.emit({ phase: 'error', error: safeImportCode(cause) }); }
        finally { this.running = false; if (this.alive && this.io.current()) this.emit({ busy: false, currentPath: null }); }
    }
    async initialize() {
        await this.exclusive(async () => {
            let raw: string | null;
            try { raw = this.io.storage.getItem(importRecoveryKey(this.owner)); }
            catch { throw new Error('CLOUD_IMPORT_RECOVERY_STORAGE'); }
            if (!raw) { this.initialized = true; return; }
            let recovery: ImportRecovery;
            try { recovery = await readImportRecovery(raw); } catch { throw invalid(); }
            this.guard(); this.state = { ...this.state, recovery }; this.initialized = true;
            await this.reconcile(false);
        });
    }
    /** A reselection can restore File references only when all immutable tuples and the name match. */
    attach(review: FolderReview, name: string) {
        this.guard();
        if (!this.initialized) throw invalid();
        if (this.running || !review.manifest) throw new Error('CLOUD_IMPORT_RETRY_CHANGED');
        const r = this.state.recovery;
        if (r && (r.name !== name.trim() || r.manifestHash !== review.manifest.manifestHash
            || r.files.length !== review.manifest.files.length || r.files.some((file, i) => !sameTuple(file, review.manifest!.files[i]!)))) throw new Error('CLOUD_IMPORT_RETRY_CHANGED');
        this.review = { ...review, manifest: { ...review.manifest, files: review.manifest.files.map(file => ({ ...file })) }, binaries: new Map(review.binaries) };
    }
    async start(name: string) {
        await this.exclusive(async () => {
            if (!this.initialized) throw invalid();
            if (!this.io.enabled()) throw new Error('CLOUD_IMPORT_DISABLED');
            if (!this.review?.manifest || this.state.recovery) throw new Error('CLOUD_IMPORT_RETRY_CHANGED');
            const trimmed = name.trim(); if (!trimmed || trimmed.length > 80) throw new Error('CLOUD_INVALID_NAME');
            const manifest = this.review.manifest;
            this.persist({ version: 1, operationKey: crypto.randomUUID(), name: trimmed, manifestHash: manifest.manifestHash,
                files: manifest.files.map(({ path, kind, bytes, hash }) => ({ path, kind, bytes, hash })), cancelRequested: false });
            await this.begin(true);
            await this.pump(true);
        });
    }
    private async begin(firstDispatch = false) {
        let r = this.state.recovery;
        if (!r || !this.review?.manifest || r.cancelRequested || !this.io.enabled()) return;
        if (r.rejectedBeforeCreation) {
            const { rejectedBeforeCreation: _rejected, ...retry } = r;
            this.persist(retry); r = retry;
        }
        const request = r;
        this.emit({ phase: 'importing' });
        try {
            const result = await this.owned(() => this.io.begin({ workspaceId: this.owner.workspaceId, actorId: this.owner.actorId,
                operationKey: request.operationKey, name: request.name, files: this.review!.manifest!.files }));
            if (result.manifestHash !== request.manifestHash) throw new Error('CLOUD_IMPORT_RETRY_CHANGED');
            // Cancellation may have arrived while begin was in flight. Preserve that intent.
            this.persist({ ...this.state.recovery!, attemptId: result.attemptId });
        } catch (cause) {
            this.guard();
            // This evidence applies only to the first dispatch. A later rejection cannot
            // disprove an earlier request whose response was lost.
            if (firstDispatch && cause instanceof ConvexError && typeof cause.data === 'string'
                && ['CLOUD_IMPORT_DISABLED', 'CLOUD_ACTOR_CHANGED', 'CLOUD_INVALID_NAME', 'CLOUD_PROJECT_LIMIT', 'CLOUD_IMPORT_LIMIT', 'CLOUD_IMPORT_BUSY',
                    'CLOUD_IMPORT_INVALID_MANIFEST', 'CLOUD_IMPORT_UNSAFE_PATH', 'CLOUD_IMPORT_PATH_COLLISION', 'CLOUD_IMPORT_INVALID_TEXT',
                    'CLOUD_IMPORT_TEXT_TOO_LARGE', 'CLOUD_IMPORT_CONTENT_MISMATCH', 'CLOUD_IMPORT_ASSET_TOO_LARGE', 'CLOUD_IMPORT_TOO_LARGE', 'CLOUD_IMPORT_INLINE_TOO_LARGE'].includes(cause.data)) {
                this.persist({ ...this.state.recovery!, rejectedBeforeCreation: true });
                this.emit({ phase: this.state.recovery?.cancelRequested ? 'canceled' : 'error', error: cause.data }); return;
            }
            const status = await this.lookup();
            if (!status) { this.emit({ phase: 'uncertain', error: safeImportCode(cause) }); return; }
            this.adopt(status);
        }
    }
    private async lookup(): Promise<ImportStatus | null> {
        const r = this.state.recovery; if (!r) return null;
        return this.owned(() => r.attemptId ? this.io.status({ attemptId: r.attemptId })
            : this.io.findAttempt({ workspaceId: this.owner.workspaceId, operationKey: r.operationKey }));
    }
    private adopt(status: ImportStatus) {
        const r = this.state.recovery;
        if (!r || status.manifestHash !== r.manifestHash || status.name !== r.name || (r.attemptId && r.attemptId !== status.attemptId)
            || status.bytes !== r.files.reduce((sum, file) => sum + file.bytes, 0) || status.files.length !== r.files.length
            || status.files.some((file, index) => file.index !== index || !sameTuple(file, r.files[index]!))) throw new Error('CLOUD_IMPORT_RETRY_CHANGED');
        if (status.state === 'finalized' && (!status.projectId || !status.branchId)) throw invalid();
        const { rejectedBeforeCreation: _rejected, ...existing } = r;
        const next = { ...existing, attemptId: status.attemptId,
            ...(status.projectId && status.branchId ? { projectId: status.projectId, branchId: status.branchId } : {}) };
        if (JSON.stringify(next) !== JSON.stringify(r)) this.persist(next);
        this.emit({ status, phase: status.state === 'finalized' ? 'complete' : status.state === 'expired' ? 'canceled'
            : !this.review && status.files.some(file => file.state !== 'received') ? 'needs-folder' : 'checking' });
    }
    private async reconcile(navigate: boolean): Promise<ImportStatus | null> {
        this.emit({ phase: 'checking' });
        let status = await this.lookup();
        if (!status) {
            this.emit({ phase: this.state.recovery?.cancelRequested && this.state.recovery.rejectedBeforeCreation ? 'canceled' : 'uncertain' }); return null;
        }
        this.adopt(status);
        if (this.state.recovery?.cancelRequested && status.state === 'open') {
            status = await this.owned(() => this.io.cancel({ attemptId: status!.attemptId, manifestHash: status!.manifestHash }));
            this.adopt(status);
        }
        if (status.state === 'finalized' && navigate && status.projectId) { this.guard(); this.io.completed(status.projectId); }
        return status;
    }
    async check() {
        await this.exclusive(async () => {
            for (let count = 0; count < 3; count++) {
                const status = await this.reconcile(false);
                if (status && (status.state !== 'open' || status.files.every(file => file.state === 'received' && file.valid)
                    || status.files.some(file => file.canUpload))) return;
                this.emit({ phase: 'uncertain' });
                if (count < 2) await this.owned(() => (this.io.wait ?? wait)(this.observationAbort.signal));
            }
        });
    }
    async resume() {
        await this.exclusive(async () => {
            if (!this.state.recovery) return;
            const status = await this.reconcile(false);
            if (!status && !this.state.recovery.cancelRequested) {
                if (!this.review) { this.emit({ phase: 'needs-folder' }); return; }
                await this.begin();
            }
            await this.pump(true);
        });
    }
    private async pump(navigate: boolean) {
        for (let count = 0; count <= MAX_CLOUD_FILES; count++) {
            const status = await this.reconcile(navigate);
            if (!status || status.state !== 'open' || this.state.recovery?.cancelRequested) return;
            if (status.files.some(file => file.state === 'received' && !file.valid)) throw new Error('CLOUD_IMPORT_ASSET_CHANGED');
            if (status.files.every(file => file.state === 'received' && file.valid)) {
                if (!this.io.enabled()) { this.emit({ phase: 'checking', error: 'CLOUD_IMPORT_DISABLED' }); return; }
                try {
                    const receipt = await this.owned(() => this.io.finalize({ attemptId: status.attemptId, manifestHash: status.manifestHash }));
                    this.persist({ ...this.state.recovery!, ...receipt });
                    this.emit({ phase: 'complete' }); this.guard(); if (navigate) this.io.completed(receipt.projectId);
                } catch (cause) {
                    this.guard(); const reconciled = await this.reconcile(navigate);
                    if (reconciled?.state !== 'finalized') this.emit({ phase: 'uncertain', error: safeImportCode(cause) });
                }
                return;
            }
            const next = status.files.find(file => file.state !== 'received');
            if (!next || !next.canUpload) { this.emit({ phase: 'uncertain' }); return; }
            const file = this.review?.binaries.get(next.path);
            if (!file) { this.emit({ phase: 'needs-folder' }); return; }
            this.uploadAbort = new AbortController();
            this.emit({ phase: 'importing', currentPath: next.path });
            let uploadFailed = false;
            try { await this.owned(() => this.io.upload({ attemptId: status.attemptId, index: next.index, file, hash: next.hash, signal: this.uploadAbort.signal })); }
            catch { this.guard(); uploadFailed = true; }
            const observed = await this.reconcile(navigate);
            if (!observed || observed.state !== 'open' || this.state.recovery?.cancelRequested) return;
            if (uploadFailed && !(observed.files[next.index]?.state === 'received' && observed.files[next.index]?.valid)) {
                this.emit({ phase: 'uncertain' }); return;
            }
        }
        this.emit({ phase: 'uncertain' });
    }
    async cancel() {
        this.guard();
        if (!this.state.recovery || this.state.phase === 'complete') return;
        try { this.persist({ ...this.state.recovery, cancelRequested: true }); }
        catch (cause) { this.emit({ error: safeImportCode(cause) }); return; }
        this.uploadAbort.abort();
        if (!this.running) await this.exclusive(async () => { await this.reconcile(false); });
    }
    /** Called only as the import screen leaves after committing navigation to its saved project. */
    acknowledgeCompletedNavigation(pathname: string): boolean {
        if (!this.alive || !this.io.current()) return false;
        const recovery = this.state.recovery;
        if (this.state.phase !== 'complete' || !recovery?.projectId || !recovery.branchId ||
            pathname !== `/project/${recovery.projectId}`) return false;
        const key = importRecoveryKey(this.owner), raw = JSON.stringify(recovery);
        try {
            // A replacement record belongs to a newer attempt, even under the same owner key.
            if (this.io.storage.getItem(key) !== raw || !this.io.current()) return false;
            this.io.storage.removeItem(key);
            return true;
        } catch { return false; } // Keep recovery if browser storage is unavailable.
    }
    resetCanceled() {
        this.guard();
        if (this.running || !this.state.recovery || (this.state.status?.state !== 'expired'
            && !(this.state.recovery.cancelRequested && this.state.recovery.rejectedBeforeCreation))) return;
        const key = importRecoveryKey(this.owner), raw = JSON.stringify(this.state.recovery);
        try { if (this.io.storage.getItem(key) === raw) this.io.storage.removeItem(key); else throw invalid(); }
        catch { this.emit({ error: 'CLOUD_IMPORT_RECOVERY_STORAGE' }); return; }
        this.review = null; this.emit({ phase: 'idle', recovery: null, status: null, error: null });
    }
    dispose() { this.alive = false; this.uploadAbort.abort(); this.observationAbort.abort(); this.review = null; }
}
