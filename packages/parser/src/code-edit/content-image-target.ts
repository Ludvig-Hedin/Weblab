import { parse, traverse, t, type T } from '../packages';

/** Source addressing only. Asset permission and decoded dimensions belong to the backend. */
export type ContentImageTarget = {
    kind: 'object-image';
    exportName: string;
    srcProperty: 'imageSrc';
    altProperty: 'imageAlt';
};
export type ContentImageValue = { src: string; alt: string };
export type ContentImageTargetErrorCode = 'INVALID_SOURCE' | 'INVALID_TARGET' | 'INVALID_VALUE'
    | 'EXPORT_NOT_FOUND' | 'UNSUPPORTED_OBJECT' | 'PROPERTY_NOT_FOUND' | 'PREVIOUS_VALUE_MISMATCH';
export class ContentImageTargetError extends Error {
    constructor(public readonly code: ContentImageTargetErrorCode) {
        super(`CONTENT_IMAGE_TARGET_${code}`);
        this.name = 'ContentImageTargetError';
    }
}
function fail(code: ContentImageTargetErrorCode): never { throw new ContentImageTargetError(code); }
const encoder = new TextEncoder();
function checkSource(source: string): void {
    if (typeof source !== 'string' || source.length > 750_000 || encoder.encode(source).byteLength > 750_000)
        fail('INVALID_SOURCE');
}
function checkValue(value: ContentImageValue): void {
    if (!value || typeof value.src !== 'string' || value.src.length > 2_048 || !value.src.startsWith('/')
        || /[\\\s?#%\u0000-\u001f\u007f]/.test(value.src)
        || value.src.slice(1).split('/').some(part => !part || part === '.' || part === '..')
        || typeof value.alt !== 'string' || value.alt.length > 1_000 || /[\u0000-\u001f\u007f]/.test(value.alt)) fail('INVALID_VALUE');
}
function checkTarget(target: ContentImageTarget): void {
    if (!target || target.kind !== 'object-image' || target.srcProperty !== 'imageSrc' || target.altProperty !== 'imageAlt'
        || typeof target.exportName !== 'string' || !target.exportName.length || target.exportName.length > 160
        || /[^A-Za-z0-9_$]/.test(target.exportName) || !/[A-Za-z_$]/.test(target.exportName[0]!)) fail('INVALID_TARGET');
}
function simpleValue(node: T.Node): boolean {
    return t.isStringLiteral(node) || t.isNumericLiteral(node) || t.isBooleanLiteral(node) || t.isNullLiteral(node)
        || (t.isArrayExpression(node) && node.elements.every(value => value !== null && t.isStringLiteral(value)));
}
type Range = { start: number; end: number; value: string };
function resolve(source: string, target: ContentImageTarget): { src: Range; alt: Range } {
    checkSource(source); checkTarget(target);
    let ast: T.File;
    try { ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] }); }
    catch { fail('INVALID_SOURCE'); }
    const declarations = ast.program.body.flatMap(statement => t.isExportNamedDeclaration(statement)
        && t.isVariableDeclaration(statement.declaration)
        ? statement.declaration.declarations.filter(node => t.isIdentifier(node.id, { name: target.exportName }))
            .map(node => ({ node, statement })) : []);
    if (declarations.length !== 1) fail('EXPORT_NOT_FOUND');
    const { node: declaration, statement } = declarations[0]!;
    if (!t.isVariableDeclaration(statement.declaration, { kind: 'const' })) fail('UNSUPPORTED_OBJECT');
    let object = declaration.init;
    if (t.isTSAsExpression(object) && t.isTSTypeReference(object.typeAnnotation)
        && t.isIdentifier(object.typeAnnotation.typeName, { name: 'const' })) object = object.expression;
    if (!t.isObjectExpression(object) || !object.properties.length || object.properties.length > 32) fail('UNSUPPORTED_OBJECT');
    const properties = new Map<string, T.ObjectProperty>();
    for (const property of object.properties) {
        if (!t.isObjectProperty(property) || property.computed || property.shorthand
            || (!t.isIdentifier(property.key) && !t.isStringLiteral(property.key)) || !simpleValue(property.value)) fail('UNSUPPORTED_OBJECT');
        const key = t.isIdentifier(property.key) ? property.key.name : property.key.value;
        if (properties.has(key) || ['__proto__', 'prototype', 'constructor'].includes(key)) fail('UNSUPPORTED_OBJECT');
        properties.set(key, property);
    }
    // Lexical binding checks catch mutation/aliases without confusing unrelated shadowed names.
    let checked = false;
    traverse(ast, { VariableDeclarator(path) {
        if (path.node !== declaration) return;
        const binding = path.scope.getBinding(target.exportName);
        if (!binding || !binding.constant || binding.constantViolations.length
            || binding.referencePaths.some(reference => reference.node !== statement)) fail('UNSUPPORTED_OBJECT');
        checked = true;
    } });
    if (!checked) fail('UNSUPPORTED_OBJECT');
    const field = (name: string): Range => {
        const node = properties.get(name)?.value;
        if (!node) fail('PROPERTY_NOT_FOUND');
        if (!t.isStringLiteral(node)) fail('UNSUPPORTED_OBJECT');
        if (node.start == null || node.end == null) fail('INVALID_SOURCE');
        return { start: node.start, end: node.end, value: node.value };
    };
    const result = { src: field(target.srcProperty), alt: field(target.altProperty) };
    checkValue({ src: result.src.value, alt: result.alt.value });
    return result;
}
export function readContentImageTarget(source: string, target: ContentImageTarget): ContentImageValue {
    const result = resolve(source, target);
    return { src: result.src.value, alt: result.alt.value };
}
/** Both previous values must match; only changed string-literal byte ranges are replaced. */
export function replaceContentImageTarget(source: string, target: ContentImageTarget,
    previousValue: ContentImageValue, value: ContentImageValue): string {
    checkValue(previousValue); checkValue(value);
    const ranges = resolve(source, target);
    if (ranges.src.value !== previousValue.src || ranges.alt.value !== previousValue.alt) fail('PREVIOUS_VALUE_MISMATCH');
    let result = source;
    const fields = (['src', 'alt'] as const).filter(field => previousValue[field] !== value[field])
        .sort((a, b) => ranges[b].start - ranges[a].start);
    for (const field of fields) {
        const literal = JSON.stringify(value[field]).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
        result = result.slice(0, ranges[field].start) + literal + result.slice(ranges[field].end);
    }
    checkSource(result);
    return result;
}
