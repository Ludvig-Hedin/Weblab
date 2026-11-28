import type { AtRule, ChildNode, Declaration, Root } from 'postcss';
import properties from 'mdn-data/css/properties.json';
import selectorParser from 'postcss-selector-parser';

import type { ClassTarget } from './stylesheet';
import {
    decodeIdent,
    defaultNamespace,
    keyword,
    layerNames,
    mediaMatch,
    modeledValue,
    selectorAst,
} from './css-syntax';

const metadata: Readonly<Record<string, { initial: string | string[] }>> = properties;
const normalize = (p: string) => (p.startsWith('--') ? p : p.toLowerCase());

function longhands(property: string): string[] {
    const initial = Object.hasOwn(metadata, property) ? metadata[property]?.initial : undefined;
    return Array.isArray(initial) ? initial.flatMap(longhands) : [property];
}

function compare(a: number[], b: number[]) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const difference = (a[i] ?? 0) - (b[i] ?? 0);
        if (difference) return difference;
    }
    return 0;
}

function specificity(nodes: readonly selectorParser.Node[]): number[] {
    const score = [0, 0, 0];
    for (const n of nodes) {
        if (n.type === 'id') score[0]!++;
        else if (n.type === 'tag' || (n.type === 'pseudo' && n.value.startsWith('::'))) score[2]!++;
        else if (n.type === 'class' || n.type === 'attribute') score[1]!++;
        else if (n.type === 'pseudo' && keyword(n.value) !== ':where') {
            if ([':is', ':has', ':not'].includes(keyword(n.value))) {
                const max = n.nodes
                    .map((s) => specificity(s.nodes))
                    .sort(compare)
                    .at(-1);
                if (max) max.forEach((part, i) => (score[i]! += part));
            } else score[1]!++;
        }
    }
    return score;
}

type Match = boolean | undefined;
const all = (terms: Match[]): Match =>
    terms.includes(false) ? false : terms.includes(undefined) ? undefined : true;
const some = (terms: Match[]): Match =>
    terms.includes(true) ? true : terms.includes(undefined) ? undefined : false;
const states = new Set([':hover', ':active', ':focus-visible']);

function stateMarker(n: selectorParser.Node) {
    return (
        (n.type === 'class' && n.value === 'w--current') ||
        (n.type === 'attribute' && keyword(n.attribute) === 'aria-current') ||
        (n.type === 'pseudo' && states.has(keyword(n.value)))
    );
}

// Evaluate each subject compound once. Keep structural constraints in the AST
// for the preview, and substitute only state predicates proved by the request.
function selectorMatch(ast: selectorParser.Selector, target: ClassTarget): Match {
    const shape = selectorAst(target.selector).first;
    const classes = new Set(shape.nodes.flatMap((n) => (n.type === 'class' ? [n.value] : [])));
    const tag = shape.first?.type === 'tag' ? keyword(shape.first.value) : undefined;
    function atom(n: selectorParser.Node): Match {
        if ('namespace' in n && n.namespace !== undefined) return undefined;
        switch (n.type) {
            case 'comment':
            case 'universal':
                return true;
            case 'class':
                if (n.value === 'w--current')
                    return target.state === 'current' && target.currentConvention !== 'webflow'
                        ? undefined
                        : target.state === 'current';
                return classes.has(n.value) ? true : undefined;
            case 'tag':
                return tag === undefined ? undefined : keyword(n.value) === tag;
            case 'attribute':
                if (keyword(n.attribute) === 'aria-current' && !n.operator)
                    return target.state === 'current' && target.currentConvention === 'webflow'
                        ? undefined
                        : target.state === 'current';
                return undefined;
            case 'pseudo':
                return states.has(keyword(n.value))
                    ? keyword(n.value) === ':' + target.state
                    : undefined;
            default:
                return undefined;
        }
    }
    function reduce(selector: selectorParser.Selector): Match {
        const start = selector.nodes.findLastIndex((n) => n.type === 'combinator') + 1;
        const terms: Match[] = start ? [undefined] : [];
        for (const node of selector.nodes.slice(start)) {
            if (node.type === 'pseudo' && [':is', ':where', ':not'].includes(keyword(node.value))) {
                const negative = keyword(node.value) === ':not';
                const branches = node.nodes.slice().map((branch) => {
                    const result = reduce(branch);
                    if (result === false) branch.remove();
                    return result;
                });
                const result = some(branches);
                terms.push(result === undefined ? undefined : negative ? !result : result);
                if (result !== undefined) node.remove();
            } else {
                const result = atom(node);
                terms.push(result);
                if (result === true && stateMarker(node)) node.remove();
            }
        }
        if (selector.last?.type === 'combinator')
            selector.append(selectorParser.universal({ value: '*' }));
        return all(terms);
    }
    const structural = ast.clone();
    const known = reduce(structural);
    if (known !== undefined || !target.matchesSelector) return known;
    let unresolved = false;
    structural.walk((n) => {
        if (stateMarker(n) || ('namespace' in n && n.namespace !== undefined)) unresolved = true;
    });
    return unresolved ? undefined : target.matchesSelector(structural.toString());
}

export type CompetingRule = { selector: string; property: string; value: string; start?: number };
export type DeclarationEffect =
    | { effect: 'applies'; competingRule?: never }
    | { effect: 'loses'; competingRule: CompetingRule }
    | { effect: 'unknown'; competingRule?: CompetingRule; reason: string };
function nestedSelectors(parents: selectorParser.Selector[], children: selectorParser.Selector[]) {
    if (!parents.length) return children;
    const parent = selectorParser.pseudo({ value: ':is', nodes: parents.map((p) => p.clone()) });
    return children.map((child) => {
        const expanded = child.clone();
        let explicit = false;
        expanded.walkNesting((node) => {
            node.replaceWith(parent.clone());
            explicit = true;
        });
        if (!explicit) {
            if (expanded.first?.type !== 'combinator')
                expanded.prepend(selectorParser.combinator({ value: ' ' }));
            expanded.prepend(parent.clone());
        }
        return expanded;
    });
}

/** Evaluate author declarations in this sheet for the target at its requested width. */
export function declarationEffect(
    root: Root,
    target: ClassTarget,
    written: Declaration,
): DeclarationEffect {
    if (root.nodes.some((n) => n.type === 'atrule' && defaultNamespace(n)))
        return { effect: 'unknown', reason: 'Default namespace needs element namespace evidence' };
    if (target.documentMode === 'quirks')
        return {
            effect: 'unknown',
            reason: 'Quirks-mode selector matching needs browser evidence',
        };
    if (target.state === 'current' && !target.currentConvention) {
        let container = written.parent;
        let webflow = false;
        while (container && container.type !== 'root') {
            if (
                container.type === 'rule' &&
                selectorAst(container.selector).nodes.some(
                    (s) => s.last?.type === 'class' && s.last.value === 'w--current',
                )
            )
                webflow = true;
            container = container.parent;
        }
        target = { ...target, currentConvention: webflow ? 'webflow' : 'aria' };
    }
    const width = target.width;
    const property = normalize(decodeIdent(written.prop));
    const affected = longhands(property);
    type Winner = {
        decl: Declaration;
        rank: number[];
        selector: string;
        scope?: AtRule;
        ambiguous?: boolean;
    };
    const possible = new Map<string, Winner>();
    let dependency = target.linkedStylesheets?.[0];
    let orderInSheet = 0;
    let unmodeledSelector: string | undefined;
    const winners = new Map<string, Winner>();
    const writtenMatches = new Set<string>();
    const layers = new Map<string, number>();
    function layerPath(parent: string[], name: string[]) {
        const path = [...parent];
        for (const part of name) {
            path.push(part);
            const key = JSON.stringify(path);
            if (!layers.has(key)) layers.set(key, layers.size + 1);
        }
        return path;
    }
    function visit(
        nodes: readonly ChildNode[],
        selectors: selectorParser.Selector[],
        layer: string[],
        active: Match,
        scope?: AtRule,
    ) {
        for (const node of nodes) {
            if (node.type === 'atrule') {
                const kind = keyword(node.name);
                if (kind === 'import' && active !== false) dependency = node.params || '@import';
                if (
                    kind === 'media' ||
                    kind === 'supports' ||
                    kind === 'container' ||
                    kind === 'scope'
                ) {
                    const condition =
                        (kind === 'media' ? mediaMatch(node, width) : undefined) ??
                        (width === undefined
                            ? undefined
                            : target.matchesCondition?.(kind, node.params, width));
                    const branch = all([active, condition]);
                    if (branch !== false)
                        visit(
                            node.nodes ?? [],
                            selectors,
                            layer,
                            branch,
                            kind === 'scope' ? node : scope,
                        );
                } else if (kind === 'layer') {
                    if (node.nodes)
                        visit(
                            node.nodes,
                            selectors,
                            layerPath(
                                layer,
                                node.params
                                    ? layerNames(node.params)[0]!
                                    : ['@' + node.source?.start?.offset],
                            ),
                            active,
                            scope,
                        );
                    else for (const name of layerNames(node.params)) layerPath(layer, name);
                } else if (
                    node.nodes &&
                    ![
                        'keyframes',
                        '-webkit-keyframes',
                        'font-face',
                        'page',
                        'counter-style',
                        'property',
                    ].includes(kind)
                ) {
                    // An unmodeled conditional group can contain a competing style rule.
                    visit(node.nodes, selectors, layer, undefined, scope);
                }
                continue;
            }
            if (node.type === 'rule') {
                visit(
                    node.nodes,
                    nestedSelectors(selectors, selectorAst(node.selector).nodes),
                    layer,
                    active,
                    scope,
                );
                continue;
            }
            if (node.type !== 'decl') continue;
            const prop = normalize(decodeIdent(node.prop));
            const writes =
                prop === 'all'
                    ? affected.filter(
                          (p) => !p.startsWith('--') && !['direction', 'unicode-bidi'].includes(p),
                      )
                    : longhands(prop).filter((p) => affected.includes(p));
            if (!writes.length) continue;
            for (const ast of selectors) {
                const selector = ast.toString();
                const matches = all([active, selectorMatch(ast, target)]);
                if (matches === false) continue;
                // Functional pseudo-classes with additional selector-dependent specificity
                // (such as nth-child(... of S)) need a full model before proving a winner.
                ast.walkPseudos((n) => {
                    if (
                        n.nodes.length &&
                        ![':where', ':is', ':has', ':not'].includes(keyword(n.value))
                    )
                        unmodeledSelector = selector;
                });
                const order = layer.map(
                    (_, i) => layers.get(JSON.stringify(layer.slice(0, i + 1)))!,
                );
                // Direct declarations follow sublayers. Importance reverses the layer comparison.
                order.push(Number.MAX_SAFE_INTEGER);
                const rank = [
                    Number(!!node.important),
                    ...order.map((n) => (node.important ? -n : n)),
                    ...specificity(ast.nodes),
                    Number(!!scope),
                    orderInSheet++,
                ];
                for (const p of writes) {
                    if (matches === true && node === written) writtenMatches.add(p);
                    const candidates = matches === true ? winners : possible;
                    const old = candidates.get(p);
                    if (!old || compare(rank, old.rank) >= 0) {
                        const tied =
                            old &&
                            scope &&
                            old.scope &&
                            compare(rank.slice(0, -1), old.rank.slice(0, -1)) === 0;
                        const ambiguous = !!(
                            tied &&
                            (old.ambiguous === true || old.scope !== scope)
                        );
                        candidates.set(p, { decl: node, rank, selector, scope, ambiguous });
                    }
                }
            }
        }
    }
    try {
        visit(root.nodes, [], [], true);
    } catch (error) {
        // Selector parsers and DOM matchers can reject future CSS syntax.
        return {
            effect: 'unknown',
            reason:
                'Could not evaluate the cascade: ' +
                (error instanceof Error ? error.message : String(error)),
        };
    }
    if (unmodeledSelector)
        return { effect: 'unknown', reason: 'Unmodeled selector: ' + unmodeledSelector };
    function describe(candidate: Winner): CompetingRule {
        return {
            selector: candidate.selector,
            property: candidate.decl.prop,
            value: candidate.decl.value,
            start:
                candidate.decl.source?.start &&
                candidate.decl.source.start.offset + Number(candidate.decl.source.input.hasBOM),
        };
    }
    let uncertain: DeclarationEffect | undefined;
    let overridden: CompetingRule | undefined;
    for (const p of affected) {
        const known = winners.get(p);
        const maybe = possible.get(p);
        if (
            known?.ambiguous ||
            (maybe?.ambiguous &&
                (!known || compare(maybe.rank.slice(0, -1), known.rank.slice(0, -1)) >= 0)) ||
            (maybe?.scope &&
                known?.scope &&
                maybe.scope !== known.scope &&
                compare(maybe.rank.slice(0, -1), known.rank.slice(0, -1)) === 0)
        )
            return {
                effect: 'unknown',
                reason: 'Scope proximity is needed to identify the winning rule',
            };
        if (
            !writtenMatches.has(p) ||
            !known ||
            (maybe && maybe.decl !== known.decl && compare(maybe.rank, known.rank) >= 0)
        ) {
            uncertain = {
                effect: 'unknown',
                reason: 'Selector or condition needs preview evidence',
                competingRule: maybe && describe(maybe),
            };
        } else if (!modeledValue(normalize(decodeIdent(known.decl.prop)), known.decl.value)) {
            uncertain = { effect: 'unknown', reason: 'Winning value needs browser evidence' };
        } else if (known.decl !== written) overridden = describe(known);
    }
    if (uncertain) return uncertain;
    if (dependency)
        return {
            effect: 'unknown',
            reason: 'Uninspected stylesheet: ' + dependency,
            competingRule: overridden,
        };
    if (overridden) return { effect: 'loses', competingRule: overridden };
    return { effect: 'applies' };
}
