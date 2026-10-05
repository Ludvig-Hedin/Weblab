import type { Binding } from '@babel/traverse';
import { parse, traverse, t, type NodePath, type T } from '../packages';
import { getAllExistingOids } from '../ids';
import { readContentTextTarget, type ContentTextTarget } from './content-target';

export type KeyedTextRenderMapping = {
    version: 1;
    kind: 'keyed-prop-map';
    mappingId: string;
    callsite: { path: string; exportName: string; oid: string };
    renderer: { path: string; exportName: string; oid: string };
};
export type ContentTextRenderMappingErrorCode = 'INVALID_SOURCE' | 'INVALID_MAPPING' | 'INVALID_INSTANCE'
    | 'MAPPING_NOT_FOUND' | 'AMBIGUOUS_MAPPING' | 'UNSUPPORTED_MAPPING' | 'INCOMPLETE_INVENTORY'
    | 'AMBIGUOUS_IMPORT' | 'DUPLICATE_OID' | 'UNSUPPORTED_CONSUMER';
export class ContentTextRenderMappingError extends Error {
    constructor(public readonly code: ContentTextRenderMappingErrorCode) {
        super(`CONTENT_TEXT_RENDER_MAPPING_${code}`);
        this.name = 'ContentTextRenderMappingError';
    }
}
type DataTarget = Extract<ContentTextTarget, { kind: 'data-leaf' }>;
type Module = { path: string; source: string; ast: T.File; nodes: Map<T.Node, NodePath> };
type ImportEdge = { module: Module; declaration: T.ImportDeclaration; target: string; runtime: boolean };
const script = /\.(?:[cm]?[jt]sx?)$/;
const id = { test: (value: string) => typeof value === 'string' && value.length > 0 && value.length <= 160 && !/[^A-Za-z0-9_.:-]/.test(value) };
const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'];
const nativeText = new Set(['span', 'p']);
function fail(code: ContentTextRenderMappingErrorCode): never { throw new ContentTextRenderMappingError(code); }
function canonicalPath(path: string): boolean {
    return path.length > 0 && path.length <= 240 && !/[\\\u0000-\u001f\u007f]/.test(path)
        && path.split('/').every(part => part !== '' && part !== '.' && part !== '..');
}
function normalize(path: string): string {
    const parts: string[] = [];
    for (const part of path.split('/')) {
        if (part === '.' || part === '') continue;
        if (part === '..') { if (!parts.length) fail('INCOMPLETE_INVENTORY'); parts.pop(); }
        else parts.push(part);
    }
    return parts.join('/');
}
function attributes(element: T.JSXElement): Map<string, T.JSXAttribute> {
    const result = new Map<string, T.JSXAttribute>();
    for (const attr of element.openingElement.attributes) {
        if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name) || result.has(attr.name.name)
            || ['children', 'dangerouslySetInnerHTML'].includes(attr.name.name)) fail('UNSUPPORTED_MAPPING');
        result.set(attr.name.name, attr);
    }
    return result;
}
function expression(attr: T.JSXAttribute | undefined): T.Expression | T.JSXEmptyExpression | null {
    return attr && t.isJSXExpressionContainer(attr.value) ? attr.value.expression : null;
}
function literalOid(element: T.JSXElement): string {
    const attr = attributes(element).get('data-oid');
    if (!attr || !t.isStringLiteral(attr.value) || !id.test(attr.value.value)) fail('UNSUPPORTED_MAPPING');
    return attr.value.value;
}
function member(node: T.Node | null | undefined, object: string, property: string): node is T.MemberExpression & { object: T.Identifier } {
    return t.isMemberExpression(node) && !node.computed && t.isIdentifier(node.object, { name: object }) && t.isIdentifier(node.property, { name: property });
}
function binding(module: Module, at: T.Node, name: string): Binding {
    const found = module.nodes.get(at)?.scope.getBinding(name);
    if (!found || !found.constant || found.constantViolations.length) fail('UNSUPPORTED_MAPPING');
    return found;
}
function references(found: Binding, allowed: T.Node[]): void {
    if (found.referencePaths.some(path => !allowed.includes(path.node))) fail('UNSUPPORTED_MAPPING');
}
function boundIdentifier(module: Module, node: T.Node | null | undefined, found: Binding): T.Identifier {
    if (!t.isIdentifier(node) || module.nodes.get(node)?.scope.getBinding(node.name) !== found) fail('UNSUPPORTED_MAPPING');
    return node;
}
function exportedFunction(module: Module, name: string, defaultExport = false): T.FunctionDeclaration {
    const candidates = module.ast.program.body.filter(node => defaultExport ? t.isExportDefaultDeclaration(node) : t.isExportNamedDeclaration(node));
    const declarations = candidates.flatMap(node => 'declaration' in node && t.isFunctionDeclaration(node.declaration)
        && node.declaration.id?.name === name ? [node.declaration] : []);
    if (declarations.length !== 1) fail('UNSUPPORTED_MAPPING');
    const fn = declarations[0]!;
    if (fn.async || fn.generator || !fn.id) fail('UNSUPPORTED_MAPPING');
    const own = binding(module, fn, name);
    // Babel includes the export declaration as a reference to an exported function.
    references(own, [module.nodes.get(fn)!.parentPath!.node]);
    return fn;
}
function directReturnedJsx(fn: T.FunctionDeclaration): T.JSXElement {
    if (fn.params.length || fn.body.body.length !== 1) fail('UNSUPPORTED_MAPPING');
    const statement = fn.body.body[0];
    if (!t.isReturnStatement(statement) || !t.isJSXElement(statement.argument)) fail('UNSUPPORTED_MAPPING');
    return statement.argument;
}
/** Follow children only: callbacks, conditionals and portals are not a proven source mount. */
function jsxPath(root: T.JSXElement, selected: T.JSXElement): T.JSXElement[] | null {
    if (root === selected) return [root];
    for (const child of root.children) if (t.isJSXElement(child)) {
        const found = jsxPath(child, selected);
        if (found) return [root, ...found];
    }
    return null;
}
function scan(files: Record<string, string>): { modules: Map<string, Module>; edges: ImportEdge[] } {
    if (!files || typeof files !== 'object' || Array.isArray(files)) fail('INVALID_SOURCE');
    const entries = Object.entries(files);
    if (!entries.length || entries.length > 1_000) fail('INVALID_SOURCE');
    let bytes = 0;
    for (const [path, source] of entries) {
        if (!canonicalPath(path) || typeof source !== 'string') fail('INVALID_SOURCE');
        const size = new TextEncoder().encode(source).byteLength;
        if (size > 750_000 || (bytes += size) > 8_000_000) fail('INVALID_SOURCE');
    }
    // This is the preparation profile's single supported alias, not a JS/TS module loader.
    try {
        const config = JSON.parse(files['tsconfig.json'] ?? '') as { extends?: unknown; compilerOptions?: { baseUrl?: unknown; paths?: unknown } };
        if (config.extends || config.compilerOptions?.baseUrl !== undefined
            || JSON.stringify(config.compilerOptions?.paths) !== JSON.stringify({ '@/*': ['./src/*'] })) fail('AMBIGUOUS_IMPORT');
    } catch (error) { if (error instanceof ContentTextRenderMappingError) throw error; fail('INCOMPLETE_INVENTORY'); }
    const resolve = (from: string, specifier: string): string | null => {
        if (!specifier.startsWith('.') && !specifier.startsWith('@/')) {
            if (specifier.startsWith('/') || specifier.startsWith('~') || specifier.startsWith('#')) fail('AMBIGUOUS_IMPORT');
            return null;
        }
        const base = normalize(specifier.startsWith('@/') ? `src/${specifier.slice(2)}` : `${from.slice(0, from.lastIndexOf('/') + 1)}${specifier}`);
        const candidates = [base, ...extensions.map(ext => base + ext), ...extensions.map(ext => `${base}/index${ext}`)]
            .filter(path => Object.hasOwn(files, path));
        if (candidates.length !== 1) fail(candidates.length ? 'AMBIGUOUS_IMPORT' : 'INCOMPLETE_INVENTORY');
        return candidates[0]!;
    };
    const modules = new Map<string, Module>(), edges: ImportEdge[] = [];
    const oids = new Set<string>();
    for (const [path, source] of entries) {
        // Public scripts execute as pinned browser assets, not source modules. Declarations are type-only.
        if (!script.test(path) || path.startsWith('public/') || /\.d\.[cm]?ts$/.test(path)) continue;
        let ast: T.File;
        try { ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] }); }
        catch { fail('INVALID_SOURCE'); }
        const module: Module = { path, source, ast, nodes: new Map() };
        modules.set(path, module);
        traverse(ast, { enter(nodePath) {
            module.nodes.set(nodePath.node, nodePath);
            const node = nodePath.node;
            if (t.isTSImportEqualsDeclaration(node) || node.type === 'ImportExpression' || t.isImport(node)
                || (t.isIdentifier(node) && (['require', 'eval'].includes(node.name) || (node.name === 'Function' && nodePath.isReferencedIdentifier())))
                || (t.isMemberExpression(node) && node.computed && t.isStringLiteral(node.property) && ['require', 'eval', 'Function'].includes(node.property.value))) fail('UNSUPPORTED_CONSUMER');
            if (!t.isJSXOpeningElement(node)) return;
            const found = getAllExistingOids(node.attributes);
            if (found.hasMultiple) fail('DUPLICATE_OID');
            if (found.hasInvalid) fail('UNSUPPORTED_MAPPING');
            const oidIndex = found.indices[0];
            if (oidIndex !== undefined && node.attributes.slice(oidIndex + 1).some(attr => t.isJSXSpreadAttribute(attr))) fail('UNSUPPORTED_MAPPING');
            for (const attr of node.attributes) if (t.isJSXSpreadAttribute(attr) && t.isObjectExpression(attr.argument)
                && attr.argument.properties.some(prop => t.isObjectProperty(prop) && (t.isIdentifier(prop.key, { name: 'data-oid' })
                    || t.isStringLiteral(prop.key, { value: 'data-oid' })))) fail('UNSUPPORTED_MAPPING');
            for (const oid of found.values) {
                if (!id.test(oid)) fail('UNSUPPORTED_MAPPING');
                if (oids.has(oid)) fail('DUPLICATE_OID');
                oids.add(oid);
            }
        } });
    }
    for (const module of modules.values()) for (const node of module.ast.program.body) {
        if (t.isImportDeclaration(node)) {
            const target = resolve(module.path, node.source.value);
            if (target) edges.push({ module, declaration: node, target, runtime: node.importKind !== 'type'
                && (node.specifiers.length === 0 || node.specifiers.some(spec => !t.isImportSpecifier(spec) || spec.importKind !== 'type')) });
        } else if ((t.isExportNamedDeclaration(node) || t.isExportAllDeclaration(node)) && node.source) {
            // Barrels obscure binding ownership, even if the reexport is never mounted.
            resolve(module.path, node.source.value);
            if (node.exportKind !== 'type') fail('UNSUPPORTED_CONSUMER');
        }
    }
    return { modules, edges };
}
function imported(module: Module, use: T.Identifier | T.JSXIdentifier, edges: ImportEdge[]): { edge: ImportEdge; exportName: string } {
    const found = binding(module, use, use.name);
    if (!found.path.isImportSpecifier()) fail('UNSUPPORTED_MAPPING');
    const spec = found.path.node;
    if (spec.importKind === 'type' || !t.isIdentifier(spec.imported) || spec.imported.name !== spec.local.name) fail('UNSUPPORTED_MAPPING');
    const edge = edges.find(edge => edge.module === module && edge.declaration.specifiers.includes(spec) && edge.runtime);
    if (!edge) fail('INCOMPLETE_INVENTORY');
    references(found, [use]);
    return { edge, exportName: spec.imported.name };
}
function rendererGrammar(module: Module, fn: T.FunctionDeclaration, selectedOid: string): 'question' | 'answer' {
    if (fn.params.length !== 1 || !t.isObjectPattern(fn.params[0])) fail('UNSUPPORTED_MAPPING');
    const params = fn.params[0].properties;
    const expected = ['items', 'heading', 'eyebrowLead', 'eyebrowTail', 'avatarSrc', 'className', 'weblabContentMapping'];
    if (params.length !== expected.length || params.some(prop => !t.isObjectProperty(prop) || prop.computed || !prop.shorthand
        || !t.isIdentifier(prop.key) || !t.isIdentifier(prop.value) || prop.key.name !== prop.value.name || !expected.includes(prop.key.name))) fail('UNSUPPORTED_MAPPING');
    const items = binding(module, fn.body, 'items'), mapping = binding(module, fn.body, 'weblabContentMapping');
    const [heading, state, guard, returned] = fn.body.body;
    if (fn.body.body.length !== 4 || !t.isVariableDeclaration(heading, { kind: 'const' }) || heading.declarations.length !== 1
        || !t.isIdentifier(heading.declarations[0]!.id, { name: 'headingId' }) || !t.isCallExpression(heading.declarations[0]!.init)
        || !t.isIdentifier(heading.declarations[0]!.init.callee, { name: 'useId' }) || heading.declarations[0]!.init.arguments.length
        || !t.isVariableDeclaration(state, { kind: 'const' }) || state.declarations.length !== 1) fail('UNSUPPORTED_MAPPING');
    const stateDecl = state.declarations[0]!;
    if (!t.isArrayPattern(stateDecl.id) || stateDecl.id.elements.length !== 2
        || !t.isIdentifier(stateDecl.id.elements[0], { name: 'activeItem' }) || !t.isIdentifier(stateDecl.id.elements[1], { name: 'setActiveItem' })
        || !t.isCallExpression(stateDecl.init) || !t.isIdentifier(stateDecl.init.callee, { name: 'useState' }) || stateDecl.init.arguments.length !== 1) fail('UNSUPPORTED_MAPPING');
    for (const name of ['useId', 'useState']) {
        const hook = binding(module, fn.body, name);
        if (!hook.path.isImportSpecifier() || !t.isIdentifier(hook.path.node.imported, { name })
            || !hook.path.parentPath.isImportDeclaration() || hook.path.parentPath.node.source.value !== 'react') fail('UNSUPPORTED_MAPPING');
    }
    const initial = stateDecl.init.arguments[0];
    if (!t.isLogicalExpression(initial, { operator: '??' }) || !t.isStringLiteral(initial.right, { value: '' })
        || !t.isOptionalMemberExpression(initial.left) || !initial.left.optional || initial.left.computed || !t.isIdentifier(initial.left.property, { name: 'id' })
        || !t.isMemberExpression(initial.left.object) || !initial.left.object.computed || !t.isNumericLiteral(initial.left.object.property, { value: 0 })) fail('UNSUPPORTED_MAPPING');
    const stateItems = boundIdentifier(module, initial.left.object.object, items);
    if (!t.isIfStatement(guard) || guard.alternate || !t.isUnaryExpression(guard.test, { operator: '!' }) || !member(guard.test.argument, 'items', 'length')
        || !t.isReturnStatement(guard.consequent) || !t.isNullLiteral(guard.consequent.argument)
        || !t.isReturnStatement(returned) || !t.isJSXElement(returned.argument)) fail('UNSUPPORTED_MAPPING');
    const guardItems = boundIdentifier(module, guard.test.argument.object, items);
    const maps: T.CallExpression[] = [];
    t.traverseFast(returned.argument, node => { if (t.isCallExpression(node) && member(node.callee, 'items', 'map')) maps.push(node); });
    if (maps.length !== 1) fail('UNSUPPORTED_MAPPING');
    const map = maps[0]!;
    if (!member(map.callee, 'items', 'map') || map.arguments.length !== 1 || !t.isArrowFunctionExpression(map.arguments[0])) fail('UNSUPPORTED_MAPPING');
    const mapItems = boundIdentifier(module, map.callee.object, items), callback = map.arguments[0];
    references(items, [stateItems, guardItems, mapItems]);
    if (callback.async || callback.params.length !== 1 || !t.isIdentifier(callback.params[0], { name: 'item' }) || !t.isBlockStatement(callback.body)
        || callback.body.body.length !== 2) fail('UNSUPPORTED_MAPPING');
    const [open, entryReturn] = callback.body.body;
    if (!t.isVariableDeclaration(open, { kind: 'const' }) || open.declarations.length !== 1 || !t.isIdentifier(open.declarations[0]!.id, { name: 'isOpen' })
        || !t.isBinaryExpression(open.declarations[0]!.init, { operator: '===' }) || !t.isIdentifier(open.declarations[0]!.init.left, { name: 'activeItem' })
        || !member(open.declarations[0]!.init.right, 'item', 'id') || !t.isReturnStatement(entryReturn) || !t.isJSXElement(entryReturn.argument)) fail('UNSUPPORTED_MAPPING');
    const item = binding(module, callback.body, 'item');
    const itemRefs: T.Node[] = [boundIdentifier(module, open.declarations[0]!.init.right.object, item)];
    const root = entryReturn.argument;
    if (!t.isJSXMemberExpression(root.openingElement.name) || !t.isJSXIdentifier(root.openingElement.name.object, { name: 'AccordionPrimitive' })
        || !t.isJSXIdentifier(root.openingElement.name.property, { name: 'Item' })) fail('UNSUPPORTED_MAPPING');
    const accordion = binding(module, root.openingElement.name.object, 'AccordionPrimitive');
    if (!accordion.path.isImportNamespaceSpecifier() || !accordion.path.parentPath.isImportDeclaration()
        || accordion.path.parentPath.node.source.value !== '@radix-ui/react-accordion') fail('UNSUPPORTED_MAPPING');
    const rootAttrs = attributes(root);
    for (const prop of ['key', 'value']) {
        const value = expression(rootAttrs.get(prop));
        if (!member(value, 'item', 'id')) fail('UNSUPPORTED_MAPPING');
        itemRefs.push(boundIdentifier(module, value.object, item));
    }
    const mapPath = module.nodes.get(map);
    if (!mapPath?.parentPath?.isJSXExpressionContainer() || !mapPath.parentPath.parentPath?.isJSXElement()) fail('UNSUPPORTED_MAPPING');
    const outer = jsxPath(returned.argument, mapPath.parentPath.parentPath.node);
    if (!outer) fail('UNSUPPORTED_MAPPING');
    outer.forEach(attributes);
    const leaves = new Map<'question' | 'answer', T.JSXElement>(), mappingRefs: T.Node[] = [];
    t.traverseFast(root, node => {
        if (!t.isJSXElement(node)) return;
        const meaningful = node.children.filter(child => !t.isJSXText(child) || child.value.trim());
        if (meaningful.length !== 1 || !t.isJSXExpressionContainer(meaningful[0])) return;
        const value = meaningful[0].expression;
        const property = member(value, 'item', 'question') ? 'question' : member(value, 'item', 'answer') ? 'answer' : null;
        if (!property || !t.isMemberExpression(value)) return;
        if (leaves.has(property) || !t.isJSXIdentifier(node.openingElement.name) || !nativeText.has(node.openingElement.name.name)) fail('UNSUPPORTED_MAPPING');
        const path = jsxPath(root, node);
        if (!path) fail('UNSUPPORTED_MAPPING');
        path.forEach(attributes);
        const attrs = attributes(node), itemMeta = expression(attrs.get('data-weblab-content-item'));
        if (!member(itemMeta, 'item', 'id')) fail('UNSUPPORTED_MAPPING');
        itemRefs.push(boundIdentifier(module, value.object, item), boundIdentifier(module, itemMeta.object, item));
        mappingRefs.push(boundIdentifier(module, expression(attrs.get('data-weblab-content-map')), mapping));
        literalOid(node); leaves.set(property, node);
    });
    if (leaves.size !== 2) fail('UNSUPPORTED_MAPPING');
    references(item, itemRefs); references(mapping, mappingRefs);
    const selected = [...leaves].find(([, node]) => literalOid(node) === selectedOid);
    if (!selected) fail('INVALID_INSTANCE');
    return selected[0];
}

/** Recognizes this preparation grammar only; callers must supply the complete authoritative saved inventory. */
export function resolveContentTextRenderMapping({ files, oid, mappingId, itemId }: {
    files: Record<string, string>; oid: string; mappingId: string; itemId: string;
}): { path: string; target: DataTarget; renderMapping: KeyedTextRenderMapping; value: string; dependencies: string[] } {
    if (!id.test(oid) || !id.test(mappingId) || typeof itemId !== 'string' || !itemId || itemId.length > 160 || /[\u0000-\u001f\u007f]/.test(itemId)) fail('INVALID_MAPPING');
    const { modules, edges } = scan(files);
    const callsites: Array<{ module: Module; element: T.JSXElement }> = [];
    for (const module of modules.values()) t.traverseFast(module.ast, node => {
        if (!t.isJSXElement(node)) return;
        for (const attr of node.openingElement.attributes) if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name, { name: 'weblabContentMapping' })) {
            if (!t.isStringLiteral(attr.value)) fail('UNSUPPORTED_MAPPING');
            if (attr.value.value === mappingId) callsites.push({ module, element: node });
        }
    });
    if (callsites.length !== 1) fail(callsites.length ? 'AMBIGUOUS_MAPPING' : 'MAPPING_NOT_FOUND');
    const { module: wrapper, element: callsite } = callsites[0]!;
    const enclosing = wrapper.nodes.get(callsite)?.getFunctionParent();
    if (!enclosing?.isFunctionDeclaration() || !enclosing.node.id) fail('UNSUPPORTED_MAPPING');
    const wrapperName = enclosing.node.id.name, wrapperFn = exportedFunction(wrapper, wrapperName);
    if (directReturnedJsx(wrapperFn) !== callsite || !callsite.openingElement.selfClosing || !t.isJSXIdentifier(callsite.openingElement.name)) fail('UNSUPPORTED_MAPPING');
    const attrs = attributes(callsite), collection = expression(attrs.get('items'));
    if (!t.isIdentifier(collection)) fail('UNSUPPORTED_MAPPING');
    const ownerImport = imported(wrapper, collection, edges), rendererImport = imported(wrapper, callsite.openingElement.name, edges);
    const owner = modules.get(ownerImport.edge.target), renderer = modules.get(rendererImport.edge.target);
    if (!owner || !renderer || owner === renderer || owner === wrapper || renderer === wrapper) fail('UNSUPPORTED_MAPPING');
    const rendererFn = exportedFunction(renderer, rendererImport.exportName);
    const property = rendererGrammar(renderer, rendererFn, oid);
    const mounts = edges.filter(edge => edge.target === wrapper.path && edge.runtime);
    if (mounts.length !== 1 || mounts[0]!.module.path !== 'src/app/page.tsx') fail('UNSUPPORTED_CONSUMER');
    const mountEdge = mounts[0]!, homepage = mountEdge.module;
    if (edges.some(edge => edge.runtime && edge.target === homepage.path)) fail('UNSUPPORTED_CONSUMER');
    const homeFn = exportedFunction(homepage, 'HomePage', true), homeRoot = directReturnedJsx(homeFn);
    const mountNodes: T.JSXElement[] = [];
    t.traverseFast(homeRoot, node => { if (t.isJSXElement(node) && t.isJSXIdentifier(node.openingElement.name, { name: wrapperName })) mountNodes.push(node); });
    if (mountNodes.length !== 1) fail('UNSUPPORTED_CONSUMER');
    const mount = mountNodes[0]!;
    if (!t.isJSXIdentifier(mount.openingElement.name) || !mount.openingElement.selfClosing || literalOid(mount) !== 'ge98qit'
        || mount.openingElement.attributes.length !== 1) fail('UNSUPPORTED_MAPPING');
    const mounted = imported(homepage, mount.openingElement.name, edges);
    if (mounted.edge !== mountEdge || mounted.exportName !== wrapperName) fail('UNSUPPORTED_MAPPING');
    const homePath = jsxPath(homeRoot, mount);
    if (!homePath || homePath.some(node => !t.isJSXIdentifier(node.openingElement.name) || (node !== mount && !/^[a-z]/.test(node.openingElement.name.name)))) fail('UNSUPPORTED_MAPPING');
    homePath.forEach(attributes);
    for (const [path, allowed] of [[owner.path, ownerImport.edge], [renderer.path, rendererImport.edge], [wrapper.path, mountEdge]] as const) {
        if (edges.some(edge => edge.runtime && edge.target === path && edge !== allowed)) fail('UNSUPPORTED_CONSUMER');
        const runtimeSpecs = allowed.declaration.specifiers.filter(spec => !t.isImportSpecifier(spec) || spec.importKind !== 'type');
        if (runtimeSpecs.length !== 1) fail('UNSUPPORTED_CONSUMER');
    }
    const declaration = owner.ast.program.body.flatMap(node => t.isExportNamedDeclaration(node) && t.isVariableDeclaration(node.declaration)
        ? node.declaration.declarations.filter(value => t.isIdentifier(value.id, { name: ownerImport.exportName })) : []);
    if (declaration.length !== 1 || !t.isArrayExpression(declaration[0]!.init) || declaration[0]!.init.elements.length > 100) fail('UNSUPPORTED_MAPPING');
    for (const record of declaration[0]!.init.elements) {
        if (!t.isObjectExpression(record) || record.properties.length !== 3) fail('UNSUPPORTED_MAPPING');
        const recordId = record.properties.find(prop => t.isObjectProperty(prop) && (t.isIdentifier(prop.key, { name: 'id' }) || t.isStringLiteral(prop.key, { value: 'id' })));
        if (!t.isObjectProperty(recordId) || !t.isStringLiteral(recordId.value)) fail('UNSUPPORTED_MAPPING');
        for (const field of ['question', 'answer']) readContentTextTarget(owner.source, { kind: 'data-leaf', exportName: ownerImport.exportName, itemId: recordId.value.value, property: field });
    }
    const target: DataTarget = { kind: 'data-leaf', exportName: ownerImport.exportName, itemId, property };
    return { path: owner.path, target, value: readContentTextTarget(owner.source, target),
        renderMapping: { version: 1, kind: 'keyed-prop-map', mappingId,
            callsite: { path: wrapper.path, exportName: wrapperName, oid: literalOid(callsite) },
            renderer: { path: renderer.path, exportName: rendererImport.exportName, oid } },
        dependencies: ['tsconfig.json', ...modules.keys()].sort() };
}
