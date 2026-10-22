import {
    DEPRECATED_IX_RUNTIME_SRCS,
    DEPRECATED_PRELOAD_SCRIPT_SRCS,
    WEBLAB_DEV_IX_RUNTIME_SRC,
    WEBLAB_DEV_PRELOAD_SCRIPT_SRC,
    WEBLAB_INTERACTIONS_PUBLIC_SRC,
    WEBLAB_IX_RUNTIME_SRC,
    WEBLAB_PRELOAD_SCRIPT_SRC,
} from '@weblab/constants';

import type { NodePath, T } from '../packages';
import { t, traverse } from '../packages';

const PRELOAD = {
    src: WEBLAB_PRELOAD_SCRIPT_SRC,
    localSrc: WEBLAB_DEV_PRELOAD_SCRIPT_SRC,
    deprecated: DEPRECATED_PRELOAD_SCRIPT_SRCS,
    id: 'weblab-preload-script',
};
const IX_RUNTIME = {
    src: WEBLAB_IX_RUNTIME_SRC,
    localSrc: WEBLAB_DEV_IX_RUNTIME_SRC,
    deprecated: DEPRECATED_IX_RUNTIME_SRCS,
    id: 'weblab-ix-runtime',
};
type BootstrapScript = typeof PRELOAD;
const bootstrapScripts = [PRELOAD, IX_RUNTIME];

function staticAttributeValue(attribute: T.JSXAttribute): string | undefined {
    const value = attribute.value;
    if (t.isStringLiteral(value)) return value.value;
    if (t.isJSXExpressionContainer(value) && t.isStringLiteral(value.expression)) {
        return value.expression.value;
    }
}

function attributesNamed(node: T.JSXElement, name: string): T.JSXAttribute[] {
    return node.openingElement.attributes.filter((item): item is T.JSXAttribute =>
        t.isJSXAttribute(item) && t.isJSXIdentifier(item.name, { name }));
}

function attributeValue(node: T.JSXElement, name: string): string | undefined {
    const attribute = attributesNamed(node, name)[0];
    return attribute && staticAttributeValue(attribute);
}

function isCurrentSource(spec: BootstrapScript, src: string | undefined): boolean {
    return src === spec.src || src === spec.localSrc;
}

function isNextScriptBinding(path: NodePath, name: string): boolean {
    const binding = path.scope.getBinding(name);
    return !!binding?.path.isImportDefaultSpecifier() &&
        !!binding.path.parentPath?.isImportDeclaration() &&
        binding.path.parentPath.node.source.value === 'next/script' &&
        binding.path.parentPath.node.importKind !== 'type';
}

// Validate both assets before either injector mutates the layout. A foreign
// component or a reserved ID with an unknown source must never be removed.
function validateBootstrapBindings(ast: T.File, removalSources?: readonly string[]): string {
    let scriptName = 'Script';
    const nextImport = ast.program.body.find(
        (node): node is T.ImportDeclaration => t.isImportDeclaration(node) &&
            node.source.value === 'next/script' && node.importKind !== 'type' &&
            node.specifiers.some((specifier) => t.isImportDefaultSpecifier(specifier)),
    );
    const defaultImport = nextImport?.specifiers.find((specifier) => t.isImportDefaultSpecifier(specifier));
    if (defaultImport) scriptName = defaultImport.local.name;
    const wrappingTarget = !removalSources && bodyPaths(ast).length === 0 && !hasHtml(ast)
        ? findWrappingTarget(ast) : undefined;
    const validateInsertionScope = (path: NodePath) => {
        if (path.scope.getBinding(scriptName) && !isNextScriptBinding(path, scriptName)) {
            throw new Error('The layout shadows the next/script binding at an insertion point.');
        }
    };
    if (wrappingTarget) validateInsertionScope(wrappingTarget);
    traverse(ast, {
        Program(path) {
            if (!removalSources && !nextImport && path.scope.getBinding(scriptName)) {
                throw new Error('The layout already uses Script for a different binding.');
            }
        },
        JSXElement(path) {
            const node = path.node;
            const name = node.openingElement.name;
            if (!removalSources && (t.isJSXIdentifier(name, { name: 'body' }) ||
                t.isJSXIdentifier(name, { name: 'html' }))) {
                validateInsertionScope(path);
            }
            const sources = attributesNamed(node, 'src').map(staticAttributeValue);
            const ids = attributesNamed(node, 'id').map(staticAttributeValue);
            if (removalSources && !sources.some((src) => src !== undefined && removalSources.includes(src))) return;
            const src = attributeValue(node, 'src');
            const id = attributeValue(node, 'id');
            const spec = bootstrapScripts.find((item) => ids.includes(item.id) ||
                sources.some((value) => value !== undefined &&
                    (isCurrentSource(item, value) || item.deprecated.includes(value))));
            if (!spec) return;
            const legacy = src !== undefined && !isCurrentSource(spec, src) && spec.deprecated.includes(src);
            const validBinding = t.isJSXIdentifier(name) &&
                (isNextScriptBinding(path, name.name) ||
                    (!nextImport && name.name === scriptName && !path.scope.getBinding(name.name)));
            if (!validBinding || !src || (!isCurrentSource(spec, src) && !legacy) ||
                ids.some((value) => bootstrapScripts.some((item) => item.id === value && item !== spec)) ||
                (!legacy && id !== undefined && id !== spec.id) ||
                node.openingElement.attributes.some((attribute) => t.isJSXSpreadAttribute(attribute))) {
                throw new Error('The layout contains a conflicting bootstrap script.');
            }
            for (const key of ['src', 'id', 'strategy', 'type', 'data-interactions-src']) {
                const attributes = attributesNamed(node, key);
                // Old generated tags repeated matching execution attributes and
                // legacy IDs. Keep migrating those without accepting hidden
                // sources, reserved IDs or conflicting execution settings.
                const legacyDuplicates = legacy && key !== 'src' && (key === 'id'
                    ? !ids.some((value) => bootstrapScripts.some((item) => item.id === value))
                    : new Set(attributes.map(staticAttributeValue)).size === 1);
                if ((attributes.length > 1 && !legacyDuplicates) ||
                    attributes.some((attribute) => staticAttributeValue(attribute) === undefined)) {
                    throw new Error('The layout contains ambiguous bootstrap attributes.');
                }
            }
            if (!legacy && ((attributeValue(node, 'strategy') !== undefined && attributeValue(node, 'strategy') !== 'afterInteractive') ||
                (attributeValue(node, 'type') !== undefined && attributeValue(node, 'type') !== 'module') ||
                (spec === IX_RUNTIME && attributeValue(node, 'data-interactions-src') !== undefined &&
                    attributeValue(node, 'data-interactions-src') !== WEBLAB_INTERACTIONS_PUBLIC_SRC))) {
                throw new Error('The layout contains conflicting bootstrap execution settings.');
            }
            const directlyInBody = path.parentPath?.isJSXElement() &&
                t.isJSXIdentifier(path.parentPath.node.openingElement.name, { name: 'body' });
            // Removing an initializer or expression operand can invalidate its
            // parent or throw after earlier edits. Only JSX child lists support
            // the relocation/removal performed by these APIs.
            if (path.listKey !== 'children' ||
                (!path.parentPath?.isJSXElement() && !path.parentPath?.isJSXFragment())) {
                throw new Error('A bootstrap script cannot be safely removed from its expression.');
            }
            if ((legacy || !directlyInBody) && node.openingElement.attributes.some((attribute) =>
                !t.isJSXAttribute(attribute) || !t.isJSXIdentifier(attribute.name) ||
                !['src', 'strategy', 'type', 'id', 'data-interactions-src'].includes(attribute.name.name))) {
                throw new Error('A bootstrap script contains attributes that cannot be discarded.');
            }
        },
    });
    if (removalSources) return scriptName;
    for (const spec of bootstrapScripts) {
        const scripts = matchingScripts(ast, [spec.src, spec.localSrc, ...spec.deprecated]);
        for (const body of bodyPaths(ast)) {
            const existing = scripts.filter((script) => script.parentPath?.node === body.node);
            if (existing.length > 1 && existing.some((script) => script.node.openingElement.attributes.some(
                (attribute) => !t.isJSXAttribute(attribute) || !t.isJSXIdentifier(attribute.name) ||
                    !['src', 'strategy', 'type', 'id', 'data-interactions-src'].includes(attribute.name.name),
            ))) throw new Error('Duplicate bootstrap scripts contain attributes that cannot be discarded.');
        }
    }
    return scriptName;
}

function ensureScriptImport(ast: T.File, scriptName: string): void {
    if (ast.program.body.some((node) => t.isImportDeclaration(node) &&
        node.source.value === 'next/script' && node.importKind !== 'type' &&
        node.specifiers.some((specifier) => t.isImportDefaultSpecifier(specifier)))) return;
    const existing = ast.program.body.find((node): node is T.ImportDeclaration =>
        t.isImportDeclaration(node) && node.source.value === 'next/script' && node.importKind !== 'type');
    if (existing) {
        existing.specifiers.unshift(t.importDefaultSpecifier(t.identifier(scriptName)));
        traverse(ast, { Program(path) { path.scope.crawl(); path.stop(); } });
        return;
    }
    const scriptImport = t.importDeclaration(
        [t.importDefaultSpecifier(t.identifier(scriptName))], t.stringLiteral('next/script'),
    );
    let insertIndex = 0;
    for (let i = 0; i < ast.program.body.length; i++) {
        if (t.isImportDeclaration(ast.program.body[i])) insertIndex = i + 1;
        else break;
    }
    ast.program.body.splice(insertIndex, 0, scriptImport);
    traverse(ast, { Program(path) { path.scope.crawl(); path.stop(); } });
}

function getBootstrapScript(spec: BootstrapScript, scriptName: string): T.JSXElement {
    const attributes = [
        t.jsxAttribute(t.jsxIdentifier('src'), t.stringLiteral(spec.src)),
        t.jsxAttribute(t.jsxIdentifier('strategy'), t.stringLiteral('afterInteractive')),
        t.jsxAttribute(t.jsxIdentifier('type'), t.stringLiteral('module')),
        t.jsxAttribute(t.jsxIdentifier('id'), t.stringLiteral(spec.id)),
    ];
    if (spec === IX_RUNTIME) attributes.push(t.jsxAttribute(
        t.jsxIdentifier('data-interactions-src'), t.stringLiteral(WEBLAB_INTERACTIONS_PUBLIC_SRC),
    ));
    return t.jsxElement(
        t.jsxOpeningElement(t.jsxIdentifier(scriptName), attributes, false),
        t.jsxClosingElement(t.jsxIdentifier(scriptName)), [], false,
    );
}

function normalizeSelfClosingTag(node: T.JSXElement): void {
    if (!node.openingElement.selfClosing) return;
    node.openingElement.selfClosing = false;
    node.closingElement = t.jsxClosingElement(t.cloneNode(node.openingElement.name));
    node.children = [];
}

function matchingScripts(ast: T.File, sources: readonly string[]): NodePath<T.JSXElement>[] {
    const scripts: NodePath<T.JSXElement>[] = [];
    traverse(ast, {
        JSXElement(path) {
            const src = attributeValue(path.node, 'src');
            if (src !== undefined && sources.includes(src)) scripts.push(path);
        },
    });
    return scripts;
}

function bodyPaths(ast: T.File): NodePath<T.JSXElement>[] {
    const bodies: NodePath<T.JSXElement>[] = [];
    traverse(ast, {
        JSXElement(path) {
            if (t.isJSXIdentifier(path.node.openingElement.name, { name: 'body' })) bodies.push(path);
        },
    });
    return bodies;
}

function hasHtml(ast: T.File): boolean {
    let found = false;
    traverse(ast, { JSXElement(path) {
        if (t.isJSXIdentifier(path.node.openingElement.name, { name: 'html' })) {
            found = true;
            path.stop();
        }
    } });
    return found;
}

function isWrappableReturn(arg: T.ReturnStatement['argument']): boolean {
    return t.isJSXElement(arg) || t.isJSXFragment(arg) || t.isIdentifier(arg) ||
        t.isMemberExpression(arg) || t.isCallExpression(arg) || t.isConditionalExpression(arg);
}

// Match the legacy wrapper's first eligible return without modifying it, so
// binding conflicts are refused before imports or document tags are added.
function findWrappingTarget(ast: T.File): NodePath | undefined {
    let target: NodePath | undefined;
    traverse(ast, {
        ArrowFunctionExpression(path) {
            if (!t.isJSXElement(path.node.body) && !t.isJSXFragment(path.node.body)) return;
            target = path;
            path.stop();
        },
        ReturnStatement(path) {
            if (!isWrappableReturn(path.node.argument)) return;
            target = path;
            path.stop();
        },
    });
    return target;
}

function injectIntoBodies(ast: T.File, spec: BootstrapScript, scriptName: string): void {
    const bodies = bodyPaths(ast);
    const scripts = matchingScripts(ast, [spec.src, spec.localSrc, ...spec.deprecated]);
    const kept = new Set<T.JSXElement>();
    // One tag in each body is valid even when the file has several alternative
    // document returns. A global script count cannot describe this invariant.
    for (const body of bodies) {
        normalizeSelfClosingTag(body.node);
        const existing = scripts.find((script) => script.parentPath?.node === body.node &&
            isCurrentSource(spec, attributeValue(script.node, 'src')));
        if (existing) {
            kept.add(existing.node);
            const canonical = getBootstrapScript(spec, scriptName);
            for (const attribute of canonical.openingElement.attributes) {
                if (!t.isJSXAttribute(attribute) || !t.isJSXIdentifier(attribute.name)) continue;
                const name = attribute.name.name;
                if (name === 'src') continue;
                const current = existing.node.openingElement.attributes.find((item) =>
                    t.isJSXAttribute(item) && t.isJSXIdentifier(item.name, { name }));
                if (t.isJSXAttribute(current)) {
                    if (attributeValue(existing.node, name) !== attributeValue(canonical, name)) current.value = attribute.value;
                } else existing.node.openingElement.attributes.push(attribute);
            }
        } else {
            body.node.children.push(t.jsxText('\n'), getBootstrapScript(spec, scriptName), t.jsxText('\n'));
        }
    }
    for (const script of scripts) if (!kept.has(script.node)) script.remove();
}

export const injectPreloadScript = (ast: T.File): T.File => {
    const scriptName = validateBootstrapBindings(ast);
    ensureScriptImport(ast, scriptName);
    let htmlFound = false;
    const bodies = bodyPaths(ast);
    traverse(ast, {
        JSXElement(path) {
            if (!t.isJSXIdentifier(path.node.openingElement.name, { name: 'html' })) return;
            htmlFound = true;
            normalizeSelfClosingTag(path.node);
            const hasBody = bodies.some((body) => body.findParent((parent) => parent.isJSXElement() &&
                t.isJSXIdentifier(parent.node.openingElement.name, { name: 'html' }))?.node === path.node);
            if (!hasBody) {
                const body = t.jsxElement(t.jsxOpeningElement(t.jsxIdentifier('body'), []),
                    t.jsxClosingElement(t.jsxIdentifier('body')), [getBootstrapScript(PRELOAD, scriptName)], false);
                path.node.children.push(t.jsxText('\n'), body, t.jsxText('\n'));
            }
        },
    });
    if (!htmlFound && bodies.length === 0) {
        wrapWithHtmlAndBody(ast, scriptName);
    }
    injectIntoBodies(ast, PRELOAD, scriptName);
    return ast;
};

function wrapWithHtmlAndBody(ast: T.File, scriptName: string): void {
    traverse(ast, {
        ArrowFunctionExpression(path) {
            const { body } = path.node;
            if (!t.isJSXElement(body) && !t.isJSXFragment(body)) {
                return;
            }

            const children: Array<
                T.JSXElement | T.JSXFragment | T.JSXText | T.JSXExpressionContainer
            > = [getBootstrapScript(PRELOAD, scriptName), t.jsxText('\n'), body];

            const newBody = t.jsxElement(
                t.jsxOpeningElement(t.jsxIdentifier('body'), []),
                t.jsxClosingElement(t.jsxIdentifier('body')),
                children,
                false,
            );

            const html = t.jsxElement(
                t.jsxOpeningElement(t.jsxIdentifier('html'), [
                    t.jsxAttribute(t.jsxIdentifier('lang'), t.stringLiteral('en')),
                ]),
                t.jsxClosingElement(t.jsxIdentifier('html')),
                [newBody],
                false,
            );

            path.node.body = t.blockStatement([t.returnStatement(html)]);
            path.stop();
        },
        ReturnStatement(path) {
            const arg = path.node.argument;
            if (!arg || !isWrappableReturn(arg)) return;

            const children: Array<
                T.JSXElement | T.JSXFragment | T.JSXText | T.JSXExpressionContainer
            > = [getBootstrapScript(PRELOAD, scriptName), t.jsxText('\n')];

            if (t.isJSXElement(arg) || t.isJSXFragment(arg)) {
                children.push(arg);
            } else if (
                t.isIdentifier(arg) ||
                t.isMemberExpression(arg) ||
                t.isCallExpression(arg) ||
                t.isConditionalExpression(arg)
            ) {
                children.push(t.jsxExpressionContainer(arg));
            } else {
                return; // skip wrapping unsupported types
            }

            const body = t.jsxElement(
                t.jsxOpeningElement(t.jsxIdentifier('body'), []),
                t.jsxClosingElement(t.jsxIdentifier('body')),
                children,
                false,
            );

            const html = t.jsxElement(
                t.jsxOpeningElement(t.jsxIdentifier('html'), [
                    t.jsxAttribute(t.jsxIdentifier('lang'), t.stringLiteral('en')),
                ]),
                t.jsxClosingElement(t.jsxIdentifier('html')),
                [body],
                false,
            );

            path.node.argument = html;
            path.stop();
        },
    });
}

export function injectIxRuntimeScript(ast: T.File): T.File {
    const scriptName = validateBootstrapBindings(ast);
    ensureScriptImport(ast, scriptName);
    injectIntoBodies(ast, IX_RUNTIME, scriptName);
    return ast;
}

/** Prepare each document branch once; repeated preparation preserves its tags. */
export function injectWeblabBootstrapScripts(ast: T.File): T.File {
    validateBootstrapBindings(ast);
    injectPreloadScript(ast);
    injectIxRuntimeScript(ast);
    return ast;
}

function scanForBootstrapScript(ast: T.File, spec: BootstrapScript): {
    scriptCount: number;
    deprecatedScriptCount: number;
    injectedCorrectly: boolean;
} {
    const bodies = bodyPaths(ast);
    // Scans also serve legacy unbound Script fixtures. Mutation requires the
    // stricter binding preflight above.
    const scripts = matchingScripts(ast, [spec.src, spec.localSrc, ...spec.deprecated]).filter((path) => {
        const name = path.node.openingElement.name;
        return t.isJSXIdentifier(name) && (name.name === 'Script' || isNextScriptBinding(path, name.name));
    });
    const current = scripts.filter((path) => isCurrentSource(spec, attributeValue(path.node, 'src')));
    return {
        scriptCount: current.length,
        deprecatedScriptCount: scripts.length - current.length,
        injectedCorrectly: bodies.length > 0 && current.length === bodies.length &&
            bodies.every((body) => current.filter((path) => path.parentPath?.node === body.node).length === 1),
    };
}

export function scanForPreloadScript(ast: T.File) {
    return scanForBootstrapScript(ast, PRELOAD);
}

export function scanForIxRuntimeScript(ast: T.File) {
    return scanForBootstrapScript(ast, IX_RUNTIME);
}

function removeScripts(ast: T.File, sources: readonly string[]): void {
    validateBootstrapBindings(ast, sources);
    for (const script of matchingScripts(ast, sources)) script.remove();
}

export function removeDeprecatedPreloadScripts(ast: T.File): void {
    removeScripts(ast, PRELOAD.deprecated);
}

export function removeAllPreloadScripts(ast: T.File): void {
    removeScripts(ast, [PRELOAD.src]);
}

export function removeDeprecatedIxRuntimeScripts(ast: T.File): void {
    removeScripts(ast, IX_RUNTIME.deprecated);
}

export function removeAllIxRuntimeScripts(ast: T.File): void {
    removeScripts(ast, [IX_RUNTIME.src]);
}
