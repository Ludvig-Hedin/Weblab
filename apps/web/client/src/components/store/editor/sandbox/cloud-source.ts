import { isImportedCloudProfile } from '@convex/lib/cloudImportManifest';
import { validateCloudChanges } from '@convex/lib/cloudEditor';
import { observable, runInAction } from 'mobx';

import type { CloudTextApproval, CloudTextRenderMapping, PlainTextElementIdentity } from '@weblab/models/actions';
import type { DomElement } from '@weblab/models';
import type { CodeFileSystem, DurableSourceChange, DurableSourceFile } from '@weblab/file-system';

import type { RejectedTextNavigationLease } from '../text';
import type {
    CloudRecoveryKey,
    CloudRecoveryOperation,
    CloudRecoveryRecord,
    CloudRecoveryStore,
} from './cloud-recovery';
import type {
    CloudDesignerOperation,
    CloudEditorAccess,
    CloudEditorClient,
    CloudEditorCommit,
    CloudEditorCommitResult,
    CloudEditorContracts,
    CloudTextContracts,
    CloudEditorRuntimeStatus,
    CloudEditorScope,
    CloudEditorSnapshot,
    CloudImageOperation,
    CloudSemanticOperation,
    CloudSourceOperation,
} from '@/lib/cloud-editor/api';
import { cloudEditorApi } from '@/lib/cloud-editor/api';
import { readImportedAsset } from '@/lib/cloud-imports/client';
import { clearAcknowledgedJournalDraft } from '@/lib/cloud-editor/journal-drafts';
import {
    cloudRecoveryOperation,
    CloudRecoveryStorageError,
    IndexedDbCloudRecoveryStore,
    validSemanticOperation,
} from './cloud-recovery';

type SourceCallbacks = {
    owner?: { signal: AbortSignal; isCurrent: () => boolean };
    onSourceChanged?: (paths: string[], external: boolean) => void;
    recoveryStore?: CloudRecoveryStore;
    hasLocalWork?: () => boolean;
    requestReload?: () => void;
    recoverableText?: () => string | null;
    prepareRejectedTextNavigation?: () => RejectedTextNavigationLease;
};

const RECOVERY_RECEIPT_LIFETIME = 30 * 24 * 60 * 60_000;
export type CloudAttributeField = 'src' | 'alt' | 'href' | 'className';
export interface CloudAttributeApproval {
    actorId: string;
    branchId: string;
    path: string;
    oid: string;
    field: CloudAttributeField;
    generation: number;
}
export type CloudImagePrepared = {
    attemptId: CloudImageOperation['image']['attemptId'];
    assetPath: string;
    hash: string;
    bytes: Uint8Array;
};
export type CloudImageLease = {
    current: () => boolean;
    commit: (image: CloudImagePrepared, source: string) => Promise<boolean>;
};
export interface CloudAttributeWrite extends CloudAttributeApproval {
    revision: number;
    value: string;
    candidate: string;
}
export interface CloudTextWrite {
    pin: CloudTextApproval;
    revision: number;
    candidate: string;
}

const textIdentifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 160 &&
    /^[A-Za-z_$]/.test(value) && !/[^A-Za-z0-9_$]/.test(value);
const textOid = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 160 && !/[^A-Za-z0-9_.:-]/.test(value);
const textPath = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 240 &&
    !/[\\\u0000-\u001f\u007f]/.test(value) && value.split('/').every(part => part !== '' && part !== '.' && part !== '..');
const exactKeys = (value: object, keys: string[]) => Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));

export function validTextRenderMapping(value: unknown): value is CloudTextRenderMapping {
    if (!value || typeof value !== 'object' || !exactKeys(value, ['version', 'kind', 'mappingId', 'callsite', 'renderer'])) return false;
    const mapping = value as Partial<CloudTextRenderMapping>;
    return mapping.version === 1 && mapping.kind === 'keyed-prop-map' && textOid(mapping.mappingId) &&
        [mapping.callsite, mapping.renderer].every(part => !!part && typeof part === 'object' &&
            exactKeys(part, ['path', 'exportName', 'oid']) && textPath(part.path) && textIdentifier(part.exportName) && textOid(part.oid));
}

export function textBindingIdentity(target: CloudTextApproval['target'], mapping?: CloudTextApproval['renderMapping']): string {
    return JSON.stringify([target.kind, target.exportName,
        target.kind === 'component-literal' ? target.oid : [target.itemId, target.property],
        mapping ? [mapping.version, mapping.kind, mapping.mappingId,
            mapping.callsite.path, mapping.callsite.exportName, mapping.callsite.oid,
            mapping.renderer.path, mapping.renderer.exportName, mapping.renderer.oid] : null]);
}

export function cloudTextIdentity(pin: CloudTextApproval): string {
    return JSON.stringify([pin.version, pin.projectId, pin.branchId, pin.actorId, pin.path, pin.bindingId,
        textBindingIdentity(pin.target, pin.renderMapping), pin.generation, pin.designRevision]);
}

export function freezeCloudTextApproval(pin: CloudTextApproval): CloudTextApproval {
    return Object.freeze({ ...pin, target: Object.freeze({ ...pin.target }), ...(pin.renderMapping ? {
        renderMapping: Object.freeze({ ...pin.renderMapping, callsite: Object.freeze({ ...pin.renderMapping.callsite }),
            renderer: Object.freeze({ ...pin.renderMapping.renderer }) }),
    } : {}) });
}

/** Rendered identity and saved owner differ for keyed data. */
export function cloudTextRenderer(pin: CloudTextApproval): { path: string; oid: string } {
    if (pin.target.kind === 'component-literal') return { path: pin.path, oid: pin.target.oid };
    if (!pin.renderMapping) throw new Error('The approved text has no rendered identity.');
    return pin.renderMapping.renderer;
}

/** Copy the identity before asynchronous frame calls can observe a changed element. */
export function plainTextExpectedIdentity(element: DomElement): PlainTextElementIdentity {
    return Object.freeze({ textRenderMode: 'plain-string-v1', domId: element.domId, oid: element.oid,
        frameId: element.frameId, branchId: element.branchId, instanceId: element.instanceId,
        ...(element.contentIdentity ? { contentIdentity: Object.freeze({ ...element.contentIdentity }) } : {}) });
}

export function matchesCloudTextElement(pin: CloudTextApproval, element: Pick<DomElement, 'oid' | 'branchId' | 'contentIdentity'>): boolean {
    if (element.branchId !== pin.branchId || element.oid !== cloudTextRenderer(pin).oid) return false;
    if (pin.target.kind === 'component-literal') return element.contentIdentity === undefined;
    return element.contentIdentity?.mappingId === pin.renderMapping?.mappingId && element.contentIdentity?.itemId === pin.target.itemId;
}

/** Persisted history is untrusted input, including when replayed by a designer. */
export function validCloudTextApproval(value: unknown): value is CloudTextApproval {
    if (!value || typeof value !== 'object') return false;
    const pin = value as Partial<CloudTextApproval>;
    return pin.version === 2 && ['projectId', 'branchId', 'actorId', 'path', 'bindingId'].every((key) => {
        const entry = pin[key as keyof CloudTextApproval];
        return typeof entry === 'string' && entry.length > 0 && entry.length <= 300 && !/[\u0000-\u0020\u007f]/.test(entry);
    }) && textPath(pin.path) &&
        Number.isSafeInteger(pin.generation) && pin.generation! > 0 && pin.generation! < Number.MAX_SAFE_INTEGER &&
        Number.isSafeInteger(pin.designRevision) && pin.designRevision! > 0 &&
        !!pin.target && textIdentifier(pin.target.exportName) &&
        (pin.target.kind === 'component-literal'
            ? exactKeys(pin.target, ['kind', 'exportName', 'oid']) && textOid(pin.target.oid) && pin.renderMapping === undefined
            : pin.target.kind === 'data-leaf' && exactKeys(pin.target, ['kind', 'exportName', 'itemId', 'property']) &&
                typeof pin.target.itemId === 'string' && pin.target.itemId.length > 0 && pin.target.itemId.length <= 160 &&
                !/[\u0000-\u001f\u007f]/.test(pin.target.itemId) && ['question', 'answer'].includes(pin.target.property) && validTextRenderMapping(pin.renderMapping));
}
const CONTENT_REJECTIONS_AFTER_RECEIPT = new Set([
    'CLOUD_CONTENT_INVALID_TARGET',
    'CLOUD_CONTENT_INVALID_VALUE',
    'CLOUD_CONTENT_INVALID_SOURCE',
    'CLOUD_CONTENT_STALE_CONTRACT',
    'CLOUD_CONTENT_UNAPPROVED_CHANGE',
    'CLOUD_CONTENT_DUPLICATE_OID',
    'CLOUD_CONTENT_INVALID_GENERATION',
]);

// Only refusals raised after the identical receipt lookup establish non-commit.
// UNAVAILABLE is intentionally absent: revocation is checked before that lookup.
const SEMANTIC_REJECTIONS_AFTER_RECEIPT = new Set([
    ...CONTENT_REJECTIONS_AFTER_RECEIPT,
    'CLOUD_STUDIO_INVALID_TARGET',
    'CLOUD_STUDIO_ALREADY_INSTALLED',
    'CLOUD_STUDIO_ROUTE_OCCUPIED',
    'CLOUD_STUDIO_TEMPLATE_NOT_APPROVED',
    'CLOUD_STUDIO_SLOT_NOT_APPROVED',
    'CLOUD_STUDIO_SLOT_CHANGED',
    'CLOUD_STUDIO_BLOCK_NOT_APPROVED',
    'CLOUD_STUDIO_SLOT_LIMIT',
    'CLOUD_STUDIO_STALE_APPROVAL',
    'CLOUD_STUDIO_INVALID_SLUG',
    'CLOUD_STUDIO_INVALID_VALUES',
    'CLOUD_STUDIO_INVALID_ASSET',
    'CLOUD_STUDIO_ITEM_LIMIT',
    'CLOUD_STUDIO_INVALID_ITEM',
    'CLOUD_STUDIO_ITEM_NOT_FOUND',
    'CLOUD_STUDIO_ITEM_CONFLICT',
    'CLOUD_STUDIO_ITEM_ARCHIVED',
    'CLOUD_STUDIO_CONTENT_TOO_LARGE',
    'CLOUD_STUDIO_PROJECTION_CHANGED',
]);

function errorCode(error: unknown): string | null {
    if (!error || typeof error !== 'object') return null;
    const data = 'data' in error ? error.data : undefined;
    return typeof data === 'string' ? data : null;
}

async function sha256(bytes: Uint8Array): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer);
    return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function decodeSnapshot(
    snapshot: CloudEditorSnapshot,
    client: CloudEditorClient,
    scope: CloudEditorScope,
    signal: AbortSignal,
    assertOwner: () => void,
): Promise<DurableSourceFile[]> {
    const files: DurableSourceFile[] = [];
    for (const file of snapshot.files) {
        assertOwner();
        signal.throwIfAborted();
        if (file.kind === 'directory') {
            files.push({ path: file.path, content: null, directory: true });
            continue;
        }
        let bytes: Uint8Array;
        if (file.text !== null) bytes = new TextEncoder().encode(file.text);
        else if (isImportedCloudProfile(snapshot.profile)) {
            bytes = await readImportedAsset(scope, file, signal);
        } else {
            if (
                !file.storageId ||
                !Number.isSafeInteger(file.bytes) ||
                file.bytes < 0 ||
                file.bytes > 2_000_000
            )
                throw new Error('Saved asset is unavailable');
            const content = await client.action(cloudEditorApi.readAsset, {
                ...scope,
                path: file.path,
                expectedHash: file.hash,
            });
            signal.throwIfAborted();
            bytes = new Uint8Array(content);
        }
        if (bytes.byteLength !== file.bytes || (await sha256(bytes)) !== file.hash)
            throw new Error('Saved source did not match its checksum');
        assertOwner();
        signal.throwIfAborted();
        files.push({ path: file.path, content: file.text ?? bytes });
    }
    return files;
}

/** The saved revision belongs to source storage, independently of preview readiness. */
export class CloudSource {
    readonly state = observable({
        profile: 'starter-v1' as CloudEditorSnapshot['profile'],
        preparingImport: false,
        preparationError: false,
        localDraftChanges: false,
        loading: false,
        pending: false,
        savedRevision: 0,
        error: null as string | null,
        conflict: false,
        needsReload: false,
        runtime: null as CloudEditorRuntimeStatus | null,
        runtimeError: null as string | null,
        previewStartErrorCode: null as string | null,
        runtimeExpired: false,
        recoveryExpired: false,
        saveAcknowledged: false,
        accessReady: false,
        accessError: null as string | null,
        access: null as CloudEditorAccess | null,
        contracts: null as CloudEditorContracts | null,
        textContracts: null as CloudTextContracts | null,
        contentMode: false,
        attributeWritePending: false,
        recoveryUnsupported: false,
        discardReloadRequested: false,
        discardReloadFailed: false,
    });
    private localWorkGuards = new Set<() => boolean>();
    private closed = false;
    private get stopped(): boolean {
        return this.closed || this.callbacks.owner?.isCurrent() === false;
    }
    private readonly onOwnerLost = () => {
        void this.stop();
    };
    private assertOwner(): void {
        if (this.stopped)
            throw new Error('The signed-in account or source changed. Reopen this project.');
        this.abort.signal.throwIfAborted();
    }
    private readonly abort = new AbortController();
    private operation: CloudSourceOperation | null = null;
    private lastAttempt: CloudRecoveryOperation | null = null;
    private recoveryVersion = 2;
    private localRecoveryAttempts: CloudRecoveryRecord[] = [];
    private recoveryIdentity: CloudRecoveryKey | null = null;
    private capabilitiesPromise: Promise<void> | null = null;
    private readonly designRequests = new WeakMap<CloudDesignerOperation, CloudEditorCommit>();
    private actorId: CloudEditorSnapshot['actorId'] | null = null;
    private operationAmbiguous = false;
    private attemptCreatedAt = 0;
    private readonly recovery: CloudRecoveryStore;
    private unloadAttached = false;
    private rejectedReload: {
        lease: RejectedTextNavigationLease;
        key: CloudRecoveryKey;
        record: CloudRecoveryRecord;
        attempt: CloudRecoveryOperation;
        bypassUnload: boolean;
    } | null = null;
    private readonly beforeUnload = (event: BeforeUnloadEvent) => {
        if (this.rejectedReload?.bypassUnload) {
            this.rejectedReload.bypassUnload = false;
            try {
                this.assertRejectedReload(this.rejectedReload);
                return;
            } catch {
                /* Keep the normal warning. */
            }
        }
        if (!this.hasPendingChanges && !this.state.pending && !this.hasLocalWork) return;
        event.preventDefault();
        event.returnValue = '';
    };
    private startPromise: Promise<void> | null = null;
    private reloadPromise: Promise<void> | null = null;
    private previewPromise: Promise<void> | null = null;
    private preparationPromise: Promise<void> | null = null;
    private pollTimer: ReturnType<typeof setTimeout> | null = null;
    private polling = false;
    private latestRevision = 0;
    private initialized = false;
    private previewRequestError: string | null = null;
    private runtimeLifecycleStarted = false;
    private externalChanges = 0;
    private ownWrites = 0;
    private binaryFiles = new Map<string, Uint8Array>();
    private sourcePaths = new Set<string>();
    private listeners = new Set<(paths: string[], external: boolean) => void>();
    private attributeWrite: CloudAttributeWrite | null = null;
    private textWrite: CloudTextWrite | null = null;
    private imageLease: {
        pin: CloudAttributeApproval;
        revision: number;
        prepared?: CloudImagePrepared;
        candidate?: string;
    } | null = null;

    constructor(
        private readonly client: CloudEditorClient,
        readonly scope: CloudEditorScope,
        private readonly fs: CodeFileSystem,
        private readonly callbacks: SourceCallbacks = {},
    ) {
        this.recovery = callbacks.recoveryStore ?? new IndexedDbCloudRecoveryStore();
        callbacks.owner?.signal.addEventListener('abort', this.onOwnerLost, { once: true });
        if (callbacks.owner?.signal.aborted) this.onOwnerLost();
    }

    get canWrite(): boolean {
        return this.imageLease === null && this.sourceWriteReady;
    }
    async cancelImagePreparation(attemptId: CloudImagePrepared['attemptId']): Promise<void> {
        await this.client.mutation(cloudEditorApi.cancelImage, { attemptId });
    }
    private get sourceWriteReady(): boolean {
        return (
            !this.stopped &&
            this.initialized &&
            this.state.profile !== 'imported-source-v1' &&
            !this.state.preparingImport &&
            this.state.accessReady &&
            (this.isContentMode
                ? this.canEditContent && (isImportedCloudProfile(this.state.profile)
                    ? this.state.textContracts?.revision === this.state.savedRevision
                    : this.state.contracts?.revision === this.state.savedRevision)
                : this.canDesign) &&
            !this.state.loading &&
            !this.state.pending &&
            this.state.savedRevision > 0 &&
            !this.state.needsReload &&
            !this.operation &&
            this.localRecoveryAttempts.length === 0 &&
            this.state.runtime?.enabled !== false
        );
    }
    get canRetrySave(): boolean {
        return (
            !!this.operation &&
            this.maySend(this.operation) &&
            !this.state.pending &&
            !this.state.loading
        );
    }
    get canDesign(): boolean {
        return !this.stopped && this.state.profile !== 'imported-source-v1' && this.state.accessReady && this.state.access?.canDesign === true;
    }
    get canPreview(): boolean {
        return !this.stopped && this.state.accessReady && this.state.access?.canPreview === true;
    }
    get canPrepareImport(): boolean {
        return !this.stopped && this.initialized && this.state.profile === 'imported-source-v1' &&
            this.state.accessReady && this.state.savedRevision > 0 && this.state.access?.canPrepareImport === true &&
            (this.state.access?.role === 'responsible' || this.state.access?.role === 'designer');
    }
    get canEditContent(): boolean {
        return (
            !this.stopped && this.state.accessReady && (isImportedCloudProfile(this.state.profile)
                ? this.state.profile === 'imported-next-v1' && this.state.access?.canEditImportedText === true
                : this.state.access?.canEditContent === true)
        );
    }
    get isContentMode(): boolean {
        return (
            this.state.contentMode ||
            this.state.access?.role === 'content' ||
            (!this.canDesign && this.canEditContent)
        );
    }
    private get currentTextApprovals(): CloudTextApproval[] {
        const snapshot = this.state.textContracts;
        if (!this.canEditContent || !snapshot || snapshot.actorId !== this.actorId ||
            snapshot.revision !== this.state.savedRevision) return [];
        return snapshot.contracts.filter(contract => contract.version === 2 && contract.active && contract.current &&
            contract.designRevision === snapshot.designRevision).flatMap(contract => contract.bindings.flatMap(binding => {
                const pin = { version: 2 as const, ...this.scope, actorId: snapshot.actorId, path: contract.path,
                    bindingId: binding.bindingId, target: binding.target, renderMapping: binding.renderMapping,
                    generation: contract.generation, designRevision: contract.designRevision };
                return validCloudTextApproval(pin) ? [freezeCloudTextApproval(pin)] : [];
            }));
    }
    resolveRenderedTextApproval(element: Pick<DomElement, 'oid' | 'branchId' | 'contentIdentity'>): CloudTextApproval | null {
        const matches = this.currentTextApprovals.filter(pin => matchesCloudTextElement(pin, element));
        return matches.length === 1 ? matches[0]! : null;
    }
    /** Source-only lookup. Keyed leaves require the complete agency mapping identity. */
    resolveTextApproval(path: string, oid: string, identity?: { mappingId: string; itemId: string }): CloudTextApproval | null {
        const matches = this.currentTextApprovals.filter(pin => {
            const renderer = cloudTextRenderer(pin);
            return renderer.path === path.replace(/^\/+/, '') && renderer.oid === oid &&
                (pin.target.kind === 'component-literal' ? identity === undefined :
                    identity?.mappingId === pin.renderMapping?.mappingId && identity?.itemId === pin.target.itemId);
        });
        return matches.length === 1 ? matches[0]! : null;
    }
    isTextApprovalCurrent(pin: unknown): pin is CloudTextApproval {
        if (!validCloudTextApproval(pin) || pin.projectId !== this.scope.projectId || pin.branchId !== this.scope.branchId ||
            pin.actorId !== this.actorId) return false;
        return this.currentTextApprovals.filter(current => cloudTextIdentity(current) === cloudTextIdentity(pin)).length === 1;
    }
    get approvedTextBindings(): Array<{
        path: string;
        oid: string;
        generation: number;
    }> {
        if (!this.canEditContent || this.state.contracts?.revision !== this.state.savedRevision)
            return [];
        return this.state.contracts.contracts
            .filter((contract) => contract.active)
            .flatMap((contract) =>
                contract.bindings
                    .filter((binding) => binding.fields.includes('text'))
                    .map((binding) => ({
                        path: contract.path,
                        oid: binding.oid,
                        generation: contract.generation,
                    })),
            );
    }
    get approvedAttributeBindings() {
        if (!this.canEditContent || this.state.contracts?.revision !== this.state.savedRevision)
            return [];
        return this.state.contracts.contracts
            .filter((contract) => contract.active)
            .flatMap((contract) =>
                contract.bindings
                    .filter((binding) => binding.fields.some((field) => field !== 'text'))
                    .map((binding) => ({
                        ...binding,
                        path: contract.path,
                        generation: contract.generation,
                    })),
            );
    }
    async withApprovedTextWrite(write: CloudTextWrite, save: () => Promise<boolean>): Promise<boolean> {
        this.assertOwner();
        if (this.textWrite || this.attributeWrite || this.imageLease || !this.canWrite ||
            this.state.localDraftChanges || write.revision !== this.state.savedRevision || !this.isTextApprovalCurrent(write.pin)) return false;
        const owner = { ...write, pin: freezeCloudTextApproval(write.pin) };
        this.textWrite = owner;
        runInAction(() => { this.state.attributeWritePending = true; });
        try {
            this.assertOwner();
            const saved = await save();
            this.assertOwner();
            return saved;
        }
        finally {
            if (this.textWrite === owner) this.textWrite = null;
            runInAction(() => { this.state.attributeWritePending = false; });
        }
    }
    canEditAttribute(
        path: string,
        oid: string,
        field: CloudAttributeField,
        value?: string,
    ): boolean {
        if (!this.canWrite) return false;
        const binding = this.approvedAttributeBindings.find(
            (entry) => entry.path === path.replace(/^\/+/, '') && entry.oid === oid,
        );
        if (!binding?.fields.includes(field)) return false;
        if (value === undefined) return true;
        if (/[\u0000-\u001f\u007f]/.test(value)) return false;
        if (field === 'alt') return value.length <= 1000;
        if (field === 'className') return Object.values(binding.choices ?? {}).includes(value);
        return value.length <= 2048 && (binding.allowedValues?.[field]?.includes(value) ?? false);
    }
    private attributeApprovalCurrent(write: CloudAttributeWrite): boolean {
        return (
            this.actorId === write.actorId &&
            this.scope.branchId === write.branchId &&
            this.state.savedRevision === write.revision &&
            this.canEditAttribute(write.path, write.oid, write.field, write.value) &&
            this.approvedAttributeBindings.some(
                (binding) =>
                    binding.path === write.path &&
                    binding.oid === write.oid &&
                    binding.generation === write.generation,
            )
        );
    }
    /** Pin this one durable write to its original approval, regardless of later UI mode. */
    async withApprovedAttributeWrite(
        write: CloudAttributeWrite,
        save: () => Promise<boolean>,
    ): Promise<boolean> {
        if (this.attributeWrite || this.textWrite || !this.attributeApprovalCurrent(write)) return false;
        const admitted = { ...write };
        this.attributeWrite = admitted;
        runInAction(() => {
            this.state.attributeWritePending = true;
        });
        try {
            return await save();
        } finally {
            if (this.attributeWrite === admitted) this.attributeWrite = null;
            runInAction(() => {
                this.state.attributeWritePending = false;
            });
        }
    }
    /** An exclusive operation keeps preparation outside the source and the final image/source write inside CodeFS. */
    async withImageUpload(
        pin: CloudAttributeApproval,
        revision: number,
        run: (lease: CloudImageLease) => Promise<boolean>,
    ): Promise<boolean> {
        if (
            !this.canWrite ||
            !this.isContentMode ||
            this.hasLocalWork ||
            pin.field !== 'src' ||
            this.actorId !== pin.actorId ||
            revision !== this.state.savedRevision ||
            pin.branchId !== this.scope.branchId
        )
            return false;
        const allowed = () =>
            this.approvedAttributeBindings.some(
                (b) =>
                    b.path === pin.path &&
                    b.oid === pin.oid &&
                    b.generation === pin.generation &&
                    b.fields.includes('src') &&
                    b.allowImageUploads === true,
            );
        if (!allowed()) return false;
        const owner: NonNullable<CloudSource['imageLease']> = { pin: { ...pin }, revision };
        this.imageLease = owner;
        runInAction(() => {
            this.state.attributeWritePending = true;
        });
        const current = () =>
            this.imageLease === owner &&
            this.sourceWriteReady &&
            this.actorId === pin.actorId &&
            this.state.savedRevision === revision &&
            this.scope.branchId === pin.branchId &&
            allowed();
        try {
            return await run({
                current,
                commit: async (image, source) => {
                    if (
                        !current() ||
                        image.assetPath !== `public/weblab-upload-${image.hash}.webp` ||
                        (await sha256(image.bytes)) !== image.hash ||
                        !current()
                    )
                        return false;
                    owner.prepared = image;
                    owner.candidate = source;
                    try {
                        await this.fs.writeFiles([
                            { path: pin.path, content: source },
                            { path: image.assetPath, content: image.bytes },
                        ]);
                        return true;
                    } catch {
                        return false;
                    }
                },
            });
        } finally {
            if (this.imageLease === owner) this.imageLease = null;
            runInAction(() => {
                this.state.attributeWritePending = false;
            });
            this.syncUnloadWarning();
        }
    }
    canEditText(path: string, oid: string, contentIdentity?: DomElement['contentIdentity']): boolean {
        if (!this.canWrite) return false;
        return (
            !this.isContentMode ||
            this.resolveTextApproval(path, oid, contentIdentity) !== null ||
            this.approvedTextBindings.some(
                (binding) => binding.path === path.replace(/^\/+/, '') && binding.oid === oid,
            )
        );
    }
    setContentMode(content: boolean): void {
        if (!content && !this.canDesign) throw new Error('Design access is required');
        runInAction(() => {
            this.state.contentMode = content;
        });
    }
    private maySend(operation: CloudSourceOperation): boolean {
        if (operation.transport === 'design') return this.canDesign;
        if (isImportedCloudProfile(this.state.profile)) return this.canEditContent &&
            this.state.access?.canEditImportedText === true && operation.transport === 'content' && operation.transportVersion === 2;
        return this.canEditContent && operation.transportVersion === 1;
    }
    refreshCapabilities(): Promise<void> {
        this.capabilitiesPromise ??= this.loadCapabilities().finally(() => {
            this.capabilitiesPromise = null;
        });
        return this.capabilitiesPromise;
    }
    private async loadCapabilities(): Promise<void> {
        try {
            this.assertOwner();
            const access = await this.client.query(cloudEditorApi.access, this.scope);
            this.assertOwner();
            if (this.actorId && access.actorId !== this.actorId)
                throw new Error('The signed-in account changed. Reopen this project.');
            const contracts =
                access.role && access.canEditContent && !isImportedCloudProfile(this.state.profile)
                    ? await this.client.query(cloudEditorApi.contracts, this.scope)
                    : null;
            this.assertOwner();
            let textContracts: CloudTextContracts | null = null;
            if (isImportedCloudProfile(this.state.profile) &&
                (access.canEditImportedText === true || access.canApproveImportedText === true)) {
                try { textContracts = await this.client.query(cloudEditorApi.textContracts, this.scope); }
                catch { /* Optional text discovery never grants permission or disables designer source writes. */ }
            }
            this.assertOwner();
            if ((textContracts && textContracts.actorId !== this.actorId) || (contracts && contracts.actorId !== this.actorId))
                throw new Error('The signed-in account changed. Reopen this project.');
            runInAction(() => {
                this.state.access = access;
                this.state.contracts = contracts;
                this.state.textContracts = textContracts;
                this.state.accessReady = true;
                this.state.accessError = null;
            });
        } catch (error) {
            if (!this.stopped)
                runInAction(() => {
                    this.state.accessReady = false;
                    this.state.runtime = null;
                    this.state.accessError =
                        'Project permissions could not be checked. Your draft is still available.';
                });
            throw error;
        }
    }
    get hasLocalWork(): boolean {
        try {
            return (
                this.imageLease !== null ||
                this.state.localDraftChanges ||
                this.state.attributeWritePending ||
                (this.callbacks.hasLocalWork?.() ?? false) ||
                [...this.localWorkGuards].some((guard) => guard())
            );
        } catch {
            return true;
        }
    }
    registerLocalWork(guard: () => boolean): () => void {
        this.localWorkGuards.add(guard);
        return () => {
            this.localWorkGuards.delete(guard);
        };
    }
    setLocalDraftChanges(dirty: boolean): void {
        runInAction(() => {
            this.state.localDraftChanges = dirty;
        });
    }
    get hasRecoverableText(): boolean {
        return this.callbacks.recoverableText?.() != null;
    }
    get hasPendingChanges(): boolean {
        return !!this.lastAttempt || this.localRecoveryAttempts.length > 0;
    }
    sourceVersion(): string {
        return `${this.scope.branchId}:${this.state.savedRevision}`;
    }
    externalRevision(): string {
        return `${this.scope.branchId}:${this.externalChanges}`;
    }
    ownRevision(): string {
        return `${this.scope.branchId}:${this.ownWrites}`;
    }
    getSourceVersion(): string {
        return this.sourceVersion();
    }
    getExternalRevision(): string {
        return this.externalRevision();
    }
    getOwnRevision(): string {
        return this.ownRevision();
    }

    /** Preserve exact bytes even if the browser filesystem would detect them as text. */
    binaryContent(path: string): Uint8Array | undefined {
        return this.binaryFiles.get(path.replace(/^\/+/, ''))?.slice();
    }

    subscribe(listener: (paths: string[], external: boolean) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private changed(paths: string[], external: boolean): void {
        // Consumers cannot turn an acknowledged save into a failed save.
        try {
            this.callbacks.onSourceChanged?.(paths, external);
        } catch {
            /* Consumer owns its cache. */
        }
        for (const listener of this.listeners) {
            try {
                listener(paths, external);
            } catch {
                /* Consumer owns its watcher. */
            }
        }
    }

    start(): Promise<void> {
        if (this.stopped) return Promise.reject(new Error('Cloud project was closed'));
        this.startPromise ??= this.startSource().catch((error) => {
            this.startPromise = null;
            throw error;
        });
        return this.startPromise;
    }

    private async startSource(): Promise<void> {
        this.assertOwner();
        this.fs.setDurableCommitHandler((changes) => this.commit(changes));
        this.fs.setDurableCacheErrorHandler(() => this.cacheFailed());
        await this.hydrate();
        this.assertOwner();
        // Viewing or editing approved content never starts a paid runtime on open.
        if (this.canDesign && !isImportedCloudProfile(this.state.profile)) await this.retryPreview().catch(() => undefined);
        this.assertOwner();
        // The first runtime writes its dependency lock. Finish loading that
        // revision before BranchManager attaches history or admits canvas edits.
        if (this.canDesign && !isImportedCloudProfile(this.state.profile) && !this.sourcePaths.has('bun.lock')) await this.settleInitialRuntime();
        if (this.stopped) throw new Error('Cloud project was closed');
        this.initialized = true;
        this.startRuntimeLifecycle();
    }

    private async settleInitialRuntime(): Promise<void> {
        const deadline = Date.now() + 180_000;
        while (!this.stopped && Date.now() < deadline) {
            this.assertOwner();
            let status = await this.client.query(cloudEditorApi.status, this.scope);
            this.assertOwner();
            if (
                status.enabled &&
                status.status === 'ready' &&
                !status.previewToken &&
                (status.expiresAt ?? 0) > Date.now() &&
                this.canPreview
            ) {
                // Minting an actor-bound view ticket never provisions runtime work.
                await this.client.mutation(cloudEditorApi.issuePreview, this.scope);
                this.assertOwner();
                status = await this.client.query(cloudEditorApi.status, this.scope);
                this.assertOwner();
            }
            if (status.status === 'ready') {
                await this.hydrate();
                return;
            }
            if (!status.enabled || status.status === 'error' || this.previewRequestError) break;
            await new Promise<void>((resolve) => {
                const finish = () => {
                    clearTimeout(timer);
                    this.abort.signal.removeEventListener('abort', finish);
                    resolve();
                };
                const timer = setTimeout(finish, 1_000);
                this.abort.signal.addEventListener('abort', finish, { once: true });
            });
        }
        this.assertOwner();
        runInAction(() => {
            this.state.needsReload = true;
            this.state.error =
                'The first preview is not ready. Retry the preview, then load the saved version before editing.';
        });
    }

    private startRuntimeLifecycle(): void {
        if (this.stopped || this.runtimeLifecycleStarted) return;
        this.runtimeLifecycleStarted = true;
        this.schedulePoll(0);
    }

    private recoveryKey(): CloudRecoveryKey {
        if (!this.actorId) throw new CloudRecoveryStorageError();
        return { ...this.scope, actorId: this.actorId };
    }

    /** Capture immutable identity and raw proposal now, before parsing yields. */
    private prepareLocalRecovery(changes: DurableSourceChange[]): () => Promise<void> {
        const key = this.recoveryIdentity;
        if (!key) throw new CloudRecoveryStorageError();
        const record: CloudRecoveryRecord = {
            version: 2,
            actorId: key.actorId,
            ambiguous: false,
            disposition: 'rejected',
            definitiveRejection: true,
            createdAt: Date.now(),
            operation: {
                ...key,
                actorId: key.actorId as CloudEditorCommit['actorId'],
                expectedRevision: this.state.savedRevision,
                operationId: crypto.randomUUID(),
                transport: 'local-only',
                transportVersion: 1,
                changes: changes.map((change) => ({
                    path: change.path,
                    content:
                        change.content instanceof Uint8Array
                            ? Uint8Array.from(change.content).buffer
                            : change.content,
                    ...(change.directory ? { directory: true } : {}),
                })),
            },
        };
        return () => this.preserveLocalRecovery(key, record);
    }

    private localRecoveryStorageFailed(): void {
        runInAction(() => {
            this.state.needsReload = true;
            this.state.saveAcknowledged = false;
            this.state.error =
                'The latest attempted changes could not be stored in browser recovery. Keep this tab open and download your changes before reloading. Any earlier recovery copy has been kept.';
        });
    }

    private async preserveLocalRecovery(
        key: CloudRecoveryKey,
        record: CloudRecoveryRecord,
    ): Promise<void> {
        if (
            !this.localRecoveryAttempts.some(
                (attempt) => attempt.operation.operationId === record.operation.operationId,
            )
        )
            this.localRecoveryAttempts.push(record);
        runInAction(() => {
            this.state.needsReload = true;
            this.state.saveAcknowledged = false;
            this.state.error =
                'The edit could not be prepared for saving. Download your attempted changes before reloading the saved source.';
        });
        this.syncUnloadWarning();
        try {
            // Never replace an earlier operation, even when its storage write failed.
            if (this.lastAttempt || this.operation) throw new CloudRecoveryStorageError();
            await this.recovery.save(key, record);
            this.lastAttempt = record.operation;
            this.recoveryVersion = record.version;
            this.attemptCreatedAt = record.createdAt;
            this.operationAmbiguous = false;
            this.localRecoveryAttempts = this.localRecoveryAttempts.filter(
                (attempt) => attempt !== record,
            );
            runInAction(() => {
                this.state.recoveryUnsupported = true;
            });
        } catch {
            // The old durable record is still owned by its original operation.
            // New bytes remain downloadable, including if this editor is stopping.
            if (!this.lastAttempt) {
                try {
                    const existing = await this.recovery.load(key);
                    if (existing) this.restoreRecovery(existing);
                } catch {
                    /* The new in-memory download remains available. */
                }
            }
            this.localRecoveryStorageFailed();
            throw new CloudRecoveryStorageError();
        }
    }

    private syncUnloadWarning(): void {
        if (typeof window === 'undefined') return;
        const needed = !this.stopped;
        if (needed && !this.unloadAttached)
            window.addEventListener('beforeunload', this.beforeUnload);
        if (!needed && this.unloadAttached)
            window.removeEventListener('beforeunload', this.beforeUnload);
        this.unloadAttached = needed;
    }

    private async persistRecovery(
        disposition: CloudRecoveryRecord['disposition'],
        definitiveRejection = false,
    ): Promise<void> {
        if (!this.lastAttempt) return;
        try {
            await this.recovery.save(this.recoveryKey(), {
                version: this.recoveryVersion,
                actorId: this.actorId!,
                operation: this.lastAttempt,
                ambiguous: this.operationAmbiguous,
                disposition,
                definitiveRejection,
                createdAt: this.attemptCreatedAt,
            });
        } catch {
            throw new CloudRecoveryStorageError();
        }
    }

    cacheFailed(): void {
        if (this.stopped) return;
        if (this.localRecoveryAttempts.length) {
            this.localRecoveryStorageFailed();
            return;
        }
        runInAction(() => {
            this.state.needsReload = true;
            this.state.error =
                'Your changes were saved. Reload the saved source to continue editing.';
        });
    }

    private markExternal(): void {
        if (this.state.conflict) return;
        this.externalChanges++;
        runInAction(() => {
            this.state.conflict = true;
            this.state.needsReload = true;
            this.state.error =
                'This project changed elsewhere. Reload the saved source before editing.';
        });
    }

    private rememberChanges(changes: DurableSourceChange[]): void {
        for (const change of changes) {
            if (change.content instanceof Uint8Array)
                this.binaryFiles.set(change.path, change.content.slice());
            else this.binaryFiles.delete(change.path);
            if (change.content === null && !change.directory) this.sourcePaths.delete(change.path);
            else this.sourcePaths.add(change.path);
        }
    }

    private async send(operation: CloudSourceOperation): Promise<CloudEditorCommitResult> {
        // Only an identical operation may be retried after a lost acknowledgement.
        // Its original expectedRevision is never advanced from a status poll.
        await this.persistRecovery('pending');
        let designRequest: CloudEditorCommit | undefined;
        if (operation.transport === 'design') {
            designRequest = this.designRequests.get(operation);
            if (!designRequest) {
                const { transport: _transport, transportVersion: _version, ...request } = operation;
                designRequest = request;
                this.designRequests.set(operation, request);
            }
        }
        for (let attempt = 0; ; attempt++) {
            if (this.stopped) throw new Error('Cloud project was closed');
            if (!this.maySend(operation))
                throw Object.assign(
                    new Error('This save requires its original project permission'),
                    { data: 'CLOUD_ROLE_REQUIRED' },
                );
            try {
                if (operation.transport === 'studio' || operation.transport === 'journal') {
                    const {
                        changes: _changes,
                        transport,
                        transportVersion: _version,
                        ...request
                    } = operation;
                    return transport === 'studio'
                        ? await this.client.action(
                              cloudEditorApi.commitStudio,
                              request as Omit<
                                  Extract<CloudSemanticOperation, { transport: 'studio' }>,
                                  'changes' | 'transport' | 'transportVersion'
                              >,
                          )
                        : await this.client.action(
                              cloudEditorApi.commitJournal,
                              request as Omit<
                                  Extract<CloudSemanticOperation, { transport: 'journal' }>,
                                  'changes' | 'transport' | 'transportVersion'
                              >,
                          );
                }
                if (operation.transport === 'content-image')
                    return await this.client.action(cloudEditorApi.commitImage, operation);
                if (operation.transport === 'content') {
                    if (operation.transportVersion === 2) return await this.client.action(cloudEditorApi.commitText, operation);
                    return await this.client.action(cloudEditorApi.commitContent, operation);
                }
                return await this.client.action(cloudEditorApi.commit, designRequest!);
            } catch (error) {
                if (!errorCode(error)) {
                    this.operationAmbiguous = true;
                    await this.persistRecovery('pending');
                }
                if (attempt >= 1 || errorCode(error) || this.stopped) throw error;
            }
        }
    }

    private async acknowledge(
        operation: CloudSourceOperation,
        result: CloudEditorCommitResult,
    ): Promise<void> {
        if (
            result.revision !== operation.expectedRevision + 1 ||
            result.currentRevision < result.revision
        )
            throw new Error('Unexpected saved revision');
        if (operation.transport === 'journal' && typeof window !== 'undefined') {
            try {
                clearAcknowledgedJournalDraft(
                    window.localStorage,
                    this.scope,
                    operation.actorId,
                    operation.operation,
                );
            } catch {
                /* Saved content is final; retain any unreadable browser draft for recovery. */
            }
        }
        this.operation = null;
        this.operationAmbiguous = false;
        let recoveryCleared = false;
        try {
            await this.recovery.remove(this.recoveryKey(), operation.operationId);
            recoveryCleared = true;
        } catch {
            /* Save is already acknowledged. */
        }
        if (this.stopped) return;
        this.lastAttempt = recoveryCleared ? null : operation;
        this.latestRevision = Math.max(this.latestRevision, result.currentRevision);
        this.ownWrites++;
        this.rememberChanges(
            operation.changes.map((change) => ({
                path: change.path,
                content:
                    change.content instanceof ArrayBuffer
                        ? new Uint8Array(change.content)
                        : change.content,
                ...('directory' in change && change.directory ? { directory: true as const } : {}),
            })),
        );
        runInAction(() => {
            this.state.savedRevision = result.revision;
            this.state.error = null;
            this.state.saveAcknowledged = true;
            if (
                operation.transport === 'content' &&
                this.state.contracts?.revision === operation.expectedRevision
            )
                this.state.contracts.revision = result.revision;
            if (operation.transport === 'content' && operation.transportVersion === 2 &&
                this.state.textContracts?.revision === operation.expectedRevision)
                this.state.textContracts.revision = result.revision;
        });
        if (operation.transport === 'content-image') {
            try {
                await this.refreshCapabilities();
            } catch {
                // The receipt is final. Let CodeFS install the acknowledged bytes even
                // when the follow-up permission read is unavailable; never call failed().
                runInAction(() => {
                    this.state.needsReload = true;
                    this.state.error =
                        'Your image was saved. Reload the saved source before editing.';
                });
            }
        }
        if (operation.transport === 'studio' || operation.transport === 'journal')
            runInAction(() => {
                this.state.needsReload = true;
            });
        if (!recoveryCleared)
            runInAction(() => {
                this.state.needsReload = true;
                this.state.error =
                    'Your changes were saved. Reload the saved source to clear its browser recovery copy.';
            });
        if (this.localRecoveryAttempts.length) this.localRecoveryStorageFailed();
        if (this.latestRevision > result.revision) this.markExternal();
        this.changed(
            operation.changes.map((change) => change.path),
            false,
        );
        this.syncUnloadWarning();
    }

    private async failed(error: unknown): Promise<void> {
        const code = errorCode(error);
        // The backend checks retained receipts before its revision comparison.
        // Within that window, conflict proves this operation did not commit.
        const definitiveRejection =
            (code === 'CLOUD_CONFLICT' ||
                ((this.lastAttempt?.transport === 'content' ||
                    this.lastAttempt?.transport === 'content-image') &&
                    code !== null &&
                    CONTENT_REJECTIONS_AFTER_RECEIPT.has(code)) ||
                ((this.lastAttempt?.transport === 'studio' ||
                    this.lastAttempt?.transport === 'journal') &&
                    code !== null &&
                    SEMANTIC_REJECTIONS_AFTER_RECEIPT.has(code))) &&
            Date.now() - this.attemptCreatedAt < RECOVERY_RECEIPT_LIFETIME;
        const rejected = definitiveRejection || (!!code && !this.operationAmbiguous);
        if (rejected) this.operation = null;
        let recoveryFailed = error instanceof CloudRecoveryStorageError;
        if (!recoveryFailed) {
            try {
                await this.persistRecovery(rejected ? 'rejected' : 'pending', definitiveRejection);
            } catch {
                recoveryFailed = true;
            }
        }
        if (code === 'CLOUD_CONFLICT' && rejected) this.markExternal();
        else
            runInAction(() => {
                this.state.needsReload = true;
                this.state.error = recoveryFailed
                    ? 'Browser recovery storage is unavailable. Keep this tab open and download your changes.'
                    : rejected
                      ? 'The changes were not saved. Reload the saved source before editing.'
                      : 'The save could not be confirmed. Retry the save to check what reached the cloud.';
            });
        this.syncUnloadWarning();
    }

    private prepareOperation(changes: DurableSourceChange[]): CloudSourceOperation {
        if (!(this.canWrite || (this.imageLease?.prepared && this.sourceWriteReady)))
            throw new Error('Reload or retry the saved source before editing');
        if (!this.actorId) throw new Error('The authenticated source is not ready');
        const attribute = this.attributeWrite;
        const text = this.textWrite;
        if (text && (!this.isTextApprovalCurrent(text.pin) || text.revision !== this.state.savedRevision ||
            changes.length !== 1 || changes[0]?.path !== text.pin.path || changes[0]?.content !== text.candidate ||
            changes[0]?.directory !== undefined)) throw new Error('The approved text changed before this edit could be saved');
        if (
            attribute &&
            (!this.attributeApprovalCurrent(attribute) ||
                changes.length !== 1 ||
                changes[0]?.path !== attribute.path ||
                changes[0]?.content !== attribute.candidate ||
                changes[0]?.directory !== undefined)
        ) {
            throw new Error('The approved field changed before this edit could be saved');
        }
        const candidate: CloudEditorCommit = {
            ...this.scope,
            actorId: this.actorId,
            expectedRevision: this.state.savedRevision,
            operationId: crypto.randomUUID(),
            changes: changes.map((change) => ({
                path: change.path,
                content:
                    change.content instanceof Uint8Array
                        ? Uint8Array.from(change.content).buffer
                        : change.content,
                ...(change.directory ? { directory: true } : {}),
            })),
        };
        validateCloudChanges(candidate.changes);
        if (text) {
            return { ...candidate, transport: 'content', transportVersion: 2,
                changes: [{ path: text.pin.path, content: text.candidate }],
                expectedContracts: [{ path: text.pin.path, version: 2, generation: text.pin.generation, designRevision: text.pin.designRevision }] };
        }
        if (this.isContentMode && isImportedCloudProfile(this.state.profile))
            throw new Error('Imported content edits require their original text approval');
        let operation: CloudSourceOperation;
        const image = this.imageLease;
        if (image?.prepared) {
            const asset = image.prepared;
            const source = candidate.changes.find((c) => c.path === image.pin.path);
            if (
                image.revision !== candidate.expectedRevision ||
                image.pin.actorId !== candidate.actorId ||
                typeof source?.content !== 'string' ||
                source.content !== image.candidate ||
                candidate.changes.some(
                    (c) =>
                        c.directory !== undefined ||
                        (c.path !== image.pin.path && c.path !== asset.assetPath),
                )
            )
                throw new Error('The image target changed before saving');
            return {
                ...candidate,
                transport: 'content-image',
                transportVersion: 1,
                image: {
                    attemptId: asset.attemptId,
                    path: image.pin.path,
                    oid: image.pin.oid,
                    generation: image.pin.generation,
                    assetPath: asset.assetPath,
                },
            };
        }
        if (this.isContentMode || attribute) {
            const textChanges = candidate.changes.map((change) => {
                if (typeof change.content !== 'string' || change.directory !== undefined)
                    throw new Error('Build mode can only change approved text files');
                return { path: change.path, content: change.content };
            });
            const expectedContracts = textChanges.map((change) => {
                const contract = this.state.contracts?.contracts.find(
                    (contract) => contract.active && contract.path === change.path,
                );
                if (!contract) throw new Error('This file has no approved content contract');
                return {
                    path: change.path,
                    generation: attribute?.generation ?? contract.generation,
                };
            });
            operation = {
                ...candidate,
                changes: textChanges,
                transport: 'content',
                transportVersion: 1,
                expectedContracts,
            };
        } else operation = { ...candidate, transport: 'design', transportVersion: 1 };
        return operation;
    }

    /** Semantic edits are journaled before transport. The open filesystem is never silently replaced. */
    async commitSemantic(
        request: Omit<
            CloudSemanticOperation,
            'operationId' | 'transportVersion' | 'changes' | 'projectId' | 'branchId'
        >,
    ): Promise<void> {
        if (
            !this.canWrite ||
            this.hasLocalWork ||
            this.hasPendingChanges ||
            !this.actorId ||
            request.actorId !== this.actorId ||
            request.expectedRevision !== this.state.savedRevision
        )
            throw new Error('Finish the current edit before changing pages or content');
        const operation = {
            ...request,
            ...this.scope,
            transportVersion: 1 as const,
            changes: [] as [],
            operationId: crypto.randomUUID(),
        } as CloudSemanticOperation;
        if (!validSemanticOperation(operation)) throw new Error('Unsupported content operation');
        this.operation = operation;
        this.lastAttempt = operation;
        this.recoveryVersion = 2;
        this.operationAmbiguous = false;
        this.attemptCreatedAt = Date.now();
        runInAction(() => {
            this.state.pending = true;
            this.state.error = null;
            this.state.saveAcknowledged = false;
        });
        this.syncUnloadWarning();
        try {
            const result = await this.send(operation);
            if (this.stopped) throw new Error('Cloud project was closed');
            await this.acknowledge(operation, result);
        } catch (error) {
            if (!this.stopped) await this.failed(error);
            throw error;
        } finally {
            if (!this.stopped)
                runInAction(() => {
                    this.state.pending = false;
                });
            this.syncUnloadWarning();
        }
    }

    private async commit(changes: DurableSourceChange[]): Promise<void> {
        const preserve = this.prepareLocalRecovery(changes);
        let operation: CloudSourceOperation;
        try {
            operation = this.prepareOperation(changes);
        } catch (error) {
            await preserve();
            throw error;
        }
        this.operation = operation;
        this.lastAttempt = operation;
        this.recoveryVersion = 2;
        this.operationAmbiguous = false;
        this.attemptCreatedAt = Date.now();
        runInAction(() => {
            this.state.pending = true;
            this.state.error = null;
            this.state.saveAcknowledged = false;
        });
        this.syncUnloadWarning();
        try {
            const result = await this.send(operation);
            if (this.stopped) throw new Error('Cloud project was closed');
            await this.acknowledge(operation, result);
        } catch (error) {
            if (!this.stopped) await this.failed(error);
            throw error;
        } finally {
            if (!this.stopped)
                runInAction(() => {
                    this.state.pending = false;
                });
            this.syncUnloadWarning();
        }
    }

    /** Resolve the original receipt; never replace files underneath an open editor. */
    async retryPending(): Promise<void> {
        if (this.stopped || this.state.pending || this.state.loading)
            throw new Error('Source is busy');
        const operation = this.operation;
        if (!operation) return;
        if (Date.now() - this.attemptCreatedAt >= RECOVERY_RECEIPT_LIFETIME) {
            this.operation = null;
            runInAction(() => {
                this.state.recoveryExpired = true;
                this.state.needsReload = true;
                this.state.error =
                    'An older recovery copy is available. Download it before reloading the saved source.';
            });
            throw new Error('Download the older recovery copy before reloading');
        }
        runInAction(() => {
            this.state.pending = true;
        });
        try {
            const result = await this.send(operation);
            if (this.stopped) return;
            await this.acknowledge(operation, result);
        } catch (error) {
            if (!this.stopped) await this.failed(error);
            throw error;
        } finally {
            if (!this.stopped)
                runInAction(() => {
                    this.state.pending = false;
                });
            this.syncUnloadWarning();
        }
        this.cacheFailed();
    }

    private assertNoOtherDrafts(): void {
        if (
            this.state.localDraftChanges ||
            this.state.attributeWritePending ||
            this.localRecoveryAttempts.length ||
            [...this.localWorkGuards].some((guard) => guard())
        )
            throw new Error('Other unsaved edits must be finished before discarding this text');
    }

    private assertRejectedReload(reload: NonNullable<CloudSource['rejectedReload']>): void {
        const key = this.recoveryKey();
        if (
            this.stopped ||
            this.state.pending ||
            this.state.loading ||
            this.operation ||
            this.lastAttempt !== reload.attempt ||
            key.actorId !== reload.key.actorId ||
            key.projectId !== reload.key.projectId ||
            key.branchId !== reload.key.branchId
        )
            throw new Error('The source owner or pending save changed');
        this.assertNoOtherDrafts();
        reload.lease.assertCurrent();
    }

    private requestDocumentReload(): void {
        if (this.callbacks.requestReload) this.callbacks.requestReload();
        else if (typeof window !== 'undefined') window.location.reload();
        else throw new Error('A document reload is unavailable');
    }

    private async navigateRejectedText(): Promise<void> {
        let reload = this.rejectedReload;
        let lease: RejectedTextNavigationLease | null = null;
        let removed = !!reload;
        try {
            if (!reload) {
                this.assertNoOtherDrafts();
                const attempt = this.lastAttempt;
                const key = this.recoveryKey();
                if (!attempt || !this.callbacks.prepareRejectedTextNavigation)
                    throw new Error('No settled rejected text session is available');
                lease = this.callbacks.prepareRejectedTextNavigation();
                runInAction(() => {
                    this.state.needsReload = true;
                });
                const record = await this.recovery.load(key);
                if (
                    !record ||
                    record.operation.operationId !== attempt.operationId ||
                    record.disposition !== 'rejected' ||
                    record.ambiguous ||
                    record.definitiveRejection !== true
                )
                    throw new Error('An unconfirmed recovery operation cannot be discarded here');
                reload = { lease, key, record, attempt, bypassUnload: false };
                this.assertRejectedReload(reload);
                await this.recovery.remove(key, attempt.operationId);
                removed = true;
                this.assertRejectedReload(reload);
                this.rejectedReload = reload;
            }
            this.assertRejectedReload(reload);
            runInAction(() => {
                this.state.discardReloadRequested = true;
                this.state.discardReloadFailed = false;
                this.state.error =
                    'The recovery copy was discarded. If this page stays open, download the text still in this tab or load the saved version again.';
            });
            reload.bypassUnload = true;
            this.requestDocumentReload();
            // Returning does not prove navigation. Keep exact text/history and
            // its admission lease until actual unload, explicit retry, or stop.
        } catch (error) {
            if (reload) reload.bypassUnload = false;
            if (removed && reload) {
                try {
                    await this.recovery.save(reload.key, reload.record);
                } catch {
                    this.localRecoveryStorageFailed();
                }
            }
            try {
                (reload?.lease ?? lease)?.release();
            } catch {
                /* Never release another history owner's lease. */
            }
            if (this.rejectedReload === reload) this.rejectedReload = null;
            runInAction(() => {
                this.state.discardReloadRequested = false;
                this.state.discardReloadFailed = !!(reload || lease);
            });
            throw error;
        }
    }

    reloadSavedSource(options: { discardRecovery?: boolean } = {}): Promise<void> {
        if (this.stopped) return Promise.reject(new Error('Cloud project was closed'));
        if (this.state.preparingImport)
            return Promise.reject(new Error('Wait for preparation before reloading'));
        if (this.state.pending)
            return Promise.reject(new Error('Wait for the current save before reloading'));
        if (this.operation)
            return Promise.reject(new Error('Retry the unconfirmed save before reloading'));
        if (!this.initialized) return this.start();
        if (this.hasLocalWork || this.rejectedReload) {
            if (!options.discardRecovery)
                return Promise.reject(
                    new Error(
                        this.hasPendingChanges || this.hasRecoverableText
                            ? 'Confirm discarding the recovery copy before reloading'
                            : 'Finish or copy your current edit before loading the saved version',
                    ),
                );
            this.reloadPromise ??= this.navigateRejectedText().finally(() => {
                this.reloadPromise = null;
            });
            return this.reloadPromise;
        }
        if (this.hasPendingChanges && !options.discardRecovery)
            return Promise.reject(
                new Error('Confirm discarding the recovery copy before reloading'),
            );
        this.reloadPromise ??= this.navigateToSavedSource(options.discardRecovery === true).finally(
            () => {
                this.reloadPromise = null;
            },
        );
        return this.reloadPromise;
    }

    private async navigateToSavedSource(discardRecovery: boolean): Promise<void> {
        // Freeze writes before asynchronous recovery cleanup. A cancelled browser
        // navigation leaves the editor read-only rather than reopening stale files.
        runInAction(() => {
            this.state.needsReload = true;
        });
        if (discardRecovery && this.lastAttempt) {
            await this.recovery.remove(this.recoveryKey(), this.lastAttempt.operationId);
            this.lastAttempt = null;
            this.syncUnloadWarning();
        }
        if (discardRecovery) this.localRecoveryAttempts = [];
        if (this.stopped || this.hasLocalWork)
            throw new Error('Finish or copy your current edit before loading the saved version');
        this.requestDocumentReload();
    }

    private restoreRecovery(recovery: CloudRecoveryRecord | null) {
        const restored = recovery ? cloudRecoveryOperation(recovery) : null;
        const unsupported =
            !!recovery && (!restored || (recovery.version === 1 && !this.canDesign));
        this.lastAttempt = unsupported ? recovery.operation : restored;
        this.recoveryVersion = unsupported ? recovery.version : 2;
        this.attemptCreatedAt = recovery?.createdAt ?? 0;
        this.operationAmbiguous = recovery?.disposition === 'pending';
        const expired = !!recovery && Date.now() - recovery.createdAt >= RECOVERY_RECEIPT_LIFETIME;
        this.operation =
            recovery?.disposition === 'pending' && !expired && !unsupported ? restored : null;
        runInAction(() => {
            this.state.recoveryExpired = expired;
            this.state.recoveryUnsupported = unsupported;
        });
        return { unsupported, expired };
    }

    private async hydrate(options: { preserveLocalWork?: boolean } = {}): Promise<void> {
        runInAction(() => {
            this.state.loading = true;
        });
        try {
            this.assertOwner();
            const snapshot = await this.client.query(cloudEditorApi.snapshot, this.scope);
            this.assertOwner();
            if (this.actorId && this.actorId !== snapshot.actorId)
                throw new Error('The signed-in account changed. Reopen this project.');
            this.actorId = snapshot.actorId;
            runInAction(() => { this.state.profile = snapshot.profile ?? 'starter-v1'; });
            this.recoveryIdentity ??= { ...this.scope, actorId: snapshot.actorId };
            this.fs.setDurableRecoveryHandler((changes) => this.prepareLocalRecovery(changes));
            await this.refreshCapabilities();
            this.assertOwner();
            const recovery = await this.recovery.load(this.recoveryKey());
            this.assertOwner();
            const files = await decodeSnapshot(
                snapshot,
                this.client,
                this.scope,
                this.abort.signal,
                () => this.assertOwner(),
            );
            this.assertOwner();
            if (isImportedCloudProfile(snapshot.profile)) {
                // Media reads can span a permission/design change. Verify the original
                // snapshot again before installing any of its decoded bytes.
                const current = await this.client.query(cloudEditorApi.status, this.scope);
                this.assertOwner();
                if (current.actorId !== snapshot.actorId || current.revision !== snapshot.revision ||
                    current.profile !== snapshot.profile ||
                    current.importedAuthority?.preparationId !== snapshot.importedAuthority?.preparationId ||
                    current.importedAuthority?.designRevision !== snapshot.importedAuthority?.designRevision)
                    throw new Error('The saved source changed while loading. Reopen this project.');
            }
            if (options.preserveLocalWork && (this.hasLocalWork || this.hasPendingChanges || this.hasRecoverableText))
                throw new Error('Finish or copy your current edit before loading the prepared source');
            this.assertOwner();
            await this.fs.hydrateDurableSnapshot(files, this.abort.signal);
            this.assertOwner();
            const changed = new Set([...this.sourcePaths, ...files.map((file) => file.path)]);
            this.binaryFiles.clear();
            this.sourcePaths.clear();
            this.rememberChanges(files);
            const { unsupported, expired } = this.restoreRecovery(recovery);
            this.externalChanges++;
            runInAction(() => {
                this.state.savedRevision = snapshot.revision;
                this.state.error = null;
                this.state.conflict = false;
                this.state.needsReload = false;
                this.state.recoveryExpired = expired;
                this.state.recoveryUnsupported = unsupported;
            });
            if (recovery)
                runInAction(() => {
                    this.state.saveAcknowledged = false;
                    this.state.needsReload = true;
                    this.state.error = unsupported
                        ? 'This recovery copy cannot be replayed with the current save protocol or access. Download it before reloading.'
                        : expired
                          ? 'An older recovery copy is available. Download it before reloading the saved source.'
                          : this.operation
                            ? 'An earlier save was not confirmed. Retry that save before editing.'
                            : 'Unsaved changes were recovered. Download them before reloading the saved source.';
                });
            if (this.latestRevision > snapshot.revision) this.markExternal();
            this.changed([...changed], true);
            this.syncUnloadWarning();
        } catch (error) {
            if (!this.stopped)
                runInAction(() => {
                    this.state.needsReload = true;
                    this.state.error =
                        'The saved source could not be loaded. Try reloading it again.';
                });
            throw error;
        } finally {
            if (!this.stopped)
                runInAction(() => {
                    this.state.loading = false;
                });
        }
    }

    /** Preparation changes saved source only. Preview provisioning requires a second explicit action. */
    prepareImportedSource(): Promise<void> {
        if (this.stopped) return Promise.reject(new Error('Cloud project was closed'));
        this.preparationPromise ??= this.prepareImport().finally(() => { this.preparationPromise = null; });
        return this.preparationPromise;
    }

    private async prepareImport(): Promise<void> {
        const clean = () => !this.state.pending && !this.state.loading && !this.state.needsReload &&
            !this.state.conflict && !this.operation && !this.hasLocalWork && !this.hasPendingChanges && !this.hasRecoverableText;
        if (!(this.canPrepareImport || (this.state.preparationError && this.state.access?.canDesign === true && this.canPreview)) || !clean()) throw new Error('Finish or recover your current edit before preparing this site');
        const unconfirmed = this.state.preparationError;
        runInAction(() => { this.state.preparingImport = true; this.state.preparationError = false; });
        try {
            this.assertOwner();
            await this.refreshCapabilities();
            this.assertOwner();
            if (!clean() || !this.actorId) throw new Error('Import preparation is unavailable');
            if (this.canPrepareImport) {
                const actorId = this.actorId;
                const expectedRevision = this.state.savedRevision;
                // The immutable import scope/revision and actor produce the same key
                // after a timeout or browser restart. Never replace an ambiguous key.
                const identity = [1, actorId, this.scope.projectId, this.scope.branchId, expectedRevision];
                const operationKey = `prepare_${await sha256(new TextEncoder().encode(JSON.stringify(identity)))}`;
                if (!this.canPrepareImport || !clean() || this.actorId !== actorId || this.state.savedRevision !== expectedRevision)
                    throw new Error('Import preparation changed');
                this.assertOwner();
                await this.client.action(cloudEditorApi.prepareImport, { ...this.scope, expectedRevision, operationKey });
                this.assertOwner();
            } else if (!unconfirmed || this.state.access?.canDesign !== true || !this.canPreview) {
                throw new Error('Import preparation is unavailable');
            }
            // A committed preparation no longer grants canPrepareImport. Resolve
            // a lost acknowledgement by reading its saved result, not by starting it again.
            this.assertOwner();
            await this.hydrate({ preserveLocalWork: true });
            if (this.state.profile !== 'imported-next-v1') throw new Error('Prepared source is unavailable');
            this.assertOwner();
            await this.refreshCapabilities();
            this.assertOwner();
            await this.refreshStatus();
            this.assertOwner();
        } catch (error) {
            if (!this.stopped) runInAction(() => { this.state.preparationError = true; });
            throw error;
        } finally {
            if (!this.stopped) runInAction(() => { this.state.preparingImport = false; });
        }
    }

    retryPreview(): Promise<void> {
        if (this.stopped) return Promise.reject(new Error('Cloud project was closed'));
        this.previewPromise ??= this.ensurePreview().finally(() => {
            this.previewPromise = null;
        });
        return this.previewPromise;
    }

    private async ensurePreview(): Promise<void> {
        try {
            this.assertOwner();
            if (!this.canPreview)
                throw Object.assign(
                    new Error('Cloud project access is required to start the preview'),
                    { data: 'CLOUD_ROLE_REQUIRED' },
                );
            await this.client.mutation(cloudEditorApi.ensurePreview, this.scope);
            this.assertOwner();
            if (!this.stopped) {
                this.previewRequestError = null;
                runInAction(() => {
                    this.state.runtimeError = null;
                    this.state.previewStartErrorCode = null;
                });
            }
        } catch (error) {
            if (!this.stopped) {
                this.previewRequestError =
                    errorCode(error) === 'CLOUD_PREVIEW_ALLOWANCE_REQUIRED'
                        ? 'The agency needs to allow another preview start. Your saved source is still available.'
                        : 'The cloud preview could not be started. Your saved source is still available.';
                runInAction(() => {
                    this.state.runtimeError = this.previewRequestError;
                    this.state.previewStartErrorCode = errorCode(error);
                });
            }
            throw error;
        }
    }

    private schedulePoll(delay = 2_000): void {
        if (this.stopped || this.pollTimer) return;
        this.pollTimer = setTimeout(() => {
            this.pollTimer = null;
            void this.poll();
        }, delay);
    }

    private async poll(): Promise<void> {
        if (this.stopped || this.polling) return;
        this.polling = true;
        try {
            await this.refreshCapabilities();
            let status = await this.client.query(cloudEditorApi.status, this.scope);
            if (
                status.enabled &&
                status.status === 'ready' &&
                !status.previewToken &&
                (status.expiresAt ?? 0) > Date.now() &&
                this.canPreview
            ) {
                // Minting an actor-bound view ticket never provisions runtime work.
                await this.client.mutation(cloudEditorApi.issuePreview, this.scope);
                status = await this.client.query(cloudEditorApi.status, this.scope);
            }
            if (this.stopped) return;
            this.latestRevision = Math.max(this.latestRevision, status.revision);
            const expired =
                status.status === 'ready' &&
                status.expiresAt !== null &&
                status.expiresAt <= Date.now();
            runInAction(() => {
                this.state.runtimeExpired = expired;
                this.state.runtime = expired
                    ? {
                          ...status,
                          status: 'stopped',
                          previewUrl: null,
                          previewToken: null,
                      }
                    : status;
                this.state.runtimeError =
                    this.previewRequestError ??
                    (expired
                        ? 'The cloud preview expired. Restart the preview. Your saved source is still available.'
                        : null);
            });
            if (
                !this.operation &&
                !this.state.loading &&
                !this.state.preparingImport &&
                status.revision > this.state.savedRevision
            ) {
                this.markExternal();
            }
        } catch {
            if (!this.stopped)
                runInAction(() => {
                    this.state.runtimeError = 'The preview status could not be checked.';
                });
        } finally {
            this.polling = false;
            this.schedulePoll();
        }
    }

    async refreshStatus(): Promise<void> {
        await this.poll();
    }

    /** Includes download-only preparation failures without selecting a save endpoint. */
    pendingChangesBackup() {
        const editingText = this.callbacks.recoverableText?.() ?? null;
        if (!this.hasPendingChanges && editingText === null)
            throw new Error('There are no unsaved changes to download');
        const encodeChanges = (changes: CloudRecoveryOperation['changes']) =>
            changes.map((change) => {
                if (change.content instanceof ArrayBuffer) {
                    const bytes = new Uint8Array(change.content);
                    let base64 = '';
                    for (let offset = 0; offset < bytes.length; offset += 6_144)
                        base64 += btoa(
                            String.fromCharCode(...bytes.subarray(offset, offset + 6_144)),
                        );
                    return { path: change.path, encoding: 'base64', content: base64 };
                }
                return {
                    path: change.path,
                    encoding: change.directory
                        ? 'directory'
                        : change.content === null
                          ? 'delete'
                          : 'utf8',
                    content: change.content,
                };
            });
        return {
            editingText,
            version: 2,
            recoveryVersion: this.recoveryVersion,
            transport:
                this.lastAttempt?.transport ??
                (this.recoveryVersion === 1 ? 'legacy-design' : null),
            transportVersion: this.lastAttempt?.transportVersion ?? null,
            expectedContracts: this.lastAttempt?.expectedContracts ?? null,
            image: this.lastAttempt?.image ?? null,
            semanticOperation: this.lastAttempt?.operation ?? null,
            expectedGeneration: this.lastAttempt?.expectedGeneration ?? null,
            operationId: this.lastAttempt?.operationId ?? null,
            expectedRevision: this.lastAttempt?.expectedRevision ?? this.state.savedRevision,
            changes: encodeChanges(this.lastAttempt?.changes ?? []),
            localAttempts: this.localRecoveryAttempts.map((attempt) => ({
                operationId: attempt.operation.operationId,
                expectedRevision: attempt.operation.expectedRevision,
                transport: 'local-only',
                stored: false,
                changes: encodeChanges(attempt.operation.changes),
            })),
        };
    }

    /** Explicit user download, including binary edits that cannot fit in a text diff. */
    downloadPendingChanges(): void {
        const backup = this.pendingChangesBackup();
        const url = URL.createObjectURL(
            new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }),
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = 'unsaved-source-changes.json';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1_000);
    }

    async stop(): Promise<void> {
        this.closed = true;
        this.callbacks.owner?.signal.removeEventListener('abort', this.onOwnerLost);
        runInAction(() => {
            this.state.accessReady = false;
            this.state.access = null;
            this.state.contracts = null;
            this.state.textContracts = null;
            this.state.runtime = null;
        });
        const reload = this.rejectedReload;
        this.rejectedReload = null;
        try {
            reload?.lease.release();
        } catch {
            /* This stop must not affect a newer owner. */
        }
        this.abort.abort();
        if (this.pollTimer) clearTimeout(this.pollTimer);
        this.pollTimer = null;
        this.listeners.clear();
        this.localWorkGuards.clear();
        this.syncUnloadWarning();
        // The installed closures are fenced by stopped. Do not touch a filesystem
        // whose owner may already have been replaced by a newer editor session.
    }
}
