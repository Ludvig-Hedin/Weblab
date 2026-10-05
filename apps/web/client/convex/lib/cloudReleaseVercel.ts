'use node';

import { createHash } from 'node:crypto';
import { aliasReceiptMatches } from './cloudReleasePolicy';

type Json = Record<string, unknown>;
function object(value: unknown): Json {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('CLOUD_RELEASE_PROVIDER_RESPONSE');
    return value as Json;
}
function id(value: unknown): string {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(value)) throw new Error('CLOUD_RELEASE_PROVIDER_ID');
    return value;
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
    constructor(private readonly input: { token: string; teamId: string; projectId: string; hostname: string; bypass: string }, private readonly signal: AbortSignal) {}
    private async request(path: string, init: RequestInit = {}): Promise<Json> {
        const url = new URL(path, 'https://api.vercel.com');
        url.searchParams.set('teamId', this.input.teamId);
        const response = await fetch(url, { ...init, redirect: 'error', cache: 'no-store', signal: this.signal,
            headers: { Authorization: `Bearer ${this.input.token}`, ...init.headers } });
        if (!response.ok) throw new Error(`CLOUD_RELEASE_PROVIDER_${response.status}`);
        return boundedJson(response);
    }
    async verifyProject(): Promise<void> {
        const project = await this.request(`/v9/projects/${encodeURIComponent(this.input.projectId)}`);
        const protection = project.ssoProtection ? object(project.ssoProtection) : null;
        if (project.id !== this.input.projectId || project.accountId !== this.input.teamId || project.link || project.autoExposeSystemEnvs !== false ||
            protection?.deploymentType !== 'prod_deployment_urls_and_all_previews' || !this.input.bypass || project.rootDirectory || project.commandForIgnoringBuildStep || project.rollingRelease) {
            throw new Error('CLOUD_RELEASE_PROVIDER_SETUP');
        }
        const env = await this.request(`/v10/projects/${encodeURIComponent(this.input.projectId)}/env?decrypt=false`);
        if (!Array.isArray(env.envs) || env.envs.length || (env.pagination && object(env.pagination).next)) throw new Error('CLOUD_RELEASE_PROVIDER_ENV_UNSUPPORTED');
        const routesPath = `/v1/projects/${encodeURIComponent(this.input.projectId)}/routes`;
        const version = liveRouteVersion(await this.request(`${routesPath}/versions`));
        const routes = await this.request(`${routesPath}?versionId=${encodeURIComponent(version)}`);
        if (object(routes.version).id !== version) throw new Error('CLOUD_RELEASE_CREDENTIAL_ISOLATION');
        assertCredentialIsolation(routes);
        if (liveRouteVersion(await this.request(`${routesPath}/versions`)) !== version) throw new Error('CLOUD_RELEASE_CREDENTIAL_ISOLATION');
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
        const data = await this.request(`/v13/deployments/${encodeURIComponent(id(deploymentId))}`);
        const meta = object(data.meta);
        if (data.id !== deploymentId || data.projectId !== this.input.projectId || data.target !== 'production' ||
            meta.weblabCloudReleaseId !== releaseId || meta.weblabCloudReleaseHash !== hash) throw new Error('CLOUD_RELEASE_BUILD_CHANGED');
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
        await this.verifyProject();
        const result = await this.request(`/v2/deployments/${encodeURIComponent(id(deploymentId))}/aliases`, { method: 'POST',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alias: this.input.hostname }) });
        id(result.uid);
        const previous = result.oldDeploymentId === undefined ? null : id(result.oldDeploymentId);
        const actual = await this.aliasTarget();
        if (!aliasReceiptMatches({ expectedPrevious, observedPrevious: previous, expectedTarget: deploymentId, observedTarget: actual ?? '', expectedHostname: this.input.hostname, observedHostname: String(result.alias) })) throw new Error('CLOUD_RELEASE_ALIAS_CHANGED');
        await this.verifyServed(`https://${this.input.hostname}`, false);
    }
}
