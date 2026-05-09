import { penpalParent } from '../..';
import { reportContentSize } from './dom';

export function publishDomProcessed(layerMap: Map<string, any>, rootNode: any) {
    if (!penpalParent) return;

    penpalParent
        .onDomProcessed({
            layerMap: Object.fromEntries(layerMap),
            rootNode,
        })
        .catch((error: Error) => {
            console.error('Failed to send DOM processed event:', error);
        });

    // DOM-processed implies layout has stabilized; push content size so the
    // parent's auto-height frame matches the page on first paint.
    reportContentSize();
}
