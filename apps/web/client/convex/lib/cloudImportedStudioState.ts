/** V8-safe data format only. Source JSON is never editing authority. */
export const IMPORTED_STUDIO_CONFIG_PATH = 'src/weblab/studio.json';
export const IMPORTED_STUDIO_PAGE_PATH = 'src/components/weblab-templates/basic-page.tsx';
export const IMPORTED_STUDIO_BLOCK_PATH = 'src/components/weblab-templates/text-block.tsx';
export const IMPORTED_STUDIO_CONFIG_BYTES = 128 * 1024;
export type ImportedStudioErrorCode = 'INVALID_CONFIG' | 'INVALID_INVENTORY' | 'INVALID_RECIPE' | 'INVALID_OPERATION'
    | 'STALE_RECIPE' | 'STALE_SOURCE' | 'ROUTE_OCCUPIED' | 'UNSUPPORTED_ROUTES' | 'SLOT_INVALID' | 'LIMIT' | 'OID_COLLISION';
export class ImportedStudioError extends Error {
    constructor(public readonly code: ImportedStudioErrorCode) { super(`CLOUD_IMPORTED_STUDIO_${code}`); this.name = 'ImportedStudioError'; }
}
export function studioFail(code: ImportedStudioErrorCode): never { throw new ImportedStudioError(code); }
export type ImportedStudioFile = { path: string; kind: 'file' | 'directory'; hash: string; bytes: number; text?: string; storageId?: unknown };
type Tuple = { path: string; hash: string; bytes: number };
type RecipeSource = Tuple & { source: string };
export type ImportedStudioConfigV1 = {
    version: 1;
    recipe: {
        id: 'basic-page-v1'; label: string;
        page: RecipeSource & { exportName: 'BasicPage' };
        block: RecipeSource & { id: 'text-block-v1'; label: string; exportName: 'TextBlock' };
        stylesheet: Tuple & { specifier: string }; assets: Tuple[];
        slots: Array<{ key: string; blockId: 'text-block-v1'; min: 0; max: number }>;
    };
    pages: Array<{ id: string; slug: string; routePath: string; ownerPath: string; ownerExport: 'StudioPage'; operationId: string;
        slots: Array<{ key: string; oid: string; instances: Array<{ id: string; blockId: 'text-block-v1'; operationId: string }> }> }>;
};
export type ImportedStudioOperation =
    | { kind: 'capture'; label: string; blockLabel: string; slots: Array<{ key: string; max: number }> }
    | { kind: 'createPage'; templateId: 'basic-page-v1'; slug: string }
    | { kind: 'insertBlock'; pageId: string; slotKey: string; blockId: 'text-block-v1'; position: number }
    | { kind: 'moveBlock'; pageId: string; slotKey: string; instanceId: string; position: number }
    | { kind: 'removeBlock'; pageId: string; slotKey: string; instanceId: string };
const encoder = new TextEncoder();
export function studioUnicode(value: string): boolean {
    for (let i = 0; i < value.length; i++) {
        const unit = value.charCodeAt(i);
        if (unit >= 0xd800 && unit <= 0xdbff) { const next = value.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) return false; }
        else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
    }
    return true;
}
export function studioLabel(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= 80 && !/[\u0000-\u001f\u007f]/.test(value) && studioUnicode(value); }
export function studioKey(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= 40 && !/[^a-z0-9-]/.test(value); }
export function studioId(value: unknown): value is string { return typeof value === 'string' && value.length === 31 && value.startsWith('studio-') && !/[^a-f0-9]/.test(value.slice(7)); }
export function studioOperationId(value: unknown): value is string { return typeof value === 'string' && value.length >= 16 && value.length <= 128 && !/[^A-Za-z0-9_-]/.test(value); }
export function studioHashValue(value: unknown): value is string { return typeof value === 'string' && value.length === 64 && !/[^a-f0-9]/.test(value); }
export function studioPath(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= 240 && studioUnicode(value) && !/[\\\s?#%\u0000-\u001f\u007f]/.test(value)
        && value.split('/').every(part => !!part && !part.startsWith('.'));
}
export function studioSlug(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= 64 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && !/[^a-z0-9-]/.test(value)
        && !['api', 'public', 'src', 'app', 'node-modules', 'weblab'].includes(value);
}
function exact(value: unknown, keys: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== keys) studioFail('INVALID_CONFIG');
    return value as Record<string, unknown>;
}
function integer(value: unknown, min: number, max: number): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max; }
function array(value: unknown, max: number): unknown[] { if (!Array.isArray(value) || value.length > max) studioFail('INVALID_CONFIG'); return value; }
function tuple(value: Record<string, unknown>, max: number) {
    if (!studioPath(value.path) || !studioHashValue(value.hash) || !integer(value.bytes, 1, max)) studioFail('INVALID_CONFIG');
}
function source(value: unknown, block: boolean) {
    const row = exact(value, block ? 'bytes,exportName,hash,id,label,path,source' : 'bytes,exportName,hash,path,source');
    tuple(row, 32 * 1024);
    if (row.path !== (block ? IMPORTED_STUDIO_BLOCK_PATH : IMPORTED_STUDIO_PAGE_PATH) || row.exportName !== (block ? 'TextBlock' : 'BasicPage')
        || typeof row.source !== 'string' || !studioUnicode(row.source) || encoder.encode(row.source).length !== row.bytes
        || (block && (row.id !== 'text-block-v1' || !studioLabel(row.label)))) studioFail('INVALID_CONFIG');
}
function validate(value: unknown): asserts value is ImportedStudioConfigV1 {
    const root = exact(value, 'pages,recipe,version'); if (root.version !== 1) studioFail('INVALID_CONFIG');
    const recipe = exact(root.recipe, 'assets,block,id,label,page,slots,stylesheet');
    if (recipe.id !== 'basic-page-v1' || !studioLabel(recipe.label)) studioFail('INVALID_CONFIG');
    source(recipe.page, false); source(recipe.block, true);
    const css = exact(recipe.stylesheet, 'bytes,hash,path,specifier'); tuple(css, 128 * 1024);
    if (typeof css.path !== 'string' || !css.path.startsWith('src/') || !css.path.endsWith('.module.css') || css.specifier !== '@/' + css.path.slice(4)) studioFail('INVALID_CONFIG');
    const assetPaths = new Set<string>();
    for (const asset of array(recipe.assets, 32)) {
        const row = exact(asset, 'bytes,hash,path'); tuple(row, 32 * 1024 * 1024);
        if (typeof row.path !== 'string' || !row.path.startsWith('public/') || assetPaths.has(row.path)) studioFail('INVALID_CONFIG'); assetPaths.add(row.path);
    }
    const policies = new Map<string, number>();
    for (const item of array(recipe.slots, 2)) {
        const row = exact(item, 'blockId,key,max,min');
        if (!studioKey(row.key) || policies.has(row.key) || row.blockId !== 'text-block-v1' || row.min !== 0 || !integer(row.max, 1, 10)) studioFail('INVALID_CONFIG');
        policies.set(row.key, row.max);
    }
    if (!policies.size) studioFail('INVALID_CONFIG');
    const ids = new Set<string>(), slugs = new Set<string>(), operations = new Set<string>();
    const unique = (id: unknown, operation: unknown) => {
        if (!studioId(id) || !studioOperationId(operation) || ids.has(id) || operations.has(operation)) studioFail('INVALID_CONFIG');
        ids.add(id); operations.add(operation);
    };
    for (const item of array(root.pages, 20)) {
        const page = exact(item, 'id,operationId,ownerExport,ownerPath,routePath,slots,slug'); unique(page.id, page.operationId);
        if (!studioSlug(page.slug) || slugs.has(page.slug) || page.routePath !== `src/app/${page.slug}/page.tsx`
            || page.ownerPath !== `src/components/weblab-pages/${page.id}.tsx` || page.ownerExport !== 'StudioPage') studioFail('INVALID_CONFIG');
        slugs.add(page.slug); const slots = new Set<string>();
        for (const item of array(page.slots, 2)) {
            const slot = exact(item, 'instances,key,oid');
            if (!studioKey(slot.key) || !policies.has(slot.key) || slots.has(slot.key) || !studioId(slot.oid) || ids.has(slot.oid)) studioFail('INVALID_CONFIG');
            slots.add(slot.key); ids.add(slot.oid);
            for (const entry of array(slot.instances, policies.get(slot.key)!)) {
                const instance = exact(entry, 'blockId,id,operationId'); unique(instance.id, instance.operationId);
                if (instance.blockId !== 'text-block-v1') studioFail('INVALID_CONFIG');
            }
        }
        if (slots.size !== policies.size) studioFail('INVALID_CONFIG');
    }
}
export function studioCanonical(value: unknown): string {
    return JSON.stringify(value, (_key, entry: unknown) => entry && typeof entry === 'object' && !Array.isArray(entry)
        ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : entry);
}
export function parseImportedStudioConfig(text: string): ImportedStudioConfigV1 {
    if (typeof text !== 'string' || !studioUnicode(text) || encoder.encode(text).length > IMPORTED_STUDIO_CONFIG_BYTES) studioFail('INVALID_CONFIG');
    let value: unknown; try { value = JSON.parse(text); } catch { return studioFail('INVALID_CONFIG'); }
    validate(value); return value;
}
export function serializeImportedStudioConfig(config: ImportedStudioConfigV1): string {
    validate(config); const text = studioCanonical(config) + '\n';
    if (encoder.encode(text).length > IMPORTED_STUDIO_CONFIG_BYTES) studioFail('LIMIT'); return text;
}
/** Exact UTF-8 SHA-256 preimage shared by Node and V8 approval code. No trailing newline. */
export function serializeImportedStudioRecipe(config: ImportedStudioConfigV1): string {
    serializeImportedStudioConfig(config);
    return studioCanonical(config.recipe);
}
export function assertImportedStudioOperation(value: unknown): asserts value is ImportedStudioOperation {
    try {
        if (!value || typeof value !== 'object' || !('kind' in value)) studioFail('INVALID_OPERATION');
        const kind = value.kind;
        if (kind === 'capture') {
            const row = exact(value, 'blockLabel,kind,label,slots');
            if (!studioLabel(row.label) || !studioLabel(row.blockLabel)) studioFail('INVALID_OPERATION');
            const seen = new Set<string>(); for (const slot of array(row.slots, 2)) {
                const item = exact(slot, 'key,max'); if (!studioKey(item.key) || seen.has(item.key) || !integer(item.max, 1, 10)) studioFail('INVALID_OPERATION'); seen.add(item.key);
            }
            if (!seen.size) studioFail('INVALID_OPERATION');
        } else if (kind === 'createPage') {
            const row = exact(value, 'kind,slug,templateId'); if (!studioSlug(row.slug) || row.templateId !== 'basic-page-v1') studioFail('INVALID_OPERATION');
        } else if (kind === 'insertBlock' || kind === 'moveBlock' || kind === 'removeBlock') {
            const row = exact(value, kind === 'insertBlock' ? 'blockId,kind,pageId,position,slotKey' : kind === 'moveBlock' ? 'instanceId,kind,pageId,position,slotKey' : 'instanceId,kind,pageId,slotKey');
            if (!studioId(row.pageId) || !studioKey(row.slotKey) || (kind !== 'removeBlock' && !integer(row.position, 0, 10))
                || (kind === 'insertBlock' ? row.blockId !== 'text-block-v1' : !studioId(row.instanceId))) studioFail('INVALID_OPERATION');
        } else studioFail('INVALID_OPERATION');
    } catch { studioFail('INVALID_OPERATION'); }
}
