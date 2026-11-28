import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';

export function selectorInventory(css: string, root = postcss.parse(css)) {
    const tokens: { name: string; start: number; end: number }[] = [];
    const uncertain: { name: string; start: number; end: number }[] = [];
    const names = new Set<string>();
    const defined = new Set<string>();
    function collectSubject(selector: selectorParser.Selector) {
        const last = selector.nodes.findLastIndex((n) => n.type === 'combinator');
        for (const node of selector.nodes.slice(last + 1)) {
            if (node.type === 'class') defined.add(node.value);
            if (
                node.type === 'attribute' &&
                node.attribute.toLowerCase() === 'class' &&
                ['=', '~='].includes(node.operator ?? '')
            ) {
                for (const name of (node.value ?? '').split(/[ \t\n\r\f]+/))
                    if (name) defined.add(name);
            }
            if (node.type === 'pseudo' && [':is', ':where'].includes(node.value))
                node.nodes.forEach(collectSubject);
        }
    }
    function scan(raw: string, offset: number, styleRule = false) {
        selectorParser((selectors) => {
            if (styleRule) selectors.nodes.forEach(collectSubject);
            selectors.walkClasses((node) => {
                names.add(node.value);
                const text = node.toString().trim();
                const start = offset + node.sourceIndex;
                if (!text.startsWith('.') || css.slice(start, start + text.length) !== text)
                    throw Error('Ambiguous selector range');
                tokens.push({ name: node.value, start: start + 1, end: start + text.length });
            });
            selectors.walkAttributes((node) => {
                if (
                    node.attribute.toLowerCase() !== 'class' ||
                    !node.value ||
                    !['=', '~='].includes(node.operator ?? '')
                )
                    return;
                const start =
                    offset + node.sourceIndex + node.offsetOf('value') + Number(!!node.quoteMark);
                const plain =
                    !node.insensitive && css.slice(start, start + node.value.length) === node.value;
                for (const match of node.value.matchAll(/[^ \t\r\n\f]+/g)) {
                    const name = match[0];
                    names.add(name);
                    if (plain)
                        tokens.push({
                            name,
                            start: start + match.index,
                            end: start + match.index + name.length,
                        });
                    else
                        uncertain.push({
                            name,
                            start: offset + node.sourceIndex,
                            end: offset + node.sourceIndex + node.toString().length,
                        });
                }
            });
        }).processSync(raw);
    }
    root.walkRules((rule) =>
        scan(
            rule.raws.selector?.raw ?? rule.selector,
            rule.source!.start!.offset + Number(rule.source!.input.hasBOM),
            true,
        ),
    );
    // Simple scope roots and limits can use the same selector-token offsets as normal rules.
    root.walkAtRules(/^scope$/i, (at) => {
        const raw = at.raws.params?.raw ?? at.params;
        const start =
            at.source!.start!.offset +
            Number(at.source!.input.hasBOM) +
            at.name.length +
            1 +
            (at.raws.afterName?.length ?? 0);
        if (!/^(?:\([^()]+\)(?:\s+to\s+\([^()]+\))?|to\s+\([^()]+\))$/.test(raw)) return;
        for (const part of raw.matchAll(/\(([^()]+)\)/g)) scan(part[1]!, start + part.index + 1);
    });
    tokens.sort((a, b) => a.start - b.start);
    return { names, tokens, uncertain, defined };
}
