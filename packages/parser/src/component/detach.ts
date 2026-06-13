import type { ComponentDef } from '@weblab/models';

import type { NodePath, T } from '../packages';
import { getOidFromJsxElement } from '../code-edit/helpers';
import { t, traverse } from '../packages';
import { getAstFromContent } from '../parse';
import { EditorAttributes } from '@weblab/constants';

/** className-merge helpers whose args are concatenated when inlining. */
const CLASS_HELPER_NAMES = new Set(['cn', 'clsx', 'classnames', 'cx', 'twMerge', 'tw', 'classNames']);

/**
 * Unlink instance: inlines the master's JSX at the call site, substituting
 * prop identifiers with the instance's values (or defaults), resolving the
 * variant to concrete classes, and splicing `children`. Webflow semantics:
 * props → static content, variants → styles, slots → elements. The detached
 * copy stops receiving master updates.
 */

export interface DetachParams {
    instanceOid: string;
    def: ComponentDef;
    masterContent: string;
}

export type DetachResult = { ok: true; removedImport: boolean } | { ok: false; error: string };

export function detachInstance(pageAst: T.File, params: DetachParams): DetachResult {
    const { instanceOid, def, masterContent } = params;

    // 1. Locate the usage element in the page.
    let usagePath: NodePath<T.JSXElement> | null = null;
    traverse(pageAst, {
        JSXElement(path) {
            if (getOidFromJsxElement(path.node.openingElement) === instanceOid) {
                usagePath = path;
                path.stop();
            }
        },
    });
    if (!usagePath) return { ok: false, error: 'Instance not found in page' };
    const usage = usagePath as NodePath<T.JSXElement>;

    // 2. Resolve the master root JSX.
    const masterAst = getAstFromContent(masterContent);
    if (!masterAst) return { ok: false, error: 'Cannot parse the component file' };
    const rootJsx = findComponentRootJsx(masterAst.program, def.name);
    if (!rootJsx) return { ok: false, error: `Cannot find ${def.name}'s root element` };

    // 3. Collect instance prop values + children.
    const values = readUsageValues(usage.node);
    const instanceChildren = usage.node.children;

    // Block detach when an unsupported prop has neither an instance literal
    // nor a serializable default — inlining would produce broken refs.
    for (const prop of def.props) {
        if (prop.type === 'slot') continue;
        const hasValue = values[prop.name] !== undefined || prop.defaultValue != null;
        if (!prop.editable && prop.type === 'unsupported' && !hasValue) {
            return {
                ok: false,
                error: `Prop "${prop.name}" has a complex type and no static value — detach is not safe`,
            };
        }
    }

    const propValue = (name: string): string | number | boolean | null => {
        const explicit = values[name];
        if (explicit !== undefined) return explicit;
        const spec = def.props.find((p) => p.name === name);
        return spec?.defaultValue ?? null;
    };

    // 4. Clone + substitute. Master oids are stripped BEFORE splicing the
    // instance children so slot content keeps its page-native oids
    // (selection continuity, interactions). Unresolvable dynamic expressions
    // abort the detach — emitting code that references master-scope
    // identifiers (cn, variant maps, props) would crash the page.
    const clone = t.cloneNode(rootJsx, true, false);
    stripAllOids(clone);
    const substitution = substituteProps(clone, def, propValue, instanceChildren);
    if (!substitution.ok) {
        return { ok: false, error: substitution.error };
    }

    // Carry the instance's oid onto the inlined root so selection survives.
    clone.openingElement.attributes.push(
        t.jsxAttribute(
            t.jsxIdentifier(EditorAttributes.DATA_WEBLAB_ID),
            t.stringLiteral(instanceOid),
        ),
    );

    usage.replaceWith(clone);

    // 5. Drop the import when this was the last usage in the page.
    let remainingUsages = 0;
    traverse(pageAst, {
        JSXOpeningElement(path) {
            if (t.isJSXIdentifier(path.node.name) && path.node.name.name === def.name) {
                remainingUsages++;
            }
        },
    });
    let removedImport = false;
    if (remainingUsages === 0) {
        for (const stmt of pageAst.program.body) {
            if (!t.isImportDeclaration(stmt)) continue;
            const before = stmt.specifiers.length;
            stmt.specifiers = stmt.specifiers.filter((s) => s.local.name !== def.name);
            if (stmt.specifiers.length !== before) removedImport = true;
        }
        pageAst.program.body = pageAst.program.body.filter(
            (stmt) => !(t.isImportDeclaration(stmt) && stmt.specifiers.length === 0),
        );
    }

    return { ok: true, removedImport };
}

function findComponentRootJsx(program: T.Program, componentName: string): T.JSXElement | null {
    let result: T.JSXElement | null = null;

    const fromFn = (
        fn: T.FunctionDeclaration | T.FunctionExpression | T.ArrowFunctionExpression,
    ): T.JSXElement | null => {
        if (t.isArrowFunctionExpression(fn) && t.isJSXElement(fn.body)) return fn.body;
        const body = t.isBlockStatement(fn.body) ? fn.body : null;
        if (!body) return null;
        for (const stmt of body.body) {
            if (t.isReturnStatement(stmt) && stmt.argument && t.isJSXElement(stmt.argument)) {
                return stmt.argument;
            }
        }
        return null;
    };

    for (const stmt of program.body) {
        const decl = t.isExportNamedDeclaration(stmt) && stmt.declaration ? stmt.declaration : stmt;
        if (t.isFunctionDeclaration(decl) && decl.id?.name === componentName) {
            result = fromFn(decl);
        } else if (t.isVariableDeclaration(decl)) {
            for (const declarator of decl.declarations) {
                if (
                    t.isIdentifier(declarator.id) &&
                    declarator.id.name === componentName &&
                    (t.isArrowFunctionExpression(declarator.init) ||
                        t.isFunctionExpression(declarator.init))
                ) {
                    result = fromFn(declarator.init);
                }
            }
        }
        if (result) break;
    }
    return result;
}

function readUsageValues(
    usage: T.JSXElement,
): Record<string, string | number | boolean | null> {
    const values: Record<string, string | number | boolean | null> = {};
    for (const attr of usage.openingElement.attributes) {
        if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) continue;
        const name = attr.name.name;
        if (name.startsWith('data-')) continue;
        if (attr.value == null) values[name] = true;
        else if (t.isStringLiteral(attr.value)) values[name] = attr.value.value;
        else if (t.isJSXExpressionContainer(attr.value)) {
            const expr = attr.value.expression;
            if (t.isStringLiteral(expr)) values[name] = expr.value;
            else if (t.isNumericLiteral(expr)) values[name] = expr.value;
            else if (t.isBooleanLiteral(expr)) values[name] = expr.value;
        }
    }
    return values;
}

function substituteProps(
    root: T.JSXElement,
    def: ComponentDef,
    propValue: (name: string) => string | number | boolean | null,
    instanceChildren: T.JSXElement['children'],
): { ok: true } | { ok: false; error: string } {
    const propNames = new Set(def.props.map((p) => p.name));
    const variant = def.variants;
    /** Dynamic expressions that survive substitution would reference
     *  master-scope identifiers from the page — collect and abort. */
    const unresolved: string[] = [];
    /** Slot children may be spliced at multiple render sites; clone after
     *  the first splice so the AST never aliases the same nodes. */
    let childrenSpliced = false;
    const spliceChildren = (): T.JSXElement['children'] =>
        childrenSpliced
            ? instanceChildren.map((c) => t.cloneNode(c, true, false))
            : ((childrenSpliced = true), instanceChildren);

    const isPropIdentifier = (expr: T.Node | null | undefined): string | null => {
        if (expr && t.isIdentifier(expr) && propNames.has(expr.name)) return expr.name;
        if (
            expr &&
            t.isMemberExpression(expr) &&
            t.isIdentifier(expr.object) &&
            expr.object.name === 'props' &&
            t.isIdentifier(expr.property) &&
            propNames.has(expr.property.name)
        ) {
            return expr.property.name;
        }
        return null;
    };

    const variantClasses = (): string => {
        if (!variant) return '';
        const chosen = String(propValue(variant.propName) ?? variant.defaultVariant);
        return variant.variants[chosen] ?? '';
    };

    /** Resolves one className part to a literal string, or null. */
    const resolvePart = (part: T.Node): string | null => {
        if (t.isStringLiteral(part)) return part.value;
        // map[variant] / map['x'] / cvaMap({ variant })
        if (
            variant &&
            t.isMemberExpression(part) &&
            t.isIdentifier(part.object) &&
            part.object.name === variant.mapName
        ) {
            return variantClasses();
        }
        if (
            variant &&
            t.isCallExpression(part) &&
            t.isIdentifier(part.callee) &&
            part.callee.name === variant.mapName
        ) {
            return variantClasses();
        }
        // `${'a'} ${map[variant] ?? ''}` — the generated template form.
        if (t.isTemplateLiteral(part)) {
            let out = '';
            for (let i = 0; i < part.quasis.length; i++) {
                out += part.quasis[i]?.value.cooked ?? '';
                const expr = part.expressions[i];
                if (expr) {
                    const resolved = resolvePart(expr as T.Node);
                    if (resolved === null) return null;
                    out += resolved;
                }
            }
            return out;
        }
        // x ?? 'fallback'
        if (t.isLogicalExpression(part) && part.operator === '??') {
            const left = resolvePart(part.left);
            if (left !== null) return left;
            return resolvePart(part.right);
        }
        // cond && 'x' where cond is a prop
        if (t.isLogicalExpression(part) && part.operator === '&&') {
            const guard = isPropIdentifier(part.left);
            if (guard) {
                if (!propValue(guard)) return '';
                return resolvePart(part.right);
            }
            return null;
        }
        // className passthrough props resolve to their (string) value.
        const propName = isPropIdentifier(part);
        if (propName) {
            const value = propValue(propName);
            return value == null ? '' : String(value);
        }
        // Class-merge helpers only — cn / clsx / classnames / cx / twMerge / tw.
        // An UNKNOWN call (e.g. getTheme(), useClasses()) returns null → abort,
        // rather than silently resolving to '' and dropping its runtime classes.
        if (t.isCallExpression(part)) {
            const calleeName = t.isIdentifier(part.callee)
                ? part.callee.name
                : t.isMemberExpression(part.callee) && t.isIdentifier(part.callee.property)
                  ? part.callee.property.name
                  : null;
            if (!calleeName || !CLASS_HELPER_NAMES.has(calleeName)) {
                return null;
            }
            const parts: string[] = [];
            for (const arg of part.arguments) {
                const resolved = resolvePart(arg as T.Node);
                if (resolved === null) return null;
                if (resolved) parts.push(resolved);
            }
            return parts.join(' ').replace(/\s+/g, ' ').trim();
        }
        return null;
    };

    type JsxParent = T.JSXElement | T.JSXFragment;

    const visit = (el: JsxParent): void => {
        if (t.isJSXElement(el)) {
            // Attributes: attr={prop} → attr="value"; className → merged literal.
            for (const attr of el.openingElement.attributes) {
                if (!t.isJSXAttribute(attr) || !attr.value) continue;
                if (!t.isJSXExpressionContainer(attr.value)) continue;
                const expr = attr.value.expression;
                if (t.isJSXEmptyExpression(expr)) continue;

                if (attr.name.name === 'className') {
                    if (t.isStringLiteral(expr)) {
                        attr.value = t.stringLiteral(expr.value);
                        continue;
                    }
                    const resolved = resolvePart(expr);
                    if (resolved !== null) {
                        attr.value = t.stringLiteral(resolved);
                    } else {
                        unresolved.push('className');
                    }
                    continue;
                }

                const propName = isPropIdentifier(expr);
                if (propName) {
                    const value = propValue(propName);
                    if (typeof value === 'string') attr.value = t.stringLiteral(value);
                    else if (typeof value === 'number') {
                        attr.value = t.jsxExpressionContainer(t.numericLiteral(value));
                    } else if (typeof value === 'boolean') {
                        attr.value = t.jsxExpressionContainer(t.booleanLiteral(value));
                    } else {
                        unresolved.push(propName);
                    }
                }
            }
        }

        // Children: {prop} → text; {prop && el} → keep/remove; {children} → splice.
        const nextChildren: JsxParent['children'] = [];
        for (const child of el.children) {
            if (t.isJSXExpressionContainer(child)) {
                const expr = child.expression;
                const propName = isPropIdentifier(expr);
                if (
                    propName === 'children' ||
                    (propName && def.slots.some((s) => s.name === propName))
                ) {
                    nextChildren.push(...spliceChildren());
                    continue;
                }
                if (propName) {
                    const value = propValue(propName);
                    if (value != null) {
                        nextChildren.push(t.jsxText(String(value)));
                        continue;
                    }
                    continue; // null → drop the expression
                }
                if (t.isLogicalExpression(expr) && expr.operator === '&&') {
                    const guard = isPropIdentifier(expr.left);
                    if (guard && t.isJSXElement(expr.right)) {
                        if (propValue(guard)) {
                            visit(expr.right);
                            nextChildren.push(expr.right);
                        }
                        continue;
                    }
                }
                if (!t.isJSXEmptyExpression(expr) && !t.isStringLiteral(expr)) {
                    // Any other expression references master scope.
                    unresolved.push('expression');
                }
            }
            if (t.isJSXElement(child) || t.isJSXFragment(child)) visit(child);
            nextChildren.push(child);
        }
        el.children = nextChildren;
    };

    visit(root);

    if (unresolved.length > 0) {
        return {
            ok: false,
            error: `The component uses dynamic ${[...new Set(unresolved)].join(', ')} that can't be inlined — unlink is not safe for this component`,
        };
    }
    return { ok: true };
}

function stripAllOids(root: T.JSXElement): void {
    const strip = (el: T.JSXElement | T.JSXFragment) => {
        if (t.isJSXElement(el)) {
            el.openingElement.attributes = el.openingElement.attributes.filter(
                (attr) =>
                    !(
                        t.isJSXAttribute(attr) &&
                        typeof attr.name.name === 'string' &&
                        (attr.name.name === EditorAttributes.DATA_WEBLAB_ID ||
                            attr.name.name === 'data-oid' ||
                            attr.name.name === 'data-onlook-id')
                    ),
            );
        }
        for (const child of el.children) {
            if (t.isJSXElement(child) || t.isJSXFragment(child)) strip(child);
        }
    };
    strip(root);
}
