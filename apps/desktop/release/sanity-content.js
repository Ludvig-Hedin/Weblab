'use strict';

const { randomUUID } = require('node:crypto');
const { assertRequestActive } = require('./authorize');
const { requireSiteEngine } = require('./site-engine');
const defaultEngine = requireSiteEngine('index');
const { stable, hash, clone } = requireSiteEngine('contract');
const { materializeRuntime } = requireSiteEngine('runtime');

const MAX_RESPONSE = 10 * 1024 * 1024;
const MAX_REQUEST = 16 * 1024;
const RECORD_LIMIT = 512 * 1024;
const POINTER_LIMIT = 1024;
const MAX_PREDECESSOR_PATH = 128;
const PREDECESSOR_RUNTIME_PATHS = new Set(materializeRuntime({}, '0'.repeat(64), defaultEngine.PROFILE.sourcePins).map((file) => file.path));
const PREDECESSOR_ASSET_PATH = /^public\/weblab-frozen-sanity\/[a-f0-9]{64}\.(?:jpg|png|webp|gif|avif)$/;
const ACTIVE_NAME = 'sanity-content-active.json';
const DIGEST = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function failed(message) { throw new Error(`Website content: ${message}`); }
function exact(value, keys) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join() !== [...keys].sort().join()) failed('unexpected content input.');
}
function identity(value) { return typeof value === 'string' && value.length > 0 && value.length <= 160 && !/[\u0000-\u001f]/.test(value); }
function revision(value) { return Number.isSafeInteger(value) && value > 0; }
function beforeAbort(pending, signal) {
    if (signal.aborted) return Promise.reject(new Error('Website content: export timed out or was cancelled.'));
    return new Promise((resolve, reject) => {
        const abort = () => reject(new Error('Website content: export timed out or was cancelled.'));
        signal.addEventListener('abort', abort, { once: true });
        pending.then((value) => { signal.removeEventListener('abort', abort); resolve(value); }, (error) => { signal.removeEventListener('abort', abort); reject(error); });
    });
}
function selectionPins(input) {
    if (!identity(input.connectionId) || !revision(input.connectionRevision) || !Array.isArray(input.selections) || input.selections.length > 8) failed('select at most eight drafts with their current connection revision.');
    const seen = new Set();
    const selections = input.selections.map((pin) => {
        exact(pin, ['draftId', 'expectedRevision', 'providerRevision', 'archived']);
        if (!identity(pin.draftId) || seen.has(pin.draftId) || !revision(pin.expectedRevision) || typeof pin.archived !== 'boolean' ||
            (pin.providerRevision !== null && (typeof pin.providerRevision !== 'string' || !pin.providerRevision || pin.providerRevision.length > 256))) failed('invalid selected draft pins.');
        seen.add(pin.draftId);
        return clone(pin);
    }).sort((a, b) => a.draftId.localeCompare(b.draftId));
    return { connectionId: input.connectionId, connectionRevision: input.connectionRevision, selections };
}
function nativeScope(input, context) {
    const binding = context?.binding;
    if (!binding || !identity(binding.userId) || !identity(binding.projectId) || !identity(binding.branchId) || typeof binding.root !== 'string' || !binding.root.startsWith('/') ||
        input.projectId !== binding.projectId || input.branchId !== binding.branchId || typeof context.directory !== 'string' || !context.directory.startsWith('/') || typeof context.refreshAccess !== 'function') failed('the authorized project scope changed.');
    return { userId: binding.userId, projectId: binding.projectId, branchId: binding.branchId, rootPath: binding.root };
}
function nativePins(artifact) {
    return { scope: clone(artifact.scope), manifestHash: artifact.manifestHash, captureId: artifact.captureId, contentHash: artifact.contentHash,
        draftHash: artifact.draftHash, sourceHash: artifact.sourceHash, predecessor: clone(artifact.predecessor ?? null) };
}
function publicResult(receipt, status) {
    return { status, manifestHash: receipt.manifestHash, captureId: receipt.captureId, contentHash: receipt.nativePins.contentHash,
        draftHash: receipt.nativePins.draftHash, selectedCount: receipt.selections.length, connectionId: receipt.connectionId,
        connectionRevision: receipt.connectionRevision, selections: clone(receipt.selections), quoteFormUnavailable: true };
}
function validateExport(value, scope, pins, profile) {
    exact(value, ['version', 'userId', 'connection', 'drafts']);
    if (value.version !== 1 || value.userId !== scope.userId || !Array.isArray(value.drafts) || value.drafts.length !== pins.selections.length) failed('the exported content belongs to a different actor or selection.');
    const connection = value.connection;
    exact(connection, ['id', 'projectId', 'branchId', 'sanityProjectId', 'dataset', 'profile', 'revision']);
    if (connection.id !== pins.connectionId || connection.revision !== pins.connectionRevision || connection.projectId !== scope.projectId || connection.branchId !== scope.branchId ||
        connection.profile !== 'sanity-blog-v1' || connection.sanityProjectId !== profile.projectId || connection.dataset !== profile.dataset) failed('the content connection changed or is outside the approved site.');
    const wanted = new Map(pins.selections.map((pin) => [pin.draftId, pin]));
    const seen = new Set();
    const documentIds = new Set();
    const drafts = value.drafts.map((draft) => {
        exact(draft, ['id', 'documentId', 'originalJson', 'documentJson', 'providerRevision', 'revision', 'archived', 'updatedAt']);
        const pin = wanted.get(draft.id);
        if (!pin || seen.has(draft.id) || !identity(draft.documentId) || documentIds.has(draft.documentId) || draft.revision !== pin.expectedRevision ||
            draft.providerRevision !== pin.providerRevision || draft.archived !== pin.archived || !Number.isFinite(draft.updatedAt) ||
            typeof draft.originalJson !== 'string' || typeof draft.documentJson !== 'string' || Buffer.byteLength(draft.originalJson) > 256 * 1024 || Buffer.byteLength(draft.documentJson) > 256 * 1024) failed('selected content changed or is incomplete.');
        seen.add(draft.id); documentIds.add(draft.documentId);
        return clone(draft);
    }).sort((a, b) => a.id.localeCompare(b.id));
    const result = { version: 1, userId: value.userId, connection: clone(connection), drafts };
    return { value: result, digest: hash(stable(result)) };
}

class SanityContentCoordinator {
    constructor({ appUrl, store, local, engine = defaultEngine, captureDependencies = {}, fetchImpl = globalThis.fetch, now = Date.now }) {
        const origin = new URL(appUrl);
        if (origin.username || origin.password || origin.hash || origin.search || origin.pathname !== '/' || (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)))) failed('a trusted application origin is required.');
        if (!store || !local || typeof fetchImpl !== 'function') failed('native content setup is unavailable.');
        if (!engine.PROFILE?.projectId || engine.PROFILE.dataset !== 'production') failed('the approved website profile is unavailable.');
        Object.assign(this, { origin: origin.origin, store, local, engine, captureDependencies, fetchImpl, now });
    }

    async authorized(input, context) {
        assertRequestActive(input);
        const scope = nativeScope(input, context);
        await context.refreshAccess();
        assertRequestActive(input);
        if (stable(nativeScope(input, context)) !== stable(scope)) failed('the authorized scope changed.');
        return scope;
    }

    async exportContent(input, scope, pins) {
        assertRequestActive(input);
        if (typeof input.jwt !== 'string' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(input.jwt) || input.jwt.length > 8192) failed('sign in again before preparing website content.');
        const body = stable({ projectId: scope.projectId, branchId: scope.branchId, ...pins });
        if (Buffer.byteLength(body) > MAX_REQUEST) failed('selected content request is too large.');
        const controller = new AbortController();
        const deadline = setTimeout(() => controller.abort(), 10000);
        const active = setInterval(() => { try { assertRequestActive(input); } catch { controller.abort(); } }, 50);
        let reader;
        try {
            const response = await beforeAbort(this.fetchImpl(new URL('/api/native/publishing/content', this.origin), {
                method: 'POST', redirect: 'error', credentials: 'omit', signal: controller.signal,
                headers: { Authorization: `Bearer ${input.jwt}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body,
            }), controller.signal);
            assertRequestActive(input);
            if (!response.ok || response.redirected || (response.url && new URL(response.url).origin !== this.origin) ||
                !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '') || !response.body) failed('the selected website content could not be verified.');
            const declared = response.headers.get('content-length');
            if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_RESPONSE)) failed('the selected content response is too large.');
            reader = response.body.getReader();
            const chunks = [];
            let size = 0;
            for (;;) {
                assertRequestActive(input);
                if (controller.signal.aborted) failed('content export timed out or was cancelled.');
                const next = await beforeAbort(reader.read(), controller.signal);
                if (next.done) break;
                size += next.value.byteLength;
                if (size > MAX_RESPONSE) failed('the selected content response is too large.');
                chunks.push(Buffer.from(next.value));
            }
            assertRequestActive(input);
            let value;
            try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
            catch { failed('the selected content response is invalid.'); }
            return validateExport(value, scope, pins, this.engine.PROFILE);
        } catch (error) {
            assertRequestActive(input);
            if (error.message?.startsWith('Website content:')) throw error;
            failed('selected website content could not be verified. Review it again.');
        } finally {
            clearTimeout(deadline); clearInterval(active);
            if (reader) { void reader.cancel().catch(() => {}); try { reader.releaseLock(); } catch { /* Cancellation may leave a pending native read. */ } }
        }
    }

    receiptName(manifestHash) {
        if (!DIGEST.test(manifestHash)) failed('retained content identity is invalid.');
        return `sanity-content-${manifestHash}.json`;
    }

    validateReceipt(receipt, scope) {
        exact(receipt, ['version', 'captureId', 'scope', 'connectionId', 'connectionRevision', 'selections', 'exportDigest', 'manifestHash', 'nativePins', 'createdAt']);
        exact(receipt.nativePins, ['scope', 'manifestHash', 'captureId', 'contentHash', 'draftHash', 'sourceHash', 'predecessor']);
        if (!receipt || receipt.version !== 1 || !UUID.test(receipt.captureId) || !DIGEST.test(receipt.manifestHash) || !DIGEST.test(receipt.exportDigest) ||
            !Number.isFinite(receipt.createdAt) || stable(receipt.scope) !== stable(scope) || stable(receipt.nativePins?.scope) !== stable(scope) ||
            receipt.nativePins?.manifestHash !== receipt.manifestHash || ['captureId', 'contentHash', 'draftHash', 'sourceHash'].some((key) => !DIGEST.test(receipt.nativePins?.[key]))) failed('retained content receipt belongs to another scope or is invalid.');
        selectionPins(receipt);
        const predecessor = receipt.nativePins.predecessor;
        if (predecessor !== null) {
            exact(predecessor, ['manifestHash', 'targets']);
            if (!DIGEST.test(predecessor.manifestHash) || !Array.isArray(predecessor.targets) || predecessor.targets.length > 1024) failed('retained predecessor is invalid.');
            const seen = new Set();
            for (const target of predecessor.targets) {
                exact(target, ['path', 'sha256']);
                if (typeof target.path !== 'string' || target.path.length > MAX_PREDECESSOR_PATH || (!PREDECESSOR_RUNTIME_PATHS.has(target.path) && !PREDECESSOR_ASSET_PATH.test(target.path)) || seen.has(target.path) || !DIGEST.test(target.sha256)) failed('retained predecessor target is invalid.');
                seen.add(target.path);
            }
            if ([...PREDECESSOR_RUNTIME_PATHS].some((path) => !seen.has(path))) failed('retained predecessor is incomplete.');
        }
        return receipt;
    }

    async readReceipt(context, scope) {
        const pointerBytes = await this.store.read(context.directory, ACTIVE_NAME, POINTER_LIMIT);
        if (!pointerBytes) return { receipt: null, pointerBytes: null };
        let pointer;
        try { pointer = JSON.parse(pointerBytes.toString('utf8')); } catch { failed('retained content pointer is invalid.'); }
        exact(pointer, ['version', 'scopeHash', 'manifestHash', 'receiptHash']);
        if (pointer.version !== 1 || pointer.scopeHash !== hash(stable(scope)) || !DIGEST.test(pointer.manifestHash) || !DIGEST.test(pointer.receiptHash)) failed('retained content pointer belongs to another scope.');
        const bytes = await this.store.read(context.directory, this.receiptName(pointer.manifestHash), RECORD_LIMIT);
        if (!bytes || hash(bytes) !== pointer.receiptHash) failed('retained content receipt changed.');
        let receipt;
        try { receipt = JSON.parse(bytes.toString('utf8')); } catch { failed('retained content receipt is invalid.'); }
        return { receipt: this.validateReceipt(receipt, scope), pointerBytes };
    }

    compareNative(receipt, native) {
        if (!native) return 'prepared';
        if (stable(native.scope) !== stable(receipt.scope)) failed('retained native content belongs to another actor or site.');
        if (native.manifestHash !== receipt.manifestHash) {
            if (native.status !== 'complete' || native.manifestHash !== receipt.nativePins.predecessor?.manifestHash) failed('retained native content changed.');
            return 'prepared';
        }
        for (const key of ['captureId', 'contentHash', 'draftHash']) if (native[key] !== receipt.nativePins[key]) failed('retained native content pins changed.');
        if (native.status === 'complete') return native.needsPreparation === true ? 'needsPreparation' : 'complete';
        if (!['pending', 'conflicted'].includes(native.status)) failed('retained native content status is invalid.');
        return 'pending';
    }

    async status(input, context) {
        exact(input, ['projectId', 'branchId', 'jwt']);
        const scope = await this.authorized(input, context);
        const { receipt } = await this.readReceipt(context, scope);
        assertRequestActive(input);
        if (!receipt) return { status: 'absent' };
        const native = await this.local.inspectRetainedSanitySiteInstall(scope.rootPath);
        assertRequestActive(input);
        return publicResult(receipt, this.compareNative(receipt, native));
    }

    async currentGuard(input, context, receipt, native) {
        const scope = await this.authorized(input, context);
        this.validateReceipt(receipt, scope);
        if (stable(native) !== stable(receipt.nativePins)) failed('retained installation or predecessor changed.');
        const exported = await this.exportContent(input, scope, selectionPins(receipt));
        if (exported.digest !== receipt.exportDigest) failed('selected content changed during preparation. Review again.');
        assertRequestActive(input);
    }

    async retainedRecoveryGuard(input, context, receipt, native) {
        const scope = await this.authorized(input, context);
        this.validateReceipt(receipt, scope);
        if (stable(native) !== stable(receipt.nativePins)) failed('retained installation or predecessor changed.');
        // Explicit recovery finishes immutable retained bytes, without claiming old drafts are current.
        await this.exportContent(input, scope, { connectionId: receipt.connectionId, connectionRevision: receipt.connectionRevision, selections: [] });
        assertRequestActive(input);
    }

    async stopOwnedPreview(input, scope) {
        assertRequestActive(input);
        const stopped = await this.local.stopDevServer(scope.rootPath);
        assertRequestActive(input);
        if (stopped?.success !== true) failed('the app preview must stop before website content can be prepared.');
    }

    async prepare(input, context) {
        exact(input, ['projectId', 'branchId', 'jwt', 'connectionId', 'connectionRevision', 'selections']);
        const pins = selectionPins(input);
        const scope = await this.authorized(input, context);
        const current = await this.readReceipt(context, scope);
        const prior = await this.local.inspectRetainedSanitySiteInstall(scope.rootPath);
        assertRequestActive(input);
        if (prior && stable(prior.scope) !== stable(scope)) failed('the native content belongs to another actor or site.');
        if (prior && prior.status !== 'complete') failed('resume the pending website setup before preparing another version.');
        const currentStatus = current.receipt ? this.compareNative(current.receipt, prior) : null;
        if (currentStatus === 'pending') failed('resume the retained content before preparing another version.');
        const exported = await this.exportContent(input, scope, pins);
        await this.stopOwnedPreview(input, scope);
        const source = await this.local.readVerifiedSanitySiteSource(scope.rootPath);
        assertRequestActive(input);
        const controller = new AbortController();
        const active = setInterval(() => { try { assertRequestActive(input); } catch { controller.abort(); } }, 50);
        let handle;
        try {
            handle = await this.engine.captureSite({ sourceFiles: source.sourceFiles, predecessor: source.predecessor,
                scope, coordinates: { projectId: this.engine.PROFILE.projectId, dataset: this.engine.PROFILE.dataset, apiVersion: this.engine.PROFILE.apiVersion },
                selectedDrafts: exported.value.drafts }, { ...this.captureDependencies, signal: controller.signal });
            const artifact = this.engine.getRetainedSiteArtifact(handle);
            if (stable(artifact.scope) !== stable(scope)) failed('captured content scope changed.');
            let receipt = { version: 1, captureId: randomUUID(), scope, ...pins, exportDigest: exported.digest,
                manifestHash: artifact.manifestHash, nativePins: nativePins(artifact), createdAt: this.now() };
            if (current.receipt?.manifestHash === artifact.manifestHash) {
                if (current.receipt.exportDigest !== exported.digest || stable(selectionPins(current.receipt)) !== stable(pins) || stable(current.receipt.nativePins) !== stable(receipt.nativePins)) failed('the immutable capture receipt conflicts with this preparation.');
                receipt = current.receipt;
            }
            this.validateReceipt(receipt, scope);
            await this.currentGuard(input, context, receipt, receipt.nativePins);
            const receiptBytes = Buffer.from(stable(receipt));
            if (receiptBytes.length > RECORD_LIMIT) failed('retained content receipt is too large.');
            const name = this.receiptName(receipt.manifestHash);
            const retainedBytes = await this.store.read(context.directory, name, RECORD_LIMIT);
            if (retainedBytes && !retainedBytes.equals(receiptBytes)) failed('this exact capture already has a different immutable receipt.');
            if (!retainedBytes) await this.store.write(context.directory, name, receiptBytes, null);
            assertRequestActive(input);
            const pointer = { version: 1, scopeHash: hash(stable(scope)), manifestHash: receipt.manifestHash, receiptHash: hash(receiptBytes) };
            await this.store.write(context.directory, ACTIVE_NAME, Buffer.from(stable(pointer)), current.pointerBytes);
            assertRequestActive(input);
            await this.local.installRetainedSanitySite(scope.rootPath, handle, undefined, {
                assertCurrent: (native) => this.currentGuard(input, context, receipt, native),
                assertActive: () => assertRequestActive(input),
            });
            const installed = await this.local.inspectRetainedSanitySiteInstall(scope.rootPath);
            assertRequestActive(input);
            const status = this.compareNative(receipt, installed);
            if (status !== 'complete') failed('website setup is retained but is not complete. Resume it before preview.');
            return publicResult(receipt, status);
        } finally {
            clearInterval(active);
            if (handle) this.engine.discardRetainedSiteArtifact(handle);
        }
    }

    async resume(input, context) {
        const hasRecovery = Object.hasOwn(input, 'recovery');
        exact(input, ['projectId', 'branchId', 'jwt', 'connectionId', 'connectionRevision', 'selections', ...(hasRecovery ? ['recovery'] : [])]);
        if (hasRecovery && typeof input.recovery !== 'boolean') failed('retained recovery requires an explicit choice.');
        const scope = await this.authorized(input, context);
        const requested = selectionPins(input);
        const { receipt } = await this.readReceipt(context, scope);
        if (!receipt || stable(requested) !== stable(selectionPins(receipt))) failed('resume requires the exact retained connection and draft pins.');
        const native = await this.local.inspectRetainedSanitySiteInstall(scope.rootPath);
        assertRequestActive(input);
        const status = this.compareNative(receipt, native);
        if (status === 'prepared') failed('capture was not installed. Prepare website content again.');
        if (status === 'needsPreparation') failed('saved website edits need a new content preparation before preview.');
        if (input.recovery === true && status !== 'pending') failed('retained recovery is available only for a pending website setup.');
        const assertCurrent = (metadata) => input.recovery === true ? this.retainedRecoveryGuard(input, context, receipt, metadata) : this.currentGuard(input, context, receipt, metadata);
        await assertCurrent(receipt.nativePins);
        if (status !== 'complete') {
            await this.stopOwnedPreview(input, scope);
            await this.local.resumeRetainedSanitySiteInstall(scope.rootPath, undefined, {
                assertCurrent,
                assertActive: () => assertRequestActive(input),
                requiresPreparation: input.recovery === true,
            });
        }
        const completed = await this.local.inspectRetainedSanitySiteInstall(scope.rootPath);
        assertRequestActive(input);
        const completedStatus = this.compareNative(receipt, completed);
        if (!['complete', 'needsPreparation'].includes(completedStatus) || (input.recovery === true && completedStatus !== 'needsPreparation')) failed('website setup still needs recovery before preview.');
        return publicResult(receipt, completedStatus);
    }
}

module.exports = { SanityContentCoordinator, validateExport, selectionPins, MAX_RESPONSE, MAX_REQUEST };
