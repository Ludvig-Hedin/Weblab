import type { DomElement } from '@weblab/models';

export type PropertyElementIdentity = Pick<DomElement, 'branchId' | 'frameId' | 'domId' | 'instanceId' | 'oid' | 'tagName' | 'contentIdentity'>;
export function propertySelectionKey(element: PropertyElementIdentity | undefined): string {
    return JSON.stringify([element?.branchId, element?.frameId, element?.domId, element?.instanceId, element?.oid,
        element?.contentIdentity?.mappingId, element?.contentIdentity?.itemId, element?.tagName.toLowerCase()]);
}
export function copyPropertyElementIdentity(element: PropertyElementIdentity): PropertyElementIdentity {
    return Object.freeze({ branchId: element.branchId, frameId: element.frameId, domId: element.domId,
        instanceId: element.instanceId, oid: element.oid, tagName: element.tagName,
        ...(element.contentIdentity ? { contentIdentity: Object.freeze({ ...element.contentIdentity }) } : {}) });
}
/** DOM IDs can be reused while the canvas selection and source revision stay unchanged. */
export async function validatePropertyElement(expected: PropertyElementIdentity, current: () => boolean,
    read: () => Promise<DomElement | null | undefined>): Promise<boolean> {
    if (!current()) return false;
    const identity = propertySelectionKey(expected);
    try {
        const live = await read();
        return current() && !!live && propertySelectionKey(live) === identity;
    } catch { return false; }
}
