import type { AtRule, ChildNode, Declaration, Root } from 'postcss';
import properties from 'mdn-data/css/properties.json';
import selectorParser from 'postcss-selector-parser';

import type { ClassTarget } from './stylesheet';

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
        else if (n.type === 'pseudo' && n.value !== ':where') {
            if ([':is', ':has', ':not'].includes(n.value)) {
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

function matchesSubject(nodes: readonly selectorParser.Node[], target: ClassTarget): Match {
    const classes = target.selector.split('.').slice(1);
    if (target.state === 'current' && target.currentConvention === 'webflow')
        classes.push('w--current');
    const lastCombinator = nodes.findLastIndex((n) => n.type === 'combinator');
    const subject = nodes.slice(lastCombinator + 1);
    const terms = subject.map((n): Match => {
        switch (n.type) {
            case 'universal':
            case 'comment':
                return true;
            case 'class':
                if (n.value === 'w--current')
                    return target.state === 'current' && target.currentConvention === 'webflow';
                return classes.includes(n.value) ? true : undefined;
            case 'tag':
                return target.selector.startsWith('.')
                    ? undefined
                    : n.value.toLowerCase() === target.selector;
            case 'attribute':
                return n.attribute === 'aria-current' && !n.operator
                    ? target.state === 'current' && target.currentConvention !== 'webflow'
                    : undefined;
            case 'pseudo':
                if (states.has(n.value)) return n.value === ':' + target.state;
                if ([':is', ':where', ':not'].includes(n.value)) {
                    const result = some(n.nodes.map((s) => matchesSubject(s.nodes, target)));
                    return n.value === ':not' && result !== undefined ? !result : result;
                }
                return undefined;
            default:
                return undefined;
        }
    });
    if (lastCombinator >= 0) terms.push(undefined);
    return all(terms);
}

function selectorMatch(ast: selectorParser.Selector, target: ClassTarget): Match {
    const result = matchesSubject(ast.nodes, target);
    if (result !== undefined || !target.matchesSelector) return result;
    // Only ask the live element about structure. The editing state is hypothetical.
    const structural = ast.clone();
    const start = structural.nodes.findLastIndex((n) => n.type === 'combinator') + 1;
    const subject = structural.nodes.slice(start);
    for (const node of subject) {
        if (
            (node.type === 'pseudo' && states.has(node.value)) ||
            (target.state === 'current' &&
                ((node.type === 'class' && node.value === 'w--current') ||
                    (node.type === 'attribute' &&
                        node.attribute === 'aria-current' &&
                        !node.operator)))
        )
            node.remove();
    }
    if (!structural.nodes.length || structural.last?.type === 'combinator')
        structural.append(selectorParser.universal({ value: '*' }));
    let dynamic = false;
    structural.walkPseudos((n) => {
        if (states.has(n.value)) dynamic = true;
    });
    if (dynamic) return undefined;
    return target.matchesSelector(structural.toString());
}

function activeMedia(at: AtRule, width: number | undefined): Match {
    return some(
        at.params.split(',').map((branch) =>
            all(
                branch
                    .trim()
                    .toLowerCase()
                    .split(/\s+and\s+/)
                    .map((term) => {
                        if (term === 'screen' || term === 'all') return true;
                        if (term === 'print') return false;
                        const m = /^\(\s*(min|max)-width\s*:\s*(\d+(?:\.\d+)?)px\s*\)$/.exec(term);
                        return m && width !== undefined
                            ? m[1] === 'max'
                                ? width <= Number(m[2])
                                : width >= Number(m[2])
                            : undefined;
                    }),
            ),
        ),
    );
}

export type CompetingRule = { selector: string; property: string; value: string; start?: number };
export type DeclarationEffect =
    | { effect: 'applies'; competingRule?: never }
    | { effect: 'loses'; competingRule: CompetingRule }
    | { effect: 'unknown'; competingRule?: CompetingRule; reason: string };
function nestedSelectors(parents: string[], children: string[]) {
    if (!parents.length) return children;
    // CSS nesting takes the maximum specificity of the parent selector list.
    const parent = ':is(' + parents.join(',') + ')';
    return children.map((child) => {
        const ast = selectorParser().astSync(child);
        let replaced = false;
        ast.walkNesting((n) => {
            const part = selectorParser().astSync(parent).first.first;
            n.replaceWith(part);
            replaced = true;
        });
        return replaced ? ast.toString() : parent + ' ' + child;
    });
}

/** Evaluate author declarations in this sheet for the target at its requested width. */
export function declarationEffect(
    root: Root,
    target: ClassTarget,
    written: Declaration,
): DeclarationEffect {
    if (target.state === 'current' && !target.currentConvention) {
        let container = written.parent;
        let webflow = false;
        while (container && container.type !== 'root') {
            if (container.type === 'rule' && container.selector.endsWith('.w--current'))
                webflow = true;
            container = container.parent;
        }
        target = { ...target, currentConvention: webflow ? 'webflow' : 'aria' };
    }
    const width = target.width;
    const property = normalize(written.prop);
    const affected = longhands(property);
    type Winner = { decl: Declaration; rank: number[]; selector: string };
    const possible = new Map<string, Winner>();
    let dependency = target.linkedStylesheets?.[0];
    let orderInSheet = 0;
    const winners = new Map<string, Winner>();
    const writtenMatches = new Set<string>();
    const layers = new Map<string, number>();
    function layerPath(parent: string[], name: string) {
        const path = [...parent];
        for (const part of name.split('.')) {
            path.push(part);
            const key = path.join('.');
            if (!layers.has(key)) layers.set(key, layers.size + 1);
        }
        return path;
    }
    function visit(
        nodes: readonly ChildNode[],
        selectors: string[],
        layer: string[],
        active: Match,
        scoped: boolean,
    ) {
        for (const node of nodes) {
            if (node.type === 'atrule') {
                if (node.name === 'import' && active !== false) dependency = node.params;
                if (
                    node.name === 'media' ||
                    node.name === 'supports' ||
                    node.name === 'container' ||
                    node.name === 'scope'
                ) {
                    const condition =
                        (node.name === 'media' ? activeMedia(node, width) : undefined) ??
                        (width === undefined
                            ? undefined
                            : target.matchesCondition?.(node.name, node.params, width));
                    const branch = all([active, condition]);
                    if (branch !== false)
                        visit(
                            node.nodes ?? [],
                            selectors,
                            layer,
                            branch,
                            scoped || node.name === 'scope',
                        );
                } else if (node.name === 'layer') {
                    if (node.nodes)
                        visit(
                            node.nodes,
                            selectors,
                            layerPath(layer, node.params || '@' + node.source?.start?.offset),
                            active,
                            scoped,
                        );
                    else for (const name of node.params.split(',')) layerPath(layer, name.trim());
                } else if (
                    node.nodes &&
                    !/^(?:(?:-\w+-)?keyframes|font-face|page|counter-style|property)$/i.test(
                        node.name,
                    )
                ) {
                    // An unmodeled conditional group can contain a competing style rule.
                    visit(node.nodes, selectors, layer, undefined, scoped);
                }
                continue;
            }
            if (node.type === 'rule') {
                visit(
                    node.nodes,
                    nestedSelectors(selectors, node.selectors),
                    layer,
                    active,
                    scoped,
                );
                continue;
            }
            if (node.type !== 'decl') continue;
            const prop = normalize(node.prop);
            const writes =
                prop === 'all'
                    ? affected.filter(
                          (p) => !p.startsWith('--') && !['direction', 'unicode-bidi'].includes(p),
                      )
                    : longhands(prop).filter((p) => affected.includes(p));
            if (!writes.length) continue;
            for (const selector of selectors) {
                const ast = selectorParser().astSync(selector).first;
                if (!ast) continue;
                const matches = all([active, selectorMatch(ast, target)]);
                if (matches === false) continue;
                const order = layer.map((_, i) => layers.get(layer.slice(0, i + 1).join('.'))!);
                // Direct declarations follow sublayers. Importance reverses the layer comparison.
                order.push(Number.MAX_SAFE_INTEGER);
                const rank = [
                    Number(!!node.important),
                    ...order.map((n) => (node.important ? -n : n)),
                    ...specificity(ast.nodes),
                    Number(scoped),
                    orderInSheet++,
                ];
                for (const p of writes) {
                    if (matches === true && node === written) writtenMatches.add(p);
                    const candidates = matches === true ? winners : possible;
                    const old = candidates.get(p);
                    if (!old || compare(rank, old.rank) >= 0)
                        candidates.set(p, { decl: node, rank, selector });
                }
            }
        }
    }
    visit(root.nodes, [], [], true, false);
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
            !writtenMatches.has(p) ||
            !known ||
            (maybe && maybe.decl !== known.decl && compare(maybe.rank, known.rank) >= 0)
        ) {
            uncertain = {
                effect: 'unknown',
                reason: 'Selector or condition needs preview evidence',
                competingRule: maybe && describe(maybe),
            };
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
