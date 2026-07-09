import { describe, expect, test } from 'bun:test';
import { access, readFile } from 'node:fs/promises';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const LOCAL_REQUIRE_RE = /require\(['"](\.\/[^'"]+)['"]\)/g;

function toPosixPath(filePath) {
    return filePath.replace(/\\/g, '/');
}

async function resolveRequiredFile(fromFile, specifier) {
    const base = resolve(ROOT, dirname(fromFile), specifier);
    const candidates = extname(base) ? [base] : [`${base}.js`, resolve(base, 'index.js')];
    for (const candidate of candidates) {
        try {
            await access(candidate);
            return toPosixPath(relative(ROOT, candidate));
        } catch {
            // Try the next CommonJS resolution candidate.
        }
    }
    throw new Error(`Could not resolve ${specifier} from ${fromFile}`);
}

async function collectRuntimeLocalRequires(entrypoints) {
    const seen = new Set();
    const queue = [...entrypoints];

    while (queue.length > 0) {
        const file = queue.shift();
        if (!file || seen.has(file)) continue;
        seen.add(file);

        const source = await readFile(resolve(ROOT, file), 'utf8');
        for (const match of source.matchAll(LOCAL_REQUIRE_RE)) {
            const requiredFile = await resolveRequiredFile(file, match[1]);
            if (!seen.has(requiredFile)) queue.push(requiredFile);
        }
    }

    return seen;
}

function isIncludedByBuilderFiles(file, patterns) {
    return patterns.some((pattern) => {
        if (pattern === file) return true;
        if (!pattern.endsWith('/**')) return false;
        const dir = pattern.slice(0, -3);
        return file === dir || file.startsWith(`${dir}/`);
    });
}

describe('desktop package files', () => {
    test('electron-builder includes every local runtime require', async () => {
        const packageJson = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8'));
        const patterns = packageJson.build?.files ?? [];
        const runtimeFiles = await collectRuntimeLocalRequires([
            packageJson.main,
            'preload.js',
        ]);

        const missing = [...runtimeFiles].filter(
            (file) => !isIncludedByBuilderFiles(file, patterns),
        );

        expect(missing).toEqual([]);
    });
});
