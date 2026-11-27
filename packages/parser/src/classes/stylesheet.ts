import type { AtRule, ChildNode, Root, Rule } from 'postcss';
import postcss from 'postcss';

import { selectorInventory } from './selector-inventory';

export type ClassState = 'hover' | 'focus-visible' | 'active' | 'current';
export interface ClassTarget {
    selector: string;
    state?: ClassState;
    width?: number;
    direction?: 'min' | 'max';
    currentConvention?: 'webflow' | 'aria';
}
export const WEBFLOW_WIDTHS = [991, 767, 479] as const;
export interface TextPatch {
    start: number;
    end: number;
    text: string;
}
export function applyPatch(source: string, patch: TextPatch | null) {
    return patch ? source.slice(0, patch.start) + patch.text + source.slice(patch.end) : source;
}
function difference(before: string, after: string): TextPatch | null {
    if (before === after) return null;
    let start = 0;
    let end = before.length;
    let nextEnd = after.length;
    while (start < end && start < nextEnd && before[start] === after[start]) start++;
    while (end > start && nextEnd > start && before[end - 1] === after[nextEnd - 1]) {
        end--;
        nextEnd--;
    }
    let text = after.slice(start, nextEnd);
    if (before.includes('\r\n') && !/(?<!\r)\n/.test(before)) {
        text = text.replace(/(?<!\r)\n/g, (lf, index: number) =>
            index === 0 && before[start - 1] === '\r' ? lf : '\r\n',
        );
    }
    return { start, end, text };
}
export function assertClassName(name: string) {
    if (!/^-?[a-zA-Z_][\w-]*$/.test(name) || name === 'w--current')
        throw Error('Unsupported class name');
}
function selectorParts(raw: string) {
    const match =
        /^((?:\.-?[a-zA-Z_][\w-]*)+|body|h[1-6]|a|p)(:hover|:active|:focus-visible|\[aria-current\])?$/.exec(
            raw,
        );
    if (!match) return;
    let selector = match[1]!;
    let state: ClassState | undefined;
    if (selector.endsWith('.w--current') && !match[2]) {
        selector = selector.slice(0, -'.w--current'.length);
        state = 'current';
    } else if (match[2]) {
        state = match[2] === '[aria-current]' ? 'current' : (match[2].slice(1) as ClassState);
    }
    if (selector)
        return {
            selector,
            state,
            currentConvention:
                state === 'current'
                    ? raw.endsWith('.w--current')
                        ? ('webflow' as const)
                        : ('aria' as const)
                    : undefined,
            classes: selector.startsWith('.') ? selector.slice(1).split('.') : [],
        };
}
function media(at: AtRule) {
    if (at.name !== 'media') return;
    const m = /^(?:screen\s+and\s+)?\(\s*(min|max)-width\s*:\s*(\d+(?:\.\d+)?)px\s*\)$/i.exec(
        at.params,
    );
    if (m) return { direction: m[1]!.toLowerCase() as 'min' | 'max', width: Number(m[2]) };
}
function range(node: ChildNode) {
    const bom = Number(node.source!.input.hasBOM);
    return { start: node.source!.start!.offset + bom, end: node.source!.end!.offset + bom };
}
function isComponents(node: ChildNode): node is AtRule {
    return (
        node.type === 'atrule' &&
        node.name === 'layer' &&
        node.params === 'components' &&
        !!node.nodes
    );
}
function rows(root: Root) {
    type Entry = NonNullable<ReturnType<typeof selectorParts>> &
        ClassTarget & {
            scope: Root | AtRule;
            rule: Rule | AtRule;
            start: number;
            end: number;
        };
    const result: Entry[] = [];
    function visit(
        node: ChildNode,
        scope: Root | AtRule,
        selector: string,
        bp?: ReturnType<typeof media>,
    ) {
        let effective = selector;
        if (node.type === 'rule') {
            if (selector && !node.selector.startsWith('&')) return;
            effective = selector ? selector + node.selector.slice(1) : node.selector;
        } else if (node.type === 'atrule' && !bp) {
            bp = media(node);
            if (!bp) return;
        } else return;
        const parts = selectorParts(effective);
        if (parts) result.push({ ...parts, ...bp, scope, rule: node, ...range(node) });
        for (const child of node.nodes ?? []) visit(child, scope, effective, bp);
    }
    for (const scope of [root, ...root.nodes.filter(isComponents)]) {
        for (const node of scope.nodes ?? []) visit(node, scope, '');
    }
    return result.sort((a, b) => a.start - b.start);
}
function declarations(rule: Rule | AtRule) {
    return (rule.nodes ?? []).filter((node) => node.type === 'decl');
}
export function indexStylesheet(source: string) {
    return rows(postcss.parse(source)).map(({ rule, scope, ...row }) => ({
        ...row,
        layer: scope.type === 'root' ? null : 'components',
        declarations: declarations(rule).map((d) => ({
            property: d.prop,
            value: d.value,
            important: !!d.important,
            ...range(d),
        })),
    }));
}
function matches(row: ClassTarget, target: ClassTarget) {
    return (
        row.selector === target.selector &&
        row.state === target.state &&
        (!target.currentConvention ||
            target.state !== 'current' ||
            row.currentConvention === target.currentConvention) &&
        row.width === target.width &&
        (row.width === undefined || row.direction === (target.direction ?? 'max'))
    );
}
// An unlayered normal declaration wins over a component rule. Important declarations reverse layer order.
function orderedDeclarations(matching: ReturnType<typeof rows>) {
    return matching
        .flatMap(({ rule, scope }) =>
            declarations(rule).map((decl) => ({
                decl,
                priority: decl.important
                    ? scope.type === 'root'
                        ? 2
                        : 3
                    : Number(scope.type === 'root'),
            })),
        )
        .sort((a, b) => a.priority - b.priority || range(a.decl).start - range(b.decl).start)
        .map((entry) => entry.decl);
}
export function detachStyles(source: string, target: ClassTarget): Record<string, string> {
    const matching = rows(postcss.parse(source)).filter((r) => matches(r, target));
    return Object.fromEntries(
        orderedDeclarations(matching).map((d) => [
            propertyKey(d.prop),
            d.value + (d.important ? ' !important' : ''),
        ]),
    );
}
function containerFor(root: Root, target: ClassTarget): Root | AtRule {
    const all = rows(root);
    const base = target.selector.split('.')[1];
    const existing =
        all.findLast((r) => r.selector === target.selector) ??
        all.findLast((r) => r.selector === '.' + base);
    let scope = existing?.scope ?? root.nodes.filter(isComponents).at(-1);
    if (!scope) {
        scope = postcss.atRule({ name: 'layer', params: 'components' });
        root.append(scope);
    }
    if (target.width === undefined) return scope;
    const direction = target.direction ?? 'max';
    const at = postcss.atRule({
        name: 'media',
        params: '(' + direction + '-width: ' + target.width + 'px)',
    });
    for (const child of scope.nodes ?? []) {
        if (child.type !== 'atrule') continue;
        const bp = media(child);
        if (bp?.direction !== direction) continue;
        if (bp.width === target.width) return child;
        if (direction === 'max' ? bp.width < target.width : bp.width > target.width) {
            scope.insertBefore(child, at);
            return at;
        }
    }
    scope.append(at);
    return at;
}
function prune(node: Rule | AtRule) {
    const parent = node.parent;
    if (node.nodes?.length || node.toString().includes('/*')) return;
    node.remove();
    if (parent?.type === 'rule' || (parent?.type === 'atrule' && parent.name === 'media'))
        prune(parent);
}
function validateDeclaration(property: string, value: string) {
    if (!/^(?:--[\w-]+|-?[a-zA-Z][\w-]*)$/.test(property) || !value.trim())
        throw Error('Invalid declaration');
    const probe = postcss.parse('x{' + property + ':' + value + '}');
    const rule = probe.first;
    if (
        probe.nodes.length !== 1 ||
        rule?.type !== 'rule' ||
        rule.nodes.length !== 1 ||
        rule.first?.type !== 'decl' ||
        rule.first.prop !== property ||
        rule.raws.semicolon
    )
        throw Error('Expected one declaration');
    return rule.first;
}
function propertyKey(property: string) {
    return property.startsWith('--') ? property : property.toLowerCase();
}

function verifyBreakpoint(css: string, target: ClassTarget, property: string) {
    if (target.width === undefined) return;
    const width = target.width;
    const candidates = [];
    const root = postcss.parse(css);
    const indexed = rows(root);
    const supported = new Set(indexed.map((row) => row.rule));
    // A complex selector or conditional wrapper may outrank the editable rule.
    // Without a rendered element its applicability cannot be determined.
    root.walkDecls((d) => {
        if (propertyKey(d.prop) !== propertyKey(property) || supported.has(d.parent as Rule))
            return;
        let container = d.parent;
        while (container && container.type !== 'root') {
            if (container.type === 'rule') {
                const names = selectorInventory(container.selector + '{}').names;
                if (
                    target.selector.split('.').some((c) => names.has(c)) ||
                    (!target.selector.startsWith('.') &&
                        container.selector.includes(target.selector))
                ) {
                    throw Error(
                        'Cascade conflict: a complex selector may override this breakpoint',
                    );
                }
            }
            container = container.parent;
        }
    });
    for (const row of indexed) {
        if (
            row.width !== undefined &&
            (row.direction === 'max' ? width > row.width : width < row.width)
        )
            continue;
        if (row.state && row.state !== target.state) continue;
        if (
            row.state === 'current' &&
            target.currentConvention &&
            row.currentConvention !== target.currentConvention
        )
            continue;
        if (
            row.selector !== target.selector &&
            !row.classes.some((c) => target.selector.split('.').includes(c))
        )
            continue;
        for (const d of declarations(row.rule)) {
            if (propertyKey(d.prop) !== propertyKey(property)) continue;
            const priority = d.important
                ? row.scope.type === 'root'
                    ? 2
                    : 3
                : Number(row.scope.type === 'root');
            const specificity = row.classes.length + Number(!!row.state);
            candidates.push({
                priority,
                specificity,
                offset: range(d).start,
                target: matches(row, target),
            });
        }
    }
    const winner = candidates
        .sort(
            (a, b) =>
                a.priority - b.priority || a.specificity - b.specificity || a.offset - b.offset,
        )
        .at(-1);
    if (winner && !winner.target)
        throw Error('Cascade conflict: another applicable declaration wins at this breakpoint');
}
export function editDeclaration(
    source: string,
    target: ClassTarget,
    property: string,
    value: string | null,
    priority: 'preserve' | 'normal' | 'important' = 'preserve',
): TextPatch | null {
    const parts = selectorParts(target.selector);
    if (
        (target.state && !['hover', 'focus-visible', 'active', 'current'].includes(target.state)) ||
        (target.direction && !['min', 'max'].includes(target.direction)) ||
        !parts ||
        parts.state ||
        (target.width !== undefined && (!Number.isFinite(target.width) || target.width < 0))
    )
        throw Error('Invalid target');
    const root = postcss.parse(source);
    const matching = rows(root).filter((r) => matches(r, target));
    const existing = orderedDeclarations(matching).filter(
        (d) => propertyKey(d.prop) === propertyKey(property),
    );
    if (value === null) {
        for (const decl of existing) {
            if (decl.toString().includes('/*'))
                throw Error('Declaration contains embedded comments');
            const owner = decl.parent as Rule | AtRule;
            decl.remove();
            prune(owner);
        }
    } else {
        const parsed = validateDeclaration(property, value);
        const decl = existing.at(-1);
        if (decl) {
            const important =
                priority === 'preserve'
                    ? !!(parsed.important || decl.important)
                    : priority === 'important';
            if (decl.value === parsed.value && !!decl.important === important) {
                verifyBreakpoint(source, target, property);
                return null;
            }
            const raw = decl.raws.value?.raw ?? decl.value;
            if (
                raw.includes('/*') ||
                raw.trim() !== decl.value ||
                (decl.important && !important && decl.raws.important?.includes('/*'))
            )
                throw Error('Editing this declaration would remove embedded comments');
            decl.raws.value = {
                value: parsed.value,
                raw: raw.replace(decl.value, () => parsed.value),
            };
            decl.value = parsed.value;
            decl.important = important;
        } else {
            let rule = matching.at(-1)?.rule;
            if (!rule) {
                const suffix =
                    target.state === 'current'
                        ? target.currentConvention === 'webflow'
                            ? '.w--current'
                            : '[aria-current]'
                        : target.state
                          ? ':' + target.state
                          : '';
                rule = postcss.rule({ selector: target.selector + suffix });
                const scope = containerFor(root, target);
                const firstMedia =
                    target.width === undefined &&
                    scope.nodes?.find((n) => n.type === 'atrule' && media(n));
                if (firstMedia) scope.insertBefore(firstMedia, rule);
                else scope.append(rule);
            }
            rule.append(
                postcss.decl({
                    prop: property,
                    value: parsed.value,
                    important:
                        priority === 'preserve' ? parsed.important : priority === 'important',
                }),
            );
        }
    }
    const next = (root.source?.input.hasBOM ? source[0] : '') + root.toString();
    if (value !== null) verifyBreakpoint(next, target, property);
    return difference(source, next);
}
export function createClass(source: string, name: string, styles: Record<string, string>) {
    assertClassName(name);
    if (selectorInventory(source).names.has(name)) throw Error('Class already exists');
    if (!Object.keys(styles).length) {
        const root = postcss.parse(source);
        const selector = '.' + name;
        containerFor(root, { selector }).append(postcss.rule({ selector }));
        return difference(source, (root.source?.input.hasBOM ? source[0] : '') + root.toString());
    }
    let next = source;
    for (const [property, value] of Object.entries(styles)) {
        next = applyPatch(next, editDeclaration(next, { selector: '.' + name }, property, value));
    }
    return difference(source, next);
}
