/**
 * Sanitize a project-relative path supplied by the AI. Drops traversal
 * segments (`..`, `.`), strips leading slashes, normalises empty segments.
 * Throws when the result is empty so callers don't silently fall back to a
 * surprising default.
 */
export function sanitizeProjectPath(path: string | undefined, fallback: string): string {
    const trimmed = path?.trim();
    const candidate = trimmed && trimmed.length > 0 ? trimmed : fallback;
    const cleaned = candidate
        .replace(/^[/\\]+/, '')
        .split(/[/\\]+/)
        .filter((seg) => seg && seg !== '..' && seg !== '.')
        .join('/');
    if (!cleaned) {
        throw new Error(
            `Invalid project path "${path}" — must be a relative path inside the project, no traversal.`,
        );
    }
    return cleaned;
}
