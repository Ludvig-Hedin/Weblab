import type { LayerNode } from '@weblab/models';

export type PenpalParentMethods = {
    getFrameId: () => string;
    getBranchId: () => string;
    onWindowMutated: (data: {
        added: Record<string, LayerNode>;
        removed: Record<string, LayerNode>;
    }) => void;
    onWindowResized: () => void;
    onDomProcessed: (data: { layerMap: Record<string, LayerNode>; rootNode: LayerNode }) => void;
    /**
     * Reported by the iframe whenever the page's intrinsic content size
     * changes. The parent uses `height` to drive auto-height on the frame
     * (Framer-style breakpoint preview where each frame shows the whole page,
     * not a clipped viewport).
     */
    onContentResized: (data: { width: number; height: number }) => void;
};

// Parent methods should be treated as promises
export type PromisifiedPenpalParentMethods = {
    [K in keyof PenpalParentMethods]: (
        ...args: Parameters<PenpalParentMethods[K]>
    ) => Promise<ReturnType<PenpalParentMethods[K]>>;
};

export const PENPAL_PARENT_CHANNEL = 'PENPAL_PARENT';
