'use node';

// Node-only: import from a Convex Node action, never from a query or mutation.
import { createHash } from 'node:crypto';
import { EditorAttributes } from '@weblab/constants';
import { parse, t, type T } from '@weblab/parser/src/packages';
import { getRenderedJsxText, updateNodeTextContent } from '@weblab/parser/src/code-edit/text';

export type CloudContentField = 'text' | 'src' | 'alt' | 'href' | 'className';
export interface CloudContentBinding {
    oid: string;
    fields: CloudContentField[];
    allowImageUploads?: boolean;
    /** Builder-approved ASCII IDs mapped to the complete, exact className value. */
    choices?: Record<string, string>;
    /** Display labels are values so localized names survive Convex serialization. */
    choiceLabels?: Record<string, string>;
    /** Exact destinations/assets approved for this target, not all project assets. */
    allowedValues?: { src?: string[]; href?: string[] };
}
export interface CloudContentContract {
    version: 1;
    path: string;
    bindings: CloudContentBinding[];
    fingerprint: string;
}
export interface CloudContentOperation {
    oid: string;
    field: CloudContentField;
    previousValue: string;
    value: string;
    choice?: string;
}
export class CloudContentContractError extends Error {
    constructor(public readonly code: 'INVALID_TARGET' | 'INVALID_VALUE' | 'INVALID_SOURCE' | 'STALE_CONTRACT' | 'UNAPPROVED_CHANGE') {
        super(`CLOUD_CONTENT_${code}`);
        this.name = 'CloudContentContractError';
    }
}
const safeTags = new Set('a abbr address article aside b blockquote br caption cite code dd del details dfn div dl dt em figcaption figure footer h1 h2 h3 h4 h5 h6 header hr i img kbd li main mark nav ol p pre q s samp section small span strong sub summary sup table tbody td th thead time tr u ul var'.split(' '));
const fields = new Set<CloudContentField>(['text', 'src', 'alt', 'href', 'className']);
function fail(code: CloudContentContractError['code']): never { throw new CloudContentContractError(code); }
const controls = /[\u0000-\u001f\u007f]/;

function parseSource(source: string): T.File {
    if (typeof source !== 'string' || source.length > 300_000) fail('INVALID_SOURCE');
    try {
        return parse(source, {
            sourceType: 'module',
            plugins: ['typescript', 'jsx', ['decorators', { decoratorsBeforeExport: true }], 'classStaticBlock', 'dynamicImport', 'importMeta'],
        });
    } catch { return fail('INVALID_SOURCE'); }
}

function checkPath(path: string): void {
    if (!/^(?:src\/)?app\/(?:[^/]+\/)*page\.tsx$/.test(path) || path.length > 300 || /[\\\u0000-\u0020\u007f]/.test(path)
        || path.split('/').some((part) => part === '.' || part === '..')) fail('INVALID_TARGET');
}

/** Drop only parser positions/raw spelling, retaining comments, directives and all syntax. */
function canonical(value: unknown): string {
    return JSON.stringify(value, (_key, entry: unknown) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
        const record = entry as Record<string, unknown>;
        return Object.fromEntries(Object.keys(record).sort()
            .filter((key) => !['start', 'end', 'loc'].includes(key)
                && !(key === 'extra' && record.type !== 'DirectiveLiteral')
                // Babel's JSX builder includes this redundant field; its parser does not.
                && !(key === 'selfClosing' && record.type === 'JSXElement'))
            .map((key) => [key, record[key]]));
    });
}

/** Compare JSX formatting by its rendered text; never use this for saved fingerprints. */
function normalizeJsxFormatting(ast: T.File): void {
    t.traverseFast(ast, (node) => {
        if (!t.isJSXElement(node) && !t.isJSXFragment(node)) return;
        node.children = node.children.filter((child) => {
            if (!t.isJSXText(child) || child.leadingComments?.length || child.trailingComments?.length || child.innerComments?.length) return true;
            child.value = getRenderedJsxText(child.value);
            return child.value !== '';
        });
    });
}

function elements(ast: T.File): Map<string, T.JSXElement> {
    const result = new Map<string, T.JSXElement>();
    t.traverseFast(ast, (node) => {
        if (!t.isJSXElement(node)) return;
        const ids = node.openingElement.attributes.filter((attribute): attribute is T.JSXAttribute =>
            t.isJSXAttribute(attribute) && t.isJSXIdentifier(attribute.name, { name: EditorAttributes.DATA_WEBLAB_ID }));
        if (!ids.length) return;
        if (ids.length !== 1 || !t.isStringLiteral(ids[0]!.value)) fail('INVALID_TARGET');
        const oid = ids[0]!.value.value;
        if (!/^[A-Za-z0-9_.:-]{1,160}$/.test(oid) || result.has(oid)) fail('INVALID_TARGET');
        result.set(oid, node);
    });
    return result;
}

function literal(attribute: T.JSXAttribute): T.StringLiteral {
    if (t.isStringLiteral(attribute.value)) return attribute.value;
    if (t.isJSXExpressionContainer(attribute.value) && t.isStringLiteral(attribute.value.expression)) return attribute.value.expression;
    return fail('INVALID_TARGET');
}

function attribute(node: T.JSXElement, name: string): T.StringLiteral {
    const attr = node.openingElement.attributes.find((entry): entry is T.JSXAttribute =>
        t.isJSXAttribute(entry) && t.isJSXIdentifier(entry.name, { name }));
    return attr ? literal(attr) : fail('INVALID_TARGET');
}

function checkTarget(node: T.JSXElement): string {
    const opening = node.openingElement;
    if (!t.isJSXIdentifier(opening.name) || !safeTags.has(opening.name.name)) fail('INVALID_TARGET');
    const seen = new Set<string>();
    for (const attr of opening.attributes) {
        if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) fail('INVALID_TARGET');
        const name = attr.name.name;
        if (seen.has(name) || /^on/i.test(name) || ['style', 'dangerouslySetInnerHTML', 'srcDoc'].includes(name)) fail('INVALID_TARGET');
        seen.add(name);
        if (attr.value !== null) literal(attr);
    }
    for (const child of node.children) {
        if (t.isJSXSpreadChild(child) || (t.isJSXExpressionContainer(child) && !t.isStringLiteral(child.expression))) fail('INVALID_TARGET');
    }
    return opening.name.name;
}

/** Only the page's direct native JSX tree has a one-source-node/one-rendered-node contract. */
function pageTargetPaths(ast: T.File): Map<T.JSXElement, T.JSXElement[]> {
    const declaration = ast.program.body.find((entry) => t.isExportDefaultDeclaration(entry));
    if (!declaration || !t.isExportDefaultDeclaration(declaration)
        || !t.isFunctionDeclaration(declaration.declaration) || declaration.declaration.generator) fail('INVALID_TARGET');
    const returns = declaration.declaration.body.body.filter((entry): entry is T.ReturnStatement => t.isReturnStatement(entry));
    if (returns.length !== 1 || !t.isJSXElement(returns[0]!.argument)) fail('INVALID_TARGET');
    const paths = new Map<T.JSXElement, T.JSXElement[]>();
    const visit = (node: T.JSXElement, ancestors: T.JSXElement[]) => {
        if (!t.isJSXIdentifier(node.openingElement.name) || !safeTags.has(node.openingElement.name.name)) return;
        const path = [...ancestors, node];
        paths.set(node, path);
        // No traversal through expressions, callbacks, local functions, fragments or component props.
        for (const child of node.children) if (t.isJSXElement(child)) visit(child, path);
    };
    visit(returns[0]!.argument, []);
    return paths;
}

function textValue(node: T.JSXElement): string {
    if (node.openingElement.selfClosing || !node.closingElement) fail('INVALID_TARGET');
    let value = '';
    for (const child of node.children) {
        // Text targets have no comments or nested markup to accidentally erase.
        let hasComment = false;
        t.traverseFast(child, (entry) => {
            if (entry.leadingComments?.length || entry.trailingComments?.length || entry.innerComments?.length) hasComment = true;
        });
        if (hasComment) fail('INVALID_TARGET');
        if (t.isJSXText(child)) value += getRenderedJsxText(child.value);
        else if (t.isJSXExpressionContainer(child) && t.isStringLiteral(child.expression)) value += child.expression.value;
        else if (t.isJSXElement(child) && t.isJSXIdentifier(child.openingElement.name, { name: 'br' })
            && child.openingElement.selfClosing && isTextBreakAttributes(child.openingElement.attributes)
            && child.closingElement === null && child.children.length === 0) value += '\n';
        else fail('INVALID_TARGET');
    }
    return value;
}

function isTextBreakAttributes(attributes: T.JSXOpeningElement['attributes']): boolean {
    if (attributes.length === 0) return true;
    const attribute = attributes[0];
    return attributes.length === 1 && t.isJSXAttribute(attribute)
        && t.isJSXIdentifier(attribute.name, { name: EditorAttributes.DATA_WEBLAB_ID })
        && t.isStringLiteral(attribute.value) && /^[A-Za-z0-9_.:-]{1,160}$/.test(attribute.value.value);
}

/** Formatting and generated line-break IDs are representation details only inside approved text. */
function normalizeApprovedText(ast: T.File, bindings: CloudContentBinding[]): void {
    const nodes = elements(ast); // Check global ID uniqueness before removing line-break IDs.
    for (const binding of bindings) {
        if (!binding.fields.includes('text')) continue;
        const node = nodes.get(binding.oid)!;
        // textValue rejects comments, other attributes and markup before any normalization.
        node.children = [t.jsxExpressionContainer(t.stringLiteral(textValue(node)))];
    }
}

function safeHref(value: string): boolean {
    if (!value || /[\s\\]/.test(value) || value.startsWith('//')) return false;
    try {
        if (controls.test(decodeURIComponent(value))) return false;
        const url = new URL(value, 'https://content.invalid/');
        if (/^https:/i.test(value)) return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
        if (/^(mailto|tel):/i.test(value)) return value.slice(value.indexOf(':') + 1).length > 0;
        return !/^[^/?#]*:/.test(value) && url.origin === 'https://content.invalid';
    } catch { return false; }
}

function checkValue(field: CloudContentField, value: string, binding: CloudContentBinding, assets: ReadonlySet<string>): void {
    if (value.length > (field === 'text' ? 10_000 : field === 'alt' ? 1_000 : 2_048)
        || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail('INVALID_VALUE');
    if (field === 'src' && (!value.startsWith('/') || value.startsWith('//') || /[\\?#\s]/.test(value)
        || value.split('/').some((part) => part === '.' || part === '..') || !assets.has(value))) fail('INVALID_VALUE');
    if (field === 'href' && !safeHref(value)) fail('INVALID_VALUE');
    if ((field === 'src' || field === 'href') && !binding.allowedValues?.[field]?.includes(value)) fail('INVALID_VALUE');
    if (field === 'className' && !Object.values(binding.choices ?? {}).includes(value)) fail('INVALID_VALUE');
}

function inspect(ast: T.File, bindings: CloudContentBinding[], assets: ReadonlySet<string>) {
    if (!bindings.length || bindings.length > 100) fail('INVALID_TARGET');
    const nodes = elements(ast);
    const pagePaths = pageTargetPaths(ast);
    const seen = new Set<string>();
    for (const binding of bindings) {
        if (seen.has(binding.oid) || !binding.fields.length || new Set(binding.fields).size !== binding.fields.length) fail('INVALID_TARGET');
        seen.add(binding.oid);
        const node = nodes.get(binding.oid);
        if (!node) fail('INVALID_TARGET');
        const ancestors = pagePaths.get(node);
        if (!ancestors) fail('INVALID_TARGET');
        for (const ancestor of ancestors) checkTarget(ancestor);
        const tag = checkTarget(node);
        if (binding.allowImageUploads !== undefined && (typeof binding.allowImageUploads !== 'boolean' || !binding.fields.includes('src') || tag !== 'img')) fail('INVALID_TARGET');
        if (binding.allowedValues && Object.keys(binding.allowedValues).some(key => key !== 'src' && key !== 'href')) fail('INVALID_TARGET');
        for (const field of ['src', 'href'] as const) {
            const values = binding.allowedValues?.[field];
            if (values && (!binding.fields.includes(field) || !values.length || values.length > 100
                || new Set(values).size !== values.length)) fail('INVALID_TARGET');
            if (binding.fields.includes(field) && !values?.length) fail('INVALID_TARGET');
            // Validate every approved option, including options not selected now.
            for (const value of values ?? []) checkValue(field, value, binding, assets);
        }
        if (binding.choices && (!binding.fields.includes('className') || Object.keys(binding.choices).length > 20
            || Object.entries(binding.choices).some(([key, value]) => !key.trim() || key.startsWith('$') || key.length > 80 || !/^[\x20-\x7e]+$/.test(key)
                || ['__proto__', 'constructor', 'prototype'].includes(key) || typeof value !== 'string' || value.length > 2_048))) fail('INVALID_TARGET');
        if (binding.choiceLabels && Object.entries(binding.choiceLabels).some(([key, label]) =>
            !Object.hasOwn(binding.choices ?? {}, key) || typeof label !== 'string' || !label.trim()
            || label.length > 80 || controls.test(label))) fail('INVALID_TARGET');
        for (const value of Object.values(binding.choices ?? {})) checkValue('className', value, binding, assets);
        for (const field of binding.fields) {
            if (!fields.has(field) || (['src', 'alt'].includes(field) && tag !== 'img') || (field === 'href' && tag !== 'a')
                || (field === 'text' && ['img', 'br', 'hr'].includes(tag))) fail('INVALID_TARGET');
            const value = field === 'text' ? textValue(node) : attribute(node, field).value;
            checkValue(field, value, binding, assets);
        }
    }
    return nodes;
}

function fingerprint(ast: T.File, bindings: CloudContentBinding[]): string {
    const masked = structuredClone(ast);
    const nodes = elements(masked);
    for (const binding of bindings) {
        const node = nodes.get(binding.oid)!;
        for (const field of binding.fields) {
            if (field === 'text') node.children = [t.jsxText('__approved_text__')];
            else attribute(node, field).value = '__approved_value__';
        }
    }
    return createHash('sha256').update(canonical({ bindings, ast: masked })).digest('hex');
}

/** Persist this contract only after builder authorization; never accept one from the customer. */
export function approveCloudContentBindings(input: {
    path: string; source: string; bindings: CloudContentBinding[]; approvedAssetPaths: readonly string[];
}): CloudContentContract {
    checkPath(input.path);
    const ast = parseSource(input.source);
    const bindings = structuredClone(input.bindings);
    inspect(ast, bindings, new Set(input.approvedAssetPaths));
    return { version: 1, path: input.path, bindings, fingerprint: fingerprint(ast, bindings) };
}

/** The caller must CAS against originalSource's saved revision before persisting returned bytes. */
export function validateCloudContentCandidate(input: {
    contract: CloudContentContract; originalSource: string; candidateSource: string; approvedAssetPaths: readonly string[];
}): { source: string; operations: CloudContentOperation[] } {
    const { contract } = input;
    checkPath(contract.path);
    if (contract.version !== 1) fail('STALE_CONTRACT');
    const original = parseSource(input.originalSource);
    const assets = new Set(input.approvedAssetPaths);
    inspect(original, contract.bindings, assets);
    if (fingerprint(original, contract.bindings) !== contract.fingerprint) fail('STALE_CONTRACT');
    const candidate = parseSource(input.candidateSource);
    const proposed = inspect(candidate, contract.bindings, assets);
    const reconstructed = structuredClone(original);
    const targets = elements(reconstructed);
    const operations: CloudContentOperation[] = [];
    for (const binding of contract.bindings) {
        const target = targets.get(binding.oid)!;
        const proposal = proposed.get(binding.oid)!;
        for (const field of binding.fields) {
            const previousValue = field === 'text' ? textValue(target) : attribute(target, field).value;
            const value = field === 'text' ? textValue(proposal) : attribute(proposal, field).value;
            if (value === previousValue) continue;
            if (field === 'text') updateNodeTextContent(target, value);
            else attribute(target, field).value = value;
            operations.push({ oid: binding.oid, field, previousValue, value,
                ...(field === 'className' ? { choice: Object.keys(binding.choices!).find((key) => binding.choices![key] === value)! } : {}),
            });
        }
    }
    normalizeApprovedText(reconstructed, contract.bindings);
    normalizeApprovedText(candidate, contract.bindings);
    normalizeJsxFormatting(reconstructed);
    normalizeJsxFormatting(candidate);
    if (canonical(reconstructed) !== canonical(candidate)) fail('UNAPPROVED_CHANGE');
    return { source: input.candidateSource, operations };
}
