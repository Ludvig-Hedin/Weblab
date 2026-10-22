import postcss from 'postcss';
import type { Declaration, Rule } from 'postcss';
import { getAstFromContent, t, traverse } from '@weblab/parser';
import type { NodePath, T } from '@weblab/parser';
import type { CssModuleProperty, CssModuleStyleEdit } from '@weblab/models/actions';
import { EditorAttributes } from '@weblab/constants';

export const CSS_MODULE_PROPERTIES: readonly CssModuleProperty[] = ['margin-top', 'max-width', 'color', 'font-weight'];
const LIMIT = 750_000;
const identifier = /^[A-Za-z_][A-Za-z0-9_-]*$/;

function refuse(): never { throw new Error('This declaration cannot be edited safely here. Use code.'); }
function textSource(source: string): void {
    if (typeof source !== 'string' || source.length > LIMIT || new TextEncoder().encode(source).length > LIMIT) refuse();
}
function projectPath(path: string): boolean {
    return typeof path === 'string' && path.length < 1_024 && !/^[/.]|[\\\u0000-\u001f?#:]/.test(path) &&
        path.split('/').every(part => part && part !== '.' && part !== '..' && !['node_modules', '.git', '.next', '.weblab'].includes(part));
}
function overlaps(property: string, selected: CssModuleProperty): boolean {
    if (property === 'all' || property === selected) return true;
    if (selected === 'margin-top') return /^margin(?:-|$)/.test(property);
    if (selected === 'max-width') return /^max-(?:inline|block)-size$/.test(property);
    return selected === 'font-weight' && ['font', 'font-variation-settings'].includes(property);
}
/** The one recognized helper always returns only --delay, regardless of its input. */
function isPureDelayStyle(expression: T.Node, path: NodePath<T.JSXElement>): boolean {
    if (!t.isCallExpression(expression) || !t.isIdentifier(expression.callee) || expression.arguments.length !== 1 ||
        t.isSpreadElement(expression.arguments[0])) return false;
    const binding = path.scope.getBinding(expression.callee.name);
    if (!binding?.constant || binding.constantViolations.length || !binding.path.isFunctionDeclaration() ||
        !binding.path.parentPath?.isProgram()) return false;
    const fn = binding.path.node;
    const parameter = fn.params[0];
    if (fn.async || fn.generator || fn.params.length !== 1 || !t.isIdentifier(parameter) || parameter.optional ||
        fn.body.directives.length || fn.body.body.length !== 1 || !t.isReturnStatement(fn.body.body[0])) return false;
    let returned = fn.body.body[0].argument;
    while (t.isTSAsExpression(returned)) returned = returned.expression;
    if (!t.isObjectExpression(returned) || returned.properties.length !== 1) return false;
    const field = returned.properties[0];
    if (!t.isObjectProperty(field) || field.computed || field.shorthand || !t.isStringLiteral(field.key, { value: '--delay' }) ||
        !t.isTemplateLiteral(field.value) || field.value.expressions.length !== 1 || field.value.quasis.length !== 2 ||
        field.value.quasis[0]?.value.cooked !== '' || field.value.quasis[1]?.value.cooked !== 'ms') return false;
    const value = field.value.expressions[0];
    const parameterBinding = binding.path.scope.getBinding(parameter.name);
    if (!t.isIdentifier(value, { name: parameter.name }) || !parameterBinding || parameterBinding.identifier !== parameter ||
        !parameterBinding.constant || parameterBinding.constantViolations.length || parameterBinding.referencePaths.length !== 1 ||
        parameterBinding.referencePaths[0]?.node !== value) return false;
    return binding.referencePaths.every(reference => reference.parentPath?.isCallExpression() && reference.parentPath.node.callee === reference.node);
}

function inlineStyleIsSafe(path: NodePath<T.JSXElement>, property: CssModuleProperty): boolean {
    const attributes = path.node.openingElement.attributes.filter((attr): attr is T.JSXAttribute => t.isJSXAttribute(attr) && attr.name.name === 'style');
    if (attributes.length === 0) return true;
    if (attributes.length !== 1) return false;
    const value = attributes[0]!.value;
    if (!t.isJSXExpressionContainer(value)) return false;
    if (isPureDelayStyle(value.expression, path)) return true;
    if (!t.isObjectExpression(value.expression)) return false;
    return value.expression.properties.every((entry) => {
        if (!t.isObjectProperty(entry) || entry.computed || entry.shorthand ||
            (!t.isIdentifier(entry.key) && !t.isStringLiteral(entry.key)) ||
            (!t.isStringLiteral(entry.value) && !t.isNumericLiteral(entry.value))) return false;
        const key = (t.isIdentifier(entry.key) ? entry.key.name : entry.key.value).replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
        return !overlaps(key, property);
    });
}

/** Resolve the actual lexical CSS import without changing class or style expressions. */
export function resolveCssModuleBinding(sourcePath: string, source: string, oid: string, property: CssModuleProperty): { cssPath: string; className: string } {
    textSource(source);
    if (!projectPath(sourcePath) || !/\.[jt]sx?$/.test(sourcePath) || !CSS_MODULE_PROPERTIES.includes(property) || !/^[A-Za-z0-9_.:-]{1,160}$/.test(oid)) refuse();
    const ast = getAstFromContent(source);
    if (!ast) refuse();
    let result: { cssPath: string; className: string } | null = null;
    let matches = 0;
    traverse(ast, {
        JSXElement(path) {
            const attrs = path.node.openingElement.attributes;
            const matching = attrs.filter((attr) => {
                if (!t.isJSXAttribute(attr) || attr.name.name !== EditorAttributes.DATA_WEBLAB_ID) return false;
                const value = t.isJSXExpressionContainer(attr.value) ? attr.value.expression : attr.value;
                const identity = t.isStringLiteral(value) ? value.value
                    : t.isTemplateLiteral(value) && value.expressions.length === 0 ? value.quasis[0]?.value.cooked : null;
                if (typeof identity !== 'string') refuse();
                return identity === oid;
            });
            if (!matching.length) return;
            matches += matching.length;
            const name = path.node.openingElement.name;
            if (!t.isJSXIdentifier(name) || !/^[a-z][a-z0-9-]*$/.test(name.name) || attrs.some(attr => t.isJSXSpreadAttribute(attr)) || !inlineStyleIsSafe(path, property)) refuse();
            const classAttrs = attrs.filter((attr): attr is T.JSXAttribute => t.isJSXAttribute(attr) && attr.name.name === 'className');
            const value = classAttrs[0]?.value;
            if (classAttrs.length !== 1 || !t.isJSXExpressionContainer(value) || !t.isMemberExpression(value.expression) ||
                value.expression.computed || !t.isIdentifier(value.expression.object) || !t.isIdentifier(value.expression.property) ||
                !identifier.test(value.expression.property.name)) refuse();
            const className = value.expression.property.name;
            if (['__proto__', 'prototype', 'constructor'].includes(className)) refuse();
            const binding = path.scope.getBinding(value.expression.object.name);
            if (!binding?.constant || binding.constantViolations.length || !binding.path.isImportDefaultSpecifier() || !binding.path.parentPath?.isImportDeclaration() ||
                binding.path.parentPath.node.importKind === 'type') refuse();
            const specifier = binding.path.parentPath.node.source.value;
            if (!/^\.\.?\//.test(specifier) || !/\.module\.css$/.test(specifier) || /[\\\u0000-\u001f?#:]/.test(specifier)) refuse();
            const parts = sourcePath.split('/').slice(0, -1);
            for (const part of specifier.split('/')) {
                if (part === '.') continue;
                if (!part || part === '..' && parts.length === 0) refuse();
                if (part === '..') parts.pop(); else parts.push(part);
            }
            const cssPath = parts.join('/');
            if (!projectPath(cssPath)) refuse();
            for (const reference of binding.referencePaths) {
                const member = reference.parentPath;
                if (!member?.isMemberExpression() || member.node.object !== reference.node || member.node.computed || !t.isIdentifier(member.node.property)) refuse();
                const usage = member.parentPath;
                if (!usage || usage.isAssignmentExpression() && usage.node.left === member.node || usage.isUpdateExpression() || usage.isUnaryExpression({ operator: 'delete' })) refuse();
                if (member.node.property.name !== className) continue;
                const container = usage;
                const attribute = container.parentPath;
                const opening = attribute?.parentPath;
                if (!container.isJSXExpressionContainer() || !attribute?.isJSXAttribute() || attribute.node.name.name !== 'className' ||
                    !opening?.isJSXOpeningElement() || !t.isJSXIdentifier(opening.node.name) || !/^[a-z][a-z0-9-]*$/.test(opening.node.name.name) ||
                    opening.node.attributes.some(attr => t.isJSXSpreadAttribute(attr)) ||
                    opening.node.attributes.filter(attr => t.isJSXAttribute(attr) && attr.name.name === 'className').length !== 1 ||
                    !opening.parentPath?.isJSXElement() || !inlineStyleIsSafe(opening.parentPath, property)) refuse();
            }
            result = { cssPath, className };
        },
    });
    if (matches !== 1 || !result) refuse();
    return result;
}

function declaration(css: string, className: string, property: CssModuleProperty): { rule: Rule; declaration: Declaration } {
    textSource(css);
    if (!identifier.test(className) || !CSS_MODULE_PROPERTIES.includes(property)) refuse();
    const root = postcss.parse(css);
    const references: Rule[] = [];
    const classReference = new RegExp(`\\.${className}(?![A-Za-z0-9_-])`);
    const composedClass = new RegExp(`(?:^|\\s)${className}(?:\\s|$)`);
    root.walkAtRules((rule) => { if (['import', 'value', 'apply'].includes(rule.name) || classReference.test(rule.params)) refuse(); });
    root.walkDecls((node) => {
        if (['composes', 'compose-with'].includes(node.prop.toLowerCase()) &&
            (node.value.includes('\\') || composedClass.test(node.value))) refuse();
    });
    root.walkRules((rule) => {
        if (rule.selector.includes('\\') || /:(?:import|export)\b/.test(rule.selector)) refuse();
        if (classReference.test(rule.selector)) references.push(rule);
    });
    const rule = references[0];
    if (references.length !== 1 || !rule || rule.parent?.type !== 'root' || rule.selector.trim() !== `.${className}`) refuse();
    const found: Declaration[] = [];
    for (const node of rule.nodes) {
        if (node.type === 'comment') continue;
        if (node.type !== 'decl' || node.important || ['composes', 'compose-with'].includes(node.prop.toLowerCase())) refuse();
        if (node.prop === property) found.push(node);
        else if (overlaps(node.prop.toLowerCase(), property)) refuse();
    }
    if (found.length !== 1 || !found[0]) refuse();
    return { rule, declaration: found[0] };
}

export function readCssModuleDeclaration(css: string, className: string, property: CssModuleProperty): string {
    const value = declaration(css, className, property).declaration.value;
    validateCssModuleValue(property, value);
    return value;
}

function numericRgb(value: string): boolean {
    const number = '(\\d+(?:\\.\\d+)?|\\.\\d+)';
    const match = new RegExp(`^rgb\\( *${number} +${number} +${number}(?: */ *${number})? *\\)$`, 'i').exec(value);
    return Boolean(match && [1, 2, 3].every(index => Number.isFinite(Number(match[index])) && Number(match[index]) <= 255) &&
        (match[4] === undefined || Number.isFinite(Number(match[4])) && Number(match[4]) <= 1));
}

/** Deliberately small values, parsed again to reject injected rules or declarations. */
export function validateCssModuleValue(property: CssModuleProperty, value: string): void {
    if (typeof value !== 'string' || value.length > 160 || value !== value.trim() || /[;{}!\\\u0000-\u001f]/.test(value)) refuse();
    const length = /^(-?\d+(?:\.\d+)?)(px|rem|em|%|vh|vw)$/;
    const match = length.exec(value);
    const valid = property === 'margin-top' ? value === '0' || value === 'auto' || Boolean(match)
        : property === 'max-width' ? value === '0' || value === 'none' || Boolean(match && Number(match[1]) >= 0)
            : property === 'font-weight' ? /^(?:[1-9]00|normal|bold)$/.test(value)
                : property === 'color' && (/^(?:#[\da-f]{3,4}|#[\da-f]{6}|#[\da-f]{8}|transparent|currentColor|var\(--[a-zA-Z_][a-zA-Z0-9_-]*\))$/i.test(value) || numericRgb(value));
    if (!valid) refuse();
    const parsed = postcss.parse(`a{${property}:${value}}`);
    const rule = parsed.nodes[0];
    if (parsed.nodes.length !== 1 || rule?.type !== 'rule' || rule.nodes.length !== 1 || rule.nodes[0]?.type !== 'decl' ||
        rule.nodes[0].prop !== property || rule.nodes[0].value !== value || rule.nodes[0].important) refuse();
}

export function replaceCssModuleDeclaration(css: string, className: string, property: CssModuleProperty, previousValue: string, value: string): string {
    const found = declaration(css, className, property);
    if (found.declaration.value !== previousValue) throw new Error('The declaration changed. Your draft has been kept.');
    validateCssModuleValue(property, previousValue);
    validateCssModuleValue(property, value);
    found.declaration.value = value;
    return found.rule.root().toString();
}

export function validateCssModuleStyleEdit(edit: CssModuleStyleEdit): void {
    if (!edit || edit.version !== 1 || !projectPath(edit.cssPath) || !/\.module\.css$/.test(edit.cssPath) ||
        typeof edit.previousValue !== 'string' || typeof edit.value !== 'string') refuse();
    const binding = resolveCssModuleBinding(edit.sourcePath, edit.source, edit.oid, edit.property);
    if (binding.cssPath !== edit.cssPath || binding.className !== edit.className) refuse();
}
