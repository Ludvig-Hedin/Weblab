'use node';

import { createHash } from 'node:crypto';
import { aliasReceiptMatches } from './cloudReleasePolicy';
import { importSourcePath, MAX_IMPORT_ASSET_BYTES, MAX_IMPORT_BYTES } from './cloudImportManifest';
import { MAX_CLOUD_FILES } from './cloudEditor';
import { manifestHash } from './cloudReleaseArtifact';
import { hostingHash, IMPORTED_HOSTING_PROFILE, serializeImportedHostingCandidate, type ImportedHostingCandidate } from './cloudImportedHostingState';

/** Required provider configuration, not evidence of an executed build or function runtime. */
export const IMPORTED_VERCEL_PROJECT_SETTINGS = Object.freeze({
    framework: 'nextjs', nodeVersion: '24.x', outputDirectory: null,
    installCommand: `node -e "if(process.versions.node.split('.')[0]!=='24')process.exit(1)" && test "$(bunx bun@1.3.11 --version)" = "1.3.11" && bunx bun@1.3.11 install --frozen-lockfile --ignore-scripts`,
    buildCommand: `node -e "if(process.versions.node.split('.')[0]!=='24')process.exit(1)" && node ./node_modules/next/dist/bin/next build --webpack`,
} as const);
export type ImportedVercelPins = { releaseId: string; candidateHash: string; deployHash: string; buildPolicyHash: string };
export type ImportedVercelFile = { path: string; kind: 'file'; hash: string; bytes: number };
export type ImportedVercelCreate = ImportedVercelPins & {
    manifest: readonly ImportedVercelFile[];
    files: AsyncIterable<{ path: string; bytes: Uint8Array }>;
};
export type ImportedVercelAssign = {
    deploymentId: string; expectedPrevious: string | null; pins: ImportedVercelPins;
    candidate: ImportedHostingCandidate; beforeSend: () => Promise<void>;
};

type Json = Record<string, unknown>;
function object(value: unknown): Json {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('CLOUD_RELEASE_PROVIDER_RESPONSE');
    return value as Json;
}
function id(value: unknown): string {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(value)) throw new Error('CLOUD_RELEASE_PROVIDER_ID');
    return value;
}
function aliasReceipt(result: Json): { previous: string | null; hostname: string } {
    id(result.uid);
    return { previous: result.oldDeploymentId == null ? null : id(result.oldDeploymentId), hostname: String(result.alias) };
}
export function providerUrl(value: unknown): string {
    if (typeof value !== 'string' || !/^[a-z0-9-]+\.vercel\.app$/.test(value)) throw new Error('CLOUD_RELEASE_PROVIDER_URL');
    return `https://${value}`;
}
async function boundedJson(response: Response): Promise<Json> {
    if (!response.body) throw new Error('CLOUD_RELEASE_PROVIDER_RESPONSE');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    try {
        while (true) {
            const part = await reader.read(); if (part.done) break;
            size += part.value.byteLength;
            if (size > 1_000_000) throw new Error('CLOUD_RELEASE_PROVIDER_RESPONSE');
            chunks.push(part.value);
        }
    } finally { await reader.cancel(); }
    return object(JSON.parse(Buffer.concat(chunks).toString('utf8')));
}

function exactKeys(value: Json, keys: string[]): boolean {
    return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function importedPins(input: ImportedVercelPins): void {
    id(input.releaseId);
    if (/[^A-Za-z0-9_-]/.test(input.releaseId) || !hostingHash(input.candidateHash) || !hostingHash(input.deployHash) || !hostingHash(input.buildPolicyHash)) {
        throw new Error('CLOUD_RELEASE_HASH_MISMATCH');
    }
}
function importedSettings(value: Json): void {
    for (const key of ['framework', 'nodeVersion', 'installCommand', 'buildCommand'] as const) {
        if (value[key] !== IMPORTED_VERCEL_PROJECT_SETTINGS[key]) throw new Error('CLOUD_RELEASE_PROVIDER_SETUP');
    }
    if (value.outputDirectory !== null && value.outputDirectory !== undefined) throw new Error('CLOUD_RELEASE_PROVIDER_SETUP');
}
function importedManifest(input: ImportedVercelCreate): ImportedVercelFile[] {
    importedPins(input);
    if (!input.files || typeof input.files[Symbol.asyncIterator] !== 'function') throw new Error('CLOUD_RELEASE_HASH_MISMATCH');
    return validateImportedHostingManifest(input.manifest, input.deployHash);
}
/** Pure preflight shared with the worker before acquiring irreversible send authority. */
export function validateImportedHostingManifest(manifest: readonly ImportedVercelFile[], deployHash: string): ImportedVercelFile[] {
    if (!hostingHash(deployHash) || !Array.isArray(manifest) || !manifest.length || manifest.length > MAX_CLOUD_FILES) throw new Error('CLOUD_RELEASE_HASH_MISMATCH');
    let total = 0;
    const files: ImportedVercelFile[] = [];
    for (const file of manifest) {
        if (!file || !exactKeys(object(file), ['path', 'kind', 'hash', 'bytes']) || file.kind !== 'file' || !hostingHash(file.hash) ||
            !Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > MAX_IMPORT_ASSET_BYTES) throw new Error('CLOUD_RELEASE_HASH_MISMATCH');
        importSourcePath(file.path);
        total += file.bytes;
        if (total > MAX_IMPORT_BYTES) throw new Error('CLOUD_RELEASE_TOO_LARGE');
        files.push({ path: file.path, kind: 'file', hash: file.hash, bytes: file.bytes });
    }
    files.sort((a, b) => a.path.localeCompare(b.path));
    for (let index = 1; index < files.length; index++) if (files[index - 1]!.path.localeCompare(files[index]!.path) === 0) throw new Error('CLOUD_RELEASE_HASH_MISMATCH');
    const paths = new Set(files.map(file => file.path));
    for (const file of files) {
        const parts = file.path.split('/');
        for (let index = 1; index < parts.length; index++) if (paths.has(parts.slice(0, index).join('/'))) throw new Error('CLOUD_RELEASE_HASH_MISMATCH');
    }
    if (manifestHash(files) !== deployHash) throw new Error('CLOUD_RELEASE_HASH_MISMATCH');
    return files;
}
function canonicalProof(value: Json): string {
    return JSON.stringify(value, (_key, entry: unknown) => entry && typeof entry === 'object' && !Array.isArray(entry)
        ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : entry);
}

function liveRouteVersion(data: Json): string {
    if (!Array.isArray(data.versions)) throw new Error('CLOUD_RELEASE_CREDENTIAL_ISOLATION');
    const live = data.versions.map(object).filter(version => version.isLive === true);
    if (live.length !== 1 || live[0]!.isStaging === true) throw new Error('CLOUD_RELEASE_CREDENTIAL_ISOLATION');
    return id(live[0]!.id);
}

/** Only the proven, unconditional CDN transform may precede customer code. */
function assertCredentialIsolation(data: Json): void {
    if (!Array.isArray(data.routes) || data.routes.length !== 1 ||
        object(data.version).ruleCount !== 1 || object(data.limit).currentRoutes !== 1) {
        throw new Error('CLOUD_RELEASE_CREDENTIAL_ISOLATION');
    }
    const rule = object(data.routes[0]);
    const route = object(rule.route);
    if (rule.enabled !== true || rule.staged !== false || rule.srcSyntax !== 'regex' || rule.routeType !== 'transform' ||
        !Object.keys(rule).every(key => ['id', 'name', 'enabled', 'staged', 'route', 'srcSyntax', 'routeType'].includes(key)) ||
        !exactKeys(route, ['src', 'transforms']) || route.src !== '^/.*$' ||
        !Array.isArray(route.transforms) || route.transforms.length !== 1) {
        throw new Error('CLOUD_RELEASE_CREDENTIAL_ISOLATION');
    }
    const transform = object(route.transforms[0]);
    const target = object(transform.target);
    if (!exactKeys(transform, ['type', 'op', 'target']) || transform.type !== 'request.headers' ||
        transform.op !== 'delete' || !exactKeys(target, ['key']) || target.key !== 'x-vercel-protection-bypass') {
        throw new Error('CLOUD_RELEASE_CREDENTIAL_ISOLATION');
    }
}

/** A single fixed account/project. Never accepts a client URL, token or arbitrary API path. */
export class CloudReleaseVercel {
    constructor(private readonly input: { token: string; teamId: string; projectId: string; hostname: string; bypass: string; expectedProof?: string;
        hostingProfile?: typeof IMPORTED_HOSTING_PROFILE }, private readonly signal: AbortSignal) {
        if (input.hostingProfile !== undefined && input.hostingProfile !== IMPORTED_HOSTING_PROFILE) throw new Error('CLOUD_RELEASE_PROVIDER_SETUP');
        if (input.hostingProfile) this.input = { ...input };
    }
    private requireImported(imported: boolean): void {
        if ((this.input.hostingProfile === IMPORTED_HOSTING_PROFILE) !== imported) throw new Error('CLOUD_RELEASE_PROVIDER_PROFILE');
    }
    private async request(path: string, init: RequestInit = {}): Promise<Json> {
        const url = new URL(path, 'https://api.vercel.com');
        url.searchParams.set('teamId', this.input.teamId);
        const response = await fetch(url, { ...init, redirect: 'error', cache: 'no-store', signal: this.signal,
            headers: { Authorization: `Bearer ${this.input.token}`, ...init.headers } });
        if (!response.ok) throw new Error(`CLOUD_RELEASE_PROVIDER_${response.status}`);
        return boundedJson(response);
    }
    async verifyProject(): Promise<string> {
        if (this.input.hostingProfile) this.signal.throwIfAborted();
        const project = await this.request(`/v9/projects/${encodeURIComponent(this.input.projectId)}`);
        const protection = project.ssoProtection ? object(project.ssoProtection) : null;
        if (project.id !== this.input.projectId || project.accountId !== this.input.teamId || project.link || project.autoExposeSystemEnvs !== false ||
            protection?.deploymentType !== 'prod_deployment_urls_and_all_previews' || !this.input.bypass || project.rootDirectory || project.commandForIgnoringBuildStep || project.rollingRelease) {
            throw new Error('CLOUD_RELEASE_PROVIDER_SETUP');
        }
        if (this.input.hostingProfile) {
            importedSettings(project);
            if (project.rootDirectory !== null && project.rootDirectory !== undefined) throw new Error('CLOUD_RELEASE_PROVIDER_SETUP');
        }
        const env = await this.request(`/v10/projects/${encodeURIComponent(this.input.projectId)}/env?decrypt=false`);
        if (!Array.isArray(env.envs) || env.envs.length || (env.pagination && object(env.pagination).next)) throw new Error('CLOUD_RELEASE_PROVIDER_ENV_UNSUPPORTED');
        const routesPath = `/v1/projects/${encodeURIComponent(this.input.projectId)}/routes`;
        const version = liveRouteVersion(await this.request(`${routesPath}/versions`));
        const routes = await this.request(`${routesPath}?versionId=${encodeURIComponent(version)}`);
        if (object(routes.version).id !== version) throw new Error('CLOUD_RELEASE_CREDENTIAL_ISOLATION');
        assertCredentialIsolation(routes);
        if (liveRouteVersion(await this.request(`${routesPath}/versions`)) !== version) throw new Error('CLOUD_RELEASE_CREDENTIAL_ISOLATION');
        const proofJson = this.input.hostingProfile ? canonicalProof({ version: 2, profile: IMPORTED_HOSTING_PROFILE,
            teamId: this.input.teamId, projectId: this.input.projectId, hostname: this.input.hostname, routeVersion: version,
            settings: { ...IMPORTED_VERCEL_PROJECT_SETTINGS, rootDirectory: null, target: 'production', autoAssignCustomDomains: false } })
            : JSON.stringify({ version: 1, teamId: this.input.teamId,
                projectId: this.input.projectId, hostname: this.input.hostname, routeVersion: version, profile: 'cloud-studio-v1' });
        const proof = createHash('sha256').update(proofJson).digest('hex');
        if (this.input.expectedProof !== undefined && this.input.expectedProof !== proof) throw new Error('CLOUD_RELEASE_CREDENTIAL_CHANGED');
        return proof;
    }
    async aliasTarget(): Promise<string | null> {
        const url = new URL(`/v4/aliases/${encodeURIComponent(this.input.hostname)}`, 'https://api.vercel.com');
        url.searchParams.set('teamId', this.input.teamId);
        const response = await fetch(url, { headers: { Authorization: `Bearer ${this.input.token}` }, redirect: 'error', signal: this.signal });
        if (response.status === 404) return null;
        if (!response.ok) throw new Error('CLOUD_RELEASE_ALIAS_UNAVAILABLE');
        const result = await boundedJson(response);
        if (result.alias !== this.input.hostname || result.projectId !== this.input.projectId) throw new Error('CLOUD_RELEASE_ALIAS_CHANGED');
        return id(result.deploymentId ?? (result.deployment ? object(result.deployment).id : null));
    }
    async create(files: Array<{ path: string; bytes: Uint8Array }>, releaseId: string, hash: string): Promise<string> {
        this.requireImported(false);
        await this.verifyProject();
        const uploaded: Array<{ file: string; sha: string; size: number }> = [];
        for (const file of files) {
            const sha = createHash('sha1').update(file.bytes).digest('hex');
            const url = new URL('/v2/files', 'https://api.vercel.com'); url.searchParams.set('teamId', this.input.teamId);
            const response = await fetch(url, { method: 'POST', body: Buffer.from(file.bytes), redirect: 'error', signal: this.signal,
                headers: { Authorization: `Bearer ${this.input.token}`, 'Content-Type': 'application/octet-stream', 'x-vercel-digest': sha, 'x-vercel-size': String(file.bytes.byteLength) } });
            if (!response.ok) throw new Error('CLOUD_RELEASE_UPLOAD_FAILED');
            await response.body?.cancel();
            uploaded.push({ file: file.path, sha, size: file.bytes.byteLength });
        }
        const data = await this.request('/v13/deployments', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'weblab-cloud-review', project: this.input.projectId, files: uploaded, target: 'production', autoAssignCustomDomains: false,
                projectSettings: { framework: 'nextjs', buildCommand: 'bun run build', installCommand: 'bun install --frozen-lockfile --ignore-scripts' },
                meta: { weblabCloudReleaseId: releaseId, weblabCloudReleaseHash: hash } }) });
        if (data.target !== 'production') throw new Error('CLOUD_RELEASE_UNEXPECTED_TARGET');
        return id(data.id);
    }
    async deployment(deploymentId: string, releaseId: string, hash: string): Promise<{ ready: boolean; failed: boolean; url: string }> {
        this.requireImported(false);
        const data = await this.request(`/v13/deployments/${encodeURIComponent(id(deploymentId))}`);
        const meta = object(data.meta);
        if (data.id !== deploymentId || data.projectId !== this.input.projectId || data.target !== 'production' ||
            meta.weblabCloudReleaseId !== releaseId || meta.weblabCloudReleaseHash !== hash) throw new Error('CLOUD_RELEASE_BUILD_CHANGED');
        return { ready: data.readyState === 'READY', failed: data.readyState === 'ERROR' || data.readyState === 'CANCELED', url: providerUrl(data.url) };
    }

    /** Caller acquires send authority first. Any upload/creation ambiguity must remain locked, never retried. */
    async createImported(input: ImportedVercelCreate): Promise<string> {
        this.requireImported(true);
        this.signal.throwIfAborted();
        const manifest = importedManifest(input);
        const pins: ImportedVercelPins = { releaseId: input.releaseId, candidateHash: input.candidateHash,
            deployHash: input.deployHash, buildPolicyHash: input.buildPolicyHash };
        const iterable = input.files;
        await this.verifyProject();
        const uploaded: Array<{ file: string; sha: string; size: number }> = [];
        const actual: ImportedVercelFile[] = [];
        const iterator = iterable[Symbol.asyncIterator]();
        try {
            while (true) {
                this.signal.throwIfAborted();
                const next = await iterator.next();
                this.signal.throwIfAborted();
                if (next.done) break;
                const file = next.value, expected = manifest[actual.length];
                if (!expected || !file || file.path !== expected.path || !(file.bytes instanceof Uint8Array) ||
                    file.bytes.byteLength !== expected.bytes || createHash('sha256').update(file.bytes).digest('hex') !== expected.hash) {
                    throw new Error('CLOUD_RELEASE_HASH_MISMATCH');
                }
                const buffer = file.bytes.buffer;
                if (!(buffer instanceof ArrayBuffer)) throw new Error('CLOUD_RELEASE_HASH_MISMATCH');
                const sha = createHash('sha1').update(file.bytes).digest('hex');
                const url = new URL('/v2/files', 'https://api.vercel.com'); url.searchParams.set('teamId', this.input.teamId);
                this.signal.throwIfAborted();
                const response = await fetch(url, { method: 'POST',
                    body: Buffer.from(buffer, file.bytes.byteOffset, file.bytes.byteLength),
                    redirect: 'error', signal: this.signal,
                    headers: { Authorization: `Bearer ${this.input.token}`, 'Content-Type': 'application/octet-stream',
                        'x-vercel-digest': sha, 'x-vercel-size': String(file.bytes.byteLength) } });
                try { if (!response.ok) throw new Error('CLOUD_RELEASE_UPLOAD_FAILED'); }
                finally { await response.body?.cancel(); }
                uploaded.push({ file: expected.path, sha, size: expected.bytes });
                actual.push(expected);
            }
        } finally { await iterator.return?.(); }
        this.signal.throwIfAborted();
        if (actual.length !== manifest.length || manifestHash(actual) !== pins.deployHash) throw new Error('CLOUD_RELEASE_HASH_MISMATCH');
        await this.verifyProject();
        this.signal.throwIfAborted();
        const data = await this.request('/v13/deployments', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'weblab-cloud-review', project: this.input.projectId, files: uploaded, target: 'production',
                autoAssignCustomDomains: false, projectSettings: IMPORTED_VERCEL_PROJECT_SETTINGS,
                meta: { weblabCloudReleaseId: pins.releaseId, weblabCloudReleaseHash: pins.candidateHash,
                    weblabCloudDeployHash: pins.deployHash, weblabCloudBuildPolicyHash: pins.buildPolicyHash,
                    weblabCloudHostingProfile: IMPORTED_HOSTING_PROFILE } }) });
        if (data.target !== 'production') throw new Error('CLOUD_RELEASE_UNEXPECTED_TARGET');
        return id(data.id);
    }

    /** Verifies documented effective configuration, not the actual function runtime or build execution. */
    async deploymentImported(deploymentId: string, pins: ImportedVercelPins): Promise<{ ready: boolean; failed: boolean; url: string }> {
        this.requireImported(true); importedPins(pins); this.signal.throwIfAborted();
        const expected = { ...pins };
        const data = await this.request(`/v13/deployments/${encodeURIComponent(id(deploymentId))}`);
        const meta = object(data.meta), settings = object(data.projectSettings);
        if (data.id !== deploymentId || data.projectId !== this.input.projectId || data.target !== 'production' ||
            data.autoAssignCustomDomains !== false || meta.weblabCloudReleaseId !== expected.releaseId ||
            meta.weblabCloudReleaseHash !== expected.candidateHash || meta.weblabCloudDeployHash !== expected.deployHash ||
            meta.weblabCloudBuildPolicyHash !== expected.buildPolicyHash || meta.weblabCloudHostingProfile !== IMPORTED_HOSTING_PROFILE) {
            throw new Error('CLOUD_RELEASE_BUILD_CHANGED');
        }
        importedSettings(settings);
        const effectiveNode = Object.hasOwn(data, 'nodeVersion') ? data.nodeVersion : settings.nodeVersion;
        if (effectiveNode !== '24.x' || data.readyState === 'READY' && data.buildSkipped !== false) throw new Error('CLOUD_RELEASE_BUILD_CHANGED');
        return { ready: data.readyState === 'READY', failed: data.readyState === 'ERROR' || data.readyState === 'CANCELED', url: providerUrl(data.url) };
    }
    async verifyServed(origin: string, authenticated: boolean): Promise<void> {
        if (origin !== `https://${this.input.hostname}` && !/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) throw new Error('CLOUD_RELEASE_PROVIDER_URL');
        if (authenticated) await this.verifyProject();
        const response = await fetch(`${origin}/`, { redirect: 'error', signal: this.signal,
            headers: authenticated ? { 'x-vercel-protection-bypass': this.input.bypass } : {} });
        await response.body?.cancel();
        if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error('CLOUD_RELEASE_SITE_UNAVAILABLE');
    }
    async verifyProtected(origin: string): Promise<void> {
        const response = await fetch(`${origin}/`, { redirect: 'manual', signal: this.signal });
        await response.body?.cancel();
        if (![401, 403, 302, 307].includes(response.status)) throw new Error('CLOUD_RELEASE_REVIEW_NOT_PRIVATE');
    }
    async assign(deploymentId: string, expectedPrevious: string | null): Promise<void> {
        this.requireImported(false);
        await this.verifyProject();
        const result = await this.request(`/v2/deployments/${encodeURIComponent(id(deploymentId))}/aliases`, { method: 'POST',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alias: this.input.hostname }) });
        const { previous, hostname } = aliasReceipt(result);
        const actual = await this.aliasTarget();
        if (!aliasReceiptMatches({ expectedPrevious, observedPrevious: previous, expectedTarget: deploymentId, observedTarget: actual ?? '', expectedHostname: this.input.hostname, observedHostname: hostname })) throw new Error('CLOUD_RELEASE_ALIAS_CHANGED');
        await this.verifyServed(`https://${this.input.hostname}`, false);
    }

    /** External alias changes cannot be made atomic with our lock. Never retry an uncertain POST. */
    async assignImported(input: ImportedVercelAssign): Promise<void> {
        this.requireImported(true);
        const candidate = structuredClone(input.candidate), pins = { ...input.pins };
        const deploymentId = id(input.deploymentId), expectedPrevious = input.expectedPrevious === null ? null : id(input.expectedPrevious);
        const beforeSend = input.beforeSend;
        importedPins(pins);
        if (/[^A-Za-z0-9_-]/.test(deploymentId) || expectedPrevious !== null && /[^A-Za-z0-9_-]/.test(expectedPrevious)) throw new Error('CLOUD_RELEASE_PROVIDER_ID');
        const candidateJson = serializeImportedHostingCandidate(candidate);
        if (candidate.importedHosting.visibility !== 'publishable' || typeof beforeSend !== 'function' ||
            candidate.importedHosting.deployHash !== pins.deployHash || candidate.importedHosting.buildPolicyHash !== pins.buildPolicyHash ||
            createHash('sha256').update(candidateJson).digest('hex') !== pins.candidateHash) throw new Error('CLOUD_RELEASE_HASH_MISMATCH');
        this.signal.throwIfAborted();
        await this.verifyProject();
        const deployment = await this.deploymentImported(deploymentId, pins);
        if (!deployment.ready || deployment.failed) throw new Error('CLOUD_RELEASE_BUILD_CHANGED');
        await this.verifyProtected(deployment.url);
        await this.verifyServed(deployment.url, true);
        if (await this.aliasTarget() !== expectedPrevious) throw new Error('CLOUD_RELEASE_ALIAS_CHANGED');
        this.signal.throwIfAborted();
        await beforeSend();
        // The worker owns uncertainty from this point, including cancellation before fetch starts.
        this.signal.throwIfAborted();
        const result = await this.request(`/v2/deployments/${encodeURIComponent(deploymentId)}/aliases`, { method: 'POST',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alias: this.input.hostname }) });
        const { previous, hostname } = aliasReceipt(result);
        const actual = await this.aliasTarget();
        if (!aliasReceiptMatches({ expectedPrevious, observedPrevious: previous, expectedTarget: deploymentId, observedTarget: actual ?? '',
            expectedHostname: this.input.hostname, observedHostname: hostname })) throw new Error('CLOUD_RELEASE_ALIAS_CHANGED');
        await this.verifyServed(`https://${this.input.hostname}`, false);
        await this.verifyProtected(deployment.url);
    }
}
