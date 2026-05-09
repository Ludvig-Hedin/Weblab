import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod';

import { ensureWithinProjectRoot } from './_path.js';

export const grepSchema = z.object({
    pattern: z.string().min(1).describe('Regular expression to search for'),
    path: z.string().describe('File or directory to search in'),
    include: z.string().optional().describe('File extension filter, e.g. ".ts"'),
    max_results: z.number().optional().default(50).describe('Maximum number of matches to return'),
    ignore_case: z.boolean().optional().default(false),
});

async function searchFile(filePath: string, regex: RegExp, maxResults: number, results: string[]) {
    if (results.length >= maxResults) return;
    const text = await readFile(filePath, 'utf8').catch(() => null);
    if (!text) return;

    text.split('\n').forEach((line, i) => {
        if (results.length >= maxResults) return;
        if (regex.test(line)) {
            results.push(`${filePath}:${i + 1}: ${line.trim()}`);
        }
    });
}

async function walk(
    dir: string,
    ext: string | undefined,
    ignore: Set<string>,
    results: string[],
    regex: RegExp,
    max: number,
) {
    if (results.length >= max) return;
    const entries = await readdir(dir).catch(() => [] as string[]);
    for (const name of entries) {
        if (ignore.has(name)) continue;
        const full = join(dir, name);
        const s = await stat(full).catch(() => null);
        if (!s) continue;
        if (s.isDirectory()) {
            await walk(full, ext, ignore, results, regex, max);
        } else if (!ext || name.endsWith(ext)) {
            await searchFile(full, regex, max, results);
        }
    }
}

export async function handleGrep(
    args: z.infer<typeof grepSchema>,
    projectRoot?: string,
): Promise<string> {
    const safePath = ensureWithinProjectRoot(args.path, projectRoot);
    const flags = args.ignore_case ? 'i' : '';
    let regex: RegExp;
    try {
        regex = new RegExp(args.pattern, flags);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Invalid regular expression: ${args.pattern} (${message})`);
    }
    const ignore = new Set(['node_modules', '.git', '.next', 'dist']);
    const results: string[] = [];

    const s = await stat(safePath).catch(() => null);
    if (!s) throw new Error(`Path not found: ${args.path}`);

    if (s.isDirectory()) {
        await walk(safePath, args.include, ignore, results, regex, args.max_results ?? 50);
    } else {
        await searchFile(safePath, regex, args.max_results ?? 50, results);
    }

    return results.length > 0 ? results.join('\n') : '(no matches)';
}
