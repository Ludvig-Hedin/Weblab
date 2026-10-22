import { EditorAttributes } from '@weblab/constants';
import type { DomElement } from '@weblab/models';

/** Read only the selected leaf. Ancestor metadata cannot identify a record. */
export function getContentIdentity(element: Pick<Element, 'getAttribute'>): DomElement['contentIdentity'] {
    const mappingId = element.getAttribute(EditorAttributes.DATA_WEBLAB_CONTENT_MAP);
    const itemId = element.getAttribute(EditorAttributes.DATA_WEBLAB_CONTENT_ITEM);
    if (!mappingId || !itemId || mappingId.length > 160 || itemId.length > 160
        || /[^A-Za-z0-9_.:-]/.test(mappingId) || /[^A-Za-z0-9_.:-]/.test(itemId)) return undefined;
    return { mappingId, itemId };
}
