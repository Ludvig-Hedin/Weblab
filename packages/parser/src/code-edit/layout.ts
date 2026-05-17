import {
    DEPRECATED_IX_RUNTIME_SRCS,
    DEPRECATED_PRELOAD_SCRIPT_SRCS,
    WEBLAB_INTERACTIONS_PUBLIC_SRC,
    WEBLAB_IX_RUNTIME_SRC,
    WEBLAB_PRELOAD_SCRIPT_SRC,
} from '@weblab/constants';

import type { T } from '../packages';
import { t, traverse } from '../packages';

const IX_RUNTIME_SCRIPT_ID = 'weblab-ix-runtime';

export const injectPreloadScript = (ast: T.File): T.File => {
    const hasScriptImport = isScriptImported(ast);
    if (!hasScriptImport) addScriptImport(ast);

    const { scriptCount, deprecatedScriptCount, injectedCorrectly } = scanForPreloadScript(ast);

    if (scriptCount === 1 && deprecatedScriptCount === 0 && injectedCorrectly) {
        return ast;
    }

    // If a previous injection (e.g. across sandbox restarts or a buggy older
    // build) left more than one preload <Script> tag, prune the extras before
    // we (re-)inject. Without this, two copies of the bundle load in the
    // iframe and any top-level identifier in the minified code collides with
    // itself ("Identifier 'X' has already been declared").
    if (scriptCount > 1) {
        removeAllPreloadScripts(ast);
    }

    removeDeprecatedPreloadScripts(ast);

    let scriptInjected = false;
    let htmlFound = false;

    traverse(ast, {
        JSXElement(path) {
            const name = path.node.openingElement.name;
            if (!t.isJSXIdentifier(name)) return;

            if (name.name === 'html') {
                htmlFound = true;
                normalizeSelfClosingTag(path.node);
            }

            if (name.name === 'body') {
                normalizeSelfClosingTag(path.node);
                if (!scriptInjected) {
                    addScriptToJSXElement(path.node);
                    scriptInjected = true;
                }
            }
        },
    });

    if (!scriptInjected && htmlFound) {
        traverse(ast, {
            JSXElement(path) {
                if (t.isJSXIdentifier(path.node.openingElement.name, { name: 'html' })) {
                    createBodyTag(path.node);
                    scriptInjected = true;
                    path.stop();
                }
            },
        });
    }

    if (!scriptInjected && !htmlFound) {
        wrapWithHtmlAndBody(ast);
    }

    return ast;
};

function normalizeSelfClosingTag(node: T.JSXElement): void {
    if (node.openingElement.selfClosing) {
        node.openingElement.selfClosing = false;

        if (t.isJSXIdentifier(node.openingElement.name)) {
            node.closingElement = t.jsxClosingElement(
                t.jsxIdentifier(node.openingElement.name.name),
            );
        } else {
            node.closingElement = t.jsxClosingElement(node.openingElement.name);
        }

        node.children = [];
    }
}

function isScriptImported(ast: T.File): boolean {
    let found = false;
    traverse(ast, {
        ImportDeclaration(path) {
            if (
                t.isStringLiteral(path.node.source, { value: 'next/script' }) &&
                path.node.specifiers.some(
                    (s) =>
                        t.isImportDefaultSpecifier(s) &&
                        t.isIdentifier(s.local, { name: 'Script' }),
                )
            ) {
                found = true;
                path.stop();
            }
        },
    });
    return found;
}

function addScriptImport(ast: T.File): void {
    const scriptImport = t.importDeclaration(
        [t.importDefaultSpecifier(t.identifier('Script'))],
        t.stringLiteral('next/script'),
    );

    let insertIndex = 0;
    for (let i = 0; i < ast.program.body.length; i++) {
        if (t.isImportDeclaration(ast.program.body[i])) insertIndex = i + 1;
        else break;
    }

    ast.program.body.splice(insertIndex, 0, scriptImport);
}

function getPreloadScript(): T.JSXElement {
    return t.jsxElement(
        t.jsxOpeningElement(
            t.jsxIdentifier('Script'),
            [
                t.jsxAttribute(t.jsxIdentifier('src'), t.stringLiteral(WEBLAB_PRELOAD_SCRIPT_SRC)),
                t.jsxAttribute(t.jsxIdentifier('strategy'), t.stringLiteral('afterInteractive')),
                t.jsxAttribute(t.jsxIdentifier('type'), t.stringLiteral('module')),
                t.jsxAttribute(t.jsxIdentifier('id'), t.stringLiteral('weblab-preload-script')),
            ],
            false,
        ),
        t.jsxClosingElement(t.jsxIdentifier('Script')),
        [],
        false,
    );
}

function addScriptToJSXElement(node: T.JSXElement): void {
    const alreadyInjected = node.children.some(
        (child) =>
            t.isJSXElement(child) &&
            t.isJSXIdentifier(child.openingElement.name, { name: 'Script' }) &&
            child.openingElement.attributes.some(
                (attr) =>
                    t.isJSXAttribute(attr) &&
                    t.isJSXIdentifier(attr.name, { name: 'src' }) &&
                    t.isStringLiteral(attr.value, { value: WEBLAB_PRELOAD_SCRIPT_SRC }),
            ),
    );
    if (!alreadyInjected) {
        node.children.push(t.jsxText('\n'));
        node.children.push(getPreloadScript());
        node.children.push(t.jsxText('\n'));
    }
}

function createBodyTag(htmlElement: T.JSXElement): void {
    const body = t.jsxElement(
        t.jsxOpeningElement(t.jsxIdentifier('body'), []),
        t.jsxClosingElement(t.jsxIdentifier('body')),
        [getPreloadScript()],
        false,
    );
    htmlElement.children.push(t.jsxText('\n'), body, t.jsxText('\n'));
}

function wrapWithHtmlAndBody(ast: T.File): void {
    traverse(ast, {
        ArrowFunctionExpression(path) {
            const { body } = path.node;
            if (!t.isJSXElement(body) && !t.isJSXFragment(body)) {
                return;
            }

            const children: Array<
                T.JSXElement | T.JSXFragment | T.JSXText | T.JSXExpressionContainer
            > = [getPreloadScript(), t.jsxText('\n'), body];

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
            if (!arg) return;

            const children: Array<
                T.JSXElement | T.JSXFragment | T.JSXText | T.JSXExpressionContainer
            > = [getPreloadScript(), t.jsxText('\n')];

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

export function removeDeprecatedPreloadScripts(ast: T.File): void {
    traverse(ast, {
        JSXElement(path) {
            const isScript = t.isJSXIdentifier(path.node.openingElement.name, { name: 'Script' });
            if (!isScript) return;

            const srcAttr = path.node.openingElement.attributes.find(
                (attr) =>
                    t.isJSXAttribute(attr) &&
                    t.isJSXIdentifier(attr.name, { name: 'src' }) &&
                    t.isStringLiteral(attr.value),
            ) as T.JSXAttribute | undefined;

            const src = srcAttr?.value;
            if (
                src &&
                t.isStringLiteral(src) &&
                DEPRECATED_PRELOAD_SCRIPT_SRCS.some((deprecatedSrc) => src.value === deprecatedSrc)
            ) {
                console.log('removing deprecated script', src.value);
                path.remove();
            }
        },
    });
}

// Strip every weblab preload <Script src=WEBLAB_PRELOAD_SCRIPT_SRC> tag from
// the AST. Used when we detect more than one already injected (which would
// load the bundle twice in the iframe and trigger duplicate top-level
// identifier errors). The caller re-injects a single fresh tag afterwards.
export function removeAllPreloadScripts(ast: T.File): void {
    traverse(ast, {
        JSXElement(path) {
            const isScript = t.isJSXIdentifier(path.node.openingElement.name, { name: 'Script' });
            if (!isScript) return;

            const srcAttr = path.node.openingElement.attributes.find(
                (attr) =>
                    t.isJSXAttribute(attr) &&
                    t.isJSXIdentifier(attr.name, { name: 'src' }) &&
                    t.isStringLiteral(attr.value),
            ) as T.JSXAttribute | undefined;

            const src = srcAttr?.value;
            if (src && t.isStringLiteral(src) && src.value === WEBLAB_PRELOAD_SCRIPT_SRC) {
                path.remove();
            }
        },
    });
}

// ============================================================================
// IX runtime injection (mirrors preload injection above — second sibling
// `<Script>` tag loads `@weblab/web-preload/ix-runtime`, attaches a
// `data-interactions-src` attribute so the runtime knows where to fetch its
// config JSON, and rides the same Next.js / static-HTML body-finding
// traversal.)
// ============================================================================

function getIxRuntimeScript(): T.JSXElement {
    return t.jsxElement(
        t.jsxOpeningElement(
            t.jsxIdentifier('Script'),
            [
                t.jsxAttribute(t.jsxIdentifier('src'), t.stringLiteral(WEBLAB_IX_RUNTIME_SRC)),
                t.jsxAttribute(t.jsxIdentifier('strategy'), t.stringLiteral('afterInteractive')),
                t.jsxAttribute(t.jsxIdentifier('type'), t.stringLiteral('module')),
                t.jsxAttribute(t.jsxIdentifier('id'), t.stringLiteral(IX_RUNTIME_SCRIPT_ID)),
                t.jsxAttribute(
                    t.jsxIdentifier('data-interactions-src'),
                    t.stringLiteral(WEBLAB_INTERACTIONS_PUBLIC_SRC),
                ),
            ],
            false,
        ),
        t.jsxClosingElement(t.jsxIdentifier('Script')),
        [],
        false,
    );
}

function addIxRuntimeScriptToJSXElement(node: T.JSXElement): void {
    const alreadyInjected = node.children.some(
        (child) =>
            t.isJSXElement(child) &&
            t.isJSXIdentifier(child.openingElement.name, { name: 'Script' }) &&
            child.openingElement.attributes.some(
                (attr) =>
                    t.isJSXAttribute(attr) &&
                    t.isJSXIdentifier(attr.name, { name: 'src' }) &&
                    t.isStringLiteral(attr.value, { value: WEBLAB_IX_RUNTIME_SRC }),
            ),
    );
    if (!alreadyInjected) {
        node.children.push(t.jsxText('\n'));
        node.children.push(getIxRuntimeScript());
        node.children.push(t.jsxText('\n'));
    }
}

export function injectIxRuntimeScript(ast: T.File): T.File {
    const hasScriptImport = isScriptImported(ast);
    if (!hasScriptImport) addScriptImport(ast);

    const { scriptCount, deprecatedScriptCount, injectedCorrectly } = scanForIxRuntimeScript(ast);

    if (scriptCount === 1 && deprecatedScriptCount === 0 && injectedCorrectly) {
        return ast;
    }

    if (scriptCount > 1) {
        removeAllIxRuntimeScripts(ast);
    }

    removeDeprecatedIxRuntimeScripts(ast);

    let scriptInjected = false;

    traverse(ast, {
        JSXElement(path) {
            const name = path.node.openingElement.name;
            if (!t.isJSXIdentifier(name)) return;

            if (name.name === 'body' && !scriptInjected) {
                addIxRuntimeScriptToJSXElement(path.node);
                scriptInjected = true;
            }
        },
    });

    // If no <body> exists yet, the preload injection step will create one and
    // its handler appends the preload tag. The IX runtime tag is added as a
    // sibling on the next pass after the body exists — the orchestrator
    // re-runs both injections in sequence to converge.

    return ast;
}

export function scanForIxRuntimeScript(ast: T.File): {
    scriptCount: number;
    deprecatedScriptCount: number;
    injectedCorrectly: boolean;
} {
    let scriptCount = 0;
    let deprecatedScriptCount = 0;
    let injectedCorrectly = false;

    traverse(ast, {
        JSXElement(path) {
            const isScript = t.isJSXIdentifier(path.node.openingElement.name, { name: 'Script' });
            if (!isScript) return;

            const srcAttr = path.node.openingElement.attributes.find(
                (attr) =>
                    t.isJSXAttribute(attr) &&
                    t.isJSXIdentifier(attr.name, { name: 'src' }) &&
                    t.isStringLiteral(attr.value),
            ) as T.JSXAttribute | undefined;

            const src = srcAttr?.value;
            if (!src || !t.isStringLiteral(src)) return;
            if (src.value === WEBLAB_IX_RUNTIME_SRC) {
                scriptCount++;
                const parentBodyPath = path.findParent((parentPath) => {
                    if (parentPath.isJSXElement()) {
                        const name = parentPath.node.openingElement.name;
                        return t.isJSXIdentifier(name, { name: 'body' });
                    }
                    return false;
                });
                if (parentBodyPath) {
                    injectedCorrectly = true;
                }
            } else if (
                DEPRECATED_IX_RUNTIME_SRCS.some((deprecatedSrc) => src.value === deprecatedSrc)
            ) {
                deprecatedScriptCount++;
            }
        },
    });

    return {
        scriptCount,
        deprecatedScriptCount,
        injectedCorrectly: scriptCount === 1 && injectedCorrectly,
    };
}

export function removeAllIxRuntimeScripts(ast: T.File): void {
    traverse(ast, {
        JSXElement(path) {
            const isScript = t.isJSXIdentifier(path.node.openingElement.name, { name: 'Script' });
            if (!isScript) return;

            const srcAttr = path.node.openingElement.attributes.find(
                (attr) =>
                    t.isJSXAttribute(attr) &&
                    t.isJSXIdentifier(attr.name, { name: 'src' }) &&
                    t.isStringLiteral(attr.value),
            ) as T.JSXAttribute | undefined;

            const src = srcAttr?.value;
            if (src && t.isStringLiteral(src) && src.value === WEBLAB_IX_RUNTIME_SRC) {
                path.remove();
            }
        },
    });
}

export function removeDeprecatedIxRuntimeScripts(ast: T.File): void {
    if (DEPRECATED_IX_RUNTIME_SRCS.length === 0) return;
    traverse(ast, {
        JSXElement(path) {
            const isScript = t.isJSXIdentifier(path.node.openingElement.name, { name: 'Script' });
            if (!isScript) return;

            const srcAttr = path.node.openingElement.attributes.find(
                (attr) =>
                    t.isJSXAttribute(attr) &&
                    t.isJSXIdentifier(attr.name, { name: 'src' }) &&
                    t.isStringLiteral(attr.value),
            ) as T.JSXAttribute | undefined;

            const src = srcAttr?.value;
            if (
                src &&
                t.isStringLiteral(src) &&
                DEPRECATED_IX_RUNTIME_SRCS.some((deprecatedSrc) => src.value === deprecatedSrc)
            ) {
                path.remove();
            }
        },
    });
}

/**
 * One-call orchestrator. Inject the preload script first (creates `<html>` /
 * `<body>` if missing), then inject the IX runtime as a sibling inside the
 * resulting `<body>`. Idempotent: re-running on an already-injected layout
 * is a no-op modulo dedup of accidental duplicates.
 */
export function injectWeblabBootstrapScripts(ast: T.File): T.File {
    injectPreloadScript(ast);
    injectIxRuntimeScript(ast);
    return ast;
}

export function scanForPreloadScript(ast: T.File): {
    scriptCount: number;
    deprecatedScriptCount: number;
    injectedCorrectly: boolean;
} {
    let scriptCount = 0;
    let deprecatedScriptCount = 0;
    let injectedCorrectly = false;

    traverse(ast, {
        JSXElement(path) {
            const isScript = t.isJSXIdentifier(path.node.openingElement.name, { name: 'Script' });
            if (!isScript) return;

            const srcAttr = path.node.openingElement.attributes.find(
                (attr) =>
                    t.isJSXAttribute(attr) &&
                    t.isJSXIdentifier(attr.name, { name: 'src' }) &&
                    t.isStringLiteral(attr.value),
            ) as T.JSXAttribute | undefined;

            const src = srcAttr?.value;
            if (!src || !t.isStringLiteral(src)) return;
            if (src.value === WEBLAB_PRELOAD_SCRIPT_SRC) {
                scriptCount++;
                // Check if this script is inside a body tag
                const parentBodyPath = path.findParent((parentPath) => {
                    if (parentPath.isJSXElement()) {
                        const name = parentPath.node.openingElement.name;
                        return t.isJSXIdentifier(name, { name: 'body' });
                    }
                    return false;
                });

                if (parentBodyPath) {
                    injectedCorrectly = true;
                }
            } else if (
                DEPRECATED_PRELOAD_SCRIPT_SRCS.some((deprecatedSrc) => src.value === deprecatedSrc)
            ) {
                deprecatedScriptCount++;
            }
        },
    });

    return {
        scriptCount,
        deprecatedScriptCount,
        injectedCorrectly: scriptCount === 1 && injectedCorrectly,
    };
}
