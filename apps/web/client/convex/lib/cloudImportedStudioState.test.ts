import { describe, expect, it } from 'bun:test';
import { assertImportedStudioOperation, parseImportedStudioConfig, serializeImportedStudioConfig, serializeImportedStudioRecipe,
    IMPORTED_STUDIO_PAGE_PATH, IMPORTED_STUDIO_BLOCK_PATH, type ImportedStudioConfigV1 } from './cloudImportedStudioState';

function config(): ImportedStudioConfigV1 {
    return { version: 1, recipe: { id: 'basic-page-v1', label: 'Page',
        page: { path: IMPORTED_STUDIO_PAGE_PATH, source: 'page', bytes: 4, hash: 'a'.repeat(64), exportName: 'BasicPage' },
        block: { path: IMPORTED_STUDIO_BLOCK_PATH, source: 'block', bytes: 5, hash: 'b'.repeat(64), exportName: 'TextBlock', id: 'text-block-v1', label: 'Text' },
        stylesheet: { path: 'src/components/sections/shared.module.css', specifier: '@/components/sections/shared.module.css', bytes: 1, hash: 'c'.repeat(64) },
        assets: [], slots: [{ key: 'body', blockId: 'text-block-v1', min: 0, max: 2 }] }, pages: [] };
}
function page(): ImportedStudioConfigV1['pages'][number] {
    const id = 'studio-' + '1'.repeat(24);
    return { id, slug: 'story', routePath: 'src/app/story/page.tsx', ownerPath: `src/components/weblab-pages/${id}.tsx`, ownerExport: 'StudioPage', operationId: 'create_operation_0001',
        slots: [{ key: 'body', oid: 'studio-' + '2'.repeat(24), instances: [] }] };
}
describe('V8-safe imported Studio state', () => {
    it('round trips a detached canonical config and provides one recipe-only hash preimage', () => {
        const original = config(), text = serializeImportedStudioConfig(original), parsed = parseImportedStudioConfig(text);
        expect(parsed).toEqual(original); expect(parsed).not.toBe(original); expect(text.endsWith('\n')).toBe(true);
        const recipe = serializeImportedStudioRecipe(original); expect(recipe.endsWith('\n')).toBe(false);
        parsed.pages.push(page()); expect(serializeImportedStudioRecipe(parsed)).toBe(recipe);
        expect(serializeImportedStudioConfig(parsed)).not.toBe(text); expect(original.pages).toEqual([]);
    });
    it.each(['actorId', 'projectId', 'branchId', 'preparationId', 'active', 'generation', 'roles', 'publish'])('refuses authority key %s at every object level', key => {
        for (const part of ['root', 'recipe', 'page', 'slot'] as const) {
            const value = config(); value.pages.push(page());
            const target = part === 'root' ? value : part === 'recipe' ? value.recipe : part === 'page' ? value.pages[0]! : value.pages[0]!.slots[0]!;
            Object.assign(target, { [key]: true });
            expect(() => parseImportedStudioConfig(JSON.stringify(value))).toThrow('INVALID_CONFIG');
        }
    });
    it('refuses nonfinite counts, mismatched paths, duplicate instance IDs and trailing-newline IDs', () => {
        for (const change of ['limit', 'path', 'duplicate', 'newline'] as const) {
            const value = config(); value.pages.push(page());
            if (change === 'limit') value.recipe.slots[0]!.max = Number.POSITIVE_INFINITY;
            if (change === 'path') value.pages[0]!.routePath = 'src/app/other/page.tsx';
            if (change === 'newline') value.pages[0]!.id += '\n';
            if (change === 'duplicate') {
                const instance = { id: 'studio-' + '3'.repeat(24), blockId: 'text-block-v1' as const, operationId: 'insert_operation_0001' };
                value.pages[0]!.slots[0]!.instances.push(instance, { ...instance });
            }
            expect(() => parseImportedStudioConfig(JSON.stringify(value))).toThrow('INVALID_CONFIG');
        }
    });
    it('refuses oversize JSON, unsupported versions, extra fields and invalid Unicode', () => {
        expect(() => parseImportedStudioConfig(' '.repeat(128 * 1024 + 1))).toThrow('INVALID_CONFIG');
        for (const value of [{ ...config(), version: 2 }, { ...config(), extra: {} }, { ...config(), recipe: { ...config().recipe, label: '\ud800' } }])
            expect(() => parseImportedStudioConfig(JSON.stringify(value))).toThrow('INVALID_CONFIG');
    });
    it('accepts only structured operation fields, finite positions and bounded clean IDs', () => {
        expect(() => assertImportedStudioOperation({ kind: 'capture', label: 'Page', blockLabel: 'Text', slots: [{ key: 'body', max: 10 }] })).not.toThrow();
        expect(() => assertImportedStudioOperation({ kind: 'createPage', templateId: 'basic-page-v1', slug: 'my-story' })).not.toThrow();
        for (const operation of [
            { kind: 'createPage', templateId: 'basic-page-v1', slug: 'my-story\n' },
            { kind: 'createPage', templateId: 'basic-page-v1', slug: 'story', code: 'execute()' },
            { kind: 'insertBlock', pageId: page().id, slotKey: 'body', blockId: 'text-block-v1', position: NaN },
            { kind: 'insertBlock', pageId: page().id + '\n', slotKey: 'body', blockId: 'text-block-v1', position: 0 },
            { kind: 'capture', label: 'Page', blockLabel: 'Text', slots: [{ key: 'body', max: 1 }, { key: 'body', max: 2 }] },
        ]) expect(() => assertImportedStudioOperation(operation)).toThrow('INVALID_OPERATION');
    });
});
