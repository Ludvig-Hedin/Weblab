import type { NodePath, T } from '@weblab/parser';
import {
    EditorAttributes,
    WEBLAB_DEV_IX_RUNTIME_PATH,
    WEBLAB_DEV_PRELOAD_SCRIPT_PATH,
} from '@weblab/constants';
import { generate, getAstFromContent, removeIdsFromAst, t, traverse } from '@weblab/parser';

/**
 * Turns a private working copy's changes into a clean Git handoff.
 *
 * Local preparation instruments every JSX element with `data-oid`, injects
 * editor bootstrap scripts into the root layout, and reprints files through
 * Babel. None of that belongs in the user's repository. For each file we
 * strip the instrumentation, then replay only the designer's attribute and
 * text changes onto the ORIGINAL source text, so untouched code keeps its
 * exact formatting. When a change cannot be replayed surgically (structure
 * edits, code-mode edits outside JSX), the file falls back to the cleaned,
 * reformatted source and is flagged for review.
 */

export interface HandoffFileChange {
    path: string;
    original: string | null;
    updated: string | null;
}

export interface CleanHandoffFile extends HandoffFileChange {
    /** True when the file could not be patched surgically and is reprinted. */
    reformatted: boolean;
}

const WEBLAB_SCRIPT_IDS = new Set(['weblab-preload-script', 'weblab-ix-runtime']);
/** Editor runtime assets written during preparation. Never handed off. */
export const WEBLAB_HANDOFF_ASSET_PATHS = new Set([
    WEBLAB_DEV_PRELOAD_SCRIPT_PATH,
    WEBLAB_DEV_IX_RUNTIME_PATH,
    '__weblab-preload.js',
    '__weblab-ix-runtime.js',
]);
const JSX_SOURCE = /\.(?:[jt]sx|[mc]?[jt]s)$/;
const HTML_SOURCE = /\.html?$/;

interface TextEdit {
    start: number;
    end: number;
    text: string;
}

export function cleanHandoffFiles(files: HandoffFileChange[]): CleanHandoffFile[] {
    const out: CleanHandoffFile[] = [];
    for (const file of files) {
        if (WEBLAB_HANDOFF_ASSET_PATHS.has(file.path.replace(/^\/+/, ''))) continue;
        const cleaned = cleanHandoffFile(file);
        if (cleaned.updated === cleaned.original) continue;
        out.push(cleaned);
    }
    return out;
}

export function cleanHandoffFile(file: HandoffFileChange): CleanHandoffFile {
    if (file.updated === null) return { ...file, reformatted: false };
    if (HTML_SOURCE.test(file.path)) {
        return { ...file, updated: stripHtmlInstrumentation(file.updated), reformatted: false };
    }
    if (!JSX_SOURCE.test(file.path) || !file.updated.includes(EditorAttributes.DATA_WEBLAB_ID)) {
        return { ...file, reformatted: false };
    }
    const originalAst = file.original === null ? null : getAstFromContent(file.original);
    const cleanAst = getAstFromContent(file.updated);
    if (!cleanAst) return { ...file, reformatted: false };
    stripInstrumentation(cleanAst, originalAst ? importsNextScript(originalAst) : false);
    const cleanCode = generate(cleanAst, { retainLines: true }, file.updated).code;

    if (file.original !== null && originalAst) {
        const surgical = replayOntoOriginal(file.original, originalAst, cleanAst);
        if (surgical !== null) return { ...file, updated: surgical, reformatted: false };
    }
    return { ...file, updated: cleanCode, reformatted: file.original !== null };
}

/** Removes `data-oid`, Weblab move keys, bootstrap scripts, and their import. */
function stripInstrumentation(ast: T.File, originalImportsScript: boolean): void {
    removeIdsFromAst(ast);
    traverse(ast, {
        JSXElement(path: NodePath<T.JSXElement>) {
            const scriptId = weblabScriptId(path.node);
            if (scriptId) path.remove();
        },
    });
    if (originalImportsScript || usesJsxName(ast, 'Script')) return;
    traverse(ast, {
        ImportDeclaration(path: NodePath<T.ImportDeclaration>) {
            if (path.node.source.value !== 'next/script') return;
            const onlyScript = path.node.specifiers.every(
                (spec) => t.isImportDefaultSpecifier(spec) && spec.local.name === 'Script',
            );
            if (onlyScript) path.remove();
        },
    });
}

function weblabScriptId(element: T.JSXElement): string | null {
    const opening = element.openingElement;
    if (!t.isJSXIdentifier(opening.name, { name: 'Script' })) return null;
    for (const attr of opening.attributes) {
        if (
            t.isJSXAttribute(attr) &&
            t.isJSXIdentifier(attr.name, { name: 'id' }) &&
            t.isStringLiteral(attr.value) &&
            WEBLAB_SCRIPT_IDS.has(attr.value.value)
        ) {
            return attr.value.value;
        }
    }
    return null;
}

function importsNextScript(ast: T.File): boolean {
    return ast.program.body.some(
        (node) => t.isImportDeclaration(node) && node.source.value === 'next/script',
    );
}

function usesJsxName(ast: T.File, name: string): boolean {
    let found = false;
    traverse(ast, {
        JSXOpeningElement(path: NodePath<T.JSXOpeningElement>) {
            if (t.isJSXIdentifier(path.node.name, { name })) {
                found = true;
                path.stop();
            }
        },
    });
    return found;
}

function stripHtmlInstrumentation(content: string): string {
    return content
        .replace(/\s+data-oid="[^"]*"/g, '')
        .replace(/[ \t]*<script\b[^>]*data-weblab-(?:preload|ix-runtime)="1"[^>]*>\s*<\/script>[ \t]*\r?\n?/g, '');
}

// ── Surgical replay ─────────────────────────────────────────────────────────

function collectElements(ast: T.File): T.JSXElement[] {
    const out: T.JSXElement[] = [];
    traverse(ast, {
        JSXElement(path: NodePath<T.JSXElement>) {
            out.push(path.node);
        },
    });
    return out;
}

function code(node: T.Node): string {
    return generate(node, { compact: true, comments: false }).code;
}

/** JSX collapses whitespace across lines; compare text the way it renders. */
function jsxTextValue(value: string): string {
    const lines = value.split(/\r\n|\n|\r/);
    return lines
        .map((line, index) => {
            let next = line;
            if (index > 0) next = next.replace(/^[ \t]+/, '');
            if (index < lines.length - 1) next = next.replace(/[ \t]+$/, '');
            return next;
        })
        .filter((line) => line.length > 0)
        .join(' ')
        .trim();
}

function attributeKey(attr: T.JSXAttribute | T.JSXSpreadAttribute): string {
    return t.isJSXSpreadAttribute(attr) ? `...${code(attr.argument)}` : code(attr.name);
}

function attributeValueKey(attr: T.JSXAttribute): string {
    if (attr.value === null || attr.value === undefined) return 'true';
    if (t.isStringLiteral(attr.value)) return `str:${attr.value.value}`;
    return `code:${code(attr.value)}`;
}

function replayOntoOriginal(original: string, originalAst: T.File, cleanAst: T.File): string | null {
    const before = collectElements(originalAst);
    const after = collectElements(cleanAst);
    if (before.length !== after.length) return null;

    const edits: TextEdit[] = [];
    for (let i = 0; i < before.length; i++) {
        const o = before[i]!;
        const c = after[i]!;
        if (code(o.openingElement.name) !== code(c.openingElement.name)) return null;
        if (!attributeEdits(o.openingElement, c.openingElement, edits)) return null;
        if (!childEdits(original, o, c, edits)) return null;
    }
    if (edits.length === 0) return original;

    edits.sort((a, b) => b.start - a.start);
    let result = original;
    let floor = Number.POSITIVE_INFINITY;
    for (const edit of edits) {
        if (edit.end > floor) return null; // overlapping edits
        result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
        floor = edit.start;
    }

    // Accept only when the replay is semantically identical to the designer's
    // cleaned source. Anything else (logic edits, imports) reprints the file.
    const replayed = getAstFromContent(result);
    if (!replayed || canonical(replayed) !== canonical(cleanAst)) return null;
    return result;
}

function attributeEdits(o: T.JSXOpeningElement, c: T.JSXOpeningElement, edits: TextEdit[]): boolean {
    const spreadsBefore = o.attributes.filter((a) => t.isJSXSpreadAttribute(a)).map(attributeKey);
    const spreadsAfter = c.attributes.filter((a) => t.isJSXSpreadAttribute(a)).map(attributeKey);
    if (spreadsBefore.join('\0') !== spreadsAfter.join('\0')) return false;

    const namedBefore = new Map<string, T.JSXAttribute>();
    for (const attr of o.attributes) if (t.isJSXAttribute(attr)) namedBefore.set(attributeKey(attr), attr);
    const namedAfter = new Map<string, T.JSXAttribute>();
    for (const attr of c.attributes) if (t.isJSXAttribute(attr)) namedAfter.set(attributeKey(attr), attr);

    for (const [name, attr] of namedBefore) {
        const next = namedAfter.get(name);
        if (attr.start == null || attr.end == null) return false;
        if (!next) {
            const index = o.attributes.indexOf(attr);
            const previousEnd = index > 0 ? o.attributes[index - 1]!.end : o.name.end;
            if (previousEnd == null) return false;
            edits.push({ start: previousEnd, end: attr.end, text: '' });
        } else if (attributeValueKey(attr) !== attributeValueKey(next)) {
            edits.push({ start: attr.start, end: attr.end, text: generate(next).code });
        }
    }
    const insertAt = o.attributes.length > 0 ? o.attributes[o.attributes.length - 1]!.end : o.name.end;
    if (insertAt == null) return false;
    for (const [name, attr] of namedAfter) {
        if (namedBefore.has(name)) continue;
        edits.push({ start: insertAt, end: insertAt, text: ` ${generate(attr).code}` });
    }
    return true;
}

function isElementLike(node: T.Node): boolean {
    return t.isJSXElement(node) || t.isJSXFragment(node);
}

function childEdits(original: string, o: T.JSXElement, c: T.JSXElement, edits: TextEdit[]): boolean {
    const before = o.children.filter((child) => !isBlankText(child));
    const after = c.children.filter((child) => !isBlankText(child));
    const sameShape =
        before.length === after.length &&
        before.every((child, i) => child.type === after[i]!.type);

    if (sameShape) {
        for (let i = 0; i < before.length; i++) {
            const b = before[i]!;
            const a = after[i]!;
            if (isElementLike(b)) continue; // aligned separately
            if (childKey(b) === childKey(a)) continue;
            if (b.start == null || b.end == null) return false;
            edits.push({ start: b.start, end: b.end, text: childSource(a, b, original) });
        }
        return true;
    }

    // Shape changed. Only a leaf (text/expressions, no nested elements) can
    // be replaced wholesale without touching aligned descendants.
    if (before.some(isElementLike) || after.some(isElementLike)) return false;
    if (o.selfClosing !== c.selfClosing || o.closingElement == null) return false;
    const start = o.openingElement.end;
    const end = o.closingElement.start;
    if (start == null || end == null) return false;
    const text = after.map((child) => childSource(child, null, original)).join('');
    edits.push({ start, end, text });
    return true;
}

function isBlankText(node: T.Node): boolean {
    return t.isJSXText(node) && jsxTextValue(node.value) === '';
}

function childKey(node: T.Node): string {
    if (t.isJSXText(node)) return `text:${jsxTextValue(node.value)}`;
    return `code:${code(node)}`;
}

/**
 * Source for a changed child. Text keeps the original's surrounding
 * whitespace so indentation around the edited copy is unchanged.
 */
function childSource(next: T.Node, previous: T.Node | null, original: string): string {
    if (!t.isJSXText(next)) return generate(next).code;
    const value = jsxTextValue(next.value);
    if (previous && t.isJSXText(previous) && previous.start != null && previous.end != null) {
        const raw = original.slice(previous.start, previous.end);
        const leading = /^\s*/.exec(raw)?.[0] ?? '';
        const trailing = /\s*$/.exec(raw)?.[0] ?? '';
        return `${leading}${value}${trailing}`;
    }
    return value;
}

/** Formatting-free code used to prove a replay matches the designer's version. */
function canonical(ast: T.File): string {
    const copy = t.cloneNode(ast, true);
    traverse(copy, {
        JSXText(path: NodePath<T.JSXText>) {
            const value = jsxTextValue(path.node.value);
            if (value === '') path.remove();
            else path.node.value = value;
        },
    });
    return code(copy);
}
