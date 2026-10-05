import { describe, expect, it } from 'bun:test';
import { prepareStudioOperation, studioFingerprint } from './cloudStudioTemplate';
import type { CloudStudioFreezeInput } from './cloudStudioContent';

const initial = [{ path: 'src/app/page.tsx', kind: 'file', text: 'export default function Page() { return <main data-oid="ce-home-main"><h1 data-oid="title">Existing content</h1></main>; }' }];
function installed() {
    const result = prepareStudioOperation({ files: initial, studio: null, operation: { kind: 'install' }, operationId: 'studio_install_0001' });
    const files = new Map(initial.map(file => [file.path, file]));
    for (const change of result.changes) files.set(change.path, { path: change.path, kind: 'file', text: change.content });
    return { files: [...files.values()], studio: { settings: result.settings, items: [], assets: [] } as CloudStudioFreezeInput };
}
function inserted() {
    const input = installed();
    const result = prepareStudioOperation({ ...input, operationId: 'studio_insert_0001', operation: { kind: 'insertBlock',
        slotId: input.studio.settings.slots[0]!.id, block: 'text-v1', position: 0 } });
    const files = input.files.map(file => ({ ...file, text: result.changes.find(change => change.path === file.path)?.content ?? file.text }));
    return { files, studio: { ...input.studio, settings: result.settings } };
}
describe('Approved cloud page and block operations', () => {
    it('preserves existing content and gives inserted fields deterministic identities', () => {
        const input = installed();
        expect(input.files.find(file => file.path === initial[0]!.path)?.text).toContain('Existing content');
        const request = { ...input, operationId: 'studio_insert_0001', operation: { kind: 'insertBlock' as const,
            slotId: input.studio.settings.slots[0]!.id, block: 'text-v1' as const, position: 0 } };
        const first = prepareStudioOperation(request), second = prepareStudioOperation(request);
        expect(first.changes).toEqual(second.changes);
        expect(first.addedBindings.get(initial[0]!.path)).toHaveLength(2);
        expect(first.settings.slots[0]!.instances).toHaveLength(1);
    });
    it('permits approved text changes before a block is removed', () => {
        const input = inserted(), slot = input.studio.settings.slots[0]!;
        input.files[0]!.text = input.files[0]!.text.replace('Add your story here.', 'Customer content');
        const result = prepareStudioOperation({ ...input, operationId: 'studio_remove_0001', operation: { kind: 'removeBlock', slotId: slot.id, instanceId: slot.instances[0]!.id } });
        expect(result.changes[0]!.content).not.toContain('Customer content');
        expect(result.settings.slots[0]!.instances).toHaveLength(0);
    });
    it('rejects changed block layout and ancestry before structural edits', () => {
        const input = inserted(), slot = input.studio.settings.slots[0]!;
        const request = { ...input, operationId: 'studio_remove_0001', operation: { kind: 'removeBlock' as const, slotId: slot.id, instanceId: slot.instances[0]!.id } };
        input.files[0]!.text = input.files[0]!.text.replace('className="py-8"', 'className="hidden"');
        expect(() => prepareStudioOperation(request)).toThrow();
        const moved = inserted();
        moved.files[0]!.text = moved.files[0]!.text.replace('data-oid="ce-home-main"', 'data-oid="changed-main"');
        expect(() => prepareStudioOperation({ ...request, ...moved })).toThrow('CLOUD_STUDIO_SLOT_CHANGED');
    });
    it('refuses unapproved blocks, limits, reserved routes and nested managed slots', () => {
        const input = installed(), slot = input.studio.settings.slots[0]!;
        input.studio.settings.allowedBlocks = ['text-v1'];
        expect(() => prepareStudioOperation({ ...input, operationId: 'studio_insert_0002', operation: { kind: 'insertBlock', slotId: slot.id, block: 'callout-v1', position: 0 } })).toThrow('CLOUD_STUDIO_BLOCK_NOT_APPROVED');
        expect(() => prepareStudioOperation({ ...input, operationId: 'studio_page_00001', operation: { kind: 'createPage', slug: 'journal' } })).toThrow('CLOUD_STUDIO_ROUTE_OCCUPIED');
        expect(() => prepareStudioOperation({ ...input, operationId: 'studio_slot_00001', operation: { kind: 'approveSlot', path: slot.path, parentOid: slot.oid, min: 0, max: 10, allowedBlocks: ['text-v1'] } })).toThrow('CLOUD_STUDIO_INVALID_TARGET');
    });
    it('creates only a new approved page with one controlled slot', () => {
        const input = installed();
        const result = prepareStudioOperation({ ...input, operationId: 'studio_page_00001', operation: { kind: 'createPage', slug: 'our-story' } });
        expect(result.changes.map(file => file.path)).toEqual(['src/app/our-story/page.tsx']);
        expect(result.addedBindings.get('src/app/our-story/page.tsx')).toHaveLength(2);
        expect(result.settings.slots).toHaveLength(2);
        expect(() => prepareStudioOperation({ ...input, operationId: 'studio_page_00002', operation: { kind: 'createPage', slug: '../api' } })).toThrow();
    });
    it('pins the transport and canonical payload to each retry receipt', () => {
        expect(studioFingerprint('journal', { a: 1, b: 2 })).toBe(studioFingerprint('journal', { b: 2, a: 1 }));
        expect(studioFingerprint('journal', { a: 1 })).not.toBe(studioFingerprint('structure', { a: 1 }));
    });
});
