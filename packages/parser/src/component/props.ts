import type { T } from '../packages';
import { getOidFromJsxElement } from '../code-edit/helpers';
import { t, traverse } from '../packages';
import { getAstFromContent } from '../parse';

/**
 * Codegen for component properties.
 *
 * `createPropFromElement` rewires an element inside a master component to a
 * new prop (with the current literal as the default), updating the function
 * signature and same-file TS types. Per-instance values are plain JSX
 * attributes written at the usage site via the existing transform pipeline.
 */

export type CreatablePropKind = 'text' | 'image' | 'link' | 'switch' | 'number';

export interface CreatePropParams {
    componentName: string;
    /** Oid of the element inside the master to bind. */
    elementOid: string;
    propName: string;
    kind: CreatablePropKind;
}

export interface CreatePropResult {
    modified: boolean;
    defaultValue: string | number | boolean | null;
    error?: string;
}

const ATTR_FOR_KIND: Partial<Record<CreatablePropKind, string>> = {
    image: 'src',
    link: 'href',
};

function isValidPropName(name: string): boolean {
    return /^[a-z][A-Za-z0-9]*$/.test(name) && name !== 'children' && name !== 'key';
}

interface ComponentFn {
    fn: T.FunctionDeclaration | T.FunctionExpression | T.ArrowFunctionExpression;
}

const HOC_NAMES = new Set(['memo', 'forwardRef', 'observer']);

function unwrapHoc(node: T.Node | null | undefined): T.Node | null {
    if (!node) return null;
    if (t.isCallExpression(node)) {
        const callee = node.callee;
        const name = t.isIdentifier(callee)
            ? callee.name
            : t.isMemberExpression(callee) && t.isIdentifier(callee.property)
              ? callee.property.name
              : null;
        if (name && HOC_NAMES.has(name) && node.arguments.length > 0) {
            return node.arguments[0] as T.Node;
        }
    }
    return node;
}

/** Finds the function implementing `componentName` at module scope. */
function findComponentFunction(program: T.Program, componentName: string): ComponentFn | null {
    const fromNode = (node: T.Node | null | undefined): ComponentFn | null => {
        const unwrapped = unwrapHoc(node);
        if (
            unwrapped &&
            (t.isFunctionDeclaration(unwrapped) ||
                t.isFunctionExpression(unwrapped) ||
                t.isArrowFunctionExpression(unwrapped))
        ) {
            return { fn: unwrapped };
        }
        return null;
    };

    const visit = (stmt: T.Statement): ComponentFn | null => {
        if (t.isFunctionDeclaration(stmt) && stmt.id?.name === componentName) {
            return fromNode(stmt);
        }
        if (t.isVariableDeclaration(stmt)) {
            for (const decl of stmt.declarations) {
                if (t.isIdentifier(decl.id) && decl.id.name === componentName && decl.init) {
                    return fromNode(decl.init);
                }
            }
        }
        return null;
    };

    for (const stmt of program.body) {
        const direct = visit(stmt);
        if (direct) return direct;
        if (t.isExportNamedDeclaration(stmt) && stmt.declaration) {
            const exported = visit(stmt.declaration);
            if (exported) return exported;
        }
        if (t.isExportDefaultDeclaration(stmt)) {
            const decl = stmt.declaration;
            if (t.isFunctionDeclaration(decl) && decl.id?.name === componentName) {
                return fromNode(decl);
            }
        }
    }
    return null;
}

function literalValueOfAttr(attr: T.JSXAttribute): string | null {
    if (t.isStringLiteral(attr.value)) return attr.value.value;
    if (
        t.isJSXExpressionContainer(attr.value) &&
        t.isStringLiteral(attr.value.expression)
    ) {
        return attr.value.expression.value;
    }
    return null;
}

/** Concatenated static text of an element's children. */
function staticTextOfChildren(node: T.JSXElement): string | null {
    let text = '';
    for (const child of node.children) {
        if (t.isJSXText(child)) {
            text += child.value;
        } else if (t.isJSXExpressionContainer(child) && t.isStringLiteral(child.expression)) {
            text += child.expression.value;
        } else {
            return null;
        }
    }
    const trimmed = text.replace(/\s+/g, ' ').trim();
    return trimmed.length > 0 ? trimmed : null;
}

function tsTypeForKind(kind: CreatablePropKind): T.TSType {
    switch (kind) {
        case 'number':
            return t.tsNumberKeyword();
        case 'switch':
            return t.tsBooleanKeyword();
        default:
            return t.tsStringKeyword();
    }
}

function defaultLiteral(value: string | number | boolean): T.Expression {
    if (typeof value === 'number') return t.numericLiteral(value);
    if (typeof value === 'boolean') return t.booleanLiteral(value);
    return t.stringLiteral(value);
}

/**
 * Adds `propName` (optional, with default) to the component signature:
 * - destructured object pattern → `propName = <default>` entry
 * - plain `props` identifier → returns the member-expression flavor
 * - no params → creates a destructured param
 * Also extends a same-file interface / inline type literal when present.
 */
function addPropToSignature(
    program: T.Program,
    fn: ComponentFn['fn'],
    propName: string,
    kind: CreatablePropKind,
    defaultValue: string | number | boolean,
): { propExpr: T.Expression } | { error: string } {
    let param = fn.params[0];

    if (!param) {
        const pattern = t.objectPattern([]);
        fn.params.push(pattern);
        param = pattern;
    }

    // Extend the TS annotation when resolvable.
    const annotation =
        'typeAnnotation' in param && param.typeAnnotation && t.isTSTypeAnnotation(param.typeAnnotation)
            ? param.typeAnnotation.typeAnnotation
            : null;
    if (annotation) {
        const member = t.tsPropertySignature(
            t.identifier(propName),
            t.tsTypeAnnotation(tsTypeForKind(kind)),
        );
        member.optional = true;

        if (t.isTSTypeLiteral(annotation)) {
            annotation.members.push(member);
        } else if (t.isTSTypeReference(annotation) && t.isIdentifier(annotation.typeName)) {
            const typeName = annotation.typeName.name;
            for (const stmt of program.body) {
                const decl =
                    t.isExportNamedDeclaration(stmt) && stmt.declaration ? stmt.declaration : stmt;
                if (t.isTSInterfaceDeclaration(decl) && decl.id.name === typeName) {
                    decl.body.body.push(member);
                    break;
                }
                if (
                    t.isTSTypeAliasDeclaration(decl) &&
                    decl.id.name === typeName &&
                    t.isTSTypeLiteral(decl.typeAnnotation)
                ) {
                    decl.typeAnnotation.members.push(member);
                    break;
                }
            }
        }
    }

    if (t.isObjectPattern(param)) {
        const exists = param.properties.some(
            (p) => t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === propName,
        );
        if (exists) {
            return { error: `Prop "${propName}" already exists on the component` };
        }
        const prop = t.objectProperty(
            t.identifier(propName),
            t.assignmentPattern(t.identifier(propName), defaultLiteral(defaultValue)),
            false,
            false,
        );
        // Insert before a rest element so `{...rest}` stays last.
        const restIndex = param.properties.findIndex((p) => t.isRestElement(p));
        if (restIndex >= 0) {
            param.properties.splice(restIndex, 0, prop);
        } else {
            param.properties.push(prop);
        }
        return { propExpr: t.identifier(propName) };
    }

    if (t.isIdentifier(param)) {
        // Plain `props` param: reference via member expression; defaults live
        // in the annotation only (no destructuring to attach a default to).
        return {
            propExpr: t.memberExpression(t.identifier(param.name), t.identifier(propName)),
        };
    }

    return { error: 'Unsupported component signature for prop creation' };
}

/**
 * Rewires the target element to the new prop and updates the signature.
 * Mutates the AST in place; caller serializes + writes the file.
 */
export function createPropFromElement(ast: T.File, params: CreatePropParams): CreatePropResult {
    const { componentName, elementOid, propName, kind } = params;

    if (!isValidPropName(propName)) {
        return {
            modified: false,
            defaultValue: null,
            error: 'Property names must be camelCase identifiers (e.g. "title").',
        };
    }

    const component = findComponentFunction(ast.program, componentName);
    if (!component) {
        return {
            modified: false,
            defaultValue: null,
            error: `Component "${componentName}" not found in file`,
        };
    }

    // Locate the target element. Captured via a mutable holder because TS
    // doesn't track assignments made inside the traverse callback.
    const found: {
        target: T.JSXElement | null;
        parent: T.JSXElement | T.JSXFragment | null;
        index: number;
    } = { target: null, parent: null, index: -1 };
    traverse(ast, {
        JSXElement(path) {
            if (getOidFromJsxElement(path.node.openingElement) === elementOid) {
                found.target = path.node;
                const parent = path.parent;
                if (t.isJSXElement(parent) || t.isJSXFragment(parent)) {
                    found.parent = parent;
                    found.index = parent.children.indexOf(path.node);
                }
                path.stop();
            }
        },
    });
    const target = found.target;
    if (!target) {
        return {
            modified: false,
            defaultValue: null,
            error: 'Element not found in the component file',
        };
    }
    const targetEl: T.JSXElement = target;

    // Capture the default + apply the binding.
    let defaultValue: string | number | boolean | null = null;

    if (kind === 'text' || kind === 'number') {
        const text = staticTextOfChildren(targetEl);
        if (text == null) {
            return {
                modified: false,
                defaultValue: null,
                error: 'Only elements with static text can be connected to a text property',
            };
        }
        defaultValue = kind === 'number' ? Number(text) : text;
        if (kind === 'number' && Number.isNaN(defaultValue)) {
            return {
                modified: false,
                defaultValue: null,
                error: 'Element text is not a number',
            };
        }
    } else if (kind === 'image' || kind === 'link') {
        const attrName = ATTR_FOR_KIND[kind]!;
        const attr = targetEl.openingElement.attributes.find(
            (a): a is T.JSXAttribute => t.isJSXAttribute(a) && a.name.name === attrName,
        );
        const literal = attr ? literalValueOfAttr(attr) : null;
        if (!attr || literal == null) {
            return {
                modified: false,
                defaultValue: null,
                error: `Element has no static ${attrName} to connect`,
            };
        }
        defaultValue = literal;
    } else {
        // switch — element gets wrapped in `{prop && (...)}`, default true.
        defaultValue = true;
    }

    const signature = addPropToSignature(
        ast.program,
        component.fn,
        propName,
        kind,
        defaultValue,
    );
    if ('error' in signature) {
        return { modified: false, defaultValue: null, error: signature.error };
    }
    const { propExpr } = signature;

    if (kind === 'text' || kind === 'number') {
        targetEl.children = [t.jsxExpressionContainer(propExpr)];
        if (targetEl.openingElement.selfClosing) {
            targetEl.openingElement.selfClosing = false;
            targetEl.closingElement = t.jsxClosingElement(targetEl.openingElement.name);
        }
    } else if (kind === 'image' || kind === 'link') {
        const attrName = ATTR_FOR_KIND[kind]!;
        const attr = targetEl.openingElement.attributes.find(
            (a): a is T.JSXAttribute => t.isJSXAttribute(a) && a.name.name === attrName,
        )!;
        attr.value = t.jsxExpressionContainer(propExpr);
    } else {
        // switch: replace the element with {prop && <el/>} in its parent.
        if (!found.parent || found.index < 0) {
            return {
                modified: false,
                defaultValue: null,
                error: 'Visibility properties need a parent element to wrap the condition',
            };
        }
        const container = t.jsxExpressionContainer(
            t.logicalExpression('&&', propExpr, targetEl),
        );
        found.parent.children.splice(found.index, 1, container);
    }

    return { modified: true, defaultValue };
}

/**
 * Parses an instance usage snippet (`<Card title="…" count={3} featured />`)
 * into a record of statically-known prop values. Non-literal expressions are
 * reported as `{ raw: '<expr>' }`-style nulls so the UI can show "dynamic".
 */
export function parseInstancePropValues(
    code: string,
): Record<string, string | number | boolean | null> {
    const values: Record<string, string | number | boolean | null> = {};
    const ast = getAstFromContent(code);
    if (!ast) return values;

    let opening: T.JSXOpeningElement | null = null;
    traverse(ast, {
        JSXOpeningElement(path) {
            opening = path.node;
            path.stop();
        },
    });
    if (!opening) return values;

    for (const attr of (opening as T.JSXOpeningElement).attributes) {
        if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) continue;
        const name = attr.name.name;
        if (name.startsWith('data-')) continue;

        if (attr.value == null) {
            values[name] = true; // boolean shorthand
        } else if (t.isStringLiteral(attr.value)) {
            values[name] = attr.value.value;
        } else if (t.isJSXExpressionContainer(attr.value)) {
            const expr = attr.value.expression;
            if (t.isStringLiteral(expr)) values[name] = expr.value;
            else if (t.isNumericLiteral(expr)) values[name] = expr.value;
            else if (t.isBooleanLiteral(expr)) values[name] = expr.value;
            else if (
                t.isUnaryExpression(expr) &&
                expr.operator === '-' &&
                t.isNumericLiteral(expr.argument)
            ) {
                values[name] = -expr.argument.value;
            } else values[name] = null; // dynamic expression
        }
    }
    return values;
}
