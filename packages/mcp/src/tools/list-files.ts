import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod';

import { ensureWithinProjectRoot } from './_path.js';

export const listFilesSchema = z.object({
    path: z.string().describe('Absolute directory path to list'),
    show_hidden: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include hidden files (dot-prefixed)'),
    ignore: z.array(z.string()).optional().describe('Exact directory or file names to exclude'),
});

export async function handleListFiles(
    args: z.infer<typeof listFilesSchema>,
    projectRoot?: string,
): Promise<string> {
    const safePath = ensureWithinProjectRoot(args.path, projectRoot);
    const entries = await readdir(safePath).catch((err: NodeJS.ErrnoException) => {
        throw new Error(`Cannot list ${args.path}: ${err.message}`);
    });

    const ignoreSet = new Set(args.ignore ?? ['node_modules', '.git', '.next', 'dist']);
    const results: { path: string; type: string }[] = [];

    for (const name of entries) {
        if (!args.show_hidden && name.startsWith('.')) continue;
        if (ignoreSet.has(name)) continue;

        const full = join(safePath, name);
        const s = await stat(full).catch(() => null);
        if (!s) continue;
        results.push({ path: name, type: s.isDirectory() ? 'directory' : 'file' });
    }

    results.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.path.localeCompare(b.path);
    });

    return (
        results.map((r) => `${r.type === 'directory' ? 'd' : 'f'} ${r.path}`).join('\n') ||
        '(empty)'
    );
}
