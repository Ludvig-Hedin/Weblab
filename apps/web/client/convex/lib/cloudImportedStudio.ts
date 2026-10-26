'use node';

import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import postcss from 'postcss';
import { parse, t, traverse, type T } from '@weblab/parser/src/packages';
import { readContentTextTarget } from '@weblab/parser/src/code-edit/content-target';
import { createCloudTextContract, type CloudTextContract, type ContentTextBinding } from './cloudContentTextContract';
import { importSourcePath } from './cloudImportManifest';
import { IMPORTED_STUDIO_CONFIG_PATH, IMPORTED_STUDIO_PAGE_PATH, IMPORTED_STUDIO_BLOCK_PATH,
    studioFail, studioCanonical, studioOperationId, studioHashValue, studioUnicode, studioKey,
    assertImportedStudioOperation, parseImportedStudioConfig, serializeImportedStudioConfig, serializeImportedStudioRecipe,
    type ImportedStudioConfigV1, type ImportedStudioFile, type ImportedStudioOperation } from './cloudImportedStudioState';
export * from './cloudImportedStudioState';

type Page = ImportedStudioConfigV1['pages'][number];
type Instance = Page['slots'][number]['instances'][number];
type Inventory = Map<string, ImportedStudioFile>;
type Span = { start: number; end: number; content: string };
type Recipe = { tree: T.File; fn: T.FunctionDeclaration; root: T.JSXElement; css: string;
    nodes: Map<string, T.JSXElement>; leaves: Array<{ key: string; oid: string }>; slots: Map<string, T.JSXElement> };
const OID = 'data-oid', TEXT = 'data-weblab-studio-text', SLOT = 'data-weblab-studio-slot';
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const byteLength = (value: string) => Buffer.byteLength(value, 'utf8');
const executable = /\.[cm]?[jt]sx?$/i;
const native = new Set(['main', 'section', 'div', 'header', 'h1', 'h2', 'p', 'span']);
function ast(source: string): T.File {
    try { return parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] }); }
    catch { return studioFail('INVALID_RECIPE'); }
}
function start(node: T.Node): number { if (node.start === null || node.start === undefined) studioFail('INVALID_RECIPE'); return node.start; }
function end(node: T.Node): number { if (node.end === null || node.end === undefined) studioFail('INVALID_RECIPE'); return node.end; }
function splice(source: string, spans: Span[]): string {
    let boundary = source.length;
    for (const span of [...spans].sort((a, b) => b.start - a.start)) {
        if (span.start < 0 || span.end > boundary || span.end < span.start) studioFail('INVALID_RECIPE');
        source = source.slice(0, span.start) + span.content + source.slice(span.end); boundary = span.start;
    }
    return source;
}
function attr(node: T.JSXElement, name: string): T.JSXAttribute | undefined {
    return node.openingElement.attributes.find((entry): entry is T.JSXAttribute => t.isJSXAttribute(entry) && t.isJSXIdentifier(entry.name, { name }));
}
function literal(node: T.JSXElement, name: string): string | null {
    const value = attr(node, name)?.value; return t.isStringLiteral(value) ? value.value : null;
}
function oid(node: T.JSXElement): string { const value = literal(node, OID); if (!value || value.length > 100 || /[^A-Za-z0-9_.:-]/.test(value)) studioFail('INVALID_RECIPE'); return value; }
function identity(operationId: string, recipe: string, instance: string, oldOid: string) {
    return `studio-${sha(studioCanonical(['imported-studio-oid-v1', operationId, recipe, instance, oldOid])).slice(0, 24)}`;
}
function textFile(files: Inventory, path: string): string {
    const file = files.get(path); if (!file || file.kind !== 'file' || typeof file.text !== 'string' || file.storageId !== undefined) studioFail('INVALID_INVENTORY'); return file.text;
}
function tuple(file: ImportedStudioFile) { return { path: file.path, hash: file.hash, bytes: file.bytes }; }
function checkedContract(path: string, source: string, bindings: ContentTextBinding[]): CloudTextContract {
    if (!bindings.length || bindings.length > 100) studioFail('LIMIT');
    try { return createCloudTextContract(path, source, bindings); } catch { return studioFail('STALE_SOURCE'); }
}

/** A complete inventory is required; hidden executable consumers cannot be ignored. */
type RuntimePin = { path: string; hash: string; bytes: number };
const bridgePaths = new Set(['public/weblab-preload-script.js', 'public/weblab-ix-runtime.js']);
function inventory(input: readonly ImportedStudioFile[], originalPaths: readonly string[], runtimePins: readonly RuntimePin[] = []): Inventory {
    if (!Array.isArray(input) || input.length < 1 || input.length > 400 || !Array.isArray(originalPaths) || originalPaths.length > 400) studioFail('INVALID_INVENTORY');
    const files: Inventory = new Map(), originals = new Set<string>(); let total = 0, inline = 0;
    for (const path of originalPaths) {
        try { importSourcePath(path); } catch { studioFail('INVALID_INVENTORY'); }
        if (originals.has(path) || path === IMPORTED_STUDIO_CONFIG_PATH || path.startsWith(IMPORTED_STUDIO_CONFIG_PATH + '/') || IMPORTED_STUDIO_CONFIG_PATH.startsWith(path + '/')) studioFail('INVALID_CONFIG');
        originals.add(path);
    }
    for (const file of input) {
        try { importSourcePath(file.path); } catch { studioFail('INVALID_INVENTORY'); }
        if (files.has(file.path) || !['file', 'directory'].includes(file.kind) || !studioHashValue(file.hash) || !Number.isSafeInteger(file.bytes) || file.bytes < 0) studioFail('INVALID_INVENTORY');
        if (file.text !== undefined) {
            if (file.kind !== 'file' || file.storageId !== undefined || !studioUnicode(file.text) || file.bytes > 750_000 || byteLength(file.text) !== file.bytes || sha(file.text) !== file.hash) studioFail('INVALID_INVENTORY');
            inline += file.bytes;
        } else if (file.kind === 'file' && (executable.test(file.path) || file.bytes > 32 * 1024 * 1024)) studioFail('INVALID_INVENTORY');
        total += file.bytes; files.set(file.path, file);
    }
    if (inline > 4_000_000 || total > 64 * 1024 * 1024) studioFail('LIMIT');
    for (const file of files.values()) for (const parent of file.path.split('/').slice(0, -1).map((_part, index) => file.path.split('/').slice(0, index + 1).join('/'))) {
        if (files.get(parent)?.kind === 'file') studioFail('INVALID_INVENTORY');
    }
    try {
        const config = JSON.parse(textFile(files, 'tsconfig.json')) as { extends?: unknown; compilerOptions?: { baseUrl?: unknown; paths?: unknown } };
        if (config.extends !== undefined || config.compilerOptions?.baseUrl !== undefined || studioCanonical(config.compilerOptions?.paths) !== studioCanonical({ '@/*': ['./src/*'] })) studioFail('INVALID_INVENTORY');
    } catch { studioFail('INVALID_INVENTORY'); }
    inspectExecutables([...files.values()], true, runtimePins);
    return files;
}
/** Also usable on a private derivative: it needs neither the JSON nor preparation pins. */
export function assertNoImportedStudioRuntimeReferences(files: readonly ImportedStudioFile[]): void {
    inspectExecutables(files, false);
}
function inspectExecutables(files: readonly ImportedStudioFile[], checkOids: boolean, runtimePins: readonly RuntimePin[] = []) {
    // Only callers with a verified preparation may provide these immutable tuples.
    const trusted = new Map(runtimePins.filter(pin => bridgePaths.has(pin.path)).map(pin => [pin.path, pin]));
    if (trusted.size !== runtimePins.filter(pin => bridgePaths.has(pin.path)).length) studioFail('INVALID_INVENTORY');
    if (files.length > 400) studioFail('LIMIT');
    const oids = new Set<string>();
    let packageName: string | null = null;
    const packageText = files.find(file => file.path === 'package.json')?.text;
    if (packageText) { try { const value = JSON.parse(packageText); if (typeof value.name === 'string') packageName = value.name; } catch { studioFail('INVALID_INVENTORY'); } }
    const reservedReference = (path: string, value: string, scriptType = false) => {
        const tooling = path.startsWith('scripts/');
        const normalized = value.replaceAll('\\', '/').split(/[?#]/, 1)[0]!;
        const resolved = normalized.startsWith('@/') ? posix.normalize(`src/${normalized.slice(2)}`) : posix.normalize(posix.join(posix.dirname(path), normalized));
        if (normalized.includes('weblab/studio') || resolved === IMPORTED_STUDIO_CONFIG_PATH || resolved === IMPORTED_STUDIO_CONFIG_PATH.slice(0, -5)
            || (/^(?:node:)?(?:fs(?:\/promises)?|vm|module|child_process|worker_threads)$/.test(normalized) && !(scriptType && normalized === 'module') && !(tooling && /^(?:node:)?(?:fs(?:\/promises)?|child_process|worker_threads)$/.test(normalized)))
            || ['fs-extra', 'eval', 'Function'].includes(normalized)) studioFail('INVALID_INVENTORY');
    };
    for (const file of files) {
        if (!executable.test(file.path) || file.kind === 'directory') continue;
        if (file.text === undefined || file.storageId !== undefined || byteLength(file.text) > 750_000) studioFail('INVALID_INVENTORY');
        const pin = trusted.get(file.path);
        if (pin) {
            if (file.hash !== pin.hash || file.bytes !== pin.bytes || sha(file.text) !== pin.hash || byteLength(file.text) !== pin.bytes) studioFail('INVALID_INVENTORY');
            continue;
        }
        const tree = ast(file.text);
        traverse(tree, {
            Identifier(path) {
                if (['eval', 'Function'].includes(path.node.name)) studioFail('INVALID_INVENTORY');
                if (path.node.name === 'require' && !(t.isCallExpression(path.parent) && path.parent.callee === path.node)) studioFail('INVALID_INVENTORY');
            },
            StringLiteral(path) {
                // Prepared Next layouts use type="module" on bridge scripts. This static
                // JSX attribute is not a reference to Node's module loader.
                const scriptType = t.isJSXAttribute(path.parent) && t.isJSXIdentifier(path.parent.name, { name: 'type' });
                reservedReference(file.path, path.node.value, scriptType);
                const parent = path.parent;
                const moduleSource = t.isImportDeclaration(parent) || t.isExportNamedDeclaration(parent) || t.isExportAllDeclaration(parent) ||
                    (t.isCallExpression(parent) && (parent.callee.type === 'Import' || t.isIdentifier(parent.callee, { name: 'require' })));
                if (moduleSource) {
                    const value = path.node.value.replaceAll('\\', '/').split(/[?#]/, 1)[0]!;
                    const resolved = posix.normalize(value.startsWith('@/') ? `src/${value.slice(2)}` : value.startsWith('/') ? value.slice(1) : value.startsWith('.') ? posix.join(posix.dirname(file.path), value) : value);
                    if (resolved === 'scripts' || resolved.startsWith('scripts/') || (packageName && (value === packageName || value.startsWith(packageName + '/')))) studioFail('INVALID_INVENTORY');
                    if ([resolved, `public/${resolved}`].some(candidate => bridgePaths.has(candidate) || (!posix.extname(candidate) && bridgePaths.has(`${candidate}.js`)))) studioFail('INVALID_INVENTORY');
                }
            },
        });
        t.traverseFast(tree, node => {
            if (t.isTemplateLiteral(node)) for (const part of node.quasis) reservedReference(file.path, part.value.cooked ?? part.value.raw);
            if (t.isNewExpression(node) && t.isIdentifier(node.callee, { name: 'URL' }) && node.arguments.length > 1) {
                const value = node.arguments[0];
                if (!t.isStringLiteral(value)) studioFail('INVALID_INVENTORY');
                const resolved = posix.normalize(posix.join(posix.dirname(file.path), value.value.replaceAll('\\', '/').split(/[?#]/, 1)[0]!));
                if (resolved === 'scripts' || resolved.startsWith('scripts/')) studioFail('INVALID_INVENTORY');
            }
            if (t.isCallExpression(node) && (node.callee.type === 'Import' || t.isIdentifier(node.callee, { name: 'require' }))) {
                if (node.arguments.length !== 1 || !t.isStringLiteral(node.arguments[0])) studioFail('INVALID_INVENTORY');
            }
            if (checkOids && t.isJSXAttribute(node) && t.isJSXIdentifier(node.name, { name: OID })) {
                const value = t.isStringLiteral(node.value) ? node.value.value : t.isJSXExpressionContainer(node.value) && t.isStringLiteral(node.value.expression) ? node.value.expression.value : null;
                if (!value || oids.has(value)) studioFail('OID_COLLISION'); oids.add(value);
            }
        });
    }
}

function recipe(source: string, exportName: string, kind: 'page' | 'block' | 'owner'): Recipe {
    if (byteLength(source) > (kind === 'owner' ? 750_000 : 32 * 1024)) studioFail('LIMIT');
    const tree = ast(source), body = tree.program.body;
    if (tree.program.directives.length || body.length !== 2) studioFail('INVALID_RECIPE');
    const imp = body[0], exported = body[1];
    if (!t.isImportDeclaration(imp) || imp.importKind === 'type' || imp.specifiers.length !== 1 || !t.isImportDefaultSpecifier(imp.specifiers[0])
        || imp.specifiers[0].local.name !== 'styles' || !imp.source.value.startsWith('@/') || !imp.source.value.endsWith('.module.css') || imp.attributes?.length || imp.assertions?.length
        || !t.isExportNamedDeclaration(exported) || exported.specifiers.length || !t.isFunctionDeclaration(exported.declaration)) studioFail('INVALID_RECIPE');
    const fn = exported.declaration;
    if (fn.id?.name !== exportName || fn.params.length || fn.async || fn.generator || fn.typeParameters || fn.returnType || fn.body.directives.length || fn.body.body.length !== 1) studioFail('INVALID_RECIPE');
    const returned = fn.body.body[0]; if (!t.isReturnStatement(returned) || !t.isJSXElement(returned.argument)) studioFail('INVALID_RECIPE');
    const root = returned.argument, nodes = new Map<string, T.JSXElement>(), leaves: Recipe['leaves'] = [], slots = new Map<string, T.JSXElement>();
    const textKeys = new Set<string>(); let count = 0, headings = 0, paragraphs = 0, blockHeadings = 0;
    function visit(node: T.JSXElement, depth: number, insideLeaf: boolean) {
        if (++count > (kind === 'owner' ? 2100 : 100) || depth > 12) studioFail('LIMIT');
        const open = node.openingElement;
        if (!t.isJSXIdentifier(open.name) || !native.has(open.name.name)) studioFail('INVALID_RECIPE');
        if (open.name.name === 'h1') headings++; if (open.name.name === 'p') paragraphs++; if (open.name.name === 'h2') blockHeadings++;
        const id = oid(node); if (nodes.has(id)) studioFail('OID_COLLISION'); nodes.set(id, node);
        const names = new Set<string>();
        for (const attribute of open.attributes) {
            if (!t.isJSXAttribute(attribute) || !t.isJSXIdentifier(attribute.name) || names.has(attribute.name.name)) studioFail('INVALID_RECIPE');
            const name = attribute.name.name; names.add(name);
            if (!['className', OID, TEXT, SLOT, 'data-nav-theme', 'data-theme', 'role'].includes(name)) studioFail('INVALID_RECIPE');
            if (name === 'className' && t.isJSXExpressionContainer(attribute.value)) {
                const value = attribute.value.expression;
                if (!t.isMemberExpression(value) || value.computed || !t.isIdentifier(value.object, { name: 'styles' }) || !t.isIdentifier(value.property)) studioFail('INVALID_RECIPE');
            } else if (!t.isStringLiteral(attribute.value)) studioFail('INVALID_RECIPE');
        }
        const text = literal(node, TEXT), slot = literal(node, SLOT);
        if (text !== null) {
            if (!studioKey(text) || insideLeaf || (kind !== 'owner' && textKeys.has(text)) || slot !== null) studioFail('INVALID_RECIPE');
            textKeys.add(text); leaves.push({ key: text, oid: id });
            try { readContentTextTarget(source, { kind: 'component-literal', exportName, oid: id }); } catch { studioFail('INVALID_RECIPE'); }
        }
        if (slot !== null) {
            if (kind === 'block' || !['body', 'footer'].includes(slot) || slots.has(slot) || open.name.name !== 'div' || insideLeaf || open.selfClosing || !node.closingElement) studioFail('INVALID_RECIPE');
            if (kind === 'page' && node.children.some(child => !t.isJSXText(child) || /\S/.test(child.value))) studioFail('INVALID_RECIPE');
            slots.set(slot, node);
        }
        for (const child of node.children) {
            if (t.isJSXElement(child)) {
                if (text !== null || (slot !== null && literal(child, SLOT) !== null)) studioFail('INVALID_RECIPE');
                visit(child, depth + 1, insideLeaf || text !== null);
            } else if (!t.isJSXText(child) && !(t.isJSXExpressionContainer(child) && t.isStringLiteral(child.expression))) studioFail('INVALID_RECIPE');
        }
    }
    visit(root, 1, false);
    if (!leaves.length || leaves.length > (kind === 'owner' ? 100 : 40) || (kind !== 'block' && (headings !== 1 || !slots.size))
        || (kind === 'block' && (!t.isJSXIdentifier(root.openingElement.name, { name: 'section' }) || headings || blockHeadings !== 1 || paragraphs !== 1))) studioFail('INVALID_RECIPE');
    // Nested slots are forbidden even through unmarked wrappers.
    for (const [key, slot] of slots) for (const [other, child] of slots) if (key !== other && start(child) > start(slot) && end(child) < end(slot)) studioFail('INVALID_RECIPE');
    return { tree, fn, root, css: imp.source.value, nodes, leaves, slots };
}
function cssAssets(files: Inventory, path: string) {
    const source = textFile(files, path); if (byteLength(source) > 128 * 1024 || /\\/.test(source)) studioFail('INVALID_RECIPE');
    let css: ReturnType<typeof postcss.parse>; try { css = postcss.parse(source); } catch { return studioFail('INVALID_RECIPE'); }
    const assets = new Map<string, ReturnType<typeof tuple>>();
    css.walkAtRules(rule => { if (rule.name.toLowerCase() === 'import') studioFail('INVALID_RECIPE'); });
    css.walkDecls(declaration => {
        // Restrict URL tokens to literal local assets; variable/remote URL resolution is not introduced here.
        const value = declaration.value.replace(/\/\*[\s\S]*?\*\//g, '');
        const matches = [...value.matchAll(/url\(\s*(?:"([^"()]*)"|'([^'()]*)'|([^\s'"()]+))\s*\)/gi)];
        if ((value.match(/url\s*\(/gi)?.length ?? 0) !== matches.length) studioFail('INVALID_RECIPE');
        for (const match of matches) {
            const url = match[1] ?? match[2] ?? match[3]!;
            if (!url.startsWith('/') || url.startsWith('//') || /[?#%\\\s]/.test(url)) studioFail('INVALID_RECIPE');
            const file = files.get(`public${url}`);
            if (!file || file.kind !== 'file' || !/\.(?:png|jpe?g|webp|avif|gif|svg|woff2?|ttf|otf)$/i.test(file.path)) studioFail('INVALID_RECIPE');
            assets.set(file.path, tuple(file));
        }
    });
    if (assets.size > 32) studioFail('LIMIT'); return [...assets.values()].sort((a, b) => a.path.localeCompare(b.path));
}
function checkRecipes(files: Inventory, config: ImportedStudioConfigV1) {
    const policy = config.recipe;
    for (const saved of [policy.page, policy.block]) {
        if (sha(saved.source) !== saved.hash || textFile(files, saved.path) !== saved.source) studioFail('STALE_RECIPE');
    }
    const page = recipe(policy.page.source, 'BasicPage', 'page'), block = recipe(policy.block.source, 'TextBlock', 'block');
    if (page.css !== block.css || policy.stylesheet.specifier !== page.css || policy.stylesheet.path !== `src/${page.css.slice(2)}`) studioFail('INVALID_RECIPE');
    const css = files.get(policy.stylesheet.path);
    if (!css || studioCanonical(tuple(css)) !== studioCanonical({ path: policy.stylesheet.path, hash: policy.stylesheet.hash, bytes: policy.stylesheet.bytes })
        || studioCanonical(cssAssets(files, css.path)) !== studioCanonical(policy.assets)) studioFail('STALE_RECIPE');
    if (policy.slots.length !== page.slots.size || policy.slots.some(slot => !page.slots.has(slot.key))) studioFail('SLOT_INVALID');
    if (page.leaves.length + policy.slots.reduce((total, slot) => total + slot.max * block.leaves.length, 0) > 100) studioFail('LIMIT');
    return { page, block };
}
function remap(source: string, parsed: Recipe, operationId: string, recipeId: string, instanceId: string, rename: boolean): string {
    const spans: Span[] = [];
    for (const [id, node] of parsed.nodes) { const value = attr(node, OID)!.value!; spans.push({ start: start(value), end: end(value), content: JSON.stringify(identity(operationId, recipeId, instanceId, id)) }); }
    if (rename) spans.push({ start: start(parsed.fn.id!), end: end(parsed.fn.id!), content: 'StudioPage' });
    return splice(source, spans);
}
function blockSource(config: ImportedStudioConfigV1, parsed: Recipe, instance: Instance): string {
    const source = remap(config.recipe.block.source, parsed, instance.operationId, instance.blockId, instance.id, false);
    const root = recipe(source, 'TextBlock', 'block').root; return source.slice(start(root), end(root));
}
function slotSpan(node: T.JSXElement): { start: number; end: number } {
    if (!node.closingElement) studioFail('SLOT_INVALID'); return { start: end(node.openingElement), end: start(node.closingElement) };
}
function buildOwner(config: ImportedStudioConfigV1, page: Page, recipes: ReturnType<typeof checkRecipes>) {
    let source = remap(config.recipe.page.source, recipes.page, page.operationId, config.recipe.id, page.id, true);
    const parsed = recipe(source, 'StudioPage', 'page');
    const spans = page.slots.map(slot => {
        const node = parsed.slots.get(slot.key); if (!node || oid(node) !== slot.oid) studioFail('SLOT_INVALID');
        return { ...slotSpan(node), content: slot.instances.map(instance => blockSource(config, recipes.block, instance)).join('') };
    });
    source = splice(source, spans); return source;
}
function bindings(source: string): ContentTextBinding[] {
    return recipe(source, 'StudioPage', 'owner').leaves.map(leaf => ({ bindingId: leaf.oid, target: { kind: 'component-literal', exportName: 'StudioPage', oid: leaf.oid } }));
}
function routeSource(page: Page) { return `import { StudioPage } from "@/components/weblab-pages/${page.id}";\nexport default function Page() { return <StudioPage />; }\n`; }
function routeAvailable(files: Inventory, slug: string, permitted?: string) {
    for (const file of files.values()) {
        if (file.path === permitted) continue;
        if (file.path === `src/app/${slug}` || file.path.startsWith(`src/app/${slug}/`)) studioFail('ROUTE_OCCUPIED');
        if (!/^(?:src\/)?app\//.test(file.path) || !/\/(?:page|route)\.[cm]?[jt]sx?$/.test(file.path)) continue;
        const parts = file.path.replace(/^(?:src\/)?app\//, '').split('/').slice(0, -1);
        if (parts.some(part => part.includes('[') || part.startsWith('@') || /^\(\./.test(part))) studioFail('UNSUPPORTED_ROUTES');
        const route = parts.filter(part => !/^\([^()]+\)$/.test(part)).join('/');
        if (route === slug) studioFail('ROUTE_OCCUPIED');
    }
}
function checkState(files: Inventory, config: ImportedStudioConfigV1) {
    const recipes = checkRecipes(files, config); const owners: CloudTextContract[] = [];
    const expectedOwners = new Set(config.pages.map(page => page.ownerPath));
    for (const file of files.values()) if (file.path.startsWith('src/components/weblab-pages/') && file.kind !== 'directory' && !expectedOwners.has(file.path)) studioFail('STALE_SOURCE');
    for (const page of config.pages) {
        if (page.id !== identity(page.operationId, config.recipe.id, 'page', 'root')) studioFail('INVALID_CONFIG');
        routeAvailable(files, page.slug, page.routePath);
        if (textFile(files, page.routePath) !== routeSource(page)) studioFail('STALE_SOURCE');
        for (const slot of page.slots) for (const instance of slot.instances) if (instance.id !== identity(instance.operationId, instance.blockId, page.id, slot.key)) studioFail('INVALID_CONFIG');
        const expected = buildOwner(config, page, recipes), actual = textFile(files, page.ownerPath), leaves = bindings(expected);
        const canonical = checkedContract(page.ownerPath, expected, leaves), current = checkedContract(page.ownerPath, actual, leaves);
        if (current.fingerprint !== canonical.fingerprint) studioFail('STALE_SOURCE');
        owners.push(current);
    }
    return { recipes, owners };
}
export function importedStudioRecipeFingerprint(config: ImportedStudioConfigV1): string {
    return sha(serializeImportedStudioRecipe(config));
}
export function assertImportedStudioSource(input: { files: readonly ImportedStudioFile[]; originalPaths: readonly string[]; runtimePins?: readonly RuntimePin[] }) {
    const files = inventory(input.files, input.originalPaths, input.runtimePins), config = parseImportedStudioConfig(textFile(files, IMPORTED_STUDIO_CONFIG_PATH));
    return { config, recipeFingerprint: importedStudioRecipeFingerprint(config), owners: checkState(files, config).owners };
}
export function prepareImportedStudioOperation(input: { files: readonly ImportedStudioFile[]; originalPaths: readonly string[]; runtimePins?: readonly RuntimePin[]; operationId: string; operation: ImportedStudioOperation }): {
    changes: Array<{ path: string; content: string; hash: string; bytes: number }>; recipeFingerprint: string; config: ImportedStudioConfigV1; textContracts: CloudTextContract[];
} {
    assertImportedStudioOperation(input.operation); if (!studioOperationId(input.operationId)) studioFail('INVALID_OPERATION');
    const files = inventory(input.files, input.originalPaths, input.runtimePins), operation = input.operation;
    let config: ImportedStudioConfigV1; const changed = new Map<string, string>();
    if (operation.kind === 'capture') {
        if (files.has(IMPORTED_STUDIO_CONFIG_PATH)) studioFail('INVALID_CONFIG');
        const pageSource = textFile(files, IMPORTED_STUDIO_PAGE_PATH), blockText = textFile(files, IMPORTED_STUDIO_BLOCK_PATH);
        const page = recipe(pageSource, 'BasicPage', 'page'), block = recipe(blockText, 'TextBlock', 'block');
        if (page.css !== block.css) studioFail('INVALID_RECIPE');
        const stylesheet = files.get(`src/${page.css.slice(2)}`); if (!stylesheet) return studioFail('INVALID_RECIPE');
        config = { version: 1, recipe: { id: 'basic-page-v1', label: operation.label,
            page: { ...tuple(files.get(IMPORTED_STUDIO_PAGE_PATH)!), source: pageSource, exportName: 'BasicPage' },
            block: { ...tuple(files.get(IMPORTED_STUDIO_BLOCK_PATH)!), source: blockText, id: 'text-block-v1', label: operation.blockLabel, exportName: 'TextBlock' },
            stylesheet: { ...tuple(stylesheet), specifier: page.css }, assets: cssAssets(files, stylesheet.path),
            slots: operation.slots.map(slot => ({ ...slot, blockId: 'text-block-v1', min: 0 })) }, pages: [] };
        checkRecipes(files, config);
    } else {
        config = parseImportedStudioConfig(textFile(files, IMPORTED_STUDIO_CONFIG_PATH));
        const { recipes } = checkState(files, config);
        if (config.pages.some(page => page.operationId === input.operationId || page.slots.some(slot => slot.instances.some(instance => instance.operationId === input.operationId)))) studioFail('INVALID_OPERATION');
        if (operation.kind === 'createPage') {
            if (config.pages.length >= 20) studioFail('LIMIT'); routeAvailable(files, operation.slug);
            const id = identity(input.operationId, config.recipe.id, 'page', 'root');
            const page: Page = { id, slug: operation.slug, routePath: `src/app/${operation.slug}/page.tsx`, ownerPath: `src/components/weblab-pages/${id}.tsx`, ownerExport: 'StudioPage', operationId: input.operationId,
                slots: config.recipe.slots.map(slot => ({ key: slot.key, oid: identity(input.operationId, config.recipe.id, id, oid(recipes.page.slots.get(slot.key)!)), instances: [] })) };
            if (files.has(page.ownerPath)) studioFail('ROUTE_OCCUPIED');
            changed.set(page.ownerPath, buildOwner(config, page, recipes)); changed.set(page.routePath, routeSource(page)); config.pages.push(page);
        } else {
            const page = config.pages.find(page => page.id === operation.pageId), slot = page?.slots.find(slot => slot.key === operation.slotKey);
            if (!page || !slot) return studioFail('SLOT_INVALID');
            const source = textFile(files, page.ownerPath), parsed = recipe(source, 'StudioPage', 'owner'), node = parsed.slots.get(slot.key);
            if (!node || oid(node) !== slot.oid) studioFail('SLOT_INVALID');
            const children = node.children.filter(child => !t.isJSXText(child) || /\S/.test(child.value));
            if (children.length !== slot.instances.length || children.some(child => !t.isJSXElement(child))) studioFail('STALE_SOURCE');
            const parts = children.map(child => source.slice(start(child), end(child)));
            if (operation.kind === 'insertBlock') {
                const max = config.recipe.slots.find(policy => policy.key === slot.key)!.max;
                if (slot.instances.length >= max || operation.position > parts.length) studioFail('LIMIT');
                const instance: Instance = { id: identity(input.operationId, operation.blockId, page.id, slot.key), blockId: operation.blockId, operationId: input.operationId };
                parts.splice(operation.position, 0, blockSource(config, recipes.block, instance)); slot.instances.splice(operation.position, 0, instance);
            } else {
                const index = slot.instances.findIndex(instance => instance.id === operation.instanceId); if (index < 0) studioFail('SLOT_INVALID');
                const [part] = parts.splice(index, 1), [instance] = slot.instances.splice(index, 1);
                if (operation.kind === 'moveBlock') {
                    if (operation.position > parts.length) studioFail('SLOT_INVALID'); parts.splice(operation.position, 0, part!); slot.instances.splice(operation.position, 0, instance!);
                }
            }
            changed.set(page.ownerPath, splice(source, [{ ...slotSpan(node), content: parts.join('') }]));
        }
    }
    changed.set(IMPORTED_STUDIO_CONFIG_PATH, serializeImportedStudioConfig(config));
    const changes = [...changed].map(([path, content]) => ({ path, content, hash: sha(content), bytes: byteLength(content) })).sort((a, b) => a.path.localeCompare(b.path));
    const next = new Map(files); for (const file of changes) next.set(file.path, { ...file, kind: 'file', text: file.content });
    const checked = assertImportedStudioSource({ files: [...next.values()], originalPaths: input.originalPaths, runtimePins: input.runtimePins });
    return { changes, config: checked.config, recipeFingerprint: checked.recipeFingerprint, textContracts: checked.owners.filter(contract => changed.has(contract.path)) };
}
