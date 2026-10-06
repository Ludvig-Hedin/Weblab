/** V8-safe hosting facts. These receipts prove neither access nor provider configuration. */
export const IMPORTED_HOSTING_PROFILE = 'imported-next-hosting-v1';
export const IMPORTED_HOSTING_TOOLCHAIN = {
    node: '24.x', bun: '1.3.11', next: '16.3.1',
    bunArchiveSha256: '8611ba935af886f05a6f38740a15160326c15e5d5d07adef966130b4493607ed',
} as const;
export const IMPORTED_HOSTING_INSTALL = 'bun install --frozen-lockfile --ignore-scripts';
export const IMPORTED_HOSTING_BUILD = 'node ./node_modules/next/dist/bin/next build --webpack';
export const IMPORTED_HOSTING_CONFIG_PATHS = [
    '.env.example', 'bun.lock', 'bunfig.toml', 'eslint.config.mjs', 'next-env.d.ts',
    'next.config.ts', 'package.json', 'postcss.config.mjs', 'tsconfig.json',
] as const;
export const IMPORTED_HOSTING_PLUGIN_VERSIONS = {
    '@tailwindcss/postcss': '4.3.3', next: '16.3.1', tailwindcss: '4.3.3', typescript: '5.9.3',
} as const;
export type ImportedHostingVisibility = 'protected-only' | 'publishable';
export type ImportedHostingTuple = { path: string; hash: string; bytes: number };
export type ImportedHostingBuildPolicy = {
    version: 1; profile: typeof IMPORTED_HOSTING_PROFILE;
    toolchain: typeof IMPORTED_HOSTING_TOOLCHAIN;
    installCommand: typeof IMPORTED_HOSTING_INSTALL; buildCommand: typeof IMPORTED_HOSTING_BUILD;
    configs: ImportedHostingTuple[];
    plugins: Array<{ name: keyof typeof IMPORTED_HOSTING_PLUGIN_VERSIONS; version: string; integrity: string }>;
    deployHash: string;
};
export type ImportedHostingBinding = {
    version: 1; profile: typeof IMPORTED_HOSTING_PROFILE;
    artifactId: string; artifactHash: string; deployHash: string; buildPolicyHash: string;
    visibility: ImportedHostingVisibility;
};
export type ImportedHostingCandidate = {
    version: 1; profile: typeof IMPORTED_HOSTING_PROFILE;
    projectId: string; branchId: string; workspaceId: string; actorId: string; revision: number;
    importedHosting: ImportedHostingBinding;
};
export type ImportedHostingOperationPins = { sourceHash: string; deployHash: string; buildPolicyHash: string };
export type ImportedHostingErrorCode = 'INVALID_RECEIPT' | 'INVALID_CANDIDATE' | 'INVALID_OPERATION' | 'ARTIFACT_MISMATCH' | 'UNSUPPORTED_CONFIG';
export class ImportedHostingError extends Error {
    constructor(public readonly code: ImportedHostingErrorCode) { super(`CLOUD_IMPORTED_HOSTING_${code}`); this.name = 'ImportedHostingError'; }
}
export function hostingFail(code: ImportedHostingErrorCode): never { throw new ImportedHostingError(code); }
export function hostingHash(value: unknown): value is string {
    return typeof value === 'string' && value.length === 64 && !/[^a-f0-9]/.test(value);
}
export function hostingId(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[^a-zA-Z0-9:_-]/.test(value);
}
function exact(value: unknown, keys: string, code: ImportedHostingErrorCode): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Object.keys(value).sort().join(',') !== keys) hostingFail(code);
    return value as Record<string, unknown>;
}
function sorted(values: string[]): boolean { return values.every((value, index) => index === 0 || values[index - 1]! < value); }
export function assertImportedHostingBuildPolicy(value: unknown): asserts value is ImportedHostingBuildPolicy {
    const fail = () => hostingFail('INVALID_RECEIPT');
    const row = exact(value, 'buildCommand,configs,deployHash,installCommand,plugins,profile,toolchain,version', 'INVALID_RECEIPT');
    if (row.version !== 1 || row.profile !== IMPORTED_HOSTING_PROFILE || row.installCommand !== IMPORTED_HOSTING_INSTALL ||
        row.buildCommand !== IMPORTED_HOSTING_BUILD || !hostingHash(row.deployHash)) fail();
    const toolchain = exact(row.toolchain, 'bun,bunArchiveSha256,next,node', 'INVALID_RECEIPT');
    for (const [key, expected] of Object.entries(IMPORTED_HOSTING_TOOLCHAIN)) if (toolchain[key] !== expected) fail();
    if (!Array.isArray(row.configs) || row.configs.length < 4 || row.configs.length > IMPORTED_HOSTING_CONFIG_PATHS.length) fail();
    const paths: string[] = [];
    for (const entry of row.configs as unknown[]) {
        const config = exact(entry, 'bytes,hash,path', 'INVALID_RECEIPT');
        if (typeof config.path !== 'string' || !(IMPORTED_HOSTING_CONFIG_PATHS as readonly string[]).includes(config.path) ||
            !hostingHash(config.hash) || typeof config.bytes !== 'number' || !Number.isSafeInteger(config.bytes) || config.bytes < 1 || config.bytes > 700_000) fail();
        paths.push(config.path as string);
    }
    if (!sorted(paths) || ['package.json', 'bun.lock', 'next.config.ts', 'tsconfig.json'].some(path => !paths.includes(path))) fail();
    if (!Array.isArray(row.plugins) || row.plugins.length < 2 || row.plugins.length > 4) fail();
    const names: string[] = [];
    for (const entry of row.plugins as unknown[]) {
        const plugin = exact(entry, 'integrity,name,version', 'INVALID_RECEIPT');
        if (typeof plugin.name !== 'string' || !Object.hasOwn(IMPORTED_HOSTING_PLUGIN_VERSIONS, plugin.name) ||
            plugin.version !== IMPORTED_HOSTING_PLUGIN_VERSIONS[plugin.name as keyof typeof IMPORTED_HOSTING_PLUGIN_VERSIONS] ||
            typeof plugin.integrity !== 'string' || plugin.integrity.length !== 95 || !plugin.integrity.startsWith('sha512-') ||
            !/^[A-Za-z0-9+/]{85}[AQgw]==$/.test(plugin.integrity.slice(7))) fail();
        names.push(plugin.name as string);
    }
    if (!sorted(names) || !names.includes('next') || !names.includes('typescript') ||
        paths.includes('postcss.config.mjs') !== names.includes('@tailwindcss/postcss') ||
        names.includes('@tailwindcss/postcss') !== names.includes('tailwindcss')) fail();
}
export function assertImportedHostingBinding(value: unknown): asserts value is ImportedHostingBinding {
    const row = exact(value, 'artifactHash,artifactId,buildPolicyHash,deployHash,profile,version,visibility', 'INVALID_CANDIDATE');
    if (row.version !== 1 || row.profile !== IMPORTED_HOSTING_PROFILE || !hostingId(row.artifactId) ||
        !hostingHash(row.artifactHash) || !hostingHash(row.deployHash) || !hostingHash(row.buildPolicyHash) ||
        (row.visibility !== 'protected-only' && row.visibility !== 'publishable')) hostingFail('INVALID_CANDIDATE');
}
export function assertImportedHostingCandidate(value: unknown): asserts value is ImportedHostingCandidate {
    const row = exact(value, 'actorId,branchId,importedHosting,profile,projectId,revision,version,workspaceId', 'INVALID_CANDIDATE');
    if (row.version !== 1 || row.profile !== IMPORTED_HOSTING_PROFILE ||
        ![row.projectId, row.branchId, row.workspaceId, row.actorId].every(hostingId) ||
        typeof row.revision !== 'number' || !Number.isSafeInteger(row.revision) || row.revision < 0) hostingFail('INVALID_CANDIDATE');
    assertImportedHostingBinding(row.importedHosting);
}
function canonical(value: unknown): string {
    return JSON.stringify(value, (_key, entry: unknown) => entry && typeof entry === 'object' && !Array.isArray(entry)
        ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : entry);
}
/** Exact UTF-8 SHA-256 preimages, without trailing newlines. */
export function serializeImportedHostingBuildPolicy(value: ImportedHostingBuildPolicy): string {
    assertImportedHostingBuildPolicy(value); return canonical(value);
}
export function serializeImportedHostingCandidate(value: ImportedHostingCandidate): string {
    assertImportedHostingCandidate(value); return canonical(value);
}
async function digest(text: string): Promise<string> {
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
/** Internal seal must also verify DB scope, current actor access, inventory and binary contents. */
export async function assertImportedHostingSeal(input: {
    candidate: ImportedHostingCandidate; buildPolicyReceipt: ImportedHostingBuildPolicy; artifactJson: string; hash: string;
}): Promise<void> {
    const json = serializeImportedHostingCandidate(input.candidate);
    const policyJson = serializeImportedHostingBuildPolicy(input.buildPolicyReceipt);
    if (!hostingHash(input.hash) || input.artifactJson !== json || input.hash !== await digest(json) ||
        input.candidate.importedHosting.deployHash !== input.buildPolicyReceipt.deployHash ||
        input.candidate.importedHosting.buildPolicyHash !== await digest(policyJson)) hostingFail('ARTIFACT_MISMATCH');
}
/** The legacy sourceHash field pins release identity, not the uploaded file manifest. */
export function assertImportedHostingOperationPins(value: unknown, candidateHash: string, binding: ImportedHostingBinding): asserts value is ImportedHostingOperationPins {
    assertImportedHostingBinding(binding);
    const row = exact(value, 'buildPolicyHash,deployHash,sourceHash', 'INVALID_OPERATION');
    if (!hostingHash(candidateHash) || row.sourceHash !== candidateHash || row.deployHash !== binding.deployHash ||
        row.buildPolicyHash !== binding.buildPolicyHash) hostingFail('INVALID_OPERATION');
}
