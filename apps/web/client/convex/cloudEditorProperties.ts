import { makeFunctionReference } from 'convex/server';
import { v, type Infer } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { requireCloudAccess } from './cloudEditorAccess';
import { propertyApprovalArgs, propertyBinding, propertyCommitArgs, propertyPin, propertyScope } from './cloudEditorPropertySchema';
import { assertCloudRevision, assertOperationId, cloudError, cloudPath, inlineSourceBytes,
    MAX_CLOUD_CHANGE_BYTES, MAX_CLOUD_FILES, MAX_CLOUD_INLINE_BYTES, validateCloudChanges } from './lib/cloudEditor';
import { canUseImportedProperties } from './lib/cloudImportedAccess';
import { MAX_IMPORT_BYTES } from './lib/cloudImportManifest';
import { assertImportedTextChanges } from './lib/cloudImportedState';
import { assertSnapshotBudget, assertSnapshotEnvelope, snapshotCanonicalJson, snapshotDocumentBytes } from './lib/cloudImportedRelease';

type Context = QueryCtx | MutationCtx;
type Scope = { projectId: Id<'projects'>; branchId: Id<'branches'>; actorId: Id<'users'> };
type Pin = Infer<typeof propertyPin>;
type Binding = Infer<typeof propertyBinding>;
const commitValidator = v.object(propertyCommitArgs);
type Commit = Infer<typeof commitValidator>;
const encoder = new TextEncoder();
const MAX_CONTRACTS = 32, MAX_CONTRACT_BYTES = 128 * 1024;
const siblingPin = v.union(v.null(), v.object({ id: v.id('cloudEditorContentContracts'), identity: v.string(), nextFingerprint: v.union(v.string(), v.null()) }));
const sourceEnvelope = { sourceFingerprint: v.string(), ownerHash: v.string(), ownerBytes: v.number() };
const sync = makeFunctionReference<'action', { projectId: Id<'projects'>; branchId: Id<'branches'> }, null>('cloudEditorRuntime:sync');
function hash(value: string): void { if (value.length !== 64 || /[^a-f0-9]/.test(value)) cloudError('CLOUD_INVALID_OPERATION'); }
function generation(value: number, zero = false): void {
    if (!Number.isSafeInteger(value) || value < (zero ? 0 : 1) || value >= Number.MAX_SAFE_INTEGER) cloudError('CLOUD_CONTENT_INVALID_GENERATION');
}
async function digest(value: string): Promise<string> {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
}
function boundedString(value: string, max: number): boolean {
    if (!value || encoder.encode(value).byteLength > max || /[\u0000-\u001f\u007f]/.test(value)) return false;
    for (let i = 0; i < value.length; i++) {
        const unit = value.charCodeAt(i);
        if (unit >= 0xd800 && unit <= 0xdbff) { const next = value.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) return false; }
        else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
    }
    return true;
}
function definitionBounds(path: string, bindings: Binding[]): void {
    cloudPath(path);
    if (!bindings.length || bindings.length > 100 || encoder.encode(snapshotCanonicalJson({ version: 1, path, bindings })).byteLength + 100 > MAX_CONTRACT_BYTES)
        cloudError('CLOUD_PROPERTY_INVALID_DEFINITION');
    const ids = new Set<string>(), targets = new Set<string>();
    for (const binding of bindings) {
        const target = snapshotCanonicalJson(binding.target);
        if (!boundedString(binding.bindingId, 80) || /[^A-Za-z0-9_.:-]/.test(binding.bindingId) || ids.has(binding.bindingId) || targets.has(target)
            || !boundedString(binding.label, 80) || !binding.options.length || binding.options.length > 20) cloudError('CLOUD_PROPERTY_INVALID_DEFINITION');
        ids.add(binding.bindingId); targets.add(target);
        const options = new Set<string>(), values = new Set<string>();
        for (const option of binding.options) {
            if (!boundedString(option.id, 80) || /[^A-Za-z0-9_.:-]/.test(option.id) || options.has(option.id) || values.has(option.value)
                || !boundedString(option.label, 80) || !boundedString(option.value, 2_048)) cloudError('CLOUD_PROPERTY_INVALID_DEFINITION');
            options.add(option.id); values.add(option.value);
        }
    }
}
/** Exact factual receipts still need current imported source visibility and preparation. */
async function ordinary(ctx: Context, scope: Scope) {
    const access = await requireCloudAccess(ctx, scope);
    if (access.user._id !== scope.actorId) cloudError('CLOUD_ACTOR_CHANGED');
    if (access.state.profile !== 'imported-next-v1') cloudError('CLOUD_CONTENT_PROFILE_UNSUPPORTED');
    if (!access.role || !access.canReadSource || process.env.WEBLAB_CLOUD_EDITOR_ENABLED !== 'true') cloudError('CLOUD_ROLE_REQUIRED');
    if (!access.preparation || !access.importedAuthority) return cloudError('CLOUD_IMPORT_PREPARATION_INVALID');
    return { ...access, preparation: access.preparation, designRevision: access.importedAuthority.designRevision };
}
async function accessFor(ctx: Context, scope: Scope, revision?: number, designer = false) {
    const access = await ordinary(ctx, scope);
    if (!canUseImportedProperties(access.role, access.importedAuthority)) cloudError('CLOUD_IMPORTED_PROPERTIES_DISABLED');
    if (designer && !access.canDesign) cloudError('CLOUD_ROLE_REQUIRED');
    if (revision !== undefined) { assertCloudRevision(revision); if (access.state.revision !== revision) cloudError('CLOUD_CONFLICT'); }
    return access;
}
async function contractFor(ctx: Context, scope: Scope, path: string) {
    cloudPath(path);
    const row = await ctx.db.query('cloudEditorPropertyContracts').withIndex('by_branchId_and_path', q => q.eq('branchId', scope.branchId).eq('path', path)).unique();
    if (row && (row.projectId !== scope.projectId || row.branchId !== scope.branchId)) cloudError('CLOUD_NOT_ENROLLED');
    return row;
}
async function siblingFor(ctx: Context, scope: Scope, path: string) {
    const row = await ctx.db.query('cloudEditorContentContracts').withIndex('by_branchId_and_path', q => q.eq('branchId', scope.branchId).eq('path', path)).unique();
    if (row && row.projectId !== scope.projectId) cloudError('CLOUD_NOT_ENROLLED');
    if (row?.active && row.imageBindings?.length) cloudError('CLOUD_CONTENT_IMAGE_APPROVAL_EXISTS');
    return row;
}
async function inventory(ctx: Context, scope: Scope) {
    await assertSnapshotBudget(ctx, { readDocs: MAX_CLOUD_FILES + 1, readBytes: 4_500_000, readCalls: 1 });
    const files = await ctx.db.query('cloudEditorFiles').withIndex('by_branchId_path', q => q.eq('branchId', scope.branchId)).take(MAX_CLOUD_FILES + 1);
    if (!files.length || files.length > MAX_CLOUD_FILES || files.some(row => row.projectId !== scope.projectId || row.branchId !== scope.branchId)) cloudError('CLOUD_FILE_LIMIT');
    const tuples = files.map(file => [file.path, file.kind, file.hash, file.bytes, file.storageId ?? null]).sort((a, b) => String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0);
    return { files, sourceFingerprint: await digest(snapshotCanonicalJson(tuples)) };
}
function ownerFor(files: Doc<'cloudEditorFiles'>[], path: string) {
    const owner = files.find(file => file.path === path);
    if (!owner || owner.kind !== 'file' || typeof owner.text !== 'string' || owner.storageId !== undefined) return cloudError('CLOUD_CONTENT_INVALID_TARGET');
    return { ...owner, text: owner.text };
}
async function checkedPin(ctx: Context, scope: Scope, pin: Pin, access: Awaited<ReturnType<typeof accessFor>>) {
    generation(pin.generation); hash(pin.definitionHash); assertCloudRevision(pin.designRevision);
    const row = await contractFor(ctx, scope, pin.path);
    if (pin.version !== 1 || !row?.active || row.workspaceId !== access.state.workspaceId || row.generation !== pin.generation
        || row.preparationId !== access.preparation._id || pin.preparationId !== row.preparationId
        || row.designRevision !== access.designRevision || pin.designRevision !== row.designRevision || row.definitionHash !== pin.definitionHash
        || row.bindings.filter(binding => binding.bindingId === pin.bindingId).length !== 1) cloudError('CLOUD_PROPERTY_STALE_APPROVAL');
    definitionBounds(row.path, row.bindings);
    return row;
}
function requestValue(args: Commit) {
    return { projectId: args.projectId, branchId: args.branchId, actorId: args.actorId, transport: args.transport,
        transportVersion: args.transportVersion, expectedRevision: args.expectedRevision, operationId: args.operationId,
        pin: args.pin, previousValue: args.previousValue, choiceId: args.choiceId, changes: args.changes };
}
function requestBounds(args: Commit) {
    assertCloudRevision(args.expectedRevision); assertOperationId(args.operationId);
    if (args.operationId.length > 80 || /[^A-Za-z0-9_-]/.test(args.operationId) || args.transport !== 'content-property' || args.transportVersion !== 1
        || args.changes.length !== 1 || args.changes[0]?.path !== args.pin.path || !boundedString(args.previousValue, 2_048) || !boundedString(args.choiceId, 80)) cloudError('CLOUD_INVALID_OPERATION');
    validateCloudChanges(args.changes); assertSnapshotEnvelope(requestValue(args), MAX_CLOUD_CHANGE_BYTES);
}
async function receipt(ctx: Context, args: Commit) {
    const access = await ordinary(ctx, args); requestBounds(args);
    const fingerprint = await digest(snapshotCanonicalJson(requestValue(args)));
    const prior = await ctx.db.query('cloudEditorOperations').withIndex('by_branchId_operationId', q => q.eq('branchId', args.branchId).eq('operationId', args.operationId)).unique();
    if (prior && (prior.projectId !== args.projectId || prior.userId !== args.actorId || prior.fingerprint !== fingerprint)) cloudError('CLOUD_INVALID_OPERATION');
    return { fingerprint, receipt: prior ? { revision: prior.revision, currentRevision: access.state.revision } : null };
}
export const contracts = query({ args: propertyScope, handler: async (ctx, args) => {
    const access = await accessFor(ctx, args);
    await assertSnapshotBudget(ctx, { readBytes: 4_500_000, readDocs: MAX_CONTRACTS + 1, readCalls: 1 });
    const rows = await ctx.db.query('cloudEditorPropertyContracts').withIndex('by_branchId_and_path', q => q.eq('branchId', args.branchId)).take(MAX_CONTRACTS + 1);
    if (rows.length > MAX_CONTRACTS || rows.some(row => row.projectId !== args.projectId || row.workspaceId !== access.state.workspaceId)) cloudError('CLOUD_PROPERTY_LIMIT');
    return { actorId: args.actorId, revision: access.state.revision, preparationId: access.preparation._id, designRevision: access.designRevision, canApprove: access.canDesign,
        contracts: rows.filter(row => access.canDesign || (row.active && row.preparationId === access.preparation._id && row.designRevision === access.designRevision)).map(row => ({
            path: row.path, version: 1 as const, generation: row.generation, preparationId: row.preparationId, designRevision: row.designRevision,
            active: row.active, current: row.active && row.preparationId === access.preparation._id && row.designRevision === access.designRevision,
            bindings: row.bindings, definitionHash: row.definitionHash })) };
}});
export const _selectionInput = internalQuery({ args: { ...propertyScope, expectedRevision: v.number() }, handler: async (ctx, args) => {
    const access = await accessFor(ctx, args, args.expectedRevision, true);
    await assertSnapshotBudget(ctx, { readBytes: 4_500_000, readDocs: MAX_CONTRACTS + 1, readCalls: 1 });
    const contracts = await ctx.db.query('cloudEditorPropertyContracts').withIndex('by_branchId_and_path', q => q.eq('branchId', args.branchId)).take(MAX_CONTRACTS + 1);
    if (contracts.length > MAX_CONTRACTS || contracts.some(row => row.projectId !== args.projectId || row.workspaceId !== access.state.workspaceId)) cloudError('CLOUD_PROPERTY_LIMIT');
    return { actorId: args.actorId, revision: access.state.revision, preparationId: access.preparation._id, designRevision: access.designRevision,
        contracts: contracts.map(row => ({ path: row.path, generation: row.generation })), ...await inventory(ctx, args) };
}});
export const _approvalInput = internalQuery({ args: propertyApprovalArgs, handler: async (ctx, args) => {
    const access = await accessFor(ctx, args, args.expectedRevision, true); generation(args.expectedGeneration, true);
    if (access.preparation._id !== args.expectedPreparationId || access.designRevision !== args.expectedDesignRevision) cloudError('CLOUD_PROPERTY_STALE_APPROVAL');
    const row = await contractFor(ctx, args, args.path);
    if ((row?.generation ?? 0) !== args.expectedGeneration) cloudError('CLOUD_PROPERTY_STALE_APPROVAL');
    definitionBounds(args.path, args.bindings); await siblingFor(ctx, args, args.path);
    const snapshot = await inventory(ctx, args), owner = ownerFor(snapshot.files, args.path);
    return { ...snapshot, ownerHash: owner.hash, ownerBytes: owner.bytes };
}});
export const _approve = internalMutation({ args: { ...propertyApprovalArgs, ...sourceEnvelope, definitionHash: v.string() }, handler: async (ctx, args) => {
    const access = await accessFor(ctx, args, args.expectedRevision, true); generation(args.expectedGeneration, true); hash(args.definitionHash);
    if (access.preparation._id !== args.expectedPreparationId || access.designRevision !== args.expectedDesignRevision) cloudError('CLOUD_PROPERTY_STALE_APPROVAL');
    const prior = await contractFor(ctx, args, args.path);
    if ((prior?.generation ?? 0) !== args.expectedGeneration || (prior && prior.workspaceId !== access.state.workspaceId)) cloudError('CLOUD_PROPERTY_STALE_APPROVAL');
    definitionBounds(args.path, args.bindings);
    if (await digest(snapshotCanonicalJson({ version: 1, path: args.path, bindings: args.bindings })) !== args.definitionHash) cloudError('CLOUD_PROPERTY_STALE_APPROVAL');
    await siblingFor(ctx, args, args.path);
    const snapshot = await inventory(ctx, args), owner = ownerFor(snapshot.files, args.path);
    if (snapshot.sourceFingerprint !== args.sourceFingerprint || owner.hash !== args.ownerHash || owner.bytes !== args.ownerBytes) cloudError('CLOUD_CONFLICT');
    await assertImportedTextChanges(snapshot.files, [{ path: owner.path, kind: 'file', text: owner.text, hash: owner.hash, bytes: owner.bytes }], access.preparation.policy);
    if (!prior) {
        await assertSnapshotBudget(ctx, { readBytes: 4_500_000, readDocs: MAX_CONTRACTS + 1, readCalls: 1 });
        if ((await ctx.db.query('cloudEditorPropertyContracts').withIndex('by_branchId_and_path', q => q.eq('branchId', args.branchId)).take(MAX_CONTRACTS)).length >= MAX_CONTRACTS) cloudError('CLOUD_PROPERTY_LIMIT');
    }
    const next = { projectId: args.projectId, branchId: args.branchId, workspaceId: access.state.workspaceId, path: args.path, version: 1 as const,
        preparationId: access.preparation._id, designRevision: access.designRevision, generation: args.expectedGeneration + 1, active: true,
        bindings: args.bindings, definitionHash: args.definitionHash, approvedByUserId: args.actorId, approvedRevision: args.expectedRevision, updatedAt: Date.now() };
    await assertSnapshotBudget(ctx, { writeDocs: 1, writeBytes: snapshotDocumentBytes(next, MAX_CONTRACT_BYTES) });
    if (prior) await ctx.db.replace(prior._id, next); else await ctx.db.insert('cloudEditorPropertyContracts', next);
    return { path: next.path, version: 1 as const, generation: next.generation, preparationId: next.preparationId, designRevision: next.designRevision, definitionHash: next.definitionHash };
}});
export const revoke = mutation({ args: { ...propertyScope, path: v.string(), expectedGeneration: v.number() }, handler: async (ctx, args) => {
    await accessFor(ctx, args, undefined, true); generation(args.expectedGeneration);
    const row = await contractFor(ctx, args, args.path);
    if (!row || row.generation !== args.expectedGeneration) cloudError('CLOUD_PROPERTY_STALE_APPROVAL');
    await assertSnapshotBudget(ctx, { writeDocs: 1, writeBytes: snapshotDocumentBytes(row) });
    await ctx.db.patch(row._id, { active: false, generation: row.generation + 1, updatedAt: Date.now() });
    return { path: row.path, generation: row.generation + 1 };
}});
export const _input = internalQuery({ args: propertyCommitArgs, handler: async (ctx, args) => {
    const prior = await receipt(ctx, args); if (prior.receipt) return { receipt: prior.receipt, snapshot: null };
    const access = await accessFor(ctx, args, args.expectedRevision), contract = await checkedPin(ctx, args, args.pin, access);
    const sibling = await siblingFor(ctx, args, args.pin.path), snapshot = await inventory(ctx, args), owner = ownerFor(snapshot.files, args.pin.path);
    return { receipt: null, snapshot: { ...snapshot, contract, sibling, ownerHash: owner.hash, ownerBytes: owner.bytes } };
}});
export const _commit = internalMutation({ args: { ...propertyCommitArgs, ...sourceEnvelope,
    nextHash: v.string(), nextBytes: v.number(), sibling: siblingPin }, handler: async (ctx, args) => {
    const prior = await receipt(ctx, args); if (prior.receipt) return prior.receipt;
    const access = await accessFor(ctx, args, args.expectedRevision), contract = await checkedPin(ctx, args, args.pin, access);
    const binding = contract.bindings.find(entry => entry.bindingId === args.pin.bindingId)!;
    if (!binding.options.some(option => option.id === args.choiceId) || !binding.options.some(option => option.value === args.previousValue)) cloudError('CLOUD_PROPERTY_INVALID_VALUE');
    const sibling = await siblingFor(ctx, args, args.pin.path);
    if (sibling ? !args.sibling || args.sibling.id !== sibling._id || args.sibling.identity !== snapshotCanonicalJson(sibling) : args.sibling !== null) cloudError('CLOUD_PROPERTY_STALE_APPROVAL');
    const currentText = !!sibling?.active && sibling.version === 2 && sibling.designRevision === access.designRevision
        && !!sibling.textBindings?.length && !sibling.bindings.length && !sibling.imageBindings?.length;
    if (currentText !== (args.sibling?.nextFingerprint !== null && args.sibling?.nextFingerprint !== undefined)) cloudError('CLOUD_PROPERTY_STALE_APPROVAL');
    if (args.sibling?.nextFingerprint) hash(args.sibling.nextFingerprint);
    const snapshot = await inventory(ctx, args), owner = ownerFor(snapshot.files, args.pin.path), content = args.changes[0]!.content;
    if (snapshot.sourceFingerprint !== args.sourceFingerprint || owner.hash !== args.ownerHash || owner.bytes !== args.ownerBytes
        || await digest(owner.text) !== args.ownerHash || encoder.encode(owner.text).byteLength !== args.ownerBytes) cloudError('CLOUD_CONFLICT');
    hash(args.nextHash);
    if (!Number.isSafeInteger(args.nextBytes) || encoder.encode(content).byteLength !== args.nextBytes || await digest(content) !== args.nextHash || content === owner.text) cloudError('CLOUD_INVALID_CHANGES');
    await assertImportedTextChanges(snapshot.files, [{ path: owner.path, kind: 'file', text: content, hash: args.nextHash, bytes: args.nextBytes }], access.preparation.policy);
    const nextFiles = snapshot.files.map(file => file._id === owner._id ? { ...file, text: content, bytes: args.nextBytes, hash: args.nextHash } : file);
    const total = nextFiles.reduce((sum, file) => sum + file.bytes, 0), revision = access.state.revision + 1;
    if (!Number.isSafeInteger(total) || total < 0 || total > MAX_IMPORT_BYTES || inlineSourceBytes(nextFiles) > MAX_CLOUD_INLINE_BYTES) cloudError('CLOUD_PROJECT_TOO_LARGE');
    assertCloudRevision(revision);
    await assertSnapshotBudget(ctx, { writeDocs: 6, writeBytes: snapshotDocumentBytes({ ...owner, text: content, hash: args.nextHash, bytes: args.nextBytes }) + (sibling ? snapshotDocumentBytes(sibling) : 0) + 16_000 });
    await ctx.db.patch(owner._id, { text: content, hash: args.nextHash, bytes: args.nextBytes });
    if (currentText && sibling && args.sibling?.nextFingerprint) await ctx.db.patch(sibling._id, { fingerprint: args.sibling.nextFingerprint });
    await ctx.db.patch(access.state._id, { revision, bytes: total, fileCount: nextFiles.length, updatedAt: Date.now() });
    await ctx.db.insert('cloudEditorOperations', { projectId: args.projectId, branchId: args.branchId, userId: args.actorId, operationId: args.operationId,
        fingerprint: prior.fingerprint, revision, storageIds: [], createdAt: Date.now() });
    await ctx.db.patch(args.projectId, { updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, sync, { projectId: args.projectId, branchId: args.branchId });
    return { revision, currentRevision: revision };
}});
