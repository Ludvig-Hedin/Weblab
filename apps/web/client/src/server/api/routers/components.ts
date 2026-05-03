import { readdir, readFile } from 'fs/promises';
import { extname, join, relative, resolve } from 'path';
import { z } from 'zod';

import { createTRPCRouter, protectedProcedure } from '../trpc';
import { extractComponents, type DiscoveredComponent } from './components.utils';

// The sandbox project root is always at this path in the runtime environment.
// Client code must pass this constant as the projectRoot to avoid path traversal.
const SANDBOX_ROOT = '/project/sandbox';

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', '.git', '__tests__', 'test']);

async function scanDirectory(dir: string, root: string): Promise<DiscoveredComponent[]> {
    const results: DiscoveredComponent[] = [];

    async function walk(current: string) {
        let entries;
        try {
            entries = await readdir(current, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (entry.isDirectory()) {
                if (!SKIP_DIRS.has(entry.name)) await walk(join(current, entry.name));
            } else if (['.tsx', '.jsx'].includes(extname(entry.name))) {
                const fullPath = join(current, entry.name);
                try {
                    const source = await readFile(fullPath, 'utf-8');
                    const relPath = relative(root, fullPath);
                    results.push(...extractComponents(source, relPath));
                } catch {
                    // skip unreadable files
                }
            }
        }
    }

    await walk(dir);
    return results;
}

export const componentsRouter = createTRPCRouter({
    listProjectComponents: protectedProcedure
        .input(z.object({ projectRoot: z.string().min(1).optional() }))
        .query(async ({ input }) => {
            // Only tests may override the sandbox root. Runtime requests must stay inside the
            // well-known sandbox path to avoid exposing arbitrary server files.
            const root =
                process.env.NODE_ENV === 'test' && input.projectRoot
                    ? resolve(input.projectRoot)
                    : SANDBOX_ROOT;
            const srcDir = join(root, 'src');
            return scanDirectory(srcDir, root);
        }),
});
