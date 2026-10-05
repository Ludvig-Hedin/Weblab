import { customTwMerge } from '@weblab/utility';

import type { T } from '../packages';
import { t } from '../packages';
import { getAstFromContent } from '../parse';

/** Only a proven static class value can be edited from a rendered element. */
export function assertStaticClassName(node: T.JSXElement): void {
    const attributes = node.openingElement.attributes;
    const classAttributes = attributes.filter((attr): attr is T.JSXAttribute =>
        t.isJSXAttribute(attr) && attr.name.name === 'className');
    const attribute = classAttributes[0];
    const index = attribute ? attributes.indexOf(attribute) : -1;
    const expression = attribute && t.isJSXExpressionContainer(attribute.value)
        ? attribute.value.expression : null;
    const staticValue = !attribute || t.isStringLiteral(attribute.value) ||
        t.isStringLiteral(expression) ||
        (t.isTemplateLiteral(expression) && expression.expressions.length === 0 &&
            expression.quasis.every((part) => typeof part.value.cooked === 'string'));
    if (classAttributes.length > 1 || !staticValue ||
        attributes.some((attr, position) => t.isJSXSpreadAttribute(attr) && (index === -1 || position > index))) {
        throw new Error('Dynamic classes must be edited in code. Your source was not changed.');
    }
}

function staticClassValue(attribute: T.JSXAttribute): string {
    if (t.isStringLiteral(attribute.value)) return attribute.value.value;
    if (t.isJSXExpressionContainer(attribute.value)) {
        const expression = attribute.value.expression;
        if (t.isStringLiteral(expression)) return expression.value;
        if (t.isTemplateLiteral(expression) && expression.expressions.length === 0) {
            return expression.quasis.map((part) => part.value.cooked ?? '').join('');
        }
    }
    throw new Error('Dynamic classes must be edited in code. Your source was not changed.');
}

/** Split variants only outside arbitrary media/value brackets. */
function classVariant(token: string): { prefix: string; utility: string } {
    let depth = 0;
    let separator = -1;
    for (let i = 0; i < token.length; i++) {
        if (token[i] === '\\') { i++; continue; }
        if (token[i] === '[' || token[i] === '(') depth++;
        else if (token[i] === ']' || token[i] === ')') depth--;
        else if (token[i] === ':' && depth === 0) separator = i;
    }
    return { prefix: token.slice(0, separator + 1), utility: token.slice(separator + 1) };
}

export function removeMatchingClasses(
    className: string,
    removals: { prefix: string; probeClass: string }[],
): string {
    return className.split(/\s+/).filter((token) => {
        if (!token) return false;
        const { prefix, utility } = classVariant(token);
        // Important syntax changes priority, not the CSS property family.
        const plain = utility.replace(/^!|!$/g, '');
        return !removals.some((removal) => prefix === removal.prefix &&
            customTwMerge(plain, removal.probeClass).trim() === removal.probeClass.trim());
    }).join(' ');
}

export function removeClassesFromNode(
    node: T.JSXElement,
    removals: { prefix: string; probeClass: string }[],
    requireMatch = false,
): void {
    assertStaticClassName(node);
    const attribute = node.openingElement.attributes.find((attr): attr is T.JSXAttribute =>
        t.isJSXAttribute(attr) && attr.name.name === 'className');
    if (!attribute) {
        if (requireMatch) throw new Error('No matching source override could be reset safely.');
        return;
    }
    const original = staticClassValue(attribute);
    const next = removeMatchingClasses(original, removals);
    if (requireMatch && next.split(/\s+/).filter(Boolean).length === original.split(/\s+/).filter(Boolean).length) {
        throw new Error('No matching source override could be reset safely.');
    }
    attribute.value = t.isJSXExpressionContainer(attribute.value)
        ? t.jsxExpressionContainer(t.stringLiteral(next)) : t.stringLiteral(next);
}

export function addClassToNode(node: T.JSXElement, className: string): void {
    assertStaticClassName(node);
    const openingElement = node.openingElement;
    const classNameAttr = openingElement.attributes.find(
        (attr) => t.isJSXAttribute(attr) && attr.name.name === 'className',
    ) as T.JSXAttribute | undefined;

    if (classNameAttr) {
        const merged = customTwMerge(staticClassValue(classNameAttr), className);
        classNameAttr.value = t.isJSXExpressionContainer(classNameAttr.value)
            ? t.jsxExpressionContainer(t.stringLiteral(merged)) : t.stringLiteral(merged);
    } else {
        insertAttribute(openingElement, 'className', className);
    }
}

export function replaceNodeClasses(node: T.JSXElement, className: string): void {
    assertStaticClassName(node);
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
