import { customTwMerge } from '@weblab/utility';

import type { T } from '../packages';
import { t } from '../packages';
import { getAstFromContent } from '../parse';

export function addClassToNode(node: T.JSXElement, className: string): void {
    const openingElement = node.openingElement;
    const classNameAttr = openingElement.attributes.find(
        (attr) => t.isJSXAttribute(attr) && attr.name.name === 'className',
    ) as T.JSXAttribute | undefined;

    if (classNameAttr) {
        if (t.isStringLiteral(classNameAttr.value)) {
            classNameAttr.value.value = customTwMerge(classNameAttr.value.value, className);
        } else if (t.isJSXExpressionContainer(classNameAttr.value)) {
            const expr = classNameAttr.value.expression;
            if (t.isCallExpression(expr)) {
                // TODO(bug-hunt): this cn()/clsx() branch dedupes only on EXACT
                // string-arg match, so conflicting Tailwind utilities of the
                // same family (existing `p-2` + new `p-4`, or `text-sm` +
                // `text-lg`) both get appended and accumulate instead of the
                // later one winning. The static-string branch above avoids this
                // via customTwMerge; here it's bypassed because the classes are
                // call arguments. Fix: merge the new class against the existing
                // static string args through customTwMerge rather than a raw
                // exact-match `some()`.
                const alreadyPresent = expr.arguments.some(
                    (arg) => t.isStringLiteral(arg) && arg.value === className,
                );
                if (!alreadyPresent) {
                    expr.arguments.push(t.stringLiteral(className));
                }
            } else if (!t.isJSXEmptyExpression(expr)) {
                // Dynamic expressions cannot be statically deduplicated —
                // skip customTwMerge here since the value is only known at runtime.
                classNameAttr.value.expression = t.binaryExpression(
                    '+',
                    t.binaryExpression('+', expr as T.Expression, t.stringLiteral(' ')),
                    t.stringLiteral(className),
                );
            }
        }
    } else {
        insertAttribute(openingElement, 'className', className);
    }
}

export function replaceNodeClasses(node: T.JSXElement, className: string): void {
    const openingElement = node.openingElement;
    const classNameAttr = openingElement.attributes.find(
        (attr) => t.isJSXAttribute(attr) && attr.name.name === 'className',
    ) as T.JSXAttribute | undefined;

    if (classNameAttr) {
        classNameAttr.value = t.stringLiteral(className);
    } else {
        insertAttribute(openingElement, 'className', className);
    }
}

export function renameNodeTag(node: T.JSXElement, tagName: string): void {
    if (!t.isJSXIdentifier(node.openingElement.name)) {
        return;
    }

    node.openingElement.name.name = tagName;

    if (node.closingElement && t.isJSXIdentifier(node.closingElement.name)) {
        node.closingElement.name.name = tagName;
    }
}

function insertAttribute(element: T.JSXOpeningElement, attribute: string, className: string): void {
    const newClassNameAttr = t.jsxAttribute(t.jsxIdentifier(attribute), t.stringLiteral(className));
    element.attributes.push(newClassNameAttr);
}

/**
 * Sentinel values understood by {@link updateNodeProp} beyond plain literals:
 * - `{ __remove: true }` deletes the attribute (used when an instance prop is
 *   reset to the component default — usage sites stay clean).
 * - `{ __jsx: '<code>' }` writes the attribute as a JSX expression container
 *   parsed from the snippet (richtext / slot values).
 */
export interface RemovePropSentinel {
    __remove: true;
}
export interface JsxPropSentinel {
    __jsx: string;
}

function isRemoveSentinel(value: unknown): value is RemovePropSentinel {
    return (
        typeof value === 'object' &&
        value !== null &&
        (value as RemovePropSentinel).__remove === true
    );
}

function isJsxSentinel(value: unknown): value is JsxPropSentinel {
    return (
        typeof value === 'object' &&
        value !== null &&
        '__jsx' in value &&
        typeof (value as JsxPropSentinel).__jsx === 'string'
    );
}

function parseJsxAttrExpression(code: string): T.Expression | null {
    // Parse as an expression statement; accepts `<>…</>`, `<div/>`, literals.
    const ast = getAstFromContent(`(${code});`);
    const stmt = ast?.program.body[0];
    if (stmt && t.isExpressionStatement(stmt)) {
        return stmt.expression;
    }
    return null;
}

export function updateNodeProp(
    node: T.JSXElement,
    key: string,
    value: object | undefined | null,
): void {
    const openingElement = node.openingElement;
    const existingAttr = openingElement.attributes.find(
        (attr) => t.isJSXAttribute(attr) && attr.name.name === key,
    ) as T.JSXAttribute | undefined;

    if (value === undefined || value === null) {
        return;
    }

    if (isRemoveSentinel(value)) {
        if (existingAttr) {
            openingElement.attributes = openingElement.attributes.filter(
                (attr) => attr !== existingAttr,
            );
        }
        return;
    }

    if (isJsxSentinel(value)) {
        const expression = parseJsxAttrExpression(value.__jsx);
        if (!expression) {
            console.error(`updateNodeProp: failed to parse jsx value for "${key}"`);
            return;
        }
        const container = t.jsxExpressionContainer(expression);
        if (existingAttr) {
            existingAttr.value = container;
        } else {
            openingElement.attributes.push(t.jsxAttribute(t.jsxIdentifier(key), container));
        }
        return;
    }

    if (existingAttr) {
        if (typeof value === 'boolean') {
            existingAttr.value = t.jsxExpressionContainer(t.booleanLiteral(value));
        } else if (typeof value === 'string') {
            existingAttr.value = t.stringLiteral(value);
        } else if (typeof value === 'function') {
            existingAttr.value = t.jsxExpressionContainer(
                t.arrowFunctionExpression([], t.blockStatement([])),
            );
        } else if (typeof value === 'number') {
            existingAttr.value = t.jsxExpressionContainer(t.numericLiteral(value));
        } else {
            // Fallback: JSON.stringify prevents [object Object] from corrupting JSX output
            existingAttr.value = t.jsxExpressionContainer(t.stringLiteral(JSON.stringify(value)));
        }
    } else {
        let newAttr: T.JSXAttribute;
        if (typeof value === 'boolean') {
            newAttr = t.jsxAttribute(
                t.jsxIdentifier(key),
                t.jsxExpressionContainer(t.booleanLiteral(value)),
            );
        } else if (typeof value === 'string') {
            newAttr = t.jsxAttribute(t.jsxIdentifier(key), t.stringLiteral(value));
        } else if (typeof value === 'function') {
            newAttr = t.jsxAttribute(
                t.jsxIdentifier(key),
                t.jsxExpressionContainer(t.arrowFunctionExpression([], t.blockStatement([]))),
            );
        } else if (typeof value === 'number') {
            newAttr = t.jsxAttribute(
                t.jsxIdentifier(key),
                t.jsxExpressionContainer(t.numericLiteral(value)),
            );
        } else {
            // Fallback: JSON.stringify prevents [object Object] from corrupting JSX output
            newAttr = t.jsxAttribute(
                t.jsxIdentifier(key),
                t.jsxExpressionContainer(t.stringLiteral(JSON.stringify(value))),
            );
        }

        openingElement.attributes.push(newAttr);
    }
}
