import { readdir, readFile } from 'fs/promises';
import { extname, join, relative } from 'path';
import { z } from 'zod';

import { publicProcedure, router } from '../trpc';

export interface DiscoveredComponent {
    name: string;
    filePath: string;
    exportType: 'default' | 'named';
}

// NOTE: This uses regex-based extraction rather than a full AST parser because
// @babel/parser is not a dependency of the server package. The regexes cover
// the most common React component export patterns. For a more robust solution,
// add @weblab/parser as a server dependency.

const NAMED_FUNCTION_RE = /export\s+function\s+([A-Z][A-Za-z0-9_]*)\s*[(<]/gm;
const NAMED_ARROW_RE = /export\s+const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*(?:\([^)]*\)|[A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*[^=]+)?\s*=>/gm;
const DEFAULT_FUNCTION_RE = /export\s+default\s+function\s+([A-Z][A-Za-z0-9_]*)\s*[(<]/gm;

/**
 * Extract React component declarations from source text using regex patterns.
 * Handles: named export functions, named export arrow functions, default export functions.
 * Returns an empty array if the source appears unparseable (contains `{{{{`-style
 * syntax errors are detected heuristically, but invalid JS that still matches a
 * pattern will still produce results — callers should handle gracefully).
 */
export function extractReactComponents(source: string, filePath: string): DiscoveredComponent[] {
    // Quick sanity check: if the source can't possibly contain valid component declarations
    // (e.g. it's garbage bytes), return early. We do this by checking that the source
    // is a non-empty string — actual unparseable content simply won't match the patterns.
    if (typeof source !== 'string') {
        return [];
    }

    // Heuristic: if the source contains sequences that are never valid in JS/TS
    // export declarations (e.g. `{{{{` which indicates template/non-JS content),
    // treat as unparseable.
    if (/\{\{\{\{/.test(source) && !/export\s+(function|const|default)/.test(source)) {
        return [];
    }

    const results: DiscoveredComponent[] = [];
    const seen = new Set<string>();

    // Named export function components
    for (const match of source.matchAll(NAMED_FUNCTION_RE)) {
        const name = match[1];
        if (name && !seen.has(name)) {
            seen.add(name);
            results.push({ name, filePath, exportType: 'named' });
        }
    }

    // Named export arrow function components
    for (const match of source.matchAll(NAMED_ARROW_RE)) {
        const name = match[1];
        if (name && !seen.has(name)) {
            seen.add(name);
            results.push({ name, filePath, exportType: 'named' });
        }
    }

    // Default export function components
    for (const match of source.matchAll(DEFAULT_FUNCTION_RE)) {
        const name = match[1];
        if (name && !seen.has(name)) {
            seen.add(name);
            results.push({ name, filePath, exportType: 'default' });
        }
    }

    return results;
}

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', '.git', '__tests__', 'test']);

async function scanDirectory(dir: string, projectRoot: string): Promise<DiscoveredComponent[]> {
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
                    const relPath = relative(projectRoot, fullPath);
                    results.push(...extractReactComponents(source, relPath));
                } catch {
                    // skip unreadable files
                }
            }
        }
    }

    await walk(dir);
    return results;
}

export const componentsRouter = router({
    listProjectComponents: publicProcedure
        .input(z.object({ projectRoot: z.string().min(1) }))
        .query(async ({ input }) => {
            const srcDir = join(input.projectRoot, 'src');
            return scanDirectory(srcDir, input.projectRoot);
        }),
});
