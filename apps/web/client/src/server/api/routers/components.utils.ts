export interface DiscoveredComponent {
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

export function extractComponents(source: string, filePath: string): DiscoveredComponent[] {
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
