import { v, type Infer } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from './_generated/server';
import { requireCloudAccess } from './cloudEditorAccess';
import { importPreparationInstrumentation, importPreparationPolicy } from './cloudEditorImportPreparationSchema';
import { assertCloudRevision, assertOperationId, cloudError, cloudScope, inlineSourceBytes, MAX_CLOUD_FILES, MAX_CLOUD_INLINE_BYTES, MAX_CLOUD_TEXT_BYTES } from './lib/cloudEditor';
import { importSourcePath, MAX_IMPORT_ASSET_BYTES, MAX_IMPORT_BYTES } from './lib/cloudImportManifest';
import { assertReleaseText } from './lib/cloudReleasePolicy';
import { requireCap } from './lib/permissions';
import { hashPreparationPolicy } from './lib/cloudImportedState';
export { hashPreparationPolicy } from './lib/cloudImportedState';

type Context = QueryCtx | MutationCtx;
type Policy = Infer<typeof importPreparationPolicy>;
type Instrumentation = Infer<typeof importPreparationInstrumentation>;
type File = Pick<Doc<'cloudEditorFiles'>, 'path' | 'kind' | 'bytes' | 'hash' | 'text' | 'storageId'>;
const BOOTSTRAP = ['public/weblab-preload-script.js', 'public/weblab-ix-runtime.js'];
const BUN_SHA256 = '8611ba935af886f05a6f38740a15160326c15e5d5d07adef966130b4493607ed';
const inputArgs = { ...cloudScope, expectedRevision: v.number(), operationKey: v.string() };
const change = v.object({ path: v.string(), originalHash: v.union(v.string(), v.null()), text: v.string(), hash: v.string(), bytes: v.number() });
type Change = Infer<typeof change>;
const encoder = new TextEncoder();
const compare = (a: { path: string }, b: { path: string }) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
const hashValid = (value: string) => /^[a-f0-9]{64}$/.test(value);
function invalid(): never { return cloudError('CLOUD_IMPORT_PREPARATION_INVALID'); }

async function digest(value: string): Promise<string> {
    const result = await crypto.subtle.digest('SHA-256', encoder.encode(value));
    return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, '0')).join('');
}
function unicode(value: string): boolean {
    for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i);
        if (code >= 0xd800 && code <= 0xdbff) {
            const next = value.charCodeAt(++i);
            if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
        } else if (code >= 0xdc00 && code <= 0xdfff) return false;
    }
    return true;
}

/** Same sorted tuple encoding as the pristine import manifest, without its row-size limit. */
export async function canonicalPreparationManifest(files: File[]): Promise<string> {
    return digest(JSON.stringify([...files].sort(compare).map(file => [file.path, typeof file.text === 'string' ? 'text' : 'binary', file.bytes, file.hash])));
}
async function validatePolicy(policy: Policy): Promise<void> {
    if (policy.kind !== 'next-app-bun-v1' || policy.node !== 'node24' || policy.bun !== '1.3.11' || policy.next !== '16.3.1' ||
        policy.install !== 'frozen-ignore-scripts' || policy.dev !== 'next-dev' || policy.build !== 'next-build-webpack' ||
        policy.bunArchiveSha256 !== BUN_SHA256 || policy.pinnedFiles.length > 32 || policy.pinnedFiles.length < 5) invalid();
    const seen = new Set<string>();
    for (const pin of policy.pinnedFiles) {
        importSourcePath(pin.path);
        if (seen.has(pin.path) || !hashValid(pin.hash) || !Number.isSafeInteger(pin.bytes) || pin.bytes < 1 || pin.bytes > MAX_CLOUD_TEXT_BYTES) invalid();
        seen.add(pin.path);
    }
    if (!hashValid(policy.policyHash) || await hashPreparationPolicy(policy) !== policy.policyHash) invalid();
}
async function validateChanges(changes: Change[], instrumentation: Instrumentation[]): Promise<void> {
    if (!changes.length || changes.length > MAX_CLOUD_FILES || instrumentation.length !== changes.length) invalid();
    const seen = new Set<string>();
    const oids = new Set<string>();
    for (const entry of instrumentation) {
        importSourcePath(entry.path);
        if (seen.has(entry.path) || !hashValid(entry.afterHash) || (entry.beforeHash !== null && !hashValid(entry.beforeHash))) invalid();
        seen.add(entry.path);
        for (const oid of entry.addedOids) {
            if (!/^[a-zA-Z0-9_.:-]{1,100}$/.test(oid) || oids.has(oid)) invalid();
            oids.add(oid);
            if (oids.size > 20_000) invalid();
        }
    }
    seen.clear();
    for (const entry of changes) {
        importSourcePath(entry.path);
        const record = instrumentation.find(value => value.path === entry.path);
        if (seen.has(entry.path) || !record || record.beforeHash !== entry.originalHash || record.afterHash !== entry.hash ||
            !hashValid(entry.hash) || !unicode(entry.text) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 ||
            entry.bytes > MAX_CLOUD_TEXT_BYTES || encoder.encode(entry.text).byteLength !== entry.bytes || await digest(entry.text) !== entry.hash) invalid();
        assertReleaseText(entry.path === '.env.example' ? 'env-example.txt' : entry.path, entry.text);
        seen.add(entry.path);
    }
}
async function validateFiles(files: File[]): Promise<void> {
    if (!files.length || files.length > MAX_CLOUD_FILES || inlineSourceBytes(files) > MAX_CLOUD_INLINE_BYTES) invalid();
    let bytes = 0;
    const paths = new Set<string>();
    for (const file of files) {
        importSourcePath(file.path);
        if (paths.has(file.path) || file.kind !== 'file' || !hashValid(file.hash) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 ||
            (typeof file.text === 'string' ? !!file.storageId || file.bytes > MAX_CLOUD_TEXT_BYTES : !file.storageId || file.bytes > MAX_IMPORT_ASSET_BYTES)) invalid();
        if (typeof file.text === 'string') {
            if (!unicode(file.text) || encoder.encode(file.text).byteLength !== file.bytes || await digest(file.text) !== file.hash) invalid();
            assertReleaseText(file.path === '.env.example' ? 'env-example.txt' : file.path, file.text);
        }
        paths.add(file.path);
        bytes += file.bytes;
    }
    if (bytes > MAX_IMPORT_BYTES) invalid();
    for (const path of paths) {
        const segments = path.split('/');
        for (let length = 1; length < segments.length; length++) if (paths.has(segments.slice(0, length).join('/'))) invalid();
    }
}
function validatePins(files: File[], policy: Policy): void {
    const pins = new Map(policy.pinnedFiles.map(pin => [pin.path, pin]));
    const layouts = files.filter(file => /^(?:src\/)?app\/layout\.tsx$/.test(file.path));
    if (layouts.length !== 1) invalid();
    const required = new Set(['package.json', 'bun.lock', 'next.config.ts', 'tsconfig.json', ...BOOTSTRAP, layouts[0]!.path]);
    for (const file of files) {
        if (['next-env.d.ts', '.env.example'].includes(file.path) || /^(?:[^/]*\.config\.[^/]+|(?:tsconfig|jsconfig)(?:\.[^/]+)?\.json|bunfig\.toml|\.npmrc|\.yarnrc(?:\.yml)?|package\.json|(?:bun|package|yarn|pnpm)[^/]*lock[^/]*)$/.test(file.path)) required.add(file.path);
    }
    for (const path of required) if (!pins.has(path)) invalid();
    for (const pin of pins.values()) {
        const file = files.find(file => file.path === pin.path);
        if (!file || typeof file.text !== 'string' || file.hash !== pin.hash || file.bytes !== pin.bytes) invalid();
    }
}

async function authorized(ctx: Context, args: {
    projectId: Doc<'projects'>['_id']; branchId: Doc<'branches'>['_id']; expectedRevision: number; operationKey: string;
}) {
    if (process.env.WEBLAB_CLOUD_IMPORTS_ENABLED !== 'true') cloudError('CLOUD_IMPORT_DISABLED');
    if (process.env.WEBLAB_CLOUD_EDITOR_ENABLED !== 'true') cloudError('CLOUD_DISABLED');
    assertOperationId(args.operationKey); assertCloudRevision(args.expectedRevision);
    const access = await requireCloudAccess(ctx, args);
    await requireCap(ctx, 'project.update', { projectId: args.projectId });
    if (access.role !== 'responsible' && access.role !== 'designer') cloudError('CLOUD_ROLE_REQUIRED');
    return access;
}
async function prior(ctx: Context, args: { branchId: Doc<'branches'>['_id']; operationKey: string }) {
    return ctx.db.query('cloudEditorImportPreparations').withIndex('by_branchId_operationKey', q => q.eq('branchId', args.branchId).eq('operationKey', args.operationKey)).unique();
}
function checkRetry(receipt: Doc<'cloudEditorImportPreparations'>, access: Awaited<ReturnType<typeof authorized>>, revision: number): void {
    if (receipt.projectId !== access.state.projectId || receipt.workspaceId !== access.state.workspaceId || receipt.actorId !== access.user._id ||
        receipt.inputRevision !== revision || access.state.profile !== 'imported-next-v1' || access.state.preparationId !== receipt._id) cloudError('CLOUD_IMPORT_RETRY_CHANGED');
}
async function input(ctx: Context, args: { projectId: Doc<'projects'>['_id']; branchId: Doc<'branches'>['_id']; expectedRevision: number }, state: Doc<'cloudEditorStates'>) {
    if (state.profile !== 'imported-source-v1') cloudError('CLOUD_IMPORT_SOURCE_ONLY');
    if (state.revision !== args.expectedRevision) cloudError('CLOUD_REVISION_CONFLICT');
    const baseline = await ctx.db.query('cloudEditorImports').withIndex('by_projectId', q => q.eq('projectId', args.projectId)).unique();
    if (!baseline || baseline.state !== 'finalized' || baseline.branchId !== args.branchId || baseline.workspaceId !== state.workspaceId) invalid();
    const files = await ctx.db.query('cloudEditorFiles').withIndex('by_branchId_path', q => q.eq('branchId', args.branchId)).take(MAX_CLOUD_FILES + 1);
    if (files.some(file => file.projectId !== args.projectId)) invalid();
    await validateFiles(files);
    const inputManifestHash = await canonicalPreparationManifest(files);
    if (inputManifestHash !== baseline.manifestHash || baseline.files.length !== files.length) cloudError('CLOUD_IMPORT_BASELINE_CHANGED');
    return { baseline, files, inputManifestHash };
}
const result = (receipt: Doc<'cloudEditorImportPreparations'>) => ({ revision: receipt.preparedRevision, preparationId: receipt._id, profile: 'imported-next-v1' as const });

export const _input = internalQuery({
    args: inputArgs,
    handler: async (ctx, args) => {
        const access = await authorized(ctx, args);
        const receipt = await prior(ctx, args);
        if (receipt) { checkRetry(receipt, access, args.expectedRevision); return { receipt: result(receipt) }; }
        return { state: access.state, ...await input(ctx, args, access.state), actorId: access.user._id };
    },
});

export const _commit = internalMutation({
    args: { ...inputArgs, actorId: v.id('users'), inputManifestHash: v.string(), policy: importPreparationPolicy,
        instrumentation: v.array(importPreparationInstrumentation), changes: v.array(change) },
    handler: async (ctx, args) => {
        const access = await authorized(ctx, args);
        if (args.actorId !== access.user._id) cloudError('CLOUD_ROLE_REQUIRED');
        await validatePolicy(args.policy);
        await validateChanges(args.changes, args.instrumentation);
        const receipt = await prior(ctx, args);
        if (receipt) {
            checkRetry(receipt, access, args.expectedRevision);
            if (receipt.inputManifestHash !== args.inputManifestHash || receipt.policy.policyHash !== args.policy.policyHash ||
                JSON.stringify([...receipt.instrumentation].sort(compare)) !== JSON.stringify([...args.instrumentation].sort(compare))) cloudError('CLOUD_IMPORT_RETRY_CHANGED');
            return result(receipt);
        }
        const snapshot = await input(ctx, args, access.state);
        if (snapshot.inputManifestHash !== args.inputManifestHash) cloudError('CLOUD_IMPORT_BASELINE_CHANGED');
        const output = new Map<string, File>(snapshot.files.map(file => [file.path, file]));
        for (const entry of args.changes) {
            const original = output.get(entry.path);
            if (original ? original.hash !== entry.originalHash || typeof original.text !== 'string' || !!original.storageId :
                entry.originalHash !== null || !BOOTSTRAP.includes(entry.path)) cloudError('CLOUD_IMPORT_SOURCE_CHANGED');
            output.set(entry.path, { path: entry.path, kind: 'file', text: entry.text, hash: entry.hash, bytes: entry.bytes });
        }
        const files = [...output.values()];
        await validateFiles(files); validatePins(files, args.policy);
        const preparedRevision = access.state.revision + 1;
        assertCloudRevision(preparedRevision);
        const createdAt = Date.now();
        const row = { projectId: args.projectId, branchId: args.branchId, workspaceId: access.state.workspaceId, actorId: args.actorId,
            operationKey: args.operationKey, baselineAttemptId: snapshot.baseline._id, baselineManifestHash: snapshot.baseline.manifestHash,
            inputRevision: args.expectedRevision, preparedRevision, inputManifestHash: snapshot.inputManifestHash,
            preparedManifestHash: await canonicalPreparationManifest(files), generation: 1 as const, profileVersion: 1 as const,
            preparationVersion: 1 as const, policy: args.policy, instrumentation: args.instrumentation, createdAt };
        if (encoder.encode(JSON.stringify(row)).byteLength > 200_000) invalid();
        for (const entry of args.changes) {
            const original = snapshot.files.find(file => file.path === entry.path);
            const value = { text: entry.text, hash: entry.hash, bytes: entry.bytes };
            if (original) await ctx.db.patch(original._id, value);
            else await ctx.db.insert('cloudEditorFiles', { projectId: args.projectId, branchId: args.branchId, path: entry.path, kind: 'file', ...value });
        }
        const preparationId = await ctx.db.insert('cloudEditorImportPreparations', row);
        await ctx.db.patch(access.state._id, { profile: 'imported-next-v1', preparationId, revision: preparedRevision, designRevision: preparedRevision,
            bytes: files.reduce((sum, file) => sum + file.bytes, 0), fileCount: files.length, updatedAt: createdAt });
        return { revision: preparedRevision, preparationId, profile: 'imported-next-v1' as const };
    },
});
