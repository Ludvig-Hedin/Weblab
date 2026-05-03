import { readdir, readFile } from 'fs/promises';
import { extname, join, relative } from 'path';
import { z } from 'zod';

import { createTRPCRouter, protectedProcedure } from '../trpc';

// The sandbox project root is always at this path in the runtime environment.
// Client code must pass this constant as the projectRoot to avoid path traversal.
const SANDBOX_ROOT = '/project/sandbox';

interface DiscoveredComponent {
    componentName: string;
    filePath: string;
    exportType: 'default' | 'named';
}

const NAMED_FUNCTION_RE = /export\s+function\s+([A-Z][A-Za-z0-9_]*)\s*[(<]/gm;
const NAMED_ARROW_RE =
    /^\s*export\s+const\s+([A-Z][A-Za-z0-9_]*)(?:\s*:\s*[^=]+?)?\s*=\s*(?:\([^)]*\)|[A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*[^=]+?)?\s*=>/gm;
// Detects observer()/HOC-wrapped exports: export const Foo = observer(...) or withSomething(...)
const HOC_WRAPPED_RE =
    /^\s*export\s+const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*[a-z][A-Za-z0-9_]*\s*\(/gm;
const DEFAULT_FUNCTION_RE = /export\s+default\s+function\s+([A-Z][A-Za-z0-9_]*)\s*[(<]/gm;
const DEFAULT_IDENTIFIER_RE = /^\s*export\s+default\s+([A-Z][A-Za-z0-9_]*)\s*;?\s*$/gm;

function extractComponents(source: string, filePath: string): DiscoveredComponent[] {
    if (typeof source !== 'string') return [];
    if (/\{\{\{\{/.test(source) && !/export\s+(function|const|default)/.test(source)) return [];

    const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const results: DiscoveredComponent[] = [];
    const seen = new Set<string>();

    for (const match of stripped.matchAll(NAMED_FUNCTION_RE)) {
        const name = match[1];
        if (name && !seen.has(name)) {
            seen.add(name);
            results.push({ componentName: name, filePath, exportType: 'named' });
        }
    }

    for (const match of stripped.matchAll(NAMED_ARROW_RE)) {
        const name = match[1];
        if (name && !seen.has(name)) {
            seen.add(name);
            results.push({ componentName: name, filePath, exportType: 'named' });
        }
    }

    for (const match of stripped.matchAll(HOC_WRAPPED_RE)) {
        const name = match[1];
        if (name && !seen.has(name)) {
            seen.add(name);
            results.push({ componentName: name, filePath, exportType: 'named' });
        }
    }

    for (const match of stripped.matchAll(DEFAULT_FUNCTION_RE)) {
        const name = match[1];
        if (name && !seen.has(name)) {
            seen.add(name);
            results.push({ componentName: name, filePath, exportType: 'default' });
        }
    }

    for (const match of stripped.matchAll(DEFAULT_IDENTIFIER_RE)) {
        const name = match[1];
        if (!name) continue;
        const existing = results.find((r) => r.componentName === name);
        if (existing) {
            existing.exportType = 'default';
        } else if (!seen.has(name)) {
            seen.add(name);
            results.push({ componentName: name, filePath, exportType: 'default' });
        }
    }

    return results;
}

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
            // Use the provided root (for testing / future flexibility) or fall back to the
            // well-known sandbox path. Never allow path traversal.
            const root = input.projectRoot ?? SANDBOX_ROOT;
            if (root.includes('..')) return [];
            const srcDir = join(root, 'src');
            return scanDirectory(srcDir, root);
        }),
});
