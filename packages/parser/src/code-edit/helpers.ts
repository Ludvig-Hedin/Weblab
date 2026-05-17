import { nanoid } from 'nanoid/non-secure';

import { EditorAttributes } from '@weblab/constants';

import type { GeneratorOptions, T } from '../packages';
import { generate, t } from '../packages';

export function getOidFromJsxElement(element: T.JSXOpeningElement): string | null {
    const attribute = element.attributes.find(
        (attr): attr is T.JSXAttribute =>
            t.isJSXAttribute(attr) && attr.name.name === EditorAttributes.DATA_WEBLAB_ID,
    );

    if (!attribute?.value) {
        return null;
    }

    if (t.isStringLiteral(attribute.value)) {
        return attribute.value.value;
    }

    return null;
}

export function addParamToElement(
    element: T.JSXElement | T.JSXFragment,
    key: string,
    value: string,
    replace = false,
): void {
    if (!t.isJSXElement(element)) {
        console.error('addParamToElement: element is not a JSXElement', element);
        return;
    }
    const paramAttribute = t.jsxAttribute(t.jsxIdentifier(key), t.stringLiteral(value));
    const existingIndex = element.openingElement.attributes.findIndex(
        (attr) => t.isJSXAttribute(attr) && attr.name.name === key,
    );

    if (existingIndex !== -1 && !replace) {
        return;
    }

    // Replace existing param or add new one
    if (existingIndex !== -1) {
        element.openingElement.attributes.splice(existingIndex, 1, paramAttribute);
    } else {
        element.openingElement.attributes.push(paramAttribute);
    }
}

export function addKeyToElement(element: T.JSXElement | T.JSXFragment, replace = false): void {
    if (!t.isJSXElement(element)) {
        console.error('addKeyToElement: element is not a JSXElement', element);
        return;
    }

    const keyIndex = element.openingElement.attributes.findIndex(
        (attr) => t.isJSXAttribute(attr) && attr.name.name === 'key',
    );

    if (keyIndex !== -1 && !replace) {
        return;
    }

    const keyValue = EditorAttributes.WEBLAB_MOVE_KEY_PREFIX + nanoid(4);
    const keyAttribute = t.jsxAttribute(t.jsxIdentifier('key'), t.stringLiteral(keyValue));

    // Replace existing key or add new one
    if (keyIndex !== -1) {
        element.openingElement.attributes.splice(keyIndex, 1, keyAttribute);
    } else {
        element.openingElement.attributes.push(keyAttribute);
    }
}

export function getIxIdFromJsxElement(element: T.JSXOpeningElement): string | null {
    const attribute = element.attributes.find(
        (attr): attr is T.JSXAttribute =>
            t.isJSXAttribute(attr) && attr.name.name === EditorAttributes.DATA_WEBLAB_IX_ID,
    );

    if (!attribute?.value) {
        return null;
    }

    if (t.isStringLiteral(attribute.value)) {
        return attribute.value.value;
    }

    return null;
}

export function ensureIxIdOnElement(
    element: T.JSXElement | T.JSXFragment,
    ixId: string,
): void {
    if (!t.isJSXElement(element)) {
        return;
    }

    const attributes = element.openingElement.attributes;
    const existingIndex = attributes.findIndex(
        (attr) =>
            t.isJSXAttribute(attr) && attr.name.name === EditorAttributes.DATA_WEBLAB_IX_ID,
    );

    const newAttr = t.jsxAttribute(
        t.jsxIdentifier(EditorAttributes.DATA_WEBLAB_IX_ID),
        t.stringLiteral(ixId),
    );

    if (existingIndex !== -1) {
        attributes.splice(existingIndex, 1, newAttr);
    } else {
        attributes.push(newAttr);
    }
}

export function removeIxIdFromElement(element: T.JSXElement | T.JSXFragment): void {
    if (!t.isJSXElement(element)) {
        return;
    }

    const attributes = element.openingElement.attributes;
    for (let i = attributes.length - 1; i >= 0; i--) {
        const attr = attributes[i];
        if (
            attr &&
            t.isJSXAttribute(attr) &&
            attr.name.name === EditorAttributes.DATA_WEBLAB_IX_ID
        ) {
            attributes.splice(i, 1);
        }
    }
}

export const jsxFilter = (
    child: T.JSXElement | T.JSXExpressionContainer | T.JSXFragment | T.JSXSpreadChild | T.JSXText,
) => t.isJSXElement(child) || t.isJSXFragment(child);

export function generateCode(
    ast: T.File | T.JSXElement,
    options: GeneratorOptions,
    codeBlock: string,
): string {
    return generate(ast, options, codeBlock).code;
}
