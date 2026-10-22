import { v, type Infer } from 'convex/values';
import { makeFunctionReference } from 'convex/server';
import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx, MutationCtx } from './_generated/server';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import { requireCloudAccess } from './cloudEditorAccess';
import { contentTextBinding } from './cloudEditorContentSchema';
import { MAX_IMPORT_BYTES } from './lib/cloudImportManifest';
import { importedStudioOperation, importedStudioPin } from './cloudEditorImportedStudioSchema';
import { assertCloudRevision, assertOperationId, cloudError, cloudScope, MAX_CLOUD_FILES, MAX_CLOUD_INLINE_BYTES, inlineSourceBytes, validateCloudChanges } from './lib/cloudEditor';
import { canUseImportedStudio } from './lib/cloudImportedAccess';
import { assertSnapshotBudget, snapshotCanonicalJson } from './lib/cloudImportedRelease';
import { IMPORTED_STUDIO_CONFIG_PATH, ImportedStudioError, parseImportedStudioConfig, serializeImportedStudioRecipe, studioHashValue } from './lib/cloudImportedStudioState';

type Context = QueryCtx | MutationCtx;
type Scope = { projectId: Id<'projects'>; branchId: Id<'branches'>; actorId: Id<'users'> };
type Pin = { expectedRevision: number; expectedGeneration: number; expectedPreparationId: Id<'cloudEditorImportPreparations'>;
    expectedDesignRevision: number; expectedRecipeFingerprint: string };
const scoped = { ...cloudScope, actorId: v.id('users') };
const envelope = { ...scoped, ...importedStudioPin, operationId: v.string(), fingerprint: v.string() };
const encoder = new TextEncoder();

async function digest(text: string): Promise<string> {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text))), byte => byte.toString(16).padStart(2, '0')).join('');
}
function generation(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER) cloudError('CLOUD_IMPORTED_STUDIO_INVALID_OPERATION');
}
function parseConfig(text: string) {
    try { return parseImportedStudioConfig(text); }
    catch (error) {
        if (error instanceof ImportedStudioError) return cloudError(`CLOUD_IMPORTED_STUDIO_${error.code}`);
        throw error;
    }
}
async function ordinary(ctx: Context, args: Scope) {
    const access = await requireCloudAccess(ctx, args);
    if (access.user._id !== args.actorId) cloudError('CLOUD_ACTOR_CHANGED');
    if (access.state.profile !== 'imported-next-v1') cloudError('CLOUD_CONTENT_PROFILE_UNSUPPORTED');
    return access;
}
async function approval(ctx: Context, args: Scope) {
    const row = await ctx.db.query('cloudEditorImportedStudioApprovals').withIndex('by_branchId', q => q.eq('branchId', args.branchId)).unique();
    if (row && row.projectId !== args.projectId) cloudError('CLOUD_NOT_ENROLLED');
    return row;
}
async function admission(ctx: Context, args: Scope & Pin, designer: boolean, capture = false) {
    const access = await ordinary(ctx, args);
    assertCloudRevision(args.expectedRevision); assertCloudRevision(args.expectedDesignRevision); generation(args.expectedGeneration);
    if (!canUseImportedStudio(access.role, access.importedAuthority)) cloudError('CLOUD_IMPORTED_STUDIO_DISABLED');
    if (!access.role || (designer && !access.canDesign)) cloudError('CLOUD_ROLE_REQUIRED');
    if (!access.preparation || !access.importedAuthority || access.preparation._id !== args.expectedPreparationId ||
        access.importedAuthority.designRevision !== args.expectedDesignRevision) return cloudError('CLOUD_IMPORT_PREPARATION_INVALID');
    if (access.state.revision !== args.expectedRevision) cloudError('CLOUD_CONFLICT');
    const row = await approval(ctx, args);
    if ((row?.generation ?? 0) !== args.expectedGeneration || (row && row.workspaceId !== access.state.workspaceId))
        cloudError('CLOUD_IMPORTED_STUDIO_STALE_APPROVAL');
    if (!capture && row && row.recipeFingerprint !== args.expectedRecipeFingerprint) cloudError('CLOUD_IMPORTED_STUDIO_STALE_APPROVAL');
    if (capture) {
        if (!designer || row || args.expectedRecipeFingerprint !== '') cloudError('CLOUD_IMPORTED_STUDIO_STALE_APPROVAL');
    } else if (!designer && (!row?.active || row.preparationId !== access.preparation._id || row.designRevision !== args.expectedDesignRevision ||
        !studioHashValue(args.expectedRecipeFingerprint) || row.recipeFingerprint !== args.expectedRecipeFingerprint))
        cloudError('CLOUD_IMPORTED_STUDIO_STALE_APPROVAL');
    return { ...access, preparation: access.preparation, designRevision: access.importedAuthority.designRevision, approval: row };
}
async function receipt(ctx: Context, args: Scope & { operationId: string; fingerprint: string }) {
    const access = await ordinary(ctx, args); assertOperationId(args.operationId);
    if (!studioHashValue(args.fingerprint)) cloudError('CLOUD_INVALID_OPERATION');
    const prior = await ctx.db.query('cloudEditorOperations').withIndex('by_branchId_operationId', q => q.eq('branchId', args.branchId).eq('operationId', args.operationId)).unique();
    if (prior && (prior.projectId !== args.projectId || prior.userId !== args.actorId || prior.fingerprint !== args.fingerprint)) cloudError('CLOUD_INVALID_OPERATION');
    return prior ? { revision: prior.revision, currentRevision: access.state.revision } : null;
}
async function inventory(ctx: Context, args: Scope, prepared: Doc<'cloudEditorImportPreparations'>) {
    await assertSnapshotBudget(ctx, { readDocs: MAX_CLOUD_FILES + 2, readBytes: 4_500_000, readCalls: 2 });
    const files = await ctx.db.query('cloudEditorFiles').withIndex('by_branchId_path', q => q.eq('branchId', args.branchId)).take(MAX_CLOUD_FILES + 1);
    if (!files.length || files.length > MAX_CLOUD_FILES || files.some(file => file.projectId !== args.projectId)) cloudError('CLOUD_FILE_LIMIT');
    const original = await ctx.db.get(prepared.baselineAttemptId);
    if (!original || original.state !== 'finalized' || original.projectId !== args.projectId || original.branchId !== args.branchId ||
        original.workspaceId !== prepared.workspaceId || original.manifestHash !== prepared.baselineManifestHash) return cloudError('CLOUD_IMPORT_PREPARATION_INVALID');
    const tuples = files.map(file => [file.path, file.kind, file.hash, file.bytes, file.storageId ?? null]).sort((a, b) => String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0);
    return { files, runtimePins: prepared.policy.pinnedFiles, originalPaths: original.files.map(file => file.path), sourceFingerprint: await digest(snapshotCanonicalJson({ tuples, originalPaths: original.files.map(file => file.path).sort() })) };
}
async function configRow(ctx: Context, args: Scope) {
    const row = await ctx.db.query('cloudEditorFiles').withIndex('by_branchId_path', q => q.eq('branchId', args.branchId).eq('path', IMPORTED_STUDIO_CONFIG_PATH)).unique();
    if (!row) return null;
    if (row.projectId !== args.projectId || row.kind !== 'file' || row.storageId !== undefined || typeof row.text !== 'string' ||
        encoder.encode(row.text).byteLength !== row.bytes || await digest(row.text) !== row.hash) return cloudError('CLOUD_IMPORTED_STUDIO_INVALID_CONFIG');
    const config = parseConfig(row.text);
    return { row, config, recipeFingerprint: await digest(serializeImportedStudioRecipe(config)) };
}

/** Display data alone never grants source or structural editing. */
export const get = query({ args: scoped, handler: async (ctx, args) => {
    const access = await ordinary(ctx, args), row = await approval(ctx, args);
    const enabled = canUseImportedStudio(access.role, access.importedAuthority);
    if (!enabled) return { actorId: access.user._id, revision: access.state.revision, enabled: false as const };
    const state = await configRow(ctx, args);
    const current = !!state && !!row?.active && row.workspaceId === access.state.workspaceId && row.preparationId === access.preparation?._id &&
        row.designRevision === access.state.designRevision && row.recipeFingerprint === state.recipeFingerprint;
    return { actorId: access.user._id, revision: access.state.revision, enabled: true as const, canApprove: access.canDesign,
        generation: row?.generation ?? 0, preparationId: access.preparation!._id, designRevision: access.state.designRevision!,
        recipeFingerprint: state?.recipeFingerprint ?? '', current,
        recipe: state ? { id: state.config.recipe.id, label: state.config.recipe.label, blockId: state.config.recipe.block.id,
            blockLabel: state.config.recipe.block.label, slots: state.config.recipe.slots } : null,
        pages: state?.config.pages ?? [] };
} });

export const _input = internalQuery({ args: { ...envelope, operation: importedStudioOperation }, handler: async (ctx, args) => {
    const prior = await receipt(ctx, args);
    if (prior) return { receipt: prior, snapshot: null };
    const capture = args.operation.kind === 'capture';
    const access = await admission(ctx, args, capture, capture);
    const source = await inventory(ctx, args, access.preparation);
    const config = await configRow(ctx, args);
    if (capture ? config !== null : config?.recipeFingerprint !== args.expectedRecipeFingerprint) cloudError('CLOUD_IMPORTED_STUDIO_STALE_APPROVAL');
    const contracts = await ctx.db.query('cloudEditorContentContracts').withIndex('by_branchId_and_path', q => q.eq('branchId', args.branchId)).take(MAX_CLOUD_FILES + 1);
    if (contracts.length > MAX_CLOUD_FILES || contracts.some(contract => contract.projectId !== args.projectId)) cloudError('CLOUD_FILE_LIMIT');
    return { receipt: null, snapshot: { ...source, contracts, designRevision: access.designRevision } };
} });

const textPolicy = v.object({ bindings: v.array(contentTextBinding), fingerprint: v.string() });
const plannedContract = v.object({ path: v.string(), bindings: v.array(contentTextBinding), fingerprint: v.string(),
    previous: v.union(v.string(), v.null()), before: v.union(textPolicy, v.null()) });
const fileChange = v.object({ path: v.string(), content: v.string(), bytes: v.number(), hash: v.string() });
type PlannedContract = Infer<typeof plannedContract>;
const sync = makeFunctionReference<'action', { projectId: Id<'projects'>; branchId: Id<'branches'> }, null>('cloudEditorRuntime:sync');

async function pinnedContracts(ctx: Context, args: Scope, plans: PlannedContract[], designRevision: number, reapprove: boolean) {
    if (plans.length > 20 || new Set(plans.map(plan => plan.path)).size !== plans.length) cloudError('CLOUD_INVALID_CHANGES');
    const result = [];
    for (const plan of plans) {
        if (!studioHashValue(plan.fingerprint) || !plan.bindings.length || plan.bindings.length > 100 ||
            plan.bindings.some(binding => binding.target.kind !== 'component-literal' || binding.target.exportName !== 'StudioPage' || binding.renderMapping))
            cloudError('CLOUD_CONTENT_STALE_CONTRACT');
        const old = await ctx.db.query('cloudEditorContentContracts').withIndex('by_branchId_and_path', q => q.eq('branchId', args.branchId).eq('path', plan.path)).unique();
        if ((old ? snapshotCanonicalJson(old) : null) !== plan.previous || (old && (old.projectId !== args.projectId ||
            old.version !== 2 || old.bindings.length || old.imageBindings?.length))) cloudError('CLOUD_CONTENT_STALE_CONTRACT');
        generation(old?.generation ?? 0);
        if (!reapprove && (plan.before ? !old?.active || old.designRevision !== designRevision || old.fingerprint !== plan.before.fingerprint ||
            snapshotCanonicalJson(old.textBindings ?? []) !== snapshotCanonicalJson(plan.before.bindings) : old !== null))
            cloudError('CLOUD_CONTENT_STALE_CONTRACT');
        result.push({ old, plan });
    }
    return result;
}
async function writeContracts(ctx: MutationCtx, args: Scope, rows: Awaited<ReturnType<typeof pinnedContracts>>, designRevision: number, revision: number, approvedByUserId: Id<'users'>) {
    for (const { old, plan } of rows) {
        const value = { projectId: args.projectId, branchId: args.branchId, path: plan.path, version: 2 as const,
            generation: (old?.generation ?? 0) + 1, active: true, bindings: [], textBindings: plan.bindings,
            designRevision, fingerprint: plan.fingerprint, approvedByUserId, approvedRevision: revision, updatedAt: Date.now() };
        if (old) await ctx.db.replace(old._id, value); else await ctx.db.insert('cloudEditorContentContracts', value);
    }
}
async function activate(ctx: MutationCtx, args: Scope & Pin, access: Awaited<ReturnType<typeof admission>>, recipeFingerprint: string) {
    const row = { projectId: args.projectId, branchId: args.branchId, workspaceId: access.state.workspaceId,
        preparationId: access.preparation._id, designRevision: access.designRevision, generation: args.expectedGeneration + 1,
        active: true, recipeFingerprint, approvedByUserId: args.actorId, updatedAt: Date.now() };
    if (access.approval) await ctx.db.replace(access.approval._id, row); else await ctx.db.insert('cloudEditorImportedStudioApprovals', row);
    return row;
}

export const _commit = internalMutation({ args: { ...envelope, operation: importedStudioOperation,
    sourceFingerprint: v.string(), recipeFingerprint: v.string(), changes: v.array(fileChange), contracts: v.array(plannedContract) }, handler: async (ctx, args) => {
    const prior = await receipt(ctx, args); if (prior) return prior;
    const capture = args.operation.kind === 'capture';
    const access = await admission(ctx, args, capture, capture), source = await inventory(ctx, args, access.preparation);
    if (source.sourceFingerprint !== args.sourceFingerprint) cloudError('CLOUD_CONFLICT');
    const current = await configRow(ctx, args);
    if (capture ? current !== null : current?.recipeFingerprint !== args.expectedRecipeFingerprint) cloudError('CLOUD_IMPORTED_STUDIO_STALE_APPROVAL');
    validateCloudChanges(args.changes);
    const configChange = args.changes.find(change => change.path === IMPORTED_STUDIO_CONFIG_PATH);
    if (!configChange || source.originalPaths.includes(IMPORTED_STUDIO_CONFIG_PATH)) return cloudError('CLOUD_IMPORTED_STUDIO_INVALID_CONFIG');
    const config = parseConfig(configChange.content);
    if (await digest(serializeImportedStudioRecipe(config)) !== args.recipeFingerprint ||
        (!capture && args.recipeFingerprint !== args.expectedRecipeFingerprint)) cloudError('CLOUD_IMPORTED_STUDIO_STALE_APPROVAL');
    const page = args.operation.kind === 'capture' ? undefined : args.operation.kind === 'createPage'
        ? config.pages.find(page => page.operationId === args.operationId)
        : config.pages.find(page => page.id === ('pageId' in args.operation ? args.operation.pageId : ''));
    const paths = capture ? [IMPORTED_STUDIO_CONFIG_PATH] : page ? [IMPORTED_STUDIO_CONFIG_PATH, page.ownerPath,
        ...(args.operation.kind === 'createPage' ? [page.routePath] : [])] : [];
    if (paths.length !== args.changes.length || args.changes.some(change => !paths.includes(change.path)) ||
        args.contracts.length !== (page ? 1 : 0) || (page && args.contracts[0]?.path !== page.ownerPath)) cloudError('CLOUD_INVALID_CHANGES');
    const oldPage = current?.config.pages.find(entry => entry.ownerPath === page?.ownerPath);
    if (page && (!!oldPage !== (args.contracts[0]?.before !== null))) cloudError('CLOUD_CONTENT_STALE_CONTRACT');
    const contracts = await pinnedContracts(ctx, args, args.contracts, access.designRevision, false);
    const byPath = new Map(source.files.map(file => [file.path, file]));
    const next = new Map(source.files.map(file => [file.path, { text: file.text, bytes: file.bytes }]));
    for (const change of args.changes) {
        const old = byPath.get(change.path);
        if (change.bytes !== encoder.encode(change.content).byteLength || await digest(change.content) !== change.hash ||
            (old && (old.kind !== 'file' || old.storageId !== undefined || typeof old.text !== 'string')) ||
            source.originalPaths.includes(change.path) || source.files.some(file => file.path.startsWith(change.path + '/') ||
                (file.kind === 'file' && change.path.startsWith(file.path + '/')))) cloudError('CLOUD_INVALID_CHANGES');
        next.set(change.path, { text: change.content, bytes: change.bytes });
    }
    const bytes = [...next.values()].reduce((total, file) => total + file.bytes, 0);
    if (next.size > MAX_CLOUD_FILES || bytes > MAX_IMPORT_BYTES || inlineSourceBytes(next.values()) > MAX_CLOUD_INLINE_BYTES) cloudError('CLOUD_PROJECT_TOO_LARGE');
    const revision = access.state.revision + 1; assertCloudRevision(revision);
    await assertSnapshotBudget(ctx, { writeDocs: args.changes.length + contracts.length + 5,
        writeBytes: encoder.encode(snapshotCanonicalJson({ changes: args.changes, contracts: args.contracts })).byteLength + 32_000 });
    for (const change of args.changes) {
        const old = byPath.get(change.path), value = { text: change.content, hash: change.hash, bytes: change.bytes };
        if (old) await ctx.db.patch(old._id, value);
        else await ctx.db.insert('cloudEditorFiles', { projectId: args.projectId, branchId: args.branchId, path: change.path, kind: 'file', ...value });
    }
    if (capture) await activate(ctx, args, access, args.recipeFingerprint);
    await writeContracts(ctx, args, contracts, access.designRevision, revision, access.approval?.approvedByUserId ?? args.actorId);
    await ctx.db.patch(access.state._id, { revision, bytes, fileCount: next.size, updatedAt: Date.now() });
    await ctx.db.insert('cloudEditorOperations', { projectId: args.projectId, branchId: args.branchId, userId: args.actorId,
        operationId: args.operationId, fingerprint: args.fingerprint, revision, storageIds: [], createdAt: Date.now() });
    await ctx.db.patch(args.projectId, { updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, sync, { projectId: args.projectId, branchId: args.branchId });
    return { revision, currentRevision: revision };
} });

export const _approvalInput = internalQuery({ args: { ...scoped, ...importedStudioPin }, handler: async (ctx, args) => {
    const access = await admission(ctx, args, true), source = await inventory(ctx, args, access.preparation), config = await configRow(ctx, args);
    if (!config || config.recipeFingerprint !== args.expectedRecipeFingerprint) return cloudError('CLOUD_IMPORTED_STUDIO_STALE_APPROVAL');
    const contracts = await ctx.db.query('cloudEditorContentContracts').withIndex('by_branchId_and_path', q => q.eq('branchId', args.branchId)).take(MAX_CLOUD_FILES + 1);
    if (contracts.length > MAX_CLOUD_FILES || contracts.some(row => row.projectId !== args.projectId)) cloudError('CLOUD_FILE_LIMIT');
    return { ...source, contracts, designRevision: access.designRevision };
} });
export const _approve = internalMutation({ args: { ...scoped, ...importedStudioPin, sourceFingerprint: v.string(), contracts: v.array(plannedContract) }, handler: async (ctx, args) => {
    const access = await admission(ctx, args, true), source = await inventory(ctx, args, access.preparation), config = await configRow(ctx, args);
    if (source.sourceFingerprint !== args.sourceFingerprint) cloudError('CLOUD_CONFLICT');
    if (!config || config.recipeFingerprint !== args.expectedRecipeFingerprint || source.originalPaths.includes(IMPORTED_STUDIO_CONFIG_PATH)) return cloudError('CLOUD_IMPORTED_STUDIO_STALE_APPROVAL');
    if (args.contracts.length !== config.config.pages.length || args.contracts.some(plan => !config.config.pages.some(page => page.ownerPath === plan.path))) cloudError('CLOUD_INVALID_CHANGES');
    const contracts = await pinnedContracts(ctx, args, args.contracts, access.designRevision, true);
    await assertSnapshotBudget(ctx, { writeDocs: contracts.length + 1, writeBytes: encoder.encode(snapshotCanonicalJson(args.contracts)).byteLength + 32_000 });
    const row = await activate(ctx, args, access, config.recipeFingerprint);
    await writeContracts(ctx, args, contracts, access.designRevision, access.state.revision, args.actorId);
    return { generation: row.generation, recipeFingerprint: row.recipeFingerprint, active: true, revision: access.state.revision };
} });
export const pause = mutation({ args: { ...scoped, ...importedStudioPin }, handler: async (ctx, args) => {
    const access = await admission(ctx, args, true);
    if (!access.approval || access.approval.recipeFingerprint !== args.expectedRecipeFingerprint) return cloudError('CLOUD_IMPORTED_STUDIO_STALE_APPROVAL');
    await ctx.db.patch(access.approval._id, { active: false, generation: args.expectedGeneration + 1, updatedAt: Date.now() });
    return { generation: args.expectedGeneration + 1, recipeFingerprint: access.approval.recipeFingerprint, active: false, revision: access.state.revision };
} });
