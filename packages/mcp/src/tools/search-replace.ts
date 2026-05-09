import { readFile, writeFile } from 'fs/promises';
import { z } from 'zod';

import { ensureWithinProjectRoot } from './_path.js';

export const searchReplaceSchema = z.object({
    file_path: z.string().min(1).describe('Absolute path to the file to edit'),
    old_string: z.string().min(1).describe('Exact string to find (must be unique in the file)'),
    new_string: z.string().describe('Replacement string'),
    replace_all: z
        .boolean()
        .optional()
        .default(false)
        .describe('Replace all occurrences instead of just the first'),
});

export async function handleSearchReplace(
    args: z.infer<typeof searchReplaceSchema>,
    projectRoot?: string,
): Promise<string> {
    const safe = ensureWithinProjectRoot(args.file_path, projectRoot);
    const content = await readFile(safe, 'utf8').catch((err: NodeJS.ErrnoException) => {
        throw new Error(`Cannot read ${args.file_path}: ${err.message}`);
    });

    if (!content.includes(args.old_string)) {
        throw new Error(`String not found in ${args.file_path}: ${args.old_string.slice(0, 80)}`);
    }

    const count = content.split(args.old_string).length - 1;
    if (count > 1 && !args.replace_all) {
        throw new Error(
            `old_string appears ${count} times in ${args.file_path}. Provide more context to make it unique, or set replace_all=true.`,
        );
    }

    // Use split/join (or a literal-replacer function) to avoid String.replace's
    // special replacement patterns (e.g. $&, $1) being interpreted in new_string.
    const updated = args.replace_all
        ? content.split(args.old_string).join(args.new_string)
        : content.replace(args.old_string, () => args.new_string);

    await writeFile(safe, updated, 'utf8');
    return `Replaced ${args.replace_all ? count : 1} occurrence(s) in ${args.file_path}`;
}
