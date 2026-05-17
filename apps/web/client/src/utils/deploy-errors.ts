import stripAnsi from 'strip-ansi';

/**
 * A parsed, human-readable view of a deployment failure. The raw log is kept
 * so users can still drill into the original output when the parsed message
 * is not enough.
 */
export interface ParsedDeployError {
    /** Short, human-readable description of the failure. */
    message: string;
    /** Optional next-step guidance ("how do I fix this?"). */
    suggestion?: string;
    /** ANSI-stripped raw error text. May be empty. */
    rawLog: string;
}

interface ErrorPattern {
    re: RegExp;
    message: string;
    suggestion: string;
}

const PATTERNS: ErrorPattern[] = [
    {
        re: /missing required environment variable|process\.env\.(\w+) is not defined|env(?:ironment)? variable .* (?:not defined|missing|required)/i,
        message: 'A required environment variable is missing.',
        suggestion:
            'Open Advanced Settings → Environment variables and add the missing key, then try again.',
    },
    {
        re: /(?:npm|bun|yarn|pnpm) (?:run )?build.*?(?:failed|exit(?:ed)? (?:with )?(?:code )?[1-9])/i,
        message: 'Build script failed.',
        suggestion:
            'Check the build log for the failing step. Common causes: TypeScript errors, missing dependency, or an incorrect build command in Advanced Settings.',
    },
    {
        re: /cannot find module|module not found/i,
        message: 'A package is missing from your dependencies.',
        suggestion: 'Add the package to your project and reinstall before publishing again.',
    },
    {
        re: /ENOENT.*lock(?:file)?|no lock(?:file)? found/i,
        message: 'No lockfile detected.',
        suggestion: 'Commit a package-lock.json, bun.lockb, or yarn.lock and republish.',
    },
    {
        re: /\b(?:401|403)\b|unauthor(?:ized|ised)|forbidden|invalid (?:token|api key|credentials)/i,
        message: 'The hosting provider rejected your credentials.',
        suggestion:
            'Reconnect the provider in Settings → Integrations and try again. The token may have expired or been revoked.',
    },
    {
        re: /\btimeout\b|timed out|deadline exceeded/i,
        message: 'The deploy took too long and timed out.',
        suggestion:
            'Re-run the deploy. If it keeps timing out, look for an infinite loop or hung process in your build script.',
    },
    {
        re: /(?:domain|hostname) (?:already|in use)/i,
        message: 'That domain is already in use.',
        suggestion: 'Pick a different subdomain or unlink the existing site first.',
    },
    {
        re: /rate ?limit|too many requests/i,
        message: 'Hit the provider rate limit.',
        suggestion: 'Wait a few minutes and try again.',
    },
];

/**
 * Map a raw deployment error string to a user-friendly summary with optional
 * remediation. Falls back to the first non-empty line when no pattern matches.
 */
export function parseDeploymentError(rawError: string | null | undefined): ParsedDeployError {
    const raw = stripAnsi(rawError ?? '').trim();
    if (!raw) {
        return { message: 'Deployment failed.', rawLog: '' };
    }
    for (const pattern of PATTERNS) {
        if (pattern.re.test(raw)) {
            return {
                message: pattern.message,
                suggestion: pattern.suggestion,
                rawLog: raw,
            };
        }
    }
    const firstLine = raw.split('\n').find((line) => line.trim()) ?? raw;
    return {
        message: firstLine.length > 200 ? `${firstLine.slice(0, 200)}…` : firstLine,
        rawLog: raw,
    };
}
