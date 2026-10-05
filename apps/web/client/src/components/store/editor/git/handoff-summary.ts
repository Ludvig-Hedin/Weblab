import type { CleanHandoffFile } from './handoff-clean';

/**
 * Plain-language summary of a handoff file for the review dialog. Designers
 * review what changed, not the code, so each file gets a readable name, a
 * short kind of change, and line counts.
 */

export type HandoffChangeKind =
    | 'added'
    | 'removed'
    | 'style'
    | 'content'
    | 'styleAndContent'
    | 'structure';

export interface HandoffFileSummary {
    path: string;
    name: string;
    kind: HandoffChangeKind;
    added: number;
    removed: number;
}

const INDEX_NAMES = new Set(['page', 'layout', 'index', 'template']);
const CLASS_ATTR = /\bclass(?:Name)?\s*=\s*(?:"[^"]*"|'[^']*'|\{`[^`]*`\})/g;

export function summarizeHandoffFile(file: CleanHandoffFile): HandoffFileSummary {
    const { added, removed } = countLineChanges(file.original ?? '', file.updated ?? '');
    return {
        path: file.path,
        name: friendlyName(file.path),
        kind: changeKind(file),
        added,
        removed,
    };
}

function changeKind(file: CleanHandoffFile): HandoffChangeKind {
    if (file.original === null) return 'added';
    if (file.updated === null) return 'removed';
    if (file.reformatted) return 'structure';
    const classesChanged = classValues(file.original) !== classValues(file.updated);
    const restChanged =
        file.original.replace(CLASS_ATTR, '') !== file.updated.replace(CLASS_ATTR, '');
    if (classesChanged && restChanged) return 'styleAndContent';
    return classesChanged ? 'style' : 'content';
}

function classValues(source: string): string {
    return (source.match(CLASS_ATTR) ?? []).join('\0');
}

/** `src/components/sections/coverage-stats.tsx` → "Coverage stats". */
export function friendlyName(path: string): string {
    const parts = path.replace(/^\/+/, '').split('/');
    const file = parts.at(-1) ?? path;
    const base = file.replace(/\.[^.]+$/, '');
    if (!INDEX_NAMES.has(base)) return humanize(base);
    const folder = parts
        .slice(0, -1)
        .reverse()
        .find((part) => !/^[([@]/.test(part) && part !== 'src');
    if (!folder || folder === 'app' || folder === 'pages')
        return base === 'page' || base === 'index' ? 'Home page' : `Root ${base}`;
    return `${humanize(folder)} ${base === 'index' ? 'page' : base}`;
}

function humanize(value: string): string {
    const words = value
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[-_.]+/g, ' ')
        .trim()
        .toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Line counts after trimming the shared head and tail; good enough for a summary. */
export function countLineChanges(
    before: string,
    after: string,
): { added: number; removed: number } {
    const a = before === '' ? [] : before.split('\n');
    const b = after === '' ? [] : after.split('\n');
    let start = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) start++;
    let endA = a.length;
    let endB = b.length;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
        endA--;
        endB--;
    }
    const pool = new Map<string, number>();
    for (const line of a.slice(start, endA)) pool.set(line, (pool.get(line) ?? 0) + 1);
    let kept = 0;
    for (const line of b.slice(start, endB)) {
        const left = pool.get(line) ?? 0;
        if (left > 0) {
            pool.set(line, left - 1);
            kept++;
        }
    }
    return { added: endB - start - kept, removed: endA - start - kept };
}
