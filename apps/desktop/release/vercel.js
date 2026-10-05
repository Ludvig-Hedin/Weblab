'use strict';

const { sha256 } = require('./policy');

const PROTECTION = new Set(['prod_deployment_urls_and_all_previews', 'all']);
const DEFINITE_REFUSALS = new Set([400, 401, 403, 404, 413, 422, 429]);
const ID = /^[a-zA-Z0-9_-]{1,160}$/;
const PUBLIC_CONFIG = {
    SANITY_PROJECT_ID: /^[a-z0-9]{8}$/, NEXT_PUBLIC_SANITY_PROJECT_ID: /^[a-z0-9]{8}$/,
    SANITY_DATASET: /^[a-z0-9][a-z0-9_-]{0,63}$/, NEXT_PUBLIC_SANITY_DATASET: /^[a-z0-9][a-z0-9_-]{0,63}$/,
    SANITY_API_VERSION: /^\d{4}-\d{2}-\d{2}$/, NEXT_PUBLIC_SANITY_API_VERSION: /^\d{4}-\d{2}-\d{2}$/,
};

function identifier(value) {
    if (typeof value !== 'string' || !ID.test(value)) throw new Error('Invalid Vercel identifier.');
    return encodeURIComponent(value);
}

class VercelApi {
    constructor({ token, projectId, teamId, accountId, fetchImpl = globalThis.fetch }) {
        if (typeof token !== 'string' || token.length < 8 || token.length > 4096 || /[\r\n]/.test(token)) {
            throw new Error('A valid Vercel access token is required.');
        }
        identifier(projectId);
        if (teamId) identifier(teamId);
        this.token = token;
        this.projectId = projectId;
        this.teamId = teamId;
        this.accountId = accountId;
        this.fetch = fetchImpl;
    }

    async request(route, { method = 'GET', body, signal } = {}) {
        // No caller URL, redirects, or forwarded credentials to another host.
        if (!/^\/v\d+\/[a-zA-Z0-9_/?=&.%+-]+$/.test(route)) throw new Error('Invalid Vercel API route.');
        const url = new URL(route, 'https://api.vercel.com');
        if (this.teamId) url.searchParams.set('teamId', this.teamId);
        const combined = signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000);
        let response;
        try {
            response = await this.fetch(url.href, {
                method, redirect: 'error', signal: combined,
                headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            });
        } catch (cause) {
            const error = new Error(method === 'GET'
                ? 'Vercel could not be reached.'
                : 'Vercel did not confirm the request. Check its status before trying again.');
            error.uncertain = method !== 'GET';
            error.cause = cause;
            throw error;
        }
        if (!response.ok) {
            const error = new Error(`Vercel refused the request (${response.status}).`);
            error.uncertain = method !== 'GET' && !DEFINITE_REFUSALS.has(response.status);
            throw error;
        }
        let data;
        try {
            const text = await response.text();
            if (text.length > 4 * 1024 * 1024) throw new Error('Vercel returned too much data.');
            data = text ? JSON.parse(text) : {};
        } catch {
            const error = new Error('Vercel did not return a complete valid response. Check status before trying again.');
            error.uncertain = method !== 'GET';
            throw error;
        }
        return { data, status: response.status };
    }

    async project(signal) {
        const { data } = await this.request(`/v9/projects/${identifier(this.projectId)}`, { signal });
        if (data.id !== this.projectId || data.framework !== 'nextjs') throw new Error('Choose the linked Next.js project in your Vercel account.');
        if (typeof data.accountId !== 'string' || (this.accountId && data.accountId !== this.accountId)) throw new Error('The Vercel project account changed. Connect it again.');
        if (!PROTECTION.has(data.ssoProtection?.deploymentType)) throw new Error('Protect previews and production deployment URLs in Vercel before publishing.');
        if (data.rollingRelease) throw new Error('Rolling releases are not supported by this publish flow.');
        if (data.rootDirectory || data.commandForIgnoringBuildStep) throw new Error('This publish flow requires the project root and no ignored build step.');
        return data;
    }

    async environmentBindings(requiredKeys, signal) {
        if (!Array.isArray(requiredKeys) || requiredKeys.length > 100 || requiredKeys.some((key) => !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(key))) {
            throw new Error('Invalid environment key list.');
        }
        const { data } = await this.request(`/v9/projects/${identifier(this.projectId)}/env?decrypt=true`, { signal });
        if (!Array.isArray(data.envs) || data.pagination?.next) throw new Error('Vercel environment settings could not be verified completely.');
        const relevant = data.envs.filter((entry) => Array.isArray(entry.target) && entry.target.some((target) => target === 'preview' || target === 'production'));
        const keys = new Set([...requiredKeys, ...relevant.map((entry) => entry.key)]);
        const sharedPublicConfig = [];
        for (const key of keys) {
            const preview = relevant.filter((entry) => entry.key === key && entry.target.includes('preview') && !entry.gitBranch && !entry.customEnvironmentIds?.length);
            const production = relevant.filter((entry) => entry.key === key && entry.target.includes('production'));
            if (preview.length !== 1 || production.length !== 1) throw new Error(`Separate preview and production values are required for ${key}.`);
            if (typeof preview[0].value !== 'string' || typeof production[0].value !== 'string') throw new Error(`Vercel did not allow verification of ${key}.`);
            if (preview[0].id === production[0].id || preview[0].value === production[0].value) {
                if (!PUBLIC_CONFIG[key]?.test(preview[0].value) || preview[0].value !== production[0].value) {
                    throw new Error(`Preview must have its own value for ${key}.`);
                }
                sharedPublicConfig.push({ key, value: preview[0].value });
            }
        }
        this.sharedPublicConfig = sharedPublicConfig.sort((a, b) => a.key.localeCompare(b.key));
        // Values stay in the main process and are represented only by a digest in review state.
        return sha256(Buffer.from(JSON.stringify(relevant.map((entry) => ({
            id: entry.id, key: entry.key, target: entry.target, gitBranch: entry.gitBranch ?? null,
            customEnvironmentIds: entry.customEnvironmentIds ?? [], value: entry.value, updatedAt: entry.updatedAt ?? null,
        })).sort((a, b) => String(a.id).localeCompare(String(b.id))))));
    }

    async deployment(deploymentId, signal) {
        const { data } = await this.request(`/v13/deployments/${identifier(deploymentId)}`, { signal });
        if (data.id !== deploymentId || data.projectId !== this.projectId) throw new Error('The deployment belongs to another Vercel project.');
        return data;
    }

    async findBuild({ releaseId, sourceHash, production, since }) {
        const { data } = await this.request(`/v6/deployments?projectId=${identifier(this.projectId)}&limit=100&since=${Math.floor(since)}`);
        if (!Array.isArray(data.deployments) || data.pagination?.next || data.deployments.length > 30) throw new Error('The uncertain build could not be reconciled completely.');
        const matches = [];
        for (const candidate of data.deployments) {
            const deployment = await this.deployment(candidate.uid ?? candidate.id);
            if (deployment.meta?.weblabReleaseId === releaseId && deployment.meta?.weblabSourceHash === sourceHash &&
                (production ? deployment.target === 'production' : deployment.target !== 'production')) {
                matches.push({ id: deployment.id, readyState: deployment.readyState, url: deployment.url });
            }
        }
        if (matches.length > 1) throw new Error('More than one matching build exists. Check Vercel before continuing.');
        return matches[0] ?? null;
    }

    async routing(signal) {
        const project = await this.project(signal);
        const current = project.targets?.production?.id ?? null;
        if (current !== null) identifier(current);
        const { data } = await this.request(`/v9/projects/${identifier(this.projectId)}/domains?limit=100`, { signal });
        if (!Array.isArray(data.domains) || data.pagination?.next) throw new Error('Production domains could not be verified completely.');
        const names = data.domains.filter((domain) => !domain.gitBranch && !domain.redirect && !domain.customEnvironmentId)
            .map((domain) => domain.name).sort();
        if (!names.length || names.length > 50 || names.some((name) => typeof name !== 'string' || !/^[A-Za-z0-9.-]{1,253}$/.test(name))) {
            throw new Error('Connect the production domain in Vercel before publishing.');
        }
        const aliases = [];
        for (const name of names) {
            const { data: alias } = await this.request(`/v4/aliases/${encodeURIComponent(name)}`, { signal });
            const deploymentId = alias.deployment?.id ?? alias.deploymentId;
            if (typeof deploymentId !== 'string' || alias.alias !== name) throw new Error('A production domain could not be verified.');
            aliases.push({ name, deploymentId });
        }
        if (!current || aliases.some((alias) => alias.deploymentId !== current)) throw new Error('Production domains point to different versions. Resolve this in Vercel first.');
        return { current, aliases, lastAliasRequest: project.lastAliasRequest ?? null };
    }

    async confirmSwitch(deploymentId, since, signal) {
        const routing = await this.routing(signal);
        const request = routing.lastAliasRequest;
        if (!request || request.toDeploymentId !== deploymentId || request.requestedAt < since || request.jobStatus !== 'succeeded' || routing.current !== deploymentId) {
            return { confirmed: false, failed: request?.toDeploymentId === deploymentId && request.jobStatus === 'failed' };
        }
        return { confirmed: true, aliases: routing.aliases };
    }

    async create({ release, releaseId, production, signal, beforePost }) {
        let project;
        try {
            project = await this.project(signal);
            if (typeof beforePost !== 'function') throw new Error('Fresh publishing authorization is required.');
            await beforePost();
        }
        catch (error) { error.uncertain = false; throw error; }
        const { data } = await this.request('/v13/deployments', {
            method: 'POST', signal,
            body: {
                name: project.name, project: this.projectId,
                files: release.files.map((file) => ({ file: file.path, data: file.bytes.toString('base64'), encoding: 'base64' })),
                ...(production ? { target: 'production' } : {}),
                autoAssignCustomDomains: false,
                projectSettings: { framework: 'nextjs' },
                meta: { weblabReleaseId: releaseId, weblabSourceHash: release.hash },
            },
        });
        try {
            identifier(data.id);
            if (data.aliasAssigned || data.alias?.length) throw new Error('Unexpected alias');
        } catch {
            const error = new Error('Vercel did not confirm a safe unaliased build. Check the project before continuing.');
            error.uncertain = true;
            throw error;
        }
        return { id: data.id, readyState: data.readyState };
    }

    async switchProduction(deploymentId, { rollback = false, signal, beforePost } = {}) {
        let route;
        try {
            await this.project(signal);
            const deployment = await this.deployment(deploymentId, signal);
            if (deployment.readyState !== 'READY' || deployment.target !== 'production') throw new Error('Only a ready production build can be published.');
            route = rollback
                ? `/v1/projects/${identifier(this.projectId)}/rollback/${identifier(deploymentId)}`
                : `/v10/projects/${identifier(this.projectId)}/promote/${identifier(deploymentId)}`;
            if (typeof beforePost !== 'function') throw new Error('Fresh publishing authorization is required.');
            await beforePost();
        } catch (error) { error.uncertain = false; throw error; }
        const result = await this.request(route, { method: 'POST', body: {}, signal });
        if (result.status === 202) {
            const error = new Error('Vercel queued the change. The website is not confirmed updated yet.');
            error.uncertain = true;
            throw error;
        }
        return { requestedDeploymentId: deploymentId };
    }
}

module.exports = { VercelApi };
