import type { ParsedError } from '@weblab/utility';

export interface FileErrorLocation {
    /** The error this came from. */
    error: ParsedError;
    /** File path as the error reported it (often relative). */
    filePath: string;
    /** 1-indexed line number. */
    line: number;
    /** 1-indexed column number, or undefined. */
    column?: number;
    /** Best-effort short message extracted from the error text. */
    message: string;
}

// Match common compiler/runtime error formats:
//   path/to/file.tsx(12,5): error TS2322: ...
//   ./src/foo.tsx:12:5
//   at /Users/.../file.ts:12:5 (Node.js stack trace)
//   at Object.render (/app/src/foo.tsx:12:5) (Node.js stack trace in parens)
//   Type error: ./src/foo.ts:12:5
//   /path/to/file.ts\n  12:5  error  ... (ESLint default reporter)
const LOCATION_PATTERNS: RegExp[] = [
    // file.ts(line,col)
    /([./\w@-][^\s():]+\.(?:tsx?|jsx?|css|html|json|md))\((\d+),(\d+)\)/,
    // Node stack trace: at ... (path:line:col) — parenthesised absolute path
    /\bat\s+(?:\S+\s+)?\(([./\w@-][^\s():]+\.(?:tsx?|jsx?|css|html|json|md)):(\d+):(\d+)\)/,
    // file.ts:line:col
    /([./\w@-][^\s:]+\.(?:tsx?|jsx?|css|html|json|md)):(\d+):(\d+)/,
    // ESLint default: path on its own line, next line starts with "  line:col  error|warning"
    /([./\w@-][^\s:]+\.(?:tsx?|jsx?|css|html|json|md))\n\s+(\d+):(\d+)\s+(?:error|warning)/,
    // file.ts:line
    /([./\w@-][^\s:]+\.(?:tsx?|jsx?|css|html|json|md)):(\d+)\b/,
];

/**
 * Best-effort extraction of file/line/column from an error's text content.
 * Many errors come from the dev server stdout, so the format varies. Returning
 * `null` when nothing parses is fine — the error is still surfaced via the
 * chat panel; we just won't put a gutter marker on a specific line.
 */
export const parseErrorLocation = (error: ParsedError): FileErrorLocation | null => {
    const text = error.content;
    for (const re of LOCATION_PATTERNS) {
        const m = text.match(re);
        if (!m) continue;
        const [, filePath, lineStr, colStr] = m;
        const line = Number(lineStr);
        if (!filePath || !Number.isFinite(line) || line < 1) continue;
        const column = colStr ? Number(colStr) : undefined;
        const message = extractShortMessage(text);
        return {
            error,
            filePath,
            line,
            column: column && Number.isFinite(column) ? column : undefined,
            message,
        };
    }
    return null;
};

const extractShortMessage = (text: string): string => {
    // Take the first line that looks like a real message (not a stack frame).
    const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    const candidate = lines.find((l) => !l.startsWith('at ') && l.length < 240) ?? lines[0] ?? text;
    return candidate.slice(0, 240);
};

/**
 * Normalise a path so two roughly-equivalent paths compare equal.
 * Strips leading `./`, leading slash, and a leading project prefix.
 */
export const normalisePath = (p: string): string =>
    p.replace(/^\.\//, '').replace(/^\/+/, '').toLowerCase();

export const pathMatches = (errorPath: string, openFilePath: string): boolean => {
    const a = normalisePath(errorPath);
    const b = normalisePath(openFilePath);
    if (a === b) return true;
    // Many errors give just `src/foo.ts`; the editor file path may include the
    // project root (e.g. `apps/web/client/src/foo.ts`). Suffix-match.
    return a.endsWith(b) || b.endsWith(a);
};
