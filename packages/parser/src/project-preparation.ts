import {
    DEPRECATED_IX_RUNTIME_SRCS, DEPRECATED_PRELOAD_SCRIPT_SRCS, EditorAttributes,
    WEBLAB_DEV_IX_RUNTIME_PATH, WEBLAB_DEV_IX_RUNTIME_SRC,
    WEBLAB_DEV_PRELOAD_SCRIPT_PATH, WEBLAB_DEV_PRELOAD_SCRIPT_SRC,
    WEBLAB_INTERACTIONS_PUBLIC_SRC, WEBLAB_IX_RUNTIME_SRC, WEBLAB_PRELOAD_SCRIPT_SRC,
} from '@weblab/constants';
import { injectWeblabBootstrapScripts } from './code-edit/layout';
import { addOidsToAst, getAllExistingOids } from './ids';
import { getAstFromContent, getContentFromAst } from './parse';
import { t, traverse, type T } from './packages';

export type ProjectPreparationText = { path: string; text: string };
export type NextPreparationFile = {
    path: string; original: string | null; updated: string;
    addedOids: string[]; bootstrapChanges: boolean;
};
const excluded = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', 'public', 'test', 'tests', '__tests__', '__mocks__', 'e2e']);
const bootstrap = [
    { id: 'weblab-preload-script', path: WEBLAB_DEV_PRELOAD_SCRIPT_PATH, local: WEBLAB_DEV_PRELOAD_SCRIPT_SRC,
        current: WEBLAB_PRELOAD_SCRIPT_SRC, sources: [WEBLAB_PRELOAD_SCRIPT_SRC, WEBLAB_DEV_PRELOAD_SCRIPT_SRC, ...DEPRECATED_PRELOAD_SCRIPT_SRCS] },
    { id: 'weblab-ix-runtime', path: WEBLAB_DEV_IX_RUNTIME_PATH, local: WEBLAB_DEV_IX_RUNTIME_SRC,
        current: WEBLAB_IX_RUNTIME_SRC, sources: [WEBLAB_IX_RUNTIME_SRC, WEBLAB_DEV_IX_RUNTIME_SRC, ...DEPRECATED_IX_RUNTIME_SRCS] },
];
function canonicalPath(path: string): boolean {
    return !!path && !path.startsWith('/') && !/^[A-Za-z]:/.test(path) && !/[\\\u0000-\u001f\u007f]/.test(path) &&
        path.split('/').every(part => !!part && part !== '.' && part !== '..');
}
function sourcePath(path: string): boolean {
    return /\.[jt]sx?$/i.test(path) && !/\.d\.ts$/i.test(path) && !/\.(test|spec|stories)\.[jt]sx?$/i.test(path) &&
        !path.split('/').some(part => part.startsWith('.') || excluded.has(part.toLowerCase()));
}
function inventory(ast: T.File, path: string): Set<string> {
    const ids = new Set<string>();
    traverse(ast, {
        JSXOpeningElement(node) {
            const existing = getAllExistingOids(node.node.attributes);
            if (existing.hasInvalid || existing.hasMultiple) throw new Error(`Invalid or dynamic element ID in ${path}.`);
            for (const id of existing.values) {
                if (ids.has(id)) throw new Error(`Duplicate element ID in ${path}.`);
                ids.add(id);
            }
            // A later spread can replace an otherwise literal source ID.
            const oidIndex = existing.indices[0];
            if (oidIndex !== undefined && node.node.attributes.slice(oidIndex + 1).some(attribute => t.isJSXSpreadAttribute(attribute))) {
                throw new Error(`A spread may override the element ID in ${path}.`);
            }
            for (const attribute of node.node.attributes) {
                if (!t.isJSXSpreadAttribute(attribute) || !t.isObjectExpression(attribute.argument)) continue;
                if (attribute.argument.properties.some(property => t.isObjectProperty(property) &&
                    (t.isStringLiteral(property.key, { value: EditorAttributes.DATA_WEBLAB_ID }) ||
                        t.isIdentifier(property.key, { name: EditorAttributes.DATA_WEBLAB_ID })))) {
                    throw new Error(`A spread supplies an element ID in ${path}.`);
                }
            }
        },
    });
    return ids;
}
function attribute(node: T.JSXOpeningElement, name: string): T.JSXAttribute | undefined {
    return node.attributes.find((item): item is T.JSXAttribute => t.isJSXAttribute(item) && t.isJSXIdentifier(item.name, { name }));
}
function literal(node: T.JSXOpeningElement, name: string): string | undefined {
    const value = attribute(node, name)?.value;
    return t.isStringLiteral(value) ? value.value : undefined;
}

function prepareBootstrap(ast: T.File): boolean {
    let bodies = 0;
    let html = 0;
    let scriptImported = false;
    const scripts = bootstrap.map(() => [] as T.JSXOpeningElement[]);
    traverse(ast, {
        Program(path) {
            const binding = path.scope.getBinding('Script');
            if (binding && (!binding.path.isImportDefaultSpecifier() ||
                !binding.path.parentPath?.isImportDeclaration() || binding.path.parentPath.node.source.value !== 'next/script')) {
                throw new Error('The layout already uses Script for a different binding.');
            }
            scriptImported = !!binding;
        },
        JSXElement(path) {
            const opening = path.node.openingElement;
            if (t.isJSXIdentifier(opening.name, { name: 'html' })) html++;
            if (t.isJSXIdentifier(opening.name, { name: 'body' })) {
                bodies++;
                if (!path.findParent(parent => parent.isJSXElement() && t.isJSXIdentifier(parent.node.openingElement.name, { name: 'html' }))) {
                    throw new Error('The root layout body must be inside html.');
                }
            }
            const src = literal(opening, 'src');
            const id = literal(opening, 'id');
            const index = bootstrap.findIndex(spec => spec.id === id || (src !== undefined && spec.sources.includes(src)));
            if (index < 0) return;
            const spec = bootstrap[index]!;
            if (!t.isJSXIdentifier(opening.name, { name: 'Script' }) || !src || !spec.sources.includes(src) ||
                (id !== undefined && id !== spec.id) || opening.attributes.some(item => t.isJSXSpreadAttribute(item)) ||
                !path.parentPath.isJSXElement() || !t.isJSXIdentifier(path.parentPath.node.openingElement.name, { name: 'body' })) {
                throw new Error('The layout contains a conflicting bootstrap script.');
            }
            if (attribute(opening, 'id') && id === undefined) throw new Error('Dynamic bootstrap IDs are unsupported.');
            for (const name of ['src', 'id', 'strategy', 'type']) {
                if (opening.attributes.filter(item => t.isJSXAttribute(item) && t.isJSXIdentifier(item.name, { name })).length > 1) {
                    throw new Error('Duplicate bootstrap attributes are unsupported.');
                }
            }
            if ((attribute(opening, 'strategy') && literal(opening, 'strategy') !== 'afterInteractive') ||
                (attribute(opening, 'type') && literal(opening, 'type') !== 'module')) throw new Error('Conflicting bootstrap execution settings.');
            if (spec.id === 'weblab-ix-runtime' && attribute(opening, 'data-interactions-src') &&
                literal(opening, 'data-interactions-src') !== WEBLAB_INTERACTIONS_PUBLIC_SRC) throw new Error('Conflicting interactions source.');
            scripts[index]!.push(opening);
        },
    });
    if (html !== 1 || bodies !== 1) throw new Error('A single existing html/body root layout is required.');
    const alreadyLocal = scripts.every((nodes, index) => nodes.length === 1 &&
        literal(nodes[0]!, 'src') === bootstrap[index]!.local && literal(nodes[0]!, 'id') === bootstrap[index]!.id &&
        literal(nodes[0]!, 'type') === 'module' && literal(nodes[0]!, 'strategy') === 'afterInteractive' &&
        (bootstrap[index]!.id !== 'weblab-ix-runtime' || literal(nodes[0]!, 'data-interactions-src') === WEBLAB_INTERACTIONS_PUBLIC_SRC));
    if (alreadyLocal && scriptImported) return false;
    for (const [index, nodes] of scripts.entries()) {
        const spec = bootstrap[index]!;
        if (nodes.length > 1 && nodes.some(node => node.attributes.some(item => t.isJSXAttribute(item) &&
            (!t.isJSXIdentifier(item.name) || !['src', 'id', 'type', 'strategy', 'data-interactions-src'].includes(item.name.name))))) {
            throw new Error('Duplicate bootstrap scripts contain attributes that cannot be discarded.');
        }
        for (const node of nodes) {
            // Normalize only recognized bootstrap URLs before the existing
            // injector deduplicates them; final source always uses local assets.
            for (const [name, value] of [['src', spec.current], ['id', spec.id], ['strategy', 'afterInteractive'], ['type', 'module']] as const) {
                const current = attribute(node, name);
                if (current) current.value = t.stringLiteral(value);
                else node.attributes.push(t.jsxAttribute(t.jsxIdentifier(name), t.stringLiteral(value)));
            }
            if (spec.id === 'weblab-ix-runtime' && !attribute(node, 'data-interactions-src')) {
                node.attributes.push(t.jsxAttribute(t.jsxIdentifier('data-interactions-src'), t.stringLiteral(WEBLAB_INTERACTIONS_PUBLIC_SRC)));
            }
        }
    }
    injectWeblabBootstrapScripts(ast);
    const counts = [0, 0];
    traverse(ast, {
        JSXOpeningElement(path) {
            const index = bootstrap.findIndex(spec => literal(path.node, 'id') === spec.id);
            if (index < 0) return;
            const src = attribute(path.node, 'src');
            if (!src || !t.isStringLiteral(src.value)) throw new Error('Bootstrap injection failed.');
            src.value.value = bootstrap[index]!.local;
            counts[index] = (counts[index] ?? 0) + 1;
        },
    });
    if (counts.some(count => count !== 1)) throw new Error('Bootstrap injection did not produce one script per asset.');
    return true;
}

/** Pure, read-only before/after plan; callers own asset fetching and atomic writes. */
export async function planNextProjectPreparation(input: {
    files: ProjectPreparationText[]; layoutPath: string; assets: ProjectPreparationText[];
}): Promise<{ files: NextPreparationFile[] }> {
    if (!/^(?:src\/)?app\/layout\.[jt]sx?$/.test(input.layoutPath)) throw new Error('A recognized root App Router layout is required.');
    const originals = new Map<string, string>();
    for (const file of input.files) {
        if (!canonicalPath(file.path) || typeof file.text !== 'string' || originals.has(file.path)) throw new Error('Invalid or duplicate source path.');
        originals.set(file.path, file.text);
    }
    for (const path of originals.keys()) {
        const parts = path.split('/');
        if (parts.slice(0, -1).some((_, index) => originals.has(parts.slice(0, index + 1).join('/')))) throw new Error('A file occupies a parent directory.');
    }
    const sources = [...originals].filter(([path]) => sourcePath(path)).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    if (!sources.length || sources.length > 500 || !originals.has(input.layoutPath)) throw new Error('Supported source/layout inventory is missing or too large.');
    const encoder = new TextEncoder();
    let bytes = 0;
    for (const [path, text] of sources) {
        const size = encoder.encode(text).byteLength;
        bytes += size;
        if (size > 500_000 || bytes > 10_000_000) throw new Error(`${path} exceeds the source review limits.`);
    }
    if (input.assets.length !== bootstrap.length || new Set(input.assets.map(asset => asset.path)).size !== bootstrap.length) throw new Error('Exactly two trusted bootstrap assets are required.');
    for (const asset of input.assets) {
        if (!bootstrap.some(spec => spec.path === asset.path) || typeof asset.text !== 'string' || !asset.text || encoder.encode(asset.text).byteLength > 750_000) throw new Error('Invalid bootstrap asset.');
        if (asset.path === WEBLAB_DEV_PRELOAD_SCRIPT_PATH && !asset.text.includes('Weblab stale domId lookup blocked:')) throw new Error('The preload bundle is stale.');
        if (originals.has(asset.path) && originals.get(asset.path) !== asset.text) throw new Error('Reserved bootstrap asset conflicts with existing bytes.');
        if (originals.has('public')) throw new Error('A file occupies the public directory.');
        if ([...originals.keys()].some(path => path.startsWith(`${asset.path}/`))) throw new Error('A directory occupies a reserved bootstrap asset path.');
    }
    const parsed = sources.map(([path, text]) => {
        const ast = getAstFromContent(text);
        if (!ast) throw new Error(`Could not parse ${path}.`);
        return { path, text, ast, ids: inventory(ast, path) };
    });
    const globalOids = new Set<string>();
    for (const file of parsed) for (const id of file.ids) {
        if (globalOids.has(id)) throw new Error(`Duplicate element ID across files in ${file.path}.`);
        globalOids.add(id);
    }
    const files: NextPreparationFile[] = [];
    for (const file of parsed) {
        const bootstrapChanges = file.path === input.layoutPath && prepareBootstrap(file.ast);
        const { modified } = addOidsToAst(file.ast, globalOids);
        const ids = inventory(file.ast, file.path);
        if ([...file.ids].some(id => !ids.has(id))) throw new Error('Preparation would discard an existing element ID.');
        const addedOids = [...ids].filter(id => !file.ids.has(id));
        for (const id of ids) globalOids.add(id);
        if (!modified && !bootstrapChanges) continue;
        const updated = await getContentFromAst(file.ast, file.text);
        if (updated !== file.text) files.push({ path: file.path, original: file.text, updated, addedOids, bootstrapChanges });
    }
    for (const asset of input.assets) {
        if (!originals.has(asset.path)) files.push({ path: asset.path, original: null, updated: asset.text, addedOids: [], bootstrapChanges: true });
    }
    return { files };
}
