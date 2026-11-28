import postcss from 'postcss';
import valueParser from 'postcss-value-parser';

import type { T } from '../packages';
import { t, traverse } from '../packages';
import { getAstFromContent } from '../parse';
import { selectorInventory } from './selector-inventory';

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

/** Effective compilerOptions.paths and baseUrl, relative to the supplied config file. */
export interface ClassPathConfig {
    paths: Readonly<Record<string, readonly string[]>>;
    baseUrl?: string;
    configPath?: string;
}
function aliasTargets(specifier: string, config?: ClassPathConfig): string[] | undefined {
    if (!config) return;
    const patterns = Object.keys(config.paths);
    const key = patterns.includes(specifier)
        ? specifier
        : patterns
              .filter((pattern) => {
                  const [prefix, suffix, ...rest] = pattern.split('*');
                  return (
                      suffix !== undefined &&
                      rest.length === 0 &&
                      specifier.startsWith(prefix!) &&
                      specifier.endsWith(suffix) &&
                      specifier.length >= prefix!.length + suffix.length
                  );
              })
              .sort((a, b) => b.indexOf('*') - a.indexOf('*'))[0];
    if (key === undefined) return;
    const star = key.indexOf('*');
    const capture =
        star < 0 ? '' : specifier.slice(star, specifier.length - (key.length - star - 1));
    const configPath = config.configPath ?? 'tsconfig.json';
    return config.paths[key]!.flatMap((template) => {
        const target = template.replace('*', () => capture);
        if (target.startsWith('/') || config.baseUrl?.startsWith('/')) return [];
        const path = localPath(configPath, (config.baseUrl ?? '.') + '/' + target, false);
        return path ? [path] : [];
    });
}
function moduleCandidates(base: string) {
    return [
        base,
        ...[
            '.ts',
            '.tsx',
            '.mts',
            '.cts',
            '.js',
            '.jsx',
            '.mjs',
            '.cjs',
            '/index.ts',
            '/index.tsx',
            '/index.js',
            '/index.jsx',
        ].map((ext) => base + ext),
    ];
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
    config?: ClassPathConfig,
): ClassStylesheetSet {
    return resolveGraph(files, entries, resolutions, true, config);
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
    config?: ClassPathConfig,
): ClassStylesheetSet {
    const paths = new Set<string>();
    const sources = new Map<string, string>();
    const unresolved: MissingImport[] = [];
    function resolve(importer: string, specifier: string, publicLink = false) {
        const proof = Object.hasOwn(resolutions, specifier) ? resolutions[specifier] : undefined;
        if (proof === 'class-free') return;
        if (!proof && !publicLink && !specifier.startsWith('.') && !specifier.startsWith('/')) {
            const targets = aliasTargets(specifier, config);
            if (targets !== undefined || /^(?:@|~)\//.test(specifier)) {
                for (const base of targets ?? []) {
                    const candidates = moduleCandidates(base).filter((path) =>
                        Object.hasOwn(files, path),
                    );
                    if (candidates.length === 1) {
                        visit(candidates[0]!);
                        return;
                    }
                    if (candidates.length > 1) break;
                }
                unresolved.push({ importer, specifier });
                return;
            }
        }
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
            let root;
            try {
                root = postcss.parse(source);
                selectorInventory(source, root);
            } catch (error) {
                unresolved.push({
                    importer: path,
                    specifier:
                        'Unparsed stylesheet: ' +
                        (error instanceof Error ? error.message : String(error)),
                });
                return;
            }
            root.walkAtRules(/^import$/i, (at) => {
                const first = valueParser(at.params.replace(/^url\(/i, 'url(')).nodes.find(
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
            if (
                Object.hasOwn(resolutions, specifier) ||
                aliasTargets(specifier, config) !== undefined ||
                /^(?:@|~)\//.test(specifier)
            ) {
                resolve(path, specifier);
                return;
            }
            if (/\.css(?:[?#]|$)/i.test(specifier)) {
                if (!specifier.startsWith('.') && !Object.hasOwn(resolutions, specifier))
                    unresolved.push({ importer: path, specifier });
                else resolve(path, specifier);
                return;
            }
            if (followModules && !specifier.startsWith('.')) {
                unresolved.push({ importer: path, specifier });
                return;
            }
            if (
                !followModules ||
                !specifier.startsWith('.') ||
                (/\.[^/.]+$/.test(specifier) && !/\.[cm]?[jt]sx?$/.test(specifier))
            )
                return;
            const base = localPath(path, specifier, false);
            const candidates = base && moduleCandidates(base);
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
    const configPath = config?.configPath ?? 'tsconfig.json';
    if (config && Object.hasOwn(files, configPath)) sources.set(configPath, files[configPath]!);
    return { status: unresolved.length ? 'incomplete' : 'complete', paths, sources, unresolved };
}
