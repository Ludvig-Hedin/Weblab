import { readFile } from 'fs/promises';
import { z } from 'zod';

import { ensureWithinProjectRoot } from './_path.js';

export const readFileSchema = z.object({
    file_path: z.string().min(1).describe('Absolute path to the file to read'),
    offset: z.number().optional().describe('Line number to start reading from (1-based)'),
    limit: z.number().optional().describe('Maximum number of lines to return'),
});

export async function handleReadFile(
    args: z.infer<typeof readFileSchema>,
    projectRoot?: string,
): Promise<string> {
    const safe = ensureWithinProjectRoot(args.file_path, projectRoot);
    const raw = await readFile(safe, 'utf8').catch((err: NodeJS.ErrnoException) => {
        throw new Error(`Cannot read ${args.file_path}: ${err.message}`);
    });

    const lines = raw.split('\n');
    const start = Math.max(0, (args.offset ?? 1) - 1);
    const end = args.limit ? start + args.limit : lines.length;
    const slice = lines.slice(start, Math.min(end, 2000 + start));

    const numbered = slice.map((line, i) => `${start + i + 1}\t${line}`).join('\n');
    // Detect truncation when the returned slice doesn't reach the end of the file —
    // covers both an explicit limit and the hard 2000-line cap above.
    const sliceEnd = start + slice.length;
    const truncated =
        sliceEnd < lines.length
            ? `\n... (truncated, showing lines ${start + 1}–${sliceEnd} of ${lines.length})`
            : '';
    return numbered + truncated;
}
