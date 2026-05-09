import { isAbsolute, relative, resolve } from 'path';

/**
 * Reject any path that resolves outside `projectRoot`. Mirrors the check
 * already used by `bash.ts` and `write-file.ts` so every tool that takes a
 * path argument enforces the same containment invariant.
 *
 * Returns the resolved path (always absolute, normalised) so callers can use
 * it directly. Throws on escape so the MCP tool surfaces a structured error
 * to the agent rather than silently reading something it shouldn't.
 */
export function ensureWithinProjectRoot(inputPath: string, projectRoot?: string): string {
    const resolved = resolve(inputPath);
    if (!projectRoot) {
        return resolved;
    }
    const root = resolve(projectRoot);
    const rel = relative(root, resolved);
    if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
        return resolved;
    }
    throw new Error(`Path must be within the project root: ${inputPath}`);
}
