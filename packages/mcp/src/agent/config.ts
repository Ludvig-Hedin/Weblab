/**
 * Environment configuration for the Weblab agent MCP server.
 *
 * Two required env vars (kept out of git — set them in the MCP client config or
 * a local shell, never committed):
 *  - WEBLAB_AGENT_API_URL   the Convex HTTP base, e.g.
 *                           `https://<deployment>.convex.site`
 *  - WEBLAB_AGENT_API_TOKEN the shared secret matching the backend's
 *                           `WEBLAB_AGENT_API_TOKEN` Convex deployment env var
 */
import { AgentApiError } from './errors.js';

export interface AgentApiConfig {
    /** Base URL with no trailing slash. */
    baseUrl: string;
    token: string;
}

type EnvRecord = Record<string, string | undefined>;

function stripTrailingSlash(value: string): string {
    return value.replace(/\/+$/, '');
}

/**
 * Build the agent config from environment variables. Throws a `CONFIG_MISSING`
 * error with an actionable message when either var is absent — surfaced at
 * process start so misconfiguration is obvious.
 */
export function loadAgentConfigFromEnv(env: EnvRecord = process.env): AgentApiConfig {
    const baseUrl = env.WEBLAB_AGENT_API_URL?.trim();
    const token = env.WEBLAB_AGENT_API_TOKEN?.trim();

    if (!baseUrl) {
        throw new AgentApiError(
            'CONFIG_MISSING',
            'WEBLAB_AGENT_API_URL is not set. Point it at your Convex HTTP base, e.g. https://<deployment>.convex.site',
        );
    }
    if (!token) {
        throw new AgentApiError(
            'CONFIG_MISSING',
            'WEBLAB_AGENT_API_TOKEN is not set. Use the secret configured on the Convex deployment (convex env set WEBLAB_AGENT_API_TOKEN ...).',
        );
    }

    return { baseUrl: stripTrailingSlash(baseUrl), token };
}
