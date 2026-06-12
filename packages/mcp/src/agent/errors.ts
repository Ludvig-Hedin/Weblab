/**
 * Typed errors for the Weblab agent connector. Every failure mode the task
 * cares about maps to one stable code so MCP tools can report it cleanly.
 */

export type AgentErrorCode =
    | 'AUTH_FAILED' // bad / missing agent token (HTTP 401)
    | 'PERMISSION_DENIED' // resource exists but not owned by the agent (HTTP 403)
    | 'NOT_FOUND' // project / resource does not exist (HTTP 404)
    | 'INVALID_INPUT' // caller-side validation or bad request (HTTP 400/422)
    | 'BACKEND_UNAVAILABLE' // network failure, 5xx, or unexpected response shape
    | 'UNSUPPORTED' // capability intentionally not supported in this version
    | 'CONFIG_MISSING'; // required env var not set on the MCP process

export class AgentApiError extends Error {
    readonly code: AgentErrorCode;
    readonly status?: number;

    constructor(code: AgentErrorCode, message: string, status?: number) {
        super(message);
        this.name = 'AgentApiError';
        this.code = code;
        this.status = status;
    }
}

/** Map an HTTP status from the backend to a connector error code. */
export function errorCodeForStatus(status: number): AgentErrorCode {
    switch (status) {
        case 400:
        case 422:
            return 'INVALID_INPUT';
        case 401:
            return 'AUTH_FAILED';
        case 403:
            return 'PERMISSION_DENIED';
        case 404:
            return 'NOT_FOUND';
        default:
            return 'BACKEND_UNAVAILABLE';
    }
}
