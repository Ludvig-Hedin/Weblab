import type { AtRule, Root } from 'postcss';
import ts from 'typescript';

import type { T } from '../packages';
import { t, traverse } from '../packages';
import { getAstFromContent } from '../parse';
import { importPath, keyword, parseSheet } from './css-syntax';
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

// Browsers only process imports in the stylesheet prelude.
function browserImports(root: Root) {
    const imports: AtRule[] = [];
    for (const node of root.nodes) {
        if (node.type === 'comment') continue;
        if (node.type !== 'atrule' || node.nodes) break;
        const name = keyword(node.name);
        if (name === 'import') imports.push(node);
        else if (name !== 'charset' && name !== 'layer') break;
    }
    return imports;
}

/** Effective compilerOptions.paths and baseUrl, relative to the supplied config file. */
export interface ClassPathConfig {
    paths: Readonly<Record<string, readonly string[]>>;
    baseUrl?: string;
    configPath?: string;
}
// Use the compiler's bundler resolver against the project snapshot. Virtual CSS
// declarations let paths, package entry points and extension substitution use
// the same lookup for both script and asset imports.
function projectResolver(
    files: Files,
    config: ClassPathConfig | undefined,
    sources: Map<string, string>,
) {
    const configPath = config?.configPath ?? 'tsconfig.json';
    const base = localPath(configPath, config?.baseUrl ?? '.', false);
    const options: ts.CompilerOptions & { pathsBasePath: string } = {
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        allowJs: true,
        allowArbitraryExtensions: true,
        ...(config?.baseUrl !== undefined ? { baseUrl: '/' + base } : {}),
        paths:
            config && Object.fromEntries(Object.entries(config.paths).map(([k, v]) => [k, [...v]])),
        pathsBasePath: '/' + configPath.split('/').slice(0, -1).join('/'),
    };
    const virtual = new Map<string, string>();
    for (const path of Object.keys(files)) {
        if (path.endsWith('.css')) virtual.set('/' + path.slice(0, -4) + '.d.css.ts', path);
    }
    const host: ts.ModuleResolutionHost = {
        fileExists: (p) => Object.hasOwn(files, p.slice(1)) || virtual.has(p),
        readFile(p) {
            const path = p.slice(1);
            const text = files[path];
            if (text !== undefined && p.endsWith('/package.json')) sources.set(path, text);
            return text;
        },
    };
    return (importer: string, specifier: string) => {
        const result = ts.resolveModuleName(
            specifier,
            '/' + importer,
            options,
            host,
        ).resolvedModule;
        if (!result) return;
        const path = result.resolvedFileName.slice(1);
        const asset = virtual.get(result.resolvedFileName);
        if (asset && !Object.hasOwn(files, path)) return asset;
        if (/\.d\.(?:[cm]?ts|css\.ts)$/.test(path)) return;
        return path;
    };
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
    const modulePath = projectResolver(files, config, sources);
    // A single source can be compiled as a module and served at a URL. Its
    // outgoing edges depend on that context, even when its bytes are identical.
    const visited = new Set<string>();
    const localOrigin = 'https://project.invalid';
    function resolveURL(importer: string, specifier: string, base?: URL) {
        let url: URL;
        try {
            // Relative document links require a document URL supplied by the caller.
            if (!base && !specifier.startsWith('/') && !URL.canParse(specifier)) throw Error();
            url = new URL(specifier, base ?? localOrigin);
            const path =
                url.origin === localOrigin
                    ? 'public' + decodeURIComponent(url.pathname)
                    : undefined;
            if (path && Object.hasOwn(files, path)) {
                visit(path, url);
                return;
            }
            // Only an absolute URL can supply globally valid browser resolution
            // evidence. An unqualified module alias cannot prove a browser edge.
            const key = url.origin === localOrigin ? url.pathname + url.search : url.href;
            const proof = Object.hasOwn(resolutions, key) ? resolutions[key] : undefined;
            if (proof === 'class-free') return;
            if (proof && Object.hasOwn(files, proof.path)) {
                visit(proof.path, url);
                return;
            }
        } catch {
            /* Missing or invalid URL evidence is reported at the import site. */
        }
        unresolved.push({ importer, specifier });
    }
    function resolve(importer: string, specifier: string, mode: 'module' | 'css', direct = false) {
        const proof = Object.hasOwn(resolutions, specifier) ? resolutions[specifier] : undefined;
        if (proof === 'class-free') return;
        let path = proof?.path;
        if (!proof) {
            if (specifier.startsWith('/')) {
                resolveURL(importer, specifier);
                return;
            }
            const module = modulePath(importer, specifier);
            const relative = mode === 'css' ? localPath(importer, specifier, false) : undefined;
            if (direct && module && module !== relative) {
                unresolved.push({ importer, specifier });
                return;
            }
            path =
                module ??
                (relative && !specifier.startsWith('@') && !specifier.startsWith('~')
                    ? relative
                    : undefined);
        }
        if (path && Object.hasOwn(files, path) && (mode === 'module' || /\.css$/i.test(path)))
            visit(path, undefined, direct);
        else unresolved.push({ importer, specifier });
    }
    function visit(path: string, url?: URL, direct = false) {
        const key = JSON.stringify([path, url?.href, direct]);
        if (visited.has(key)) return;
        visited.add(key);
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
                root = parseSheet(source);
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
            function followImport(at: AtRule) {
                if (keyword(at.name) !== 'import') return;
                const specifier = importPath(at);
                if (specifier && url) resolveURL(path, specifier, url);
                else if (specifier) resolve(path, specifier, 'css', direct);
                else unresolved.push({ importer: path, specifier: at.params });
            }
            if (url) browserImports(root).forEach(followImport);
            else root.walkAtRules(followImport);
            return;
        }
        const ast = getAstFromContent(source);
        if (!ast) throw Error('Unable to parse stylesheet entry ' + path);
        function moduleImport(specifier: string) {
            if (
                followModules ||
                /\.css(?:[?#]|$)/i.test(specifier) ||
                Object.hasOwn(resolutions, specifier)
            )
                resolve(path, specifier, 'module');
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
                if (href) resolveURL(path, href);
                else
                    unresolved.push({
                        importer: path,
                        specifier: source.slice(node.start!, node.end!),
                    });
            },
        });
    }
    for (const entry of entries) {
        const url = entry.startsWith('public/')
            ? new URL(entry.slice('public'.length), localOrigin)
            : undefined;
        visit(entry, url, true);
    }
    const configPath = config?.configPath ?? 'tsconfig.json';
    if (config && Object.hasOwn(files, configPath)) sources.set(configPath, files[configPath]!);
    return { status: unresolved.length ? 'incomplete' : 'complete', paths, sources, unresolved };
}
