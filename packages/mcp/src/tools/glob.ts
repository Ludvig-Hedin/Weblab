import { readdir, stat } from 'fs/promises';
import { join, relative as pathRelative } from 'path';
import { z } from 'zod';

import { ensureWithinProjectRoot } from './_path.js';

export const globSchema = z.object({
    pattern: z.string().min(1).describe('Simple glob pattern, e.g. "**/*.ts" or "src/**/*.tsx"'),
    root: z.string().describe('Absolute root directory to search from'),
    max_results: z.number().optional().default(100),
});

function matchSimpleGlob(pattern: string, filePath: string): boolean {
    // Convert glob pattern to regex. `**/` matches zero-or-more leading path
    // segments (incl. none) so `**/*.ts` matches both root files (`index.ts`)
    // AND deeply-nested files (`src/a/foo.ts`). Stash the `**/` and `**`
    // expansions behind placeholders FIRST so the `*` → `[^/]*` pass can't
    // corrupt the `.*` inside them (which would otherwise re-limit `**/` to a
    // single segment).
    const escaped = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*\//g, '__GLOBSTAR_SLASH__')
        .replace(/\*\*/g, '__DOUBLESTAR__')
        .replace(/\*/g, '[^/]*')
        .replace(/__GLOBSTAR_SLASH__/g, '(?:.*/)?')
        .replace(/__DOUBLESTAR__/g, '.*');
    return new RegExp(`^${escaped}$`).test(filePath);
}

async function walk(
    dir: string,
    root: string,
    pattern: string,
    ignore: Set<string>,
    results: string[],
    max: number,
) {
    if (results.length >= max) return;
    const entries = await readdir(dir).catch(() => [] as string[]);
    for (const name of entries) {
        if (ignore.has(name)) continue;
        const full = join(dir, name);
        // Normalize to forward slashes so simple-glob patterns work on Windows too.
        const rel = pathRelative(root, full).split(/[\\/]/).join('/');
        const s = await stat(full).catch(() => null);
        if (!s) continue;
        if (s.isDirectory()) {
            await walk(full, root, pattern, ignore, results, max);
        } else if (matchSimpleGlob(pattern, rel)) {
            results.push(full);
            if (results.length >= max) return;
        }
    }
}

export async function handleGlob(
    args: z.infer<typeof globSchema>,
    projectRoot?: string,
): Promise<string> {
    const safeRoot = ensureWithinProjectRoot(args.root, projectRoot);
    const ignore = new Set(['node_modules', '.git', '.next', 'dist']);
    const results: string[] = [];
    await walk(safeRoot, safeRoot, args.pattern, ignore, results, args.max_results ?? 100);
    return results.length > 0 ? results.join('\n') : '(no matches)';
}
