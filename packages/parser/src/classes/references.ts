import type { NodePath, T } from '../packages';
import type { TextPatch } from './stylesheet';
import type { ClassStylesheetSet } from './stylesheet-graph';
import { t, traverse } from '../packages';
import { getAstFromContent } from '../parse';
import { selectorInventory } from './selector-inventory';
import { applyPatch, assertClassName } from './stylesheet';
import { singleSheetInventory } from './stylesheet-graph';

type Site = { path: string; start: number; end: number; reason: string };
interface Reference extends Site {
    names: string[];
    safe: boolean;
    usage: boolean;
}
type Files = Readonly<Record<string, string>>;
function isClassHelper(scope: NodePath['scope'], name: string) {
    const binding = scope.getBinding(name)?.path;
    if (!binding?.parentPath?.isImportDeclaration()) return false;
    const module = binding.parentPath.node.source.value;
    const imported = binding.isImportDefaultSpecifier()
        ? 'default'
        : binding.isImportSpecifier() && t.isIdentifier(binding.node.imported)
          ? binding.node.imported.name
          : '';
    return (
        (module === 'clsx' && (imported === 'clsx' || imported === 'default')) ||
        (module === 'tailwind-merge' && imported === 'twMerge') ||
        (module === '@weblab/ui/utils' && imported === 'cn')
    );
}

function possibleClasses(node: T.Node): string[] {
    if (t.isStringLiteral(node)) return node.value.split(/[ \t\n\r\f]+/);
    if (t.isConditionalExpression(node))
        return [...possibleClasses(node.consequent), ...possibleClasses(node.alternate)];
    if (t.isLogicalExpression(node)) return possibleClasses(node.right);
    if (t.isTemplateLiteral(node))
        return node.quasis.flatMap((q, i) => {
            const words = (q.value.cooked ?? q.value.raw).split(/[ \t\n\r\f]+/);
            if (i > 0) words.shift();
            if (!q.tail) words.pop();
            return words;
        });
    return [];
}

function references(files: Files) {
    const sites: Reference[] = [];
    for (const [path, source] of Object.entries(files)) {
        if (!/\.[cm]?[jt]sx?$/.test(path)) continue;
        const ast = getAstFromContent(source);
        if (!ast) {
            sites.push({
                path,
                start: 0,
                end: source.length,
                reason: 'unparsed file',
                names: [],
                safe: false,
                usage: false,
            });
            continue;
        }
        function record(
            start: number,
            end: number,
            reason: string,
            names: string[],
            safe = false,
            usage = false,
        ) {
            sites.push({ path, start, end, reason, names, safe, usage });
        }
        function literal(node: T.StringLiteral) {
            const start = node.start! + 1;
            const raw = source.slice(start, node.end! - 1);
            if (raw !== node.value) {
                record(
                    start,
                    node.end! - 1,
                    'encoded class literal',
                    node.value.split(/[ \t\n\r\f]+/),
                    false,
                    true,
                );
            } else {
                for (const token of raw.matchAll(/[^ \t\n\r\f]+/g)) {
                    record(
                        start + token.index,
                        start + token.index + token[0].length,
                        'literal',
                        [token[0]],
                        true,
                        true,
                    );
                }
            }
        }
        function classExpression(node: T.Node, scope: NodePath['scope']) {
            if (t.isStringLiteral(node)) return literal(node);
            if (
                t.isCallExpression(node) &&
                t.isIdentifier(node.callee) &&
                isClassHelper(scope, node.callee.name)
            ) {
                for (const arg of node.arguments) classExpression(arg, scope);
                return;
            }
            record(
                node.start!,
                node.end!,
                'dynamic expression',
                possibleClasses(node),
                false,
                true,
            );
        }
        traverse(ast, {
            JSXAttribute(attr) {
                if (!t.isJSXIdentifier(attr.node.name, { name: 'className' })) return;
                const value = attr.node.value;
                if (!value) return;
                const owner = attr.parent;
                if (
                    !t.isJSXOpeningElement(owner) ||
                    !t.isJSXIdentifier(owner.name) ||
                    !/^[a-z]/.test(owner.name.name)
                ) {
                    record(
                        value.start!,
                        value.end!,
                        'dynamic expression',
                        possibleClasses(
                            t.isJSXExpressionContainer(value) ? value.expression : value,
                        ),
                        false,
                        true,
                    );
                    attr.skip();
                    return;
                }
                classExpression(
                    t.isJSXExpressionContainer(value) ? value.expression : value,
                    attr.scope,
                );
                attr.skip();
            },
            JSXSpreadAttribute(attr) {
                record(attr.node.start!, attr.node.end!, 'dynamic expression', []);
            },
            'CallExpression|OptionalCallExpression'(call: NodePath) {
                if (!t.isCallExpression(call.node) && !t.isOptionalCallExpression(call.node))
                    return;
                const callee = call.node.callee;
                if (!t.isMemberExpression(callee) && !t.isOptionalMemberExpression(callee)) return;
                const object = callee.object;
                const classList =
                    (t.isMemberExpression(object) || t.isOptionalMemberExpression(object)) &&
                    t.isIdentifier(object.property, { name: 'classList' });
                if (
                    classList ||
                    (t.isIdentifier(callee.property) &&
                        [
                            'querySelector',
                            'querySelectorAll',
                            'matches',
                            'closest',
                            'getElementsByClassName',
                            'setAttribute',
                        ].includes(callee.property.name))
                ) {
                    const names = classList ? call.node.arguments.flatMap(possibleClasses) : [];
                    record(
                        call.node.start!,
                        call.node.end!,
                        'dynamic expression',
                        names,
                        false,
                        classList,
                    );
                    call.skip();
                }
            },
            'StringLiteral|TemplateElement'(p: NodePath) {
                const { start, end } = p.node;
                const raw = t.isStringLiteral(p.node) ? p.node.value : source.slice(start!, end!);
                record(start!, end!, 'string outside className', raw.match(/[\w-]+/g) ?? []);
            },
        });
    }
    return sites;
}

export function classUsage(css: string, files: Files) {
    const names = selectorInventory(css).names;
    for (const [path, text] of Object.entries(files)) {
        if (/\.css$/i.test(path)) for (const name of selectorInventory(text).names) names.add(name);
    }
    names.delete('w--current');
    const counts: Record<string, number> = Object.fromEntries([...names].map((n) => [n, 0]));
    const dynamic: Site[] = [];
    for (const site of references(files)) {
        if (site.usage)
            for (const name of new Set(site.names)) if (names.has(name)) counts[name]!++;
        if (!site.safe && site.reason !== 'string outside className') dynamic.push(site);
    }
    return { counts, unused: [...names].filter((n) => !counts[n]), dynamic };
}

// Audit every literal token in original coordinates, including unsupported syntax and file types.
function residualSites(
    path: string,
    source: string,
    name: string,
    patches: TextPatch[],
    unsafe: Site[],
) {
    const covered = [...patches, ...unsafe.filter((site) => site.path === path)].sort(
        (a, b) => a.start - b.start,
    );
    let index = 0;
    let coveredUntil = -1;
    for (const match of source.matchAll(new RegExp('(?<![\\w-])' + name + '(?![\\w-])', 'g'))) {
        const start = match.index;
        const end = start + name.length;
        while (index < covered.length && covered[index]!.start <= start) {
            coveredUntil = Math.max(coveredUntil, covered[index++]!.end);
        }
        if (coveredUntil < end) unsafe.push({ path, start, end, reason: 'unverified reference' });
    }
}
function cssRenamePatches(css: string, from: string, to: string, path: string, unsafe: Site[]) {
    const { names, tokens, uncertain } = selectorInventory(css);
    if (names.has(to)) throw Error('Destination class already exists');
    for (const token of uncertain) {
        if (token.name.toLowerCase() === to.toLowerCase())
            throw Error('Possible destination class collision');
        if (token.name.toLowerCase() === from.toLowerCase())
            unsafe.push({
                path,
                start: token.start,
                end: token.end,
                reason: 'ambiguous attribute selector',
            });
    }
    return tokens
        .filter((token) => token.name === from)
        .map(({ start, end }) => ({ start, end, text: to }));
}

export function renameClass(
    css: string,
    files: Files,
    from: string,
    to: string,
    cssPath = '<stylesheet>',
    stylesheetSet?: ClassStylesheetSet,
) {
    assertClassName(from);
    assertClassName(to);
    if (files[cssPath] !== undefined && files[cssPath] !== css)
        throw Error('Selected stylesheet has changed');
    const sources = { ...files, [cssPath]: css };
    // Single-sheet callers remain supported. A multi-sheet write requires explicit ownership.
    const graph = stylesheetSet ?? singleSheetInventory(sources, cssPath);
    if (graph.status === 'incomplete') {
        throw Error(
            'Incomplete stylesheet inventory: ' +
                graph.unresolved.map((i) => i.importer + ' imports ' + i.specifier).join(', '),
        );
    }
    if (!graph.paths.has(cssPath) || (!stylesheetSet && graph.paths.size !== 1))
        throw Error('Pass the resolved stylesheet set for this project');
    for (const [path, source] of graph.sources)
        if (sources[path] !== source) throw Error('Stylesheet inventory changed at ' + path);
    if (![...graph.paths].some((path) => selectorInventory(sources[path]!).defined.has(from)))
        throw Error('Class is not defined in the project stylesheets');
    const owned = Object.fromEntries(
        Object.entries(files).filter(([path]) => graph.sources.has(path)),
    );
    const unsafe: Site[] = [];
    const cssPatches = cssRenamePatches(css, from, to, cssPath, unsafe);
    const next = { ...files };
    const patches: Record<string, TextPatch[]> = Object.fromEntries(
        Object.entries(owned)
            .filter(([path]) => !/\.css$/i.test(path) || graph.paths.has(path))
            .map(([path, source]) => [
                path,
                path === cssPath
                    ? cssPatches
                    : graph.paths.has(path)
                      ? cssRenamePatches(source, from, to, path, unsafe)
                      : [],
            ]),
    );
    for (const { path, start, end, reason, names, safe, usage } of references(owned)) {
        if (usage && names.includes(to)) throw Error('Destination class is already used');
        if (!names.includes(from) && reason !== 'unparsed file' && reason !== 'dynamic expression')
            continue;
        if (safe) patches[path]!.push({ start, end, text: to });
        else unsafe.push({ path, start, end, reason });
    }
    for (const [path, edits] of Object.entries(patches)) {
        residualSites(path, next[path]!, from, edits, unsafe);
        for (const patch of edits.toReversed()) next[path] = applyPatch(next[path]!, patch);
    }
    if (!(cssPath in files)) residualSites(cssPath, css, from, cssPatches, unsafe);
    for (const patch of cssPatches.toReversed()) css = applyPatch(css, patch);
    return { css, files: next, unsafe, patches, cssPatches };
}
