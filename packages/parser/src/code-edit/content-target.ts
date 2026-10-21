import { EditorAttributes } from '@weblab/constants';

import type { T } from '../packages';
import { parse, t } from '../packages';
import { getRenderedJsxText } from './text';

export type ContentTextTarget =
    | { kind: 'component-literal'; exportName: string; oid: string }
    | { kind: 'data-leaf'; exportName: string; itemId: string; property: string };

export type ContentTextTargetErrorCode =
    | 'INVALID_SOURCE'
    | 'INVALID_TARGET'
    | 'INVALID_VALUE'
    | 'EXPORT_NOT_FOUND'
    | 'UNSUPPORTED_COMPONENT'
    | 'OID_NOT_FOUND'
    | 'DUPLICATE_OID'
    | 'UNSUPPORTED_ELEMENT'
    | 'NON_LITERAL_TEXT'
    | 'UNSUPPORTED_LIST'
    | 'DUPLICATE_ITEM_ID'
    | 'ITEM_NOT_FOUND'
    | 'PROPERTY_NOT_FOUND'
    | 'PREVIOUS_VALUE_MISMATCH';

export class ContentTextTargetError extends Error {
    constructor(public readonly code: ContentTextTargetErrorCode) {
        super(`CONTENT_TEXT_TARGET_${code}`);
        this.name = 'ContentTextTargetError';
    }
}

const MAX_SOURCE_BYTES = 750_000;
const MAX_TEXT_LENGTH = 5_000;
// eslint-disable-next-line no-control-regex -- Reject control bytes in untrusted source identities and values.
const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const identifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const nativeTags = new Set(
    'a abbr address article aside b blockquote caption cite code dd del details dfn div dl dt em figcaption figure footer h1 h2 h3 h4 h5 h6 header i kbd li main mark nav ol p pre q s samp section small span strong sub summary sup table tbody td th thead time tr u ul var'.split(
        ' ',
    ),
);

function fail(code: ContentTextTargetErrorCode): never {
    throw new ContentTextTargetError(code);
}

function checkSource(source: string): void {
    if (
        typeof source !== 'string' ||
        source.length > MAX_SOURCE_BYTES ||
        new TextEncoder().encode(source).byteLength > MAX_SOURCE_BYTES
    )
        fail('INVALID_SOURCE');
}

function checkText(value: string): void {
    if (typeof value !== 'string' || value.length > MAX_TEXT_LENGTH || controls.test(value))
        fail('INVALID_VALUE');
}

function parseSource(source: string): T.File {
    checkSource(source);
    try {
        return parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
    } catch {
        return fail('INVALID_SOURCE');
    }
}

function checkTarget(target: ContentTextTarget): void {
    if (
        !target ||
        typeof target.exportName !== 'string' ||
        !identifier.test(target.exportName) ||
        target.exportName.length > 160
    )
        fail('INVALID_TARGET');
    if (target.kind === 'component-literal') {
        if (typeof target.oid !== 'string' || !/^[A-Za-z0-9_.:-]{1,160}$/.test(target.oid))
            fail('INVALID_TARGET');
    } else if (target.kind === 'data-leaf') {
        if (
            typeof target.itemId !== 'string' ||
            !target.itemId.length ||
            target.itemId.length > 160 ||
            // eslint-disable-next-line no-control-regex -- Reject control bytes in untrusted source identities and values.
            /[\u0000-\u001f\u007f]/.test(target.itemId) ||
            typeof target.property !== 'string' ||
            !identifier.test(target.property) ||
            target.property.length > 160 ||
            ['id', '__proto__', 'prototype', 'constructor'].includes(target.property)
        )
            fail('INVALID_TARGET');
    } else fail('INVALID_TARGET');
}

interface TextRange {
    start: number;
    end: number;
    value: string;
    jsx: boolean;
}

function range(node: T.Node, value: string, jsx = false): TextRange {
    if (node.start == null || node.end == null) fail('INVALID_SOURCE');
    return { start: node.start, end: node.end, value, jsx };
}

function componentRange(
    ast: T.File,
    target: Extract<ContentTextTarget, { kind: 'component-literal' }>,
): TextRange {
    const exported = ast.program.body.filter(
        (node): node is T.ExportNamedDeclaration =>
            t.isExportNamedDeclaration(node) &&
            t.isFunctionDeclaration(node.declaration) &&
            node.declaration.id?.name === target.exportName,
    );
    if (exported.length !== 1) {
        const unsupported = ast.program.body.some(
            (node) =>
                t.isExportNamedDeclaration(node) &&
                t.isVariableDeclaration(node.declaration) &&
                node.declaration.declarations.some((declaration) =>
                    t.isIdentifier(declaration.id, { name: target.exportName }),
                ),
        );
        fail(unsupported ? 'UNSUPPORTED_COMPONENT' : 'EXPORT_NOT_FOUND');
    }
    const fn = exported[0]!.declaration;
    if (!t.isFunctionDeclaration(fn) || fn.async || fn.generator) fail('UNSUPPORTED_COMPONENT');
    const returns: T.ReturnStatement[] = [];
    t.traverseFast(fn.body, (node) => {
        if (t.isReturnStatement(node)) returns.push(node);
    });
    const returned = returns[0];
    if (
        returns.length !== 1 ||
        !returned ||
        !fn.body.body.includes(returned) ||
        !t.isJSXElement(returned.argument)
    )
        fail('UNSUPPORTED_COMPONENT');

    let selected: T.JSXElement | undefined;
    let matches = 0;
    t.traverseFast(ast, (node) => {
        if (!t.isJSXElement(node)) return;
        for (const attr of node.openingElement.attributes) {
            if (
                !t.isJSXAttribute(attr) ||
                !t.isJSXIdentifier(attr.name, { name: EditorAttributes.DATA_WEBLAB_ID })
            )
                continue;
            // Static expressions still collide with a literal target at runtime.
            const expression = t.isJSXExpressionContainer(attr.value)
                ? attr.value.expression
                : null;
            const value = t.isStringLiteral(attr.value)
                ? attr.value.value
                : t.isStringLiteral(expression)
                  ? expression.value
                  : t.isTemplateLiteral(expression) && expression.expressions.length === 0
                    ? expression.quasis[0]?.value.cooked
                    : null;
            if (value === target.oid) {
                matches++;
                if (t.isStringLiteral(attr.value)) selected = node;
            }
        }
    });
    if (matches > 1) fail('DUPLICATE_OID');
    if (!selected) fail('OID_NOT_FOUND');

    // Follow JSX children only. A callback, condition, fragment or expression is not a proven render path.
    const findPath = (node: T.JSXElement): T.JSXElement[] | null => {
        if (node === selected) return [node];
        for (const child of node.children) {
            if (!t.isJSXElement(child)) continue;
            const path = findPath(child);
            if (path) return [node, ...path];
        }
        return null;
    };
    const path = findPath(returned.argument);
    if (!path) fail('UNSUPPORTED_COMPONENT');
    for (const node of path) {
        if (
            !t.isJSXIdentifier(node.openingElement.name) ||
            !nativeTags.has(node.openingElement.name.name)
        )
            fail('UNSUPPORTED_ELEMENT');
        const names = new Set<string>();
        for (const attr of node.openingElement.attributes) {
            if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name))
                fail('UNSUPPORTED_ELEMENT');
            if (
                names.has(attr.name.name) ||
                ['children', 'dangerouslySetInnerHTML'].includes(attr.name.name)
            )
                fail('UNSUPPORTED_ELEMENT');
            names.add(attr.name.name);
        }
    }
    let value = '';
    for (const child of selected.children) {
        if (t.isJSXText(child)) value += getRenderedJsxText(child.value);
        else if (
            t.isJSXExpressionContainer(child) &&
            t.isStringLiteral(child.expression) &&
            !child.expression.leadingComments?.length &&
            !child.expression.trailingComments?.length
        )
            value += child.expression.value;
        else fail('NON_LITERAL_TEXT');
    }
    if (
        !selected.closingElement ||
        selected.openingElement.end == null ||
        selected.closingElement.start == null
    )
        fail('NON_LITERAL_TEXT');
    return {
        start: selected.openingElement.end,
        end: selected.closingElement.start,
        value,
        jsx: true,
    };
}

function dataRange(
    ast: T.File,
    target: Extract<ContentTextTarget, { kind: 'data-leaf' }>,
): TextRange {
    const declarations: T.VariableDeclarator[] = [];
    for (const node of ast.program.body) {
        if (!t.isExportNamedDeclaration(node) || !t.isVariableDeclaration(node.declaration))
            continue;
        for (const declaration of node.declaration.declarations) {
            if (!t.isIdentifier(declaration.id, { name: target.exportName })) continue;
            if (node.declaration.kind !== 'const') fail('UNSUPPORTED_LIST');
            declarations.push(declaration);
        }
    }
    if (declarations.length !== 1) fail('EXPORT_NOT_FOUND');
    const declaration = declarations[0]!;
    if (!t.isArrayExpression(declaration.init)) fail('UNSUPPORTED_LIST');
    // No local alias or mutation of the exported array. External consumers are pinned by the server.
    t.traverseFast(ast, (node) => {
        if (t.isIdentifier(node, { name: target.exportName }) && node !== declaration.id)
            fail('UNSUPPORTED_LIST');
    });
    const ids = new Set<string>();
    let selected: T.StringLiteral | undefined;
    let found = false;
    for (const item of declaration.init.elements) {
        if (!t.isObjectExpression(item)) fail('UNSUPPORTED_LIST');
        const properties = new Map<string, T.ObjectProperty>();
        for (const property of item.properties) {
            if (
                !t.isObjectProperty(property) ||
                property.computed ||
                property.shorthand ||
                (!t.isIdentifier(property.key) && !t.isStringLiteral(property.key))
            )
                fail('UNSUPPORTED_LIST');
            const key = t.isIdentifier(property.key) ? property.key.name : property.key.value;
            if (properties.has(key) || ['__proto__', 'prototype', 'constructor'].includes(key))
                fail('UNSUPPORTED_LIST');
            if (
                !t.isStringLiteral(property.value) &&
                !t.isNumericLiteral(property.value) &&
                !t.isBooleanLiteral(property.value) &&
                !t.isNullLiteral(property.value)
            )
                fail('UNSUPPORTED_LIST');
            properties.set(key, property);
        }
        const id = properties.get('id')?.value;
        if (
            !t.isStringLiteral(id) ||
            !id.value.length ||
            id.value.length > 160 ||
            // eslint-disable-next-line no-control-regex -- Reject control bytes in untrusted source identities and values.
            /[\u0000-\u001f\u007f]/.test(id.value)
        )
            fail('UNSUPPORTED_LIST');
        if (ids.has(id.value)) fail('DUPLICATE_ITEM_ID');
        ids.add(id.value);
        if (id.value !== target.itemId) continue;
        found = true;
        const property = properties.get(target.property);
        if (!property) fail('PROPERTY_NOT_FOUND');
        if (!t.isStringLiteral(property.value)) fail('NON_LITERAL_TEXT');
        selected = property.value;
    }
    if (!found || !selected) fail('ITEM_NOT_FOUND');
    return range(selected, selected.value);
}

function resolve(source: string, target: ContentTextTarget): TextRange {
    checkTarget(target);
    const ast = parseSource(source);
    const result =
        target.kind === 'component-literal' ? componentRange(ast, target) : dataRange(ast, target);
    checkText(result.value);
    return result;
}

/** Deterministic source addressing only. Approval and complete candidate comparison belong to the server. */
export function readContentTextTarget(source: string, target: ContentTextTarget): string {
    return resolve(source, target).value;
}

/** Replace only the approved literal range; all bytes outside it stay untouched. */
export function replaceContentTextTarget(
    source: string,
    target: ContentTextTarget,
    previousValue: string,
    value: string,
): string {
    checkText(previousValue);
    checkText(value);
    const location = resolve(source, target);
    if (location.value !== previousValue) fail('PREVIOUS_VALUE_MISMATCH');
    if (previousValue === value) return source;
    const literal = JSON.stringify(value)
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
    const replacement = location.jsx ? `{${literal}}` : literal;
    const result = source.slice(0, location.start) + replacement + source.slice(location.end);
    checkSource(result);
    return result;
}
