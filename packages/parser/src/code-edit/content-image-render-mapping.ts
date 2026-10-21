import type { NodePath, T } from '../packages';
import type { ContentImageTarget, ContentImageValue } from './content-image-target';
import type { Binding } from '@babel/traverse';
import { getAllExistingOids } from '../ids';
import { parse, t, traverse } from '../packages';
import { readContentImageTarget } from './content-image-target';

export type ObjectImageRenderMapping = {
    version: 1;
    kind: 'object-prop-image';
    mappingId: string;
    callsite: { path: string; exportName: string; oid: string };
    renderer: { path: string; exportName: string; oid: string };
};
export type ContentImageRenderMapping = ObjectImageRenderMapping;
export type ContentImageRenderMappingErrorCode =
    | 'INVALID_SOURCE'
    | 'INVALID_MAPPING'
    | 'INVALID_INSTANCE'
    | 'MAPPING_NOT_FOUND'
    | 'AMBIGUOUS_MAPPING'
    | 'UNSUPPORTED_MAPPING'
    | 'INCOMPLETE_INVENTORY'
    | 'AMBIGUOUS_IMPORT'
    | 'DUPLICATE_OID'
    | 'UNSUPPORTED_CONSUMER';
export class ContentImageRenderMappingError extends Error {
    constructor(public readonly code: ContentImageRenderMappingErrorCode) {
        super(`CONTENT_IMAGE_RENDER_MAPPING_${code}`);
        this.name = 'ContentImageRenderMappingError';
    }
}
type Module = { path: string; source: string; ast: T.File; nodes: Map<T.Node, NodePath> };
type Edge = { module: Module; declaration: T.ImportDeclaration; target: string; runtime: boolean };
type Mount = {
    module: Module;
    element: T.JSXElement;
    mappingId: string;
    exportName: string;
    owner: Module;
    ownerName: string;
    ownerUse: T.Identifier;
    rendererUse: T.JSXIdentifier;
};
function fail(code: ContentImageRenderMappingErrorCode): never {
    throw new ContentImageRenderMappingError(code);
}
function identifier(value: string): boolean {
    return (
        typeof value === 'string' &&
        value.length > 0 &&
        value.length <= 160 &&
        !/[^A-Za-z0-9_.:-]/.test(value)
    );
}
function canonicalPath(path: string): boolean {
    return (
        path.length > 0 &&
        path.length <= 240 &&
        // eslint-disable-next-line no-control-regex -- Reject control bytes in untrusted source identities and values.
        !/[\\\u0000-\u001f\u007f]/.test(path) &&
        path.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
    );
}
function normalize(path: string): string {
    const parts: string[] = [];
    for (const part of path.split('/')) {
        if (!part || part === '.') continue;
        if (part === '..') {
            if (!parts.length) fail('INCOMPLETE_INVENTORY');
            parts.pop();
        } else parts.push(part);
    }
    return parts.join('/');
}
function scan(files: Record<string, string>): { modules: Map<string, Module>; edges: Edge[] } {
    if (!files || typeof files !== 'object' || Array.isArray(files)) fail('INVALID_SOURCE');
    const entries = Object.entries(files);
    if (!entries.length || entries.length > 400) fail('INVALID_SOURCE');
    let bytes = 0;
    for (const [path, source] of entries) {
        if (!canonicalPath(path) || typeof source !== 'string') fail('INVALID_SOURCE');
        const size = new TextEncoder().encode(source).byteLength;
        if (size > 750_000 || (bytes += size) > 4_000_000) fail('INVALID_SOURCE');
    }
    try {
        const config = JSON.parse(files['tsconfig.json'] ?? '') as {
            extends?: unknown;
            compilerOptions?: { baseUrl?: unknown; paths?: unknown };
        };
        if (
            config.extends ||
            config.compilerOptions?.baseUrl !== undefined ||
            JSON.stringify(config.compilerOptions?.paths) !== JSON.stringify({ '@/*': ['./src/*'] })
        )
            fail('AMBIGUOUS_IMPORT');
    } catch (error) {
        if (error instanceof ContentImageRenderMappingError) throw error;
        fail('INCOMPLETE_INVENTORY');
    }
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'];
    const resolve = (from: string, specifier: string): string | null => {
        if (!specifier.startsWith('.') && !specifier.startsWith('@/')) {
            if (specifier.startsWith('/') || specifier.startsWith('~') || specifier.startsWith('#'))
                fail('AMBIGUOUS_IMPORT');
            return null;
        }
        const base = normalize(
            specifier.startsWith('@/')
                ? `src/${specifier.slice(2)}`
                : `${from.slice(0, from.lastIndexOf('/') + 1)}${specifier}`,
        );
        const candidates = [
            base,
            ...extensions.map((ext) => base + ext),
            ...extensions.map((ext) => `${base}/index${ext}`),
        ].filter((path) => Object.hasOwn(files, path));
        if (candidates.length !== 1)
            fail(candidates.length ? 'AMBIGUOUS_IMPORT' : 'INCOMPLETE_INVENTORY');
        return candidates[0]!;
    };
    const modules = new Map<string, Module>(),
        edges: Edge[] = [],
        oids = new Set<string>();
    const executable = /\.(?:[cm]?[jt]sx?)$/;
    // Prepared browser bundles are separately pinned, not application-module consumers.
    const preparedScripts = new Set([
        'public/weblab-preload-script.js',
        'public/weblab-ix-runtime.js',
    ]);
    for (const [path, source] of entries) {
        if (!executable.test(path) || preparedScripts.has(path) || /\.d\.[cm]?ts$/.test(path))
            continue;
        let ast: T.File;
        try {
            ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
        } catch {
            fail('INVALID_SOURCE');
        }
        const module: Module = { path, source, ast, nodes: new Map() };
        modules.set(path, module);
        traverse(ast, {
            enter(nodePath) {
                module.nodes.set(nodePath.node, nodePath);
                const node = nodePath.node;
                if (
                    t.isTSImportEqualsDeclaration(node) ||
                    node.type === 'ImportExpression' ||
                    t.isImport(node) ||
                    (t.isIdentifier(node) &&
                        (['require', 'eval'].includes(node.name) ||
                            (node.name === 'Function' && nodePath.isReferencedIdentifier()))) ||
                    (t.isMemberExpression(node) &&
                        node.computed &&
                        t.isStringLiteral(node.property) &&
                        ['require', 'eval', 'Function'].includes(node.property.value))
                )
                    fail('UNSUPPORTED_CONSUMER');
                if (!t.isJSXOpeningElement(node)) return;
                const found = getAllExistingOids(node.attributes);
                if (found.hasMultiple) fail('DUPLICATE_OID');
                if (found.hasInvalid) fail('UNSUPPORTED_MAPPING');
                const oidIndex = found.indices[0];
                if (
                    oidIndex !== undefined &&
                    node.attributes.slice(oidIndex + 1).some((attr) => t.isJSXSpreadAttribute(attr))
                )
                    fail('UNSUPPORTED_MAPPING');
                for (const attr of node.attributes)
                    if (
                        t.isJSXSpreadAttribute(attr) &&
                        t.isObjectExpression(attr.argument) &&
                        attr.argument.properties.some(
                            (prop) =>
                                t.isObjectProperty(prop) &&
                                (t.isIdentifier(prop.key, { name: 'data-oid' }) ||
                                    t.isStringLiteral(prop.key, { value: 'data-oid' })),
                        )
                    )
                        fail('UNSUPPORTED_MAPPING');
                for (const oid of found.values) {
                    if (!identifier(oid)) fail('UNSUPPORTED_MAPPING');
                    if (oids.has(oid)) fail('DUPLICATE_OID');
                    oids.add(oid);
                }
            },
        });
    }
    for (const module of modules.values())
        for (const node of module.ast.program.body) {
            if (t.isImportDeclaration(node)) {
                const target = resolve(module.path, node.source.value);
                const runtime =
                    node.importKind !== 'type' &&
                    (node.specifiers.length === 0 ||
                        node.specifiers.some(
                            (spec) => !t.isImportSpecifier(spec) || spec.importKind !== 'type',
                        ));
                // No runtime import may turn an excluded executable into a hidden consumer.
                if (target && runtime && executable.test(target) && !modules.has(target))
                    fail('UNSUPPORTED_CONSUMER');
                if (target) edges.push({ module, declaration: node, target, runtime });
            } else if (
                (t.isExportNamedDeclaration(node) || t.isExportAllDeclaration(node)) &&
                node.source
            ) {
                resolve(module.path, node.source.value);
                if (node.exportKind !== 'type') fail('UNSUPPORTED_CONSUMER');
            }
        }
    return { modules, edges };
}
function attributes(element: T.JSXElement, allowSpread = false): Map<string, T.JSXAttribute> {
    const result = new Map<string, T.JSXAttribute>();
    let spreads = 0;
    for (const attr of element.openingElement.attributes) {
        if (t.isJSXSpreadAttribute(attr)) {
            if (!allowSpread || ++spreads > 1 || element.openingElement.attributes[0] !== attr)
                fail('UNSUPPORTED_MAPPING');
            continue;
        }
        if (
            !t.isJSXIdentifier(attr.name) ||
            result.has(attr.name.name) ||
            ['children', 'dangerouslySetInnerHTML', 'ref', 'key'].includes(attr.name.name)
        )
            fail('UNSUPPORTED_MAPPING');
        result.set(attr.name.name, attr);
    }
    return result;
}
function literal(attr: T.JSXAttribute | undefined): string | null {
    return attr && t.isStringLiteral(attr.value) ? attr.value.value : null;
}
function expression(attr: T.JSXAttribute | undefined): T.Expression | T.JSXEmptyExpression | null {
    return attr && t.isJSXExpressionContainer(attr.value) ? attr.value.expression : null;
}
function oid(element: T.JSXElement, allowSpread = false): string {
    const value = literal(attributes(element, allowSpread).get('data-oid'));
    if (value === null || !identifier(value)) fail('UNSUPPORTED_MAPPING');
    return value;
}
function binding(module: Module, node: T.Node, name: string): Binding {
    const found = module.nodes.get(node)?.scope.getBinding(name);
    if (!found || !found.constant || found.constantViolations.length) fail('UNSUPPORTED_MAPPING');
    return found;
}
function references(found: Binding, allowed: T.Node[]): void {
    if (found.referencePaths.some((path) => !allowed.includes(path.node)))
        fail('UNSUPPORTED_CONSUMER');
}
function imported(
    module: Module,
    use: T.Identifier | T.JSXIdentifier,
    edges: Edge[],
): { edge: Edge; exportName: string; binding: Binding } {
    const found = binding(module, use, use.name);
    if (!found.path.isImportSpecifier()) fail('UNSUPPORTED_MAPPING');
    const spec = found.path.node;
    if (
        spec.importKind === 'type' ||
        !t.isIdentifier(spec.imported) ||
        spec.imported.name !== spec.local.name
    )
        fail('UNSUPPORTED_MAPPING');
    const edge = edges.find(
        (edge) =>
            edge.module === module && edge.declaration.specifiers.includes(spec) && edge.runtime,
    );
    if (!edge) fail('INCOMPLETE_INVENTORY');
    return { edge, exportName: spec.imported.name, binding: found };
}
function exportedFunction(
    module: Module,
    name: string,
    defaultExport = false,
): T.FunctionDeclaration {
    const declarations: T.FunctionDeclaration[] = [];
    for (const node of module.ast.program.body) {
        if (!t.isExportNamedDeclaration(node) && !t.isExportDefaultDeclaration(node)) continue;
        if (defaultExport !== t.isExportDefaultDeclaration(node)) continue;
        if (t.isFunctionDeclaration(node.declaration) && node.declaration.id?.name === name)
            declarations.push(node.declaration);
    }
    if (declarations.length !== 1) fail('UNSUPPORTED_MAPPING');
    const fn = declarations[0]!;
    if (fn.async || fn.generator || !fn.id) fail('UNSUPPORTED_MAPPING');
    references(binding(module, fn, name), [module.nodes.get(fn)!.parentPath!.node]);
    return fn;
}
function returnedJsx(fn: T.FunctionDeclaration): T.JSXElement {
    const statement = fn.body.body[0];
    if (
        fn.body.body.length !== 1 ||
        !t.isReturnStatement(statement) ||
        !t.isJSXElement(statement.argument)
    )
        fail('UNSUPPORTED_MAPPING');
    return statement.argument;
}
function jsxPath(root: T.JSXElement, selected: T.JSXElement): T.JSXElement[] | null {
    if (root === selected) return [root];
    for (const child of root.children)
        if (t.isJSXElement(child)) {
            const path = jsxPath(child, selected);
            if (path) return [root, ...path];
        }
    return null;
}
function directNativePath(root: T.JSXElement, selected: T.JSXElement): void {
    const path = jsxPath(root, selected);
    if (
        !path ||
        path
            .slice(0, -1)
            .some(
                (node) =>
                    !t.isJSXIdentifier(node.openingElement.name) ||
                    !['main', 'header', 'section', 'div', 'article'].includes(
                        node.openingElement.name.name,
                    ),
            )
    )
        fail('UNSUPPORTED_MAPPING');
    path.slice(0, -1).forEach((node) => attributes(node));
}
function rendererGrammar(module: Module, fn: T.FunctionDeclaration, selectedOid: string): void {
    if (fn.params.length !== 1 || !t.isObjectPattern(fn.params[0])) fail('UNSUPPORTED_MAPPING');
    const names = new Set<string>();
    const supported = [
        'eyebrowEmphasis',
        'eyebrowLead',
        'eyebrowTail',
        'heading',
        'imageSrc',
        'imageAlt',
        'imageWidth',
        'imageHeight',
        'tone',
        'weblabContentMapping',
    ];
    for (const prop of fn.params[0].properties) {
        if (
            !t.isObjectProperty(prop) ||
            prop.computed ||
            !t.isIdentifier(prop.key) ||
            !supported.includes(prop.key.name) ||
            names.has(prop.key.name)
        )
            fail('UNSUPPORTED_MAPPING');
        const value = t.isAssignmentPattern(prop.value) ? prop.value.left : prop.value;
        if (!t.isIdentifier(value, { name: prop.key.name })) fail('UNSUPPORTED_MAPPING');
        if (
            t.isAssignmentPattern(prop.value) &&
            !(
                (prop.key.name === 'tone' &&
                    t.isStringLiteral(prop.value.right, { value: 'dark' })) ||
                (prop.key.name === 'eyebrowEmphasis' &&
                    t.isStringLiteral(prop.value.right, { value: 'lead' }))
            )
        )
            fail('UNSUPPORTED_MAPPING');
        names.add(prop.key.name);
    }
    for (const name of [
        'imageSrc',
        'imageAlt',
        'imageWidth',
        'imageHeight',
        'weblabContentMapping',
    ])
        if (!names.has(name)) fail('UNSUPPORTED_MAPPING');
    const root = returnedJsx(fn);
    const selected: T.JSXElement[] = [];
    t.traverseFast(root, (node) => {
        if (
            t.isJSXElement(node) &&
            node.openingElement.attributes.some(
                (attr) =>
                    t.isJSXAttribute(attr) &&
                    t.isJSXIdentifier(attr.name, { name: 'data-oid' }) &&
                    literal(attr) === selectedOid,
            )
        )
            selected.push(node);
    });
    if (selected.length !== 1) fail('MAPPING_NOT_FOUND');
    const leaf = selected[0]!;
    if (
        !t.isJSXIdentifier(leaf.openingElement.name, { name: 'img' }) ||
        !leaf.openingElement.selfClosing
    )
        fail('UNSUPPORTED_MAPPING');
    directNativePath(root, leaf);
    const attrs = attributes(leaf);
    if (
        attrs.has('srcSet') ||
        attrs.has('sizes') ||
        attrs.has('onLoad') ||
        attrs.has('onError') ||
        [...attrs.keys()].some((name) => name.startsWith('on'))
    )
        fail('UNSUPPORTED_MAPPING');
    for (const [attribute, name] of [
        ['src', 'imageSrc'],
        ['alt', 'imageAlt'],
        ['width', 'imageWidth'],
        ['height', 'imageHeight'],
        ['data-weblab-content-map', 'weblabContentMapping'],
    ] as const) {
        const use = expression(attrs.get(attribute));
        if (
            !t.isIdentifier(use, { name }) ||
            binding(module, use, name) !== binding(module, fn.body, name)
        )
            fail('UNSUPPORTED_MAPPING');
        references(binding(module, use, name), [use]);
    }
    if (literal(attrs.get('data-weblab-content-item')) !== 'single') fail('UNSUPPORTED_MAPPING');
}
function mount(
    module: Module,
    element: T.JSXElement,
    edges: Edge[],
    modules: Map<string, Module>,
): Mount {
    if (
        !/^(?:src\/)?app\/(?:[^/]+\/)*page\.[jt]sx$/.test(module.path) ||
        !element.openingElement.selfClosing ||
        !t.isJSXIdentifier(element.openingElement.name)
    )
        fail('UNSUPPORTED_MAPPING');
    const attrs = attributes(element, true);
    const mappingId = literal(attrs.get('weblabContentMapping'));
    if (mappingId === null || !identifier(mappingId)) fail('INVALID_MAPPING');
    oid(element, true);
    for (const [name, attr] of attrs) {
        if (['data-oid', 'weblabContentMapping'].includes(name)) continue;
        if (
            ['tone', 'eyebrowEmphasis'].includes(name) &&
            t.isStringLiteral(attr.value) &&
            (name === 'tone' ? ['light', 'dark'] : ['lead', 'tail']).includes(attr.value.value)
        )
            continue;
        const value = expression(attr);
        if (
            ['imageWidth', 'imageHeight'].includes(name) &&
            t.isNumericLiteral(value) &&
            Number.isSafeInteger(value.value) &&
            value.value > 0
        )
            continue;
        fail('UNSUPPORTED_MAPPING');
    }
    const spread = element.openingElement.attributes[0];
    if (!t.isJSXSpreadAttribute(spread) || !t.isIdentifier(spread.argument))
        fail('UNSUPPORTED_MAPPING');
    const ownerImport = imported(module, spread.argument, edges),
        owner = modules.get(ownerImport.edge.target);
    if (!owner) fail('INCOMPLETE_INVENTORY');
    const fnPath = module.nodes.get(element)?.getFunctionParent();
    if (!fnPath?.isFunctionDeclaration() || !fnPath.node.id) fail('UNSUPPORTED_MAPPING');
    const fn = exportedFunction(module, fnPath.node.id.name, true);
    if (fn !== fnPath.node || fn.params.length) fail('UNSUPPORTED_MAPPING');
    directNativePath(returnedJsx(fn), element);
    if (edges.some((edge) => edge.runtime && edge.target === module.path))
        fail('UNSUPPORTED_CONSUMER');
    return {
        module,
        element,
        mappingId,
        exportName: fn.id!.name,
        owner,
        ownerName: ownerImport.exportName,
        ownerUse: spread.argument,
        rendererUse: element.openingElement.name,
    };
}
/** Complete saved text inventory only; missing dependencies and unaccounted consumers refuse. */
export function resolveContentImageRenderMapping(
    files: Record<string, string>,
    selection: {
        oid: string;
        mappingId: string;
        itemId: string;
    },
): {
    path: string;
    target: ContentImageTarget;
    value: ContentImageValue;
    renderMapping: ObjectImageRenderMapping;
    dependencies: string[];
} {
    if (!selection || !identifier(selection.oid) || !identifier(selection.mappingId))
        fail('INVALID_MAPPING');
    if (selection.itemId !== 'single') fail('INVALID_INSTANCE');
    const { modules, edges } = scan(files);
    const candidates: { module: Module; element: T.JSXElement }[] = [];
    for (const module of modules.values())
        t.traverseFast(module.ast, (node) => {
            if (!t.isJSXElement(node)) return;
            if (
                node.openingElement.attributes.some(
                    (attr) =>
                        t.isJSXAttribute(attr) &&
                        t.isJSXIdentifier(attr.name, { name: 'weblabContentMapping' }) &&
                        literal(attr) === selection.mappingId,
                )
            )
                candidates.push({ module, element: node });
        });
    if (candidates.length !== 1)
        fail(candidates.length ? 'AMBIGUOUS_MAPPING' : 'MAPPING_NOT_FOUND');
    const selected = candidates[0]!,
        selectedMount = mount(selected.module, selected.element, edges, modules);
    const rendererImport = imported(selected.module, selectedMount.rendererUse, edges);
    const renderer = modules.get(rendererImport.edge.target);
    if (!renderer) fail('INCOMPLETE_INVENTORY');
    rendererGrammar(renderer, exportedFunction(renderer, rendererImport.exportName), selection.oid);
    const mounts: Mount[] = [];
    for (const edge of edges.filter((edge) => edge.runtime && edge.target === renderer.path)) {
        if (!edge.declaration.specifiers.length) fail('UNSUPPORTED_CONSUMER');
        for (const spec of edge.declaration.specifiers) {
            if (t.isImportSpecifier(spec) && spec.importKind === 'type') continue;
            if (!t.isImportSpecifier(spec) || !t.isIdentifier(spec.imported))
                fail('UNSUPPORTED_CONSUMER');
            if (spec.imported.name !== rendererImport.exportName) continue;
            if (spec.local.name !== spec.imported.name) fail('UNSUPPORTED_CONSUMER');
            const found = binding(edge.module, spec, spec.local.name);
            if (!found.referencePaths.length) fail('UNSUPPORTED_CONSUMER');
            for (const reference of found.referencePaths) {
                const opening = reference.parentPath;
                const element = opening?.parentPath;
                if (
                    !reference.isJSXIdentifier() ||
                    !opening?.isJSXOpeningElement() ||
                    opening.node.name !== reference.node ||
                    !element?.isJSXElement()
                )
                    fail('UNSUPPORTED_CONSUMER');
                const entry = mount(edge.module, element.node, edges, modules);
                imported(edge.module, entry.rendererUse, edges);
                mounts.push(entry);
            }
        }
    }
    if (!mounts.some((entry) => entry.element === selected.element)) fail('UNSUPPORTED_MAPPING');
    if (new Set(mounts.map((entry) => entry.mappingId)).size !== mounts.length)
        fail('AMBIGUOUS_MAPPING');
    for (const entry of mounts) {
        const target: ContentImageTarget = {
            kind: 'object-image',
            exportName: entry.ownerName,
            srcProperty: 'imageSrc',
            altProperty: 'imageAlt',
        };
        readContentImageTarget(entry.owner.source, target);
        const ownerImport = imported(entry.module, entry.ownerUse, edges);
        references(ownerImport.binding, [entry.ownerUse]);
        // Each object has exactly one proven mount. Other named exports in its module are independent.
        const sameOwner = mounts.filter(
            (other) => other.owner === entry.owner && other.ownerName === entry.ownerName,
        );
        if (sameOwner.length !== 1) fail('UNSUPPORTED_CONSUMER');
        for (const edge of edges.filter(
            (edge) => edge.runtime && edge.target === entry.owner.path,
        )) {
            if (!edge.declaration.specifiers.length) fail('UNSUPPORTED_CONSUMER');
            for (const spec of edge.declaration.specifiers) {
                if (t.isImportSpecifier(spec) && spec.importKind === 'type') continue;
                if (!t.isImportSpecifier(spec) || !t.isIdentifier(spec.imported))
                    fail('UNSUPPORTED_CONSUMER');
                if (
                    spec.imported.name === entry.ownerName &&
                    (edge !== ownerImport.edge || spec !== ownerImport.binding.path.node)
                )
                    fail('UNSUPPORTED_CONSUMER');
            }
        }
    }
    const target: ContentImageTarget = {
        kind: 'object-image',
        exportName: selectedMount.ownerName,
        srcProperty: 'imageSrc',
        altProperty: 'imageAlt',
    };
    return {
        path: selectedMount.owner.path,
        target,
        value: readContentImageTarget(selectedMount.owner.source, target),
        renderMapping: {
            version: 1,
            kind: 'object-prop-image',
            mappingId: selectedMount.mappingId,
            callsite: {
                path: selectedMount.module.path,
                exportName: selectedMount.exportName,
                oid: oid(selectedMount.element, true),
            },
            renderer: {
                path: renderer.path,
                exportName: rendererImport.exportName,
                oid: selection.oid,
            },
        },
        dependencies: [
            ...new Set(['tsconfig.json', ...modules.keys(), ...edges.map((edge) => edge.target)]),
        ].sort(),
    };
}
