import type { AtRule } from 'postcss';
import { ident, lexer, parse, string, tokenTypes as T, tokenize, url } from 'css-tree';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';

export const selectorAst = (source: string) => selectorParser().astSync(source);
export const keyword = (name: string) => ident.decode(name).toLowerCase();
export const decodeIdent = (name: string) => ident.decode(name);
export function tokens(source: string) {
    const result: { type: number; raw: string; start: number; end: number }[] = [];
    tokenize(source, (type, start, end) =>
        result.push({ type, raw: source.slice(start, end), start, end }),
    );
    return result;
}
export function hasComment(source: string) {
    return tokens(source).some((t) => t.type === T.Comment);
}
export function parseSheet(source: string) {
    // PostCSS splits escaped at-keywords. Mask their names at equal UTF-16
    // lengths for parsing, then restore the original spelling on the CST nodes.
    const escapes = tokens(source).filter(
        (t) => t.type === T.AtKeyword && ident.decode(t.raw) !== t.raw,
    );
    if (!escapes.length) return readPriorities(postcss.parse(source));
    function mask(parts: typeof escapes) {
        let css = '',
            offset = 0;
        for (const part of parts) {
            css += source.slice(offset, part.start) + '@' + 'x'.repeat(part.raw.length - 1);
            offset = part.end;
        }
        return postcss.parse(css + source.slice(offset));
    }
    let root = mask(escapes);
    const offsets = new Set<number>();
    root.walkAtRules((at) => {
        offsets.add(at.source!.start!.offset + Number(at.source!.input.hasBOM));
    });
    const names = escapes.filter((t) => offsets.has(t.start));
    if (names.length !== escapes.length) root = mask(names);
    const originals = new Map(names.map((t) => [t.start, t.raw.slice(1)]));
    root.walkAtRules((at) => {
        const original = originals.get(at.source!.start!.offset + Number(at.source!.input.hasBOM));
        if (original) at.name = original;
    });
    return readPriorities(root);
}

// PostCSS leaves escaped spellings of !important in the value. Keep their
// original bytes in raws.important so ordinary edits preserve the spelling.
function readPriorities(root: postcss.Root) {
    root.walkDecls((decl) => {
        if (decl.important) return;
        const raw = decl.raws.value?.raw ?? decl.value;
        const parts = significant(raw);
        const name = parts.at(-1),
            bang = parts.at(-2);
        if (
            name?.type !== T.Ident ||
            keyword(name.raw) !== 'important' ||
            bang?.type !== T.Delim ||
            bang.raw !== '!'
        )
            return;
        const end = parts.at(-3)?.end ?? 0;
        const body = raw.slice(0, end);
        decl.value = body;
        delete decl.raws.value;
        decl.important = true;
        decl.raws.important = raw.slice(end);
    });
    return root;
}
const significant = (source: string) =>
    tokens(source).filter((t) => t.type !== T.Comment && t.type !== T.WhiteSpace);
export function defaultNamespace(at: AtRule) {
    return keyword(at.name) === 'namespace' && significant(at.params)[0]?.type !== T.Ident;
}
export function modeledValue(property: string, value: string) {
    const first = significant(value)[0];
    if (first?.type === T.Ident && ['revert', 'revert-layer'].includes(keyword(first.raw)))
        return false;
    return property.startsWith('--') || !lexer.matchProperty(property, value).error;
}
export function importPath(at: AtRule) {
    const [first, arg, close] = significant(at.params);
    if (!first) return;
    if (first.type === T.String) return string.decode(first.raw);
    if (first.type === T.Url) return url.decode(first.raw);
    if (
        first.type === T.Function &&
        keyword(first.raw.slice(0, -1)) === 'url' &&
        arg?.type === T.String &&
        close?.type === T.RightParenthesis
    )
        return string.decode(arg.raw);
}
type Width = { direction: 'min' | 'max'; width: number };
function mediaBranches(params: string): (Width | boolean | undefined)[][] {
    const input = significant(params);
    const branches: (Width | boolean | undefined)[][] = [[]];
    let i = 0;
    while (i < input.length) {
        const t = input[i++]!;
        let term: Width | boolean | undefined;
        if (t.type === T.Ident) {
            const name = keyword(t.raw);
            if (name === 'all' || name === 'screen') term = true;
            if (name === 'print') term = false;
        } else if (t.type === T.LeftParenthesis) {
            const [name, colon, dimension, end] = input.slice(i, i + 4);
            if (
                name?.type !== T.Ident ||
                colon?.type !== T.Colon ||
                dimension?.type !== T.Dimension ||
                end?.type !== T.RightParenthesis
            )
                return [[undefined]];
            i += 4;
            const feature = keyword(name.raw);
            const value = parse(dimension.raw, { context: 'value' });
            const d = value.type === 'Value' && value.children.first;
            if (
                (feature === 'min-width' || feature === 'max-width') &&
                d &&
                d.type === 'Dimension' &&
                keyword(d.unit) === 'px'
            )
                term = {
                    direction: feature === 'min-width' ? 'min' : 'max',
                    width: Number(d.value),
                };
        }
        branches.at(-1)!.push(term);
        const separator = input[i++];
        if (!separator) break;
        if (i === input.length) return [[undefined]];
        if (separator.type === T.Comma) branches.push([]);
        else if (separator.type !== T.Ident || keyword(separator.raw) !== 'and')
            return [[undefined]];
    }
    return branches;
}
export function breakpoint(at: AtRule) {
    if (keyword(at.name) !== 'media') return;
    const branches = mediaBranches(at.params);
    if (branches.length !== 1) return;
    const terms = branches[0]!.filter((t) => t !== true);
    if (terms.length === 1 && typeof terms[0] === 'object') return terms[0];
}
export function mediaMatch(at: AtRule, width?: number) {
    const branches = mediaBranches(at.params).map((branch) => {
        const terms = branch.map((t) =>
            typeof t !== 'object'
                ? t
                : width === undefined
                  ? undefined
                  : t.direction === 'max'
                    ? width <= t.width
                    : width >= t.width,
        );
        return terms.includes(false)
            ? false
            : terms.includes(undefined) || !terms.length
              ? undefined
              : true;
    });
    return branches.includes(true) ? true : branches.includes(undefined) ? undefined : false;
}
export function scopeSelectors(raw: string) {
    const ranges: { start: number; end: number }[] = [];
    let start = 0,
        depth = 0;
    for (const token of significant(raw)) {
        if (token.type === T.LeftParenthesis || token.type === T.Function) {
            if (!depth) start = token.end;
            depth++;
        } else if (token.type === T.RightParenthesis && --depth === 0)
            ranges.push({ start, end: token.start });
    }
    return ranges;
}
export function layerNames(raw: string) {
    const names: string[][] = [[]];
    let needName = true;
    for (const t of significant(raw)) {
        if (needName && t.type === T.Ident) names.at(-1)!.push(ident.decode(t.raw));
        else if (!needName && t.type === T.Comma) names.push([]);
        else if (needName || t.type !== T.Delim || t.raw !== '.')
            throw Error('Unmodeled layer name');
        needName = !needName;
    }
    return names;
}
