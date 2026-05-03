import { readdir, readFile } from 'fs/promises';
import { extname, isAbsolute, join, relative, resolve } from 'path';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { publicProcedure, router } from '../trpc';

// Restrict scans to a single configurable sandbox base directory. Any projectRoot
// passed by the caller must resolve to a path inside this base. Defaults to a
// path that does not exist on most hosts, effectively disabling the endpoint
// unless the operator opts in by setting SANDBOX_BASE_DIR.
const SANDBOX_BASE_DIR = resolve(process.env.SANDBOX_BASE_DIR ?? '/project/sandbox');

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
// Matches both plain and typed arrow components:
//   export const Foo = () => ...
//   export const Foo: React.FC<Props> = ({ children }) => ...
//   export const Foo: FC = (props) => ...
// Matches both plain and typed arrow components (optional leading whitespace for indented files):
//   export const Foo = () => ...
//   export const Foo: React.FC<Props> = ({ children }) => ...
//   export const Foo: FC = (props) => ...
const NAMED_ARROW_RE = /^\s*export\s+const\s+([A-Z][A-Za-z0-9_]*)(?:\s*:\s*[^=]+?)?\s*=\s*(?:\([^)]*\)|[A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*[^=]+?)?\s*=>/gm;
const DEFAULT_FUNCTION_RE = /export\s+default\s+function\s+([A-Z][A-Za-z0-9_]*)\s*[(<]/gm;
// Matches: export default ComponentName (re-exported identifier, declared elsewhere)
const DEFAULT_IDENTIFIER_RE = /^\s*export\s+default\s+([A-Z][A-Za-z0-9_]*)\s*;?\s*$/gm;

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

    // Strip block and single-line comments before applying regexes to avoid matching
    // commented-out exports (e.g. `// export const Foo = ...` or `/* ... */`).
    const stripped = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');

    const results: DiscoveredComponent[] = [];
    const seen = new Set<string>();

    // Named export function components
    for (const match of stripped.matchAll(NAMED_FUNCTION_RE)) {
        const name = match[1];
        if (name && !seen.has(name)) {
            seen.add(name);
            results.push({ name, filePath, exportType: 'named' });
        }
    }

    // Named export arrow function components (including typed: const X: FC<T> = ...)
    for (const match of stripped.matchAll(NAMED_ARROW_RE)) {
        const name = match[1];
        if (name && !seen.has(name)) {
            seen.add(name);
            results.push({ name, filePath, exportType: 'named' });
        }
    }

    // Default export function components
    for (const match of stripped.matchAll(DEFAULT_FUNCTION_RE)) {
        const name = match[1];
        if (name && !seen.has(name)) {
            seen.add(name);
            results.push({ name, filePath, exportType: 'default' });
        }
    }

    // `export default ComponentName` — identifier re-export of a separately declared component.
    // If the name was already found as a named export, upgrade it to default; otherwise add it.
    for (const match of stripped.matchAll(DEFAULT_IDENTIFIER_RE)) {
        const name = match[1];
        if (!name) continue;
        const existing = results.find((r) => r.name === name);
        if (existing) {
            existing.exportType = 'default';
        } else if (!seen.has(name)) {
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
        .input(
            z.object({
                projectRoot: z
                    .string()
                    .min(1)
                    .refine((p) => !p.includes('..'), 'Invalid project root path'),
            }),
        )
        .query(async ({ input }) => {
            // Resolve the requested root and ensure it is contained inside SANDBOX_BASE_DIR.
            // Reject absolute paths outside the base and any traversal that escapes it.
            const candidate = isAbsolute(input.projectRoot)
                ? resolve(input.projectRoot)
                : resolve(SANDBOX_BASE_DIR, input.projectRoot);
            const rel = relative(SANDBOX_BASE_DIR, candidate);
            if (
                rel.startsWith('..') ||
                isAbsolute(rel) ||
                resolve(SANDBOX_BASE_DIR, rel) !== candidate
            ) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid project root path' });
            }
            const srcDir = join(candidate, 'src');
            return scanDirectory(srcDir, candidate);
        }),
});
