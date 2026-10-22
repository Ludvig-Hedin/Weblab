import type { Doc } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { cloudError, MAX_CLOUD_CHANGE_BYTES, MAX_CLOUD_FILES, MAX_CLOUD_INLINE_BYTES, MAX_CLOUD_TEXT_BYTES } from './cloudEditor';
import { importSourcePath } from './cloudImportManifest';
import { assertReleaseText } from './cloudReleasePolicy';

type Policy = Doc<'cloudEditorImportPreparations'>['policy'];
type File = Doc<'cloudEditorFiles'>;
export type ImportedTextChange = {
    path: string;
    kind: 'file' | 'delete' | 'directory';
    text?: string;
    storageId?: string;
    hash: string;
    bytes: number;
};

const encoder = new TextEncoder();
const CONSTANTS = {
    kind: 'next-app-bun-v1', node: 'node24', bun: '1.3.11', next: '16.3.1',
    install: 'frozen-ignore-scripts', dev: 'next-dev', build: 'next-build-webpack',
    bunArchiveSha256: '8611ba935af886f05a6f38740a15160326c15e5d5d07adef966130b4493607ed',
} as const;
const REQUIRED = ['package.json', 'bun.lock', 'next.config.ts', 'tsconfig.json',
    'public/weblab-preload-script.js', 'public/weblab-ix-runtime.js'];
const ALLOWED = new Set([...REQUIRED, 'bunfig.toml', 'postcss.config.mjs', 'eslint.config.mjs',
    'next-env.d.ts', '.env.example']);
const layoutPath = (path: string) => /^(?:src\/)?app\/layout\.tsx$/.test(path);
const compare = (left: { path: string }, right: { path: string }) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
const hashValid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function invalid(): never { return cloudError('CLOUD_IMPORT_PREPARATION_INVALID'); }

async function digest(value: string): Promise<string> {
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Shared V8 encoding; identical to the Node profile validator's canonical policy. */
export async function hashPreparationPolicy(policy: Omit<Policy, 'policyHash'>): Promise<string> {
    return digest(JSON.stringify({ kind: policy.kind, node: policy.node, bun: policy.bun, next: policy.next,
        install: policy.install, dev: policy.dev, build: policy.build, bunArchiveSha256: policy.bunArchiveSha256,
        pinnedFiles: [...policy.pinnedFiles].sort(compare).map(({ path, hash, bytes }) => ({ path, hash, bytes })) }));
}

async function validatePolicy(policy: Policy): Promise<Set<string>> {
    if (!policy || typeof policy !== 'object' || Object.keys(policy).length !== 10 ||
        Object.entries(CONSTANTS).some(([key, value]) => Reflect.get(policy, key) !== value) ||
        !Array.isArray(policy.pinnedFiles) || policy.pinnedFiles.length < 7 || policy.pinnedFiles.length > 32 ||
        !hashValid(policy.policyHash)) invalid();
    const pins = new Set<string>();
    let bytes = 0;
    for (const pin of policy.pinnedFiles) {
        if (!pin || Object.keys(pin).length !== 3) invalid();
        importSourcePath(pin.path);
        if ((!ALLOWED.has(pin.path) && !layoutPath(pin.path)) || pins.has(pin.path) || !hashValid(pin.hash) ||
            !Number.isSafeInteger(pin.bytes) || pin.bytes < 1 || pin.bytes > MAX_CLOUD_TEXT_BYTES) invalid();
        pins.add(pin.path);
        bytes += pin.bytes + 512;
    }
    if (bytes > MAX_CLOUD_INLINE_BYTES || REQUIRED.some(path => !pins.has(path)) ||
        [...pins].filter(layoutPath).length !== 1 || await hashPreparationPolicy(policy) !== policy.policyHash) invalid();
    return pins;
}

function unicode(value: string): boolean {
    for (let index = 0; index < value.length; index++) {
        const code = value.charCodeAt(index);
        if (code >= 0xd800 && code <= 0xdbff) {
            const next = value.charCodeAt(++index);
            if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
        } else if (code >= 0xdc00 && code <= 0xdfff) return false;
    }
    return true;
}

async function validateText(file: { path: string; text?: string; storageId?: string; hash: string; bytes: number }): Promise<void> {
    importSourcePath(file.path);
    if (typeof file.text !== 'string' || file.storageId !== undefined || !unicode(file.text) || !hashValid(file.hash) ||
        !Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > MAX_CLOUD_TEXT_BYTES ||
        encoder.encode(file.text).byteLength !== file.bytes || await digest(file.text) !== file.hash) invalid();
    assertReleaseText(file.path === '.env.example' ? 'env-example.txt' : file.path, file.text);
}

async function assertPin(file: File | null | undefined, pin: Policy['pinnedFiles'][number]): Promise<void> {
    if (!file || file.kind !== 'file' || file.path !== pin.path || file.bytes !== pin.bytes || file.hash !== pin.hash) invalid();
    await validateText(file);
}

// Keep this admission inventory aligned with cloudImportedNextProfile.configPath.
function configPath(path: string): boolean {
    const name = path.split('/').at(-1)!.toLowerCase();
    return ALLOWED.has(path) || /(?:^|\.)config(?:\.|$)/.test(name) ||
        /^(?:package\.json|bun\.lockb?|bunfig\.toml|.*lock(?:\.(?:json|yaml|yml))?|npm-shrinkwrap\.json|\.(?:npmrc|yarnrc)(?:\..*)?|\.pnp\..*|\.babelrc(?:\..*)?|\.browserslistrc|tsconfig(?:\..*)?\.json|jsconfig\.json|deno\.jsonc?|next-env\.d\.ts)$/.test(name);
}

/** Provenance only. Callers still enforce the current actor's project/cloud role. */
export async function getPreparedImport(
    ctx: QueryCtx | MutationCtx, state: Doc<'cloudEditorStates'>,
): Promise<Doc<'cloudEditorImportPreparations'> | null> {
    if (state.profile !== 'imported-next-v1') return null;
    try {
        if (!state.preparationId || state.version !== 1 || !Number.isSafeInteger(state.revision)) invalid();
        const receipt = await ctx.db.get(state.preparationId);
        if (!receipt || receipt._id !== state.preparationId || receipt.projectId !== state.projectId ||
            receipt.branchId !== state.branchId || receipt.workspaceId !== state.workspaceId ||
            receipt.generation !== 1 || receipt.profileVersion !== 1 || receipt.preparationVersion !== 1 ||
            !Number.isSafeInteger(receipt.inputRevision) || receipt.inputRevision < 1 ||
            receipt.preparedRevision !== receipt.inputRevision + 1 || receipt.preparedRevision > state.revision ||
            !hashValid(receipt.baselineManifestHash) || receipt.inputManifestHash !== receipt.baselineManifestHash ||
            !hashValid(receipt.preparedManifestHash)) invalid();
        const baseline = await ctx.db.get(receipt.baselineAttemptId);
        if (!baseline || baseline._id !== receipt.baselineAttemptId || baseline.state !== 'finalized' ||
            baseline.projectId !== state.projectId || baseline.branchId !== state.branchId || baseline.workspaceId !== state.workspaceId ||
            baseline.manifestHash !== receipt.baselineManifestHash) invalid();
        await validatePolicy(receipt.policy);
        let inlineBytes = 0;
        for (const pin of receipt.policy.pinnedFiles) {
            const file = await ctx.db.query('cloudEditorFiles').withIndex('by_branchId_path', q =>
                q.eq('branchId', state.branchId).eq('path', pin.path)).unique();
            if (!file || file.projectId !== state.projectId || file.branchId !== state.branchId) invalid();
            inlineBytes += 512 + encoder.encode(JSON.stringify(file.text ?? '')).byteLength;
            if (inlineBytes > MAX_CLOUD_INLINE_BYTES) invalid();
            await assertPin(file, pin);
        }
        return receipt;
    } catch { return invalid(); }
}

/** Existing source/CSS replacements only; assets and runtime pins stay immutable. */
export async function assertImportedTextChanges(
    files: File[], changes: ImportedTextChange[], policy: Policy,
): Promise<void> {
    try {
        const pins = await validatePolicy(policy);
        if (!Array.isArray(files) || files.length < 1 || files.length > MAX_CLOUD_FILES ||
            !Array.isArray(changes) || !changes.length || changes.length > MAX_CLOUD_FILES ||
            encoder.encode(JSON.stringify(changes)).byteLength > MAX_CLOUD_CHANGE_BYTES) invalid();
        const current = new Map<string, File>();
        const scope = files[0]!;
        let pinBytes = 0;
        for (const file of files) {
            importSourcePath(file.path);
            if (current.has(file.path) || file.projectId !== scope.projectId || file.branchId !== scope.branchId ||
                ((configPath(file.path) || layoutPath(file.path)) && !pins.has(file.path))) invalid();
            current.set(file.path, file);
            if (pins.has(file.path)) pinBytes += 512 + encoder.encode(JSON.stringify(file.text ?? '')).byteLength;
        }
        if (pinBytes > MAX_CLOUD_INLINE_BYTES) invalid();
        for (const pin of policy.pinnedFiles) await assertPin(current.get(pin.path), pin);
        const seen = new Set<string>();
        for (const change of changes) {
            importSourcePath(change.path);
            const original = current.get(change.path);
            if (seen.has(change.path) || pins.has(change.path) || !/\.(?:[jt]sx?|css)$/.test(change.path) ||
                change.kind !== 'file' || !original || original.kind !== 'file' || typeof original.text !== 'string' ||
                original.storageId !== undefined || change.storageId !== undefined) invalid();
            await validateText(original);
            await validateText(change);
            seen.add(change.path);
        }
    } catch { cloudError('CLOUD_IMPORT_SOURCE_CHANGE_FORBIDDEN'); }
}
