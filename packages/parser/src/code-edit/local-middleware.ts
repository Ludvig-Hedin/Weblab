import {
    WEBLAB_DEV_IX_RUNTIME_SRC,
    WEBLAB_DEV_PRELOAD_SCRIPT_SRC,
    WEBLAB_INTERACTIONS_PUBLIC_INITIAL_CSS_SRC,
    WEBLAB_INTERACTIONS_PUBLIC_SRC,
} from '@weblab/constants';
import type { T } from '../packages';
import { t, traverse } from '../packages';

const START = '/((?!';
const END = ').*)';
const LEGACY_ASSETS = [WEBLAB_DEV_PRELOAD_SCRIPT_SRC, WEBLAB_DEV_IX_RUNTIME_SRC];
const assetExclusions = (assets: string[]) => assets
    .map((src) => `${src.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
    .join('|') + '|';
const LEGACY_PREFIX = START + assetExclusions(LEGACY_ASSETS);
const PREFIX = START + assetExclusions([
    ...LEGACY_ASSETS, WEBLAB_INTERACTIONS_PUBLIC_SRC, WEBLAB_INTERACTIONS_PUBLIC_INITIAL_CSS_SRC,
]);

export function isLocalMiddlewareFile(filePath: string): boolean {
    return /^(?:src\/)?(?:proxy|middleware)\.[jt]sx?$/.test(filePath);
}

function staticConfigValue(node: T.Node, depth = 0): boolean {
    if (depth > 20) return false;
    if (t.isStringLiteral(node) || t.isNumericLiteral(node) || t.isBooleanLiteral(node) || t.isNullLiteral(node)) return true;
    if (t.isArrayExpression(node)) return node.elements.every((item) => item !== null && staticConfigValue(item, depth + 1));
    if (!t.isObjectExpression(node)) return false;
    const keys = new Set<string>();
    return node.properties.every((property) => {
        if (!t.isObjectProperty(property) || property.computed || property.shorthand ||
            (!t.isIdentifier(property.key) && !t.isStringLiteral(property.key))) return false;
        const key = t.isIdentifier(property.key) ? property.key.name : property.key.value;
        if (key === '__proto__' || keys.has(key)) return false;
        keys.add(key);
        return staticConfigValue(property.value, depth + 1);
    });
}

function matcherLiterals(ast: T.File): T.StringLiteral[] {
    const configs: T.VariableDeclaration[] = [];
    for (const statement of ast.program.body) {
        if (!t.isExportNamedDeclaration(statement)) continue;
        if (statement.specifiers.some((specifier) =>
            t.isExportSpecifier(specifier) &&
            (t.isIdentifier(specifier.exported, { name: 'config' }) ||
                t.isStringLiteral(specifier.exported, { value: 'config' })))) {
            throw new Error('Local preview requires a directly exported static middleware config.');
        }
        if (t.isVariableDeclaration(statement.declaration) &&
            statement.declaration.declarations.some((declaration) => t.isIdentifier(declaration.id, { name: 'config' }))) {
            configs.push(statement.declaration);
        }
    }
    if (configs.length !== 1 || configs[0]?.kind !== 'const') {
        throw new Error('Review the middleware matcher before preparing local preview assets.');
    }
    const declaration = configs[0].declarations.find((item) => t.isIdentifier(item.id, { name: 'config' }));
    if (!t.isObjectExpression(declaration?.init) || !staticConfigValue(declaration.init)) {
        throw new Error('The whole middleware config must be static for local preparation.');
    }
    let matcher: T.Expression | null = null;
    const keys = new Set<string>();
    for (const property of declaration.init.properties) {
        if (!t.isObjectProperty(property) || property.computed || property.shorthand ||
            (!t.isIdentifier(property.key) && !t.isStringLiteral(property.key))) {
            throw new Error('Ambiguous middleware config cannot be prepared safely.');
        }
        const key = t.isIdentifier(property.key) ? property.key.name : property.key.value;
        if (keys.has(key)) throw new Error('Duplicate middleware config keys cannot be prepared safely.');
        keys.add(key);
        if (key === 'matcher') {
            if (!t.isExpression(property.value)) throw new Error('The middleware matcher must be static.');
            matcher = property.value;
        }
    }
    if (t.isStringLiteral(matcher)) return [matcher];
    if (t.isArrayExpression(matcher) && matcher.elements.length > 0 && matcher.elements.every((item) => t.isStringLiteral(item))) {
        return matcher.elements as T.StringLiteral[];
    }
    throw new Error('Only literal middleware matcher strings are supported for local preparation.');
}

function preparedMatcher(value: string): string {
    const start = value.startsWith(PREFIX) ? PREFIX : value.startsWith(LEGACY_PREFIX) ? LEGACY_PREFIX : START;
    const exclusions = value.slice(start.length, -END.length);
    if (!value.startsWith(start) || !value.endsWith(END) ||
        !/^[A-Za-z0-9_/-]+(?:\|[A-Za-z0-9_/-]+)*$/.test(exclusions)) {
        throw new Error('Review this middleware matcher before allowing local preview assets.');
    }
    return PREFIX + exclusions + END;
}

/** Extend only a complete, simple negative-lookahead matcher, never its auth function. */
export function prepareLocalMiddleware(ast: T.File): void {
    const matchers = matcherLiterals(ast);
    // Arrays are OR rules. Validate every entry before changing any of them.
    const values = matchers.map((matcher) => preparedMatcher(matcher.value));
    matchers.forEach((matcher, index) => { matcher.value = values[index]!; });
}

/** Remove only our exact inserted prefix; customer-owned exclusions stay intact. */
export function stripLocalMiddleware(ast: T.File, original: T.File | null): void {
    let instrumented = false;
    traverse(ast, { StringLiteral(path) {
        if (path.node.value.startsWith(PREFIX) || path.node.value.startsWith(LEGACY_PREFIX)) instrumented = true;
    } });
    if (!instrumented) return;
    if (!original) throw new Error('Middleware preview exclusions need their original source for handoff.');
    const current = matcherLiterals(ast);
    const baseline = matcherLiterals(original);
    if (current.length !== baseline.length) throw new Error('Review changed middleware rules before handoff.');
    const values = current.map((matcher, index) => {
        const previous = baseline[index]!;
        const prepared = preparedMatcher(previous.value);
        // The baseline may already own either prefix. Restore its exact value,
        // including customer exclusions, rather than stripping a matching prefix.
        if (matcher.value === previous.value || matcher.value === prepared) return previous.value;
        const unpreparedBaseline = !previous.value.startsWith(PREFIX) && !previous.value.startsWith(LEGACY_PREFIX);
        if (unpreparedBaseline && matcher.value === LEGACY_PREFIX + previous.value.slice(START.length)) {
            return previous.value;
        }
        throw new Error('Review changed middleware rules before handoff.');
    });
    current.forEach((matcher, index) => { matcher.value = values[index]!; });
}
