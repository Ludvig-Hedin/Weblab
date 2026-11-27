import postcss from 'postcss';
import valueParser from 'postcss-value-parser';

import type { T } from '../packages';
import { t, traverse } from '../packages';
import { getAstFromContent } from '../parse';

type Files = Readonly<Record<string, string>>;
type Resolution = 'class-free' | { path: string };
type MissingImport = { importer: string; specifier: string };
export interface ClassStylesheetSet {
    status: 'complete' | 'incomplete';
    paths: ReadonlySet<string>;
    sources: ReadonlyMap<string, string>;
    unresolved: readonly MissingImport[];
}

function localPath(importer: string, specifier: string, publicLink: boolean) {
    if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(specifier)) return;
    const path = specifier.split(/[?#]/)[0];
    if (!path || (publicLink && !path.startsWith('/'))) return;
    const publicRoot = path.startsWith('/');
    const parts = publicRoot ? ['public'] : importer.split('/').slice(0, -1);
    for (const part of path.split('/')) {
        if (part === '.' || !part) continue;
        if (part !== '..') parts.push(part);
        else if (publicRoot && parts.length === 1) continue;
        else if (!parts.pop()) return;
    }
    return parts.join('/');
}

function attribute(element: T.JSXOpeningElement, name: string) {
    for (const attr of element.attributes) {
        if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name, { name })) continue;
        if (t.isStringLiteral(attr.value)) return attr.value.value;
        if (t.isJSXExpressionContainer(attr.value) && t.isStringLiteral(attr.value.expression))
            return attr.value.expression.value;
        return null;
    }
}

/** Entries are CSS paths or document modules whose stylesheet imports and links form this project's roots. */
export function resolveClassStylesheets(
    files: Files,
    entries: readonly string[],
    resolutions: Readonly<Record<string, Resolution>> = {},
): ClassStylesheetSet {
    return resolveGraph(files, entries, resolutions, true);
}
// In single-sheet mode callers already supply scripts individually for reference analysis.
export function singleSheetInventory(files: Files, path: string) {
    return resolveGraph(
        files,
        [path, ...Object.keys(files).filter((p) => /\.[cm]?[jt]sx?$/.test(p))],
        {},
        false,
    );
}
function resolveGraph(
    files: Files,
    entries: readonly string[],
    resolutions: Readonly<Record<string, Resolution>>,
    followModules: boolean,
): ClassStylesheetSet {
    const paths = new Set<string>();
    const sources = new Map<string, string>();
    const unresolved: MissingImport[] = [];
    function resolve(importer: string, specifier: string, publicLink = false) {
        const proof = Object.hasOwn(resolutions, specifier) ? resolutions[specifier] : undefined;
        if (proof === 'class-free') return;
        const path = proof?.path ?? localPath(importer, specifier, publicLink);
        if (!path || !Object.hasOwn(files, path)) unresolved.push({ importer, specifier });
        else visit(path);
    }
    function visit(path: string) {
        if (sources.has(path)) return;
        const source = files[path];
        if (source === undefined) {
            unresolved.push({ importer: path, specifier: path });
            return;
        }
        sources.set(path, source);
        if (!/\.[cm]?[jt]sx?$/i.test(path)) {
            if (!/\.module\.css$/i.test(path)) paths.add(path);
            postcss.parse(source).walkAtRules(/^import$/i, (at) => {
                const first = valueParser(at.params).nodes.find(
                    (n) => n.type !== 'space' && n.type !== 'comment',
                );
                if (first?.type === 'string') resolve(path, first.value);
                else if (first?.type === 'function' && first.value.toLowerCase() === 'url') {
                    const inner = first.nodes.filter(
                        (n) => n.type !== 'space' && n.type !== 'comment',
                    );
                    if (
                        inner.length === 1 &&
                        (inner[0]?.type === 'string' || inner[0]?.type === 'word')
                    )
                        resolve(path, inner[0].value);
                    else unresolved.push({ importer: path, specifier: at.params });
                } else unresolved.push({ importer: path, specifier: at.params });
            });
            return;
        }
        const ast = getAstFromContent(source);
        if (!ast) throw Error('Unable to parse stylesheet entry ' + path);
        function moduleImport(specifier: string) {
            if (specifier.startsWith('@/') && !Object.hasOwn(resolutions, specifier)) {
                const suffix = specifier.slice(2);
                const matches = [suffix, 'src/' + suffix]
                    .flatMap((base) => [
                        base,
                        ...[
                            '.tsx',
                            '.ts',
                            '.jsx',
                            '.js',
                            '/index.tsx',
                            '/index.ts',
                            '/index.jsx',
                            '/index.js',
                        ].map((ext) => base + ext),
                    ])
                    .filter((candidate) => Object.hasOwn(files, candidate));
                if (matches.length === 1) visit(matches[0]!);
                else unresolved.push({ importer: path, specifier });
                return;
            }
            if (/\.css(?:[?#]|$)/i.test(specifier)) {
                if (!specifier.startsWith('.') && !Object.hasOwn(resolutions, specifier))
                    unresolved.push({ importer: path, specifier });
                else resolve(path, specifier);
                return;
            }
            if (followModules && Object.hasOwn(resolutions, specifier)) {
                resolve(path, specifier);
                return;
            }
            if (
                !followModules ||
                !specifier.startsWith('.') ||
                (/\.[^/.]+$/.test(specifier) && !/\.[cm]?[jt]sx?$/.test(specifier))
            )
                return;
            const base = localPath(path, specifier, false);
            const candidates = base && [
                base,
                ...[
                    '.tsx',
                    '.ts',
                    '.jsx',
                    '.js',
                    '/index.tsx',
                    '/index.ts',
                    '/index.jsx',
                    '/index.js',
                ].map((s) => base + s),
            ];
            const next = candidates && candidates.find((p) => Object.hasOwn(files, p));
            if (next) visit(next);
            else unresolved.push({ importer: path, specifier });
        }
        traverse(ast, {
            CallExpression({ node }) {
                if (!t.isImport(node.callee)) return;
                const arg = node.arguments[0];
                if (t.isStringLiteral(arg)) moduleImport(arg.value);
                else
                    unresolved.push({
                        importer: path,
                        specifier: source.slice(node.start!, node.end!),
                    });
            },
            ImportDeclaration({ node }) {
                if (node.importKind !== 'type') moduleImport(node.source.value);
            },
            ExportNamedDeclaration({ node }) {
                if (node.exportKind !== 'type' && node.source) moduleImport(node.source.value);
            },
            ExportAllDeclaration({ node }) {
                if (node.exportKind !== 'type') moduleImport(node.source.value);
            },
            JSXOpeningElement({ node }) {
                if (!t.isJSXIdentifier(node.name, { name: 'link' })) return;
                const rel = attribute(node, 'rel');
                if (
                    rel === undefined ||
                    (typeof rel === 'string' &&
                        !rel
                            .toLowerCase()
                            .split(/[ \t\n\f\r]+/)
                            .includes('stylesheet'))
                )
                    return;
                const href = attribute(node, 'href');
                if (href) resolve(path, href, true);
                else
                    unresolved.push({
                        importer: path,
                        specifier: source.slice(node.start!, node.end!),
                    });
            },
        });
    }
    for (const entry of entries) visit(entry);
    return { status: unresolved.length ? 'incomplete' : 'complete', paths, sources, unresolved };
}
