import type { SerializedNode } from '../codegen/types';

/** Plugin thread → UI thread */
export interface PluginToUIMessage {
    type: 'SELECTION';
    nodes: SerializedNode[];
}

/** UI thread → Plugin thread */
export interface UIToPluginMessage {
    type: 'READY' | 'CLOSE';
}
