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

function matchesSubject(nodes: readonly selectorParser.Node[], target: ClassTarget): boolean {
    const classes = target.selector.split('.').slice(1);
    if (target.state === 'current' && target.currentConvention === 'webflow')
        classes.push('w--current');
    return nodes.every((n) => {
        switch (n.type) {
            case 'universal':
            case 'comment':
                return true;
            case 'class':
                return classes.includes(n.value);
            case 'tag':
                return n.value.toLowerCase() === target.selector;
            case 'attribute':
                return (
                    n.attribute === 'aria-current' &&
                    !n.operator &&
                    target.state === 'current' &&
                    target.currentConvention !== 'webflow'
                );
            case 'pseudo':
                if (n.value === ':is' || n.value === ':where')
                    return n.nodes.some((s) => matchesSubject(s.nodes, target));
                if (
                    n.value === ':not' &&
                    n.nodes.every((s) => s.nodes.every((child) => child.type === 'class'))
                ) {
                    return !n.nodes.some((s) => matchesSubject(s.nodes, target));
                }
                return n.value === ':' + target.state;
            default:
                return false;
        }
    });
}

function activeMedia(at: AtRule, width: number) {
    return at.params.split(',').some((branch) =>
        branch
            .trim()
            .toLowerCase()
            .split(/\s+and\s+/)
            .every((term) => {
                if (term === 'screen' || term === 'all') return true;
                const match = /^\(\s*(min|max)-width\s*:\s*(\d+(?:\.\d+)?)px\s*\)$/.exec(term);
                return (
                    !!match &&
                    (match[1] === 'max' ? width <= Number(match[2]) : width >= Number(match[2]))
                );
            }),
    );
}

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
export function verifyBreakpoint(root: Root, target: ClassTarget, written: Declaration) {
    if (target.width === undefined) return;
    const width = target.width;
    const property = normalize(written.prop);
    const affected = longhands(property);
    type Winner = { decl: Declaration; rank: number[] };
    const winners = new Map<string, Winner>();
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
    function visit(nodes: readonly ChildNode[], selectors: string[], layer: string[]) {
        for (const node of nodes) {
            if (node.type === 'atrule') {
                if (
                    node.name === 'media' ||
                    node.name === 'supports' ||
                    node.name === 'container'
                ) {
                    const active =
                        target.matchesCondition?.(node.name, node.params, width) ??
                        (node.name === 'media' && activeMedia(node, width));
                    if (active) visit(node.nodes ?? [], selectors, layer);
                }
                if (node.name === 'layer') {
                    if (node.nodes)
                        visit(
                            node.nodes,
                            selectors,
                            layerPath(layer, node.params || '@' + node.source?.start?.offset),
                        );
                    else for (const name of node.params.split(',')) layerPath(layer, name.trim());
                }
                continue;
            }
            if (node.type === 'rule') {
                visit(node.nodes, nestedSelectors(selectors, node.selectors), layer);
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
                const matches = target.matchesSelector
                    ? target.matchesSelector(selector)
                    : matchesSubject(ast.nodes, target);
                if (!matches) continue;
                const order = layer.map((_, i) => layers.get(layer.slice(0, i + 1).join('.'))!);
                // Direct declarations follow sublayers. Importance reverses the layer comparison.
                order.push(Number.MAX_SAFE_INTEGER);
                const rank = [
                    Number(!!node.important),
                    ...order.map((n) => (node.important ? -n : n)),
                    ...specificity(ast.nodes),
                ];
                for (const p of writes) {
                    const old = winners.get(p);
                    if (!old || compare(rank, old.rank) >= 0) winners.set(p, { decl: node, rank });
                }
            }
        }
    }
    visit(root.nodes, [], []);
    for (const { decl } of winners.values())
        if (decl !== written)
            throw Error(
                'Cascade conflict: ' +
                    decl.prop +
                    ' overrides ' +
                    written.prop +
                    ' at ' +
                    width +
                    'px',
            );
}
