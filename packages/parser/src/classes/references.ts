import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';

import type { NodePath, T } from '../packages';
import type { TextPatch } from './stylesheet';
import { t, traverse } from '../packages';
import { getAstFromContent } from '../parse';
import { applyPatch, assertClassName, indexStylesheet } from './stylesheet';

type Site = { path: string; start: number; end: number; reason: string };
interface Reference extends Site {
    names: string[];
    safe: boolean;
    usage: boolean;
}
type Files = Readonly<Record<string, string>>;
const helpers = new Set(['cn', 'clsx', 'twMerge']);

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
                    node.value.split(/\s+/),
                    false,
                    true,
                );
            } else {
                for (const token of raw.matchAll(/\S+/g)) {
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
                helpers.has(node.callee.name)
            ) {
                const binding = scope.getBinding(node.callee.name);
                // A locally shadowed function may interpret its arguments as selectors or other data.
                if (!binding || binding.kind === 'module') {
                    for (const arg of node.arguments) classExpression(arg, scope);
                    return;
                }
            }
            const raw = source.slice(node.start!, node.end!);
            record(
                node.start!,
                node.end!,
                'dynamic expression',
                raw.match(/[\w-]+/g) ?? [],
                false,
                !t.isCallExpression(node),
            );
        }
        traverse(ast, {
            JSXAttribute(attr) {
                if (!t.isJSXIdentifier(attr.node.name, { name: 'className' })) return;
                const value = attr.node.value;
                if (!value) return;
                classExpression(
                    t.isJSXExpressionContainer(value) ? value.expression : value,
                    attr.scope,
                );
                attr.skip();
            },
            CallExpression(call) {
                if (!t.isIdentifier(call.node.callee) || !helpers.has(call.node.callee.name))
                    return;
                classExpression(call.node, call.scope);
                call.skip();
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
    const names = new Set(indexStylesheet(css).flatMap((row) => row.classes));
    const counts: Record<string, number> = Object.fromEntries([...names].map((n) => [n, 0]));
    const dynamic: Site[] = [];
    for (const site of references(files)) {
        if (site.usage)
            for (const name of new Set(site.names)) if (names.has(name)) counts[name]!++;
        if (!site.safe && site.reason !== 'string outside className') dynamic.push(site);
    }
    return { counts, unused: [...names].filter((n) => !counts[n]), dynamic };
}

function cssRenamePatches(css: string, from: string, to: string) {
    const patches: TextPatch[] = [];
    postcss.parse(css).walkRules((rule) => {
        const raw = rule.raws.selector?.raw ?? rule.selector;
        selectorParser((selectors) => {
            selectors.walkClasses((node) => {
                if (node.value === to) throw Error('Destination class already exists');
                if (node.value !== from) return;
                const token = node.toString().trim();
                const start =
                    rule.source!.start!.offset +
                    Number(rule.source!.input.hasBOM) +
                    node.sourceIndex;
                if (css.slice(start, start + token.length) !== token)
                    throw Error('Ambiguous CSS selector range');
                patches.push({ start, end: start + token.length, text: '.' + to });
            });
        }).processSync(raw);
    });
    return patches;
}

export function renameClass(css: string, files: Files, from: string, to: string) {
    assertClassName(from);
    assertClassName(to);
    const cssPatches = cssRenamePatches(css, from, to);
    const next = { ...files };
    const unsafe: Site[] = [];
    const patches: Record<string, TextPatch[]> = Object.fromEntries(
        Object.keys(files).map((path) => [path, [] as TextPatch[]]),
    );
    for (const { path, start, end, reason, names, safe } of references(files)) {
        if (!names.includes(from) && reason !== 'unparsed file' && reason !== 'dynamic expression')
            continue;
        if (safe) (patches[path] ??= []).push({ start, end, text: to });
        else unsafe.push({ path, start, end, reason });
    }
    for (const [path, edits] of Object.entries(patches)) {
        for (const patch of edits.toReversed()) next[path] = applyPatch(next[path]!, patch);
    }
    for (const patch of cssPatches.toReversed()) css = applyPatch(css, patch);
    return { css, files: next, unsafe, patches, cssPatches };
}
