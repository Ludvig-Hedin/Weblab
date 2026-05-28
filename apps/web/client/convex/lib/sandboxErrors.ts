import { ConvexError } from 'convex/values';

// Maps errors thrown by the @vercel/sandbox SDK during sandbox provisioning
// into ConvexErrors with a structured, user-facing payload.
//
// Why this exists: a plain `Error` thrown from a Convex action is redacted to
// the opaque string "Server Error" on production deployments. That hides the
// real reason a sandbox failed to provision (e.g. Vercel HTTP 402 billing),
// leaving the user with an undiagnosable toast. `ConvexError` application
// errors are delivered to the client verbatim, so we re-wrap the recognized,
// safe-to-surface provisioning failures here. Unrecognized errors are returned
// untouched so they keep the deliberate prod redaction.

export type SandboxErrorKind = 'billing' | 'auth' | 'rate_limit' | 'upstream' | 'unknown';

// A `type` (not `interface`) so it satisfies Convex's `Value` constraint on
// `ConvexError<T>` — interfaces are open and lack the implicit string index
// signature that `Value` requires.
export type SandboxErrorData = {
    kind: SandboxErrorKind;
    /** HTTP status pulled from the SDK error, when one could be derived. */
    status: number | null;
    /** User-facing, actionable message safe to render in a toast. */
    message: string;
    /** Whether the caller should offer a "Retry" affordance. */
    retryable: boolean;
};

/**
 * Pull an HTTP status code out of an error thrown by the Vercel Sandbox SDK.
 * The SDK throws plain Errors shaped like `"Status code 402 is not ok"` and,
 * depending on the call site, may also attach numeric status fields. Structured
 * fields are checked first, then the message is parsed as a fallback.
 */
export function extractHttpStatus(error: unknown): number | null {
    if (error && typeof error === 'object') {
        const e = error as Record<string, unknown>;
        const response = e.response as Record<string, unknown> | undefined;
        const candidates = [e.status, e.statusCode, response?.status];
        for (const candidate of candidates) {
            if (typeof candidate === 'number' && candidate >= 100 && candidate <= 599) {
                return candidate;
            }
        }
    }
    const message = error instanceof Error ? error.message : String(error);
    // `(?!\d)` so we don't grab the first 3 digits of a 4-digit number.
    const match = message.match(/status code (\d{3})(?!\d)/i);
    if (match) {
        const parsed = Number(match[1]);
        if (parsed >= 100 && parsed <= 599) return parsed;
    }
    return null;
}

/**
 * Convert a sandbox-provisioning failure into a ConvexError when it matches a
 * recognized, safe-to-surface category (billing / auth / rate-limit / upstream).
 * Returns the original `error` untouched otherwise — DB errors, validation
 * errors, and anything we don't explicitly classify keep their existing
 * behavior (including prod redaction).
 */
export function mapSandboxProvisionError(error: unknown): unknown {
    // Don't double-wrap: an inner action may already have classified this.
    if (error instanceof ConvexError) return error;

    const status = extractHttpStatus(error);
    if (status === null) return error;

    let data: SandboxErrorData | null = null;
    if (status === 402) {
        data = {
            kind: 'billing',
            status,
            message:
                'Sandbox provisioning is blocked by Vercel billing (HTTP 402, Payment Required). ' +
                'The connected Vercel team has hit a spend limit or is on a plan that does not ' +
                'include Sandbox. Add a payment method, raise the spend cap, or upgrade the team ' +
                'in the Vercel dashboard, then try again.',
            retryable: false,
        };
    } else if (status === 401 || status === 403) {
        data = {
            kind: 'auth',
            status,
            message:
                `Vercel rejected the sandbox request (HTTP ${status}). The VERCEL_TOKEN is ` +
                'invalid or lacks access to the configured team/project. Verify VERCEL_TOKEN, ' +
                'VERCEL_TEAM_ID, and VERCEL_PROJECT_ID.',
            retryable: false,
        };
    } else if (status === 429) {
        data = {
            kind: 'rate_limit',
            status,
            message:
                'Vercel is rate-limiting sandbox creation (HTTP 429). Too many sandboxes are ' +
                'being provisioned right now. Wait a few moments and try again.',
            retryable: true,
        };
    } else if (status >= 500 && status <= 599) {
        data = {
            kind: 'upstream',
            status,
            message:
                `Vercel's sandbox service returned a temporary error (HTTP ${status}). This is ` +
                'usually transient. Please try again in a few moments.',
            retryable: true,
        };
    }

    if (!data) return error;
    return new ConvexError(data);
}
