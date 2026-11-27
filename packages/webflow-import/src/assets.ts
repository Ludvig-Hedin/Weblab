import { posix } from 'node:path';
import postcss from 'postcss';
import valueParser from 'postcss-value-parser';

export type RewriteReference = (value: string, kind?: 'link' | 'asset' | 'optional') => string;

export function createReferenceRewriter(
    source: string,
    paths: ReadonlySet<string>,
    routes: ReadonlyMap<string, string>,
    missing: (path: string) => void,
): RewriteReference {
    return (value, kind = 'asset') => {
        const reference = value.trim();
        if (!reference || /^(?:[a-z][a-z\d+.-]*:|\/\/|[?#])/i.test(reference)) return value;

        const parts = /^([^?#]*)(.*)$/s.exec(reference);
        if (!parts?.[1]) return value;
        const path = decodePath(parts[1]);
        const normalized = posix.normalize(
            path.startsWith('/') ? path.slice(1) : posix.join(posix.dirname(source), path),
        );
        const target = normalized.replace(/\/$/, '');
        if (target === '..' || target.startsWith('../')) return value;

        if (kind === 'link') {
            const route = routes.get(target) ?? routes.get(posix.join(target, 'index.html'));
            if (route !== undefined) return route + parts[2];
        }

        if (kind === 'asset' || (kind === 'link' && posix.extname(target))) {
            if (!paths.has(target)) missing(target);
        }
        return '/' + encodePath(target) + parts[2];
    };
}

function decodePath(path: string) {
    return path
        .split('/')
        .map((segment) => {
            try {
                const decoded = decodeURIComponent(segment);
                return /[/\\\0]/.test(decoded) ? segment : decoded;
            } catch {
                return segment;
            }
        })
        .join('/');
}

export function encodePath(path: string) {
    return path.split('/').map(encodeURIComponent).join('/');
}

export function rewriteSrcSet(value: string, rewrite: RewriteReference) {
    const candidates = [];
    // A candidate URL can contain commas, notably a data URL.
    let rest = value;
    while ((rest = rest.replace(/^[\s,]+/, ''))) {
        const url = /^\S+/.exec(rest)?.[0];
        if (!url) break;
        rest = rest.slice(url.length);
        if (url.endsWith(',')) {
            candidates.push(rewrite(url.replace(/,+$/, '')));
            continue;
        }
        const separator = rest.indexOf(',');
        const descriptor = (separator < 0 ? rest : rest.slice(0, separator)).trim();
        candidates.push([rewrite(url), descriptor].filter(Boolean).join(' '));
        rest = separator < 0 ? '' : rest.slice(separator + 1);
    }
    return candidates.join(', ');
}

export function rewriteCssUrls(value: string, rewrite: RewriteReference, importRule = false) {
    const parsed = valueParser(value);
    const first = parsed.nodes.find((node) => node.type !== 'space' && node.type !== 'comment');
    if (importRule && first?.type === 'string') first.value = rewrite(first.value);
    parsed.walk((node) => {
        if (node.type !== 'function' || node.value.toLowerCase() !== 'url') return;
        const url = node.nodes[0];
        if (url?.type === 'word' || url?.type === 'string') url.value = rewrite(url.value);
        return false;
    });
    return valueParser.stringify(parsed.nodes);
}

export function rewriteStylesheet(
    content: string,
    source: string,
    rewrite: RewriteReference,
    replaceFont: (value: string) => string,
    warn: (message: string) => void,
) {
    try {
        const css = postcss.parse(content, { from: source });
        css.walkDecls((declaration) => {
            declaration.value = rewriteCssUrls(declaration.value, rewrite);
            const property = declaration.prop.toLowerCase();
            if (property === 'font-family' && declaration.parent?.type !== 'atrule') {
                declaration.value = replaceFont(declaration.value);
            }
        });
        css.walkAtRules('import', (rule) => {
            rule.params = rewriteCssUrls(rule.params, rewrite, true);
        });
        return css.toString();
    } catch {
        warn(`${source}: kept the original stylesheet because it could not be parsed.`);
        return content;
    }
}
