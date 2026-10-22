import type { T } from '../packages';
import type { ObjectImageRenderMapping } from './content-image-render-mapping';
import { getAllExistingOids } from '../ids';
import { parse, t } from '../packages';
import { resolveContentImageRenderMapping } from './content-image-render-mapping';

/** Only existing literal hrefs and the prepared hero's explicit tone are supported. */
export type ContentPropertyTarget =
    | { kind: 'component-literal-href'; exportName: string; oid: string; field: 'href' }
    | {
          kind: 'mapped-callsite-enum';
          exportName: string;
          oid: string;
          field: 'tone';
          renderMapping: ObjectImageRenderMapping;
      };
export type ContentPropertySelection =
    | { kind: 'component-literal-href'; path: string; exportName: string; oid: string }
    | { kind: 'mapped-callsite-enum'; oid: string; mappingId: string; itemId: 'single' };
export type ContentPropertyTargetErrorCode =
    | 'INVALID_SOURCE'
    | 'INVALID_TARGET'
    | 'INVALID_VALUE'
    | 'UNSUPPORTED_TARGET'
    | 'DUPLICATE_OID'
    | 'PREVIOUS_VALUE_MISMATCH';
export class ContentPropertyTargetError extends Error {
    constructor(public readonly code: ContentPropertyTargetErrorCode) {
        super(`CONTENT_PROPERTY_TARGET_${code}`);
        this.name = 'ContentPropertyTargetError';
    }
}
const encoder = new TextEncoder();
const native = new Set(
    'a abbr address article aside b blockquote br caption cite code dd del details dfn div dl dt em figcaption figure footer h1 h2 h3 h4 h5 h6 header hr i img kbd li main mark nav ol p pre q s samp section small span strong sub summary sup table tbody td th thead time tr u ul var'.split(
        ' ',
    ),
);
function fail(code: ContentPropertyTargetErrorCode): never {
    throw new ContentPropertyTargetError(code);
}
function exact(value: unknown, keys: string): value is Record<string, unknown> {
    return (
        !!value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.keys(value).sort().join(',') === keys
    );
}
function identifier(value: unknown): value is string {
    return (
        typeof value === 'string' &&
        value.length > 0 &&
        value.length <= 160 &&
        /[A-Za-z_$]/.test(value[0]!) &&
        !/[^A-Za-z0-9_$]/.test(value)
    );
}
function oid(value: unknown): value is string {
    return (
        typeof value === 'string' &&
        value.length > 0 &&
        value.length <= 160 &&
        !/[^A-Za-z0-9_.:-]/.test(value)
    );
}
function unicode(value: string): boolean {
    for (let i = 0; i < value.length; i++) {
        const unit = value.charCodeAt(i);
        if (unit >= 0xd800 && unit <= 0xdbff) {
            const next = value.charCodeAt(++i);
            if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
        } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
    }
    return true;
}
function path(value: unknown): value is string {
    return (
        typeof value === 'string' &&
        value.length <= 300 &&
        /^(?:src|app)\/.+\.tsx$/.test(value) &&
        // eslint-disable-next-line no-control-regex -- Reject control bytes in untrusted source identities and values.
        !/[\\\s?#%\u0000-\u001f\u007f]/.test(value) &&
        value.split('/').every((part) => !!part && !part.startsWith('.'))
    );
}
function checkTarget(target: ContentPropertyTarget): void {
    if (!target || !identifier(target.exportName) || !oid(target.oid)) fail('INVALID_TARGET');
    if (target.kind === 'component-literal-href') {
        if (!exact(target, 'exportName,field,kind,oid') || target.field !== 'href')
            fail('INVALID_TARGET');
        return;
    }
    if (
        target.kind !== 'mapped-callsite-enum' ||
        target.field !== 'tone' ||
        !exact(target, 'exportName,field,kind,oid,renderMapping')
    )
        fail('INVALID_TARGET');
    const mapping = target.renderMapping;
    if (
        !exact(mapping, 'callsite,kind,mappingId,renderer,version') ||
        mapping.version !== 1 ||
        mapping.kind !== 'object-prop-image' ||
        !oid(mapping.mappingId)
    )
        fail('INVALID_TARGET');
    for (const entry of [mapping.callsite, mapping.renderer]) {
        if (
            !exact(entry, 'exportName,oid,path') ||
            !path(entry.path) ||
            !identifier(entry.exportName) ||
            !oid(entry.oid)
        )
            fail('INVALID_TARGET');
    }
    if (mapping.callsite.oid !== target.oid || mapping.callsite.exportName !== target.exportName)
        fail('INVALID_TARGET');
}
function tree(source: string): T.File {
    if (
        typeof source !== 'string' ||
        encoder.encode(source).byteLength > 750_000 ||
        !unicode(source)
    )
        fail('INVALID_SOURCE');
    try {
        return parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
    } catch {
        return fail('INVALID_SOURCE');
    }
}
function inventory(files: Record<string, string>): void {
    if (!files || typeof files !== 'object' || Array.isArray(files)) fail('INVALID_SOURCE');
    const entries = Object.entries(files);
    if (!entries.length || entries.length > 400) fail('INVALID_SOURCE');
    let bytes = 0;
    const seen = new Set<string>();
    for (const [name, source] of entries) {
        if (
            !name ||
            name.length > 300 ||
            // eslint-disable-next-line no-control-regex -- Reject control bytes in untrusted source identities and values.
            /[\\\s?#%\u0000-\u001f\u007f]/.test(name) ||
            name.split('/').some((part) => !part || part === '.' || part === '..') ||
            typeof source !== 'string' ||
            !unicode(source) ||
            encoder.encode(source).byteLength > 750_000 ||
            (bytes += encoder.encode(source).byteLength) > 4_000_000
        )
            fail('INVALID_SOURCE');
        if (
            !/\.[cm]?[jt]sx?$/.test(name) ||
            /\.d\.[cm]?ts$/.test(name) ||
            ['public/weblab-preload-script.js', 'public/weblab-ix-runtime.js'].includes(name)
        )
            continue;
        t.traverseFast(tree(source), (node) => {
            if (!t.isJSXOpeningElement(node)) return;
            const found = getAllExistingOids(node.attributes);
            if (found.hasMultiple || found.values.some((value) => seen.has(value)))
                fail('DUPLICATE_OID');
            if (found.hasInvalid || found.values.some((value) => !oid(value)))
                fail('INVALID_TARGET');
            // A static spread can supply an identity without an explicit JSX attribute.
            for (const attr of node.attributes)
                if (
                    t.isJSXSpreadAttribute(attr) &&
                    t.isObjectExpression(attr.argument) &&
                    attr.argument.properties.some(
                        (property) =>
                            (t.isObjectProperty(property) || t.isObjectMethod(property)) &&
                            (t.isIdentifier(property.key, { name: 'data-oid' }) ||
                                t.isStringLiteral(property.key, { value: 'data-oid' })),
                    )
                ) {
                    fail('UNSUPPORTED_TARGET');
                }
            const index = found.indices[0];
            if (
                index !== undefined &&
                node.attributes.slice(index + 1).some((attr) => t.isJSXSpreadAttribute(attr))
            )
                fail('UNSUPPORTED_TARGET');
            for (const value of found.values) seen.add(value);
        });
    }
}
function attributes(element: T.JSXElement, allowSpread = false): Map<string, T.JSXAttribute> {
    const result = new Map<string, T.JSXAttribute>();
    for (const attr of element.openingElement.attributes) {
        if (allowSpread && t.isJSXSpreadAttribute(attr)) continue;
        if (
            !t.isJSXAttribute(attr) ||
            !t.isJSXIdentifier(attr.name) ||
            result.has(attr.name.name) ||
            /^(?:on|ref$)/i.test(attr.name.name) ||
            ['children', 'dangerouslySetInnerHTML', 'srcDoc'].includes(attr.name.name)
        )
            fail('UNSUPPORTED_TARGET');
        result.set(attr.name.name, attr);
    }
    return result;
}
function literalRange(
    source: string,
    target: ContentPropertyTarget,
): { start: number; end: number; value: string } {
    checkTarget(target);
    const ast = tree(source),
        mapped = target.kind === 'mapped-callsite-enum';
    const declarations = ast.program.body.flatMap((node) => {
        const declaration =
            mapped && t.isExportDefaultDeclaration(node)
                ? node.declaration
                : !mapped && t.isExportNamedDeclaration(node)
                  ? node.declaration
                  : null;
        return t.isFunctionDeclaration(declaration) && declaration.id?.name === target.exportName
            ? [declaration]
            : [];
    });
    const fn = declarations[0];
    if (
        declarations.length !== 1 ||
        !fn ||
        fn.async ||
        fn.generator ||
        fn.params.length ||
        fn.body.body.length !== 1 ||
        !t.isReturnStatement(fn.body.body[0]) ||
        !t.isJSXElement(fn.body.body[0].argument)
    )
        fail('UNSUPPORTED_TARGET');
    let selected: T.JSXElement | undefined,
        matches = 0;
    t.traverseFast(ast, (node) => {
        if (!t.isJSXElement(node)) return;
        const found = getAllExistingOids(node.openingElement.attributes);
        if (!found.values.includes(target.oid)) return;
        matches += found.values.filter((value) => value === target.oid).length;
        if (found.hasInvalid || found.hasMultiple) fail('DUPLICATE_OID');
        selected = node;
    });
    if (matches > 1) fail('DUPLICATE_OID');
    if (!selected) fail('INVALID_TARGET');
    function direct(node: T.JSXElement): T.JSXElement[] | null {
        if (node === selected) return [node];
        for (const child of node.children)
            if (t.isJSXElement(child)) {
                const found = direct(child);
                if (found) return [node, ...found];
            }
        return null;
    }
    const route = direct(fn.body.body[0].argument);
    if (!route) fail('UNSUPPORTED_TARGET');
    for (const node of route) {
        const isCallsite = mapped && node === selected;
        if (
            !t.isJSXIdentifier(node.openingElement.name) ||
            (!isCallsite && !native.has(node.openingElement.name.name))
        )
            fail('UNSUPPORTED_TARGET');
        attributes(node, isCallsite);
    }
    if (!mapped && !t.isJSXIdentifier(selected.openingElement.name, { name: 'a' }))
        fail('UNSUPPORTED_TARGET');
    const attr = attributes(selected, mapped).get(target.field);
    if (
        !attr ||
        !t.isStringLiteral(attr.value) ||
        attr.value.start == null ||
        attr.value.end == null
    )
        fail('UNSUPPORTED_TARGET');
    if (mapped && !['light', 'dark'].includes(attr.value.value)) fail('INVALID_VALUE');
    return { start: attr.value.start, end: attr.value.end, value: attr.value.value };
}

/** Local literal read only. Server callers must also validate the complete saved inventory. */
export function readContentPropertyTarget(source: string, target: ContentPropertyTarget): string {
    return literalRange(source, target).value;
}
/** Byte-preserving outside the one quoted JSX literal; authority is not implied. */
export function replaceContentPropertyTarget(
    source: string,
    target: ContentPropertyTarget,
    previousValue: string,
    value: string,
): string {
    if (
        typeof value !== 'string' ||
        !unicode(value) ||
        encoder.encode(value).byteLength > 2_048 ||
        // eslint-disable-next-line no-control-regex -- Reject control bytes in untrusted source identities and values.
        /[\u0000-\u001f\u007f]/.test(value)
    )
        fail('INVALID_VALUE');
    const range = literalRange(source, target);
    if (range.value !== previousValue) fail('PREVIOUS_VALUE_MISMATCH');
    if (target.kind === 'mapped-callsite-enum' && !['light', 'dark'].includes(value))
        fail('INVALID_VALUE');
    if (value === previousValue) return source;
    const literal = `"${value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}"`;
    const result = source.slice(0, range.start) + literal + source.slice(range.end);
    if (readContentPropertyTarget(result, target) !== value) fail('INVALID_VALUE');
    return result;
}
export function resolveContentPropertyTarget(
    files: Record<string, string>,
    selection: ContentPropertySelection,
): { path: string; target: ContentPropertyTarget; value: string } {
    inventory(files);
    if (selection?.kind === 'component-literal-href') {
        if (!exact(selection, 'exportName,kind,oid,path') || !path(selection.path))
            fail('INVALID_TARGET');
        const target: ContentPropertyTarget = {
            kind: selection.kind,
            exportName: selection.exportName,
            oid: selection.oid,
            field: 'href',
        };
        return {
            path: selection.path,
            target,
            value: readContentPropertyTarget(files[selection.path]!, target),
        };
    }
    if (
        selection?.kind !== 'mapped-callsite-enum' ||
        !exact(selection, 'itemId,kind,mappingId,oid') ||
        selection.itemId !== 'single'
    )
        fail('INVALID_TARGET');
    const found = resolveContentImageRenderMapping(files, {
        oid: selection.oid,
        mappingId: selection.mappingId,
        itemId: selection.itemId,
    });
    const { callsite } = found.renderMapping;
    const target: ContentPropertyTarget = {
        kind: selection.kind,
        exportName: callsite.exportName,
        oid: callsite.oid,
        field: 'tone',
        renderMapping: found.renderMapping,
    };
    return {
        path: callsite.path,
        target,
        value: readContentPropertyTarget(files[callsite.path]!, target),
    };
}
/** Re-resolve saved identity, including every existing image consumer check for mapped props. */
export function validateContentPropertyTarget(
    files: Record<string, string>,
    ownerPath: string,
    target: ContentPropertyTarget,
): string {
    checkTarget(target);
    if (!path(ownerPath)) fail('INVALID_TARGET');
    const found = resolveContentPropertyTarget(
        files,
        target.kind === 'component-literal-href'
            ? { kind: target.kind, path: ownerPath, exportName: target.exportName, oid: target.oid }
            : {
                  kind: target.kind,
                  oid: target.renderMapping.renderer.oid,
                  mappingId: target.renderMapping.mappingId,
                  itemId: 'single',
              },
    );
    if (
        found.path !== ownerPath ||
        found.target.kind !== target.kind ||
        found.target.oid !== target.oid ||
        found.target.exportName !== target.exportName
    )
        fail('INVALID_TARGET');
    if (target.kind === 'mapped-callsite-enum') {
        if (found.target.kind !== 'mapped-callsite-enum') fail('INVALID_TARGET');
        for (const key of ['callsite', 'renderer'] as const)
            for (const field of ['path', 'exportName', 'oid'] as const)
                if (target.renderMapping[key][field] !== found.target.renderMapping[key][field])
                    fail('INVALID_TARGET');
    }
    return found.value;
}
