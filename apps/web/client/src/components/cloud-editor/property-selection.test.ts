import { describe, expect, it } from 'bun:test';
import type { DomElement } from '@weblab/models';
import { copyPropertyElementIdentity, propertySelectionKey, validatePropertyElement } from './property-selection';

const selected = { branchId: 'branch', frameId: 'frame', domId: 'dom', instanceId: 'instance-a', oid: 'link', tagName: 'a' } as DomElement;
describe('property live selection identity', () => {
    it('includes instance identity even when every selected source and DOM field stays unchanged', () => {
        expect(propertySelectionKey(selected)).not.toBe(propertySelectionKey({ ...selected, instanceId: 'instance-b' }));
    });
    it.each(['instanceId', 'branchId', 'frameId', 'oid', 'domId', 'tagName'] as const)('refuses live %s reuse before dispatch', async field => {
        let sends = 0;
        const expected = copyPropertyElementIdentity(selected);
        const valid = await validatePropertyElement(expected, () => true, async () => ({ ...selected, [field]: 'reused' }));
        if (valid) sends++;
        expect(sends).toBe(0);
    });
    it('captures mapping identity independently of later selection mutation', async () => {
        const element = { ...selected, tagName: 'img', contentIdentity: { mappingId: 'about', itemId: 'single' } };
        const expected = copyPropertyElementIdentity(element);
        element.contentIdentity.mappingId = 'other';
        expect(await validatePropertyElement(expected, () => true, async () => element)).toBe(false);
        expect(expected.contentIdentity?.mappingId).toBe('about');
    });
    it('checks owner again after the live DOM reply', async () => {
        let current = true;
        expect(await validatePropertyElement(selected, () => current, async () => { current = false; return selected; })).toBe(false);
    });
    it('accepts only the unchanged live instance', async () => {
        expect(await validatePropertyElement(selected, () => true, async () => ({ ...selected }))).toBe(true);
        expect(await validatePropertyElement(selected, () => true, async () => null)).toBe(false);
    });
});
