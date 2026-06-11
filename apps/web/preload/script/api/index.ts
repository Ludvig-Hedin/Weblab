import type { ProcessDomResult } from './dom';
import { findListAncestorOid, setCmsData } from './cms';
import { buildLayerTree, processDom, processDomNow } from './dom';
import {
    getChildElement,
    getChildrenCount,
    getElementAtLoc,
    getElementByDomId,
    getElementByOid,
    getOffsetParent,
    getParentElement,
    updateElementInstance,
} from './elements';
import { getFigmaSceneData } from './elements/dom/figma-scene';
import { groupElements, ungroupElements } from './elements/dom/group';
import {
    getActionElement,
    getActionLocation,
    getElementType,
    getFirstWeblabElement,
    setElementType,
} from './elements/dom/helpers';
import { insertImage, removeImage } from './elements/dom/image';
import { getInsertLocation, insertElement, removeElement } from './elements/dom/insert';
import { getRemoveAction } from './elements/dom/remove';
import { getElementIndex, moveElement } from './elements/move';
import {
    drag,
    dragAbsolute,
    endAllDrag,
    endDrag,
    endDragAbsolute,
    startDrag,
} from './elements/move/drag';
import { getComputedStyleByDomId } from './elements/style';
import { editText, isChildTextEditable, startEditingText, stopEditingText } from './elements/text';
import {
    applyInitialStates,
    applyInteractionsConfig,
    listInteractionTargets,
    pauseInteraction,
    playInteraction,
    reloadInteractions,
    scrubInteraction,
} from './interactions';
import { handleBodyReady } from './ready';
import { captureScreenshot as _captureScreenshot } from './screenshot';
import { serializeDocumentForOffline } from './snapshot';
import { setBranchId, setFrameId } from './state';
import { updateStyle } from './style';
import { getTheme, setTheme } from './theme';

let capabilities = { allowScreenshot: false };

function setCapabilities(caps: Partial<{ allowScreenshot: boolean }>): void {
    capabilities = { ...capabilities, ...caps };
}

function withTryCatch<T extends (...args: any[]) => any>(fn: T): T {
    return ((...args: any[]) => {
        try {
            return fn(...args);
        } catch (error) {
            console.error(`Error in ${fn.name}:`, error);
            return null;
        }
    }) as T;
}

const rawMethods = {
    // Misc
    processDom,
    processDomNow,
    setFrameId,
    setBranchId,
    getComputedStyleByDomId,
    updateElementInstance,
    getFirstWeblabElement,
    buildLayerTree,
    setCapabilities,

    // Elements
    getElementAtLoc,
    getElementByDomId,
    getElementByOid,
    getElementIndex,
    setElementType,
    getElementType,
    getParentElement,
    getChildrenCount,
    getChildElement,
    getOffsetParent,

    // Actions
    getActionLocation,
    getActionElement,
    getFigmaSceneData,
    getInsertLocation,
    getRemoveAction,

    // Theme
    getTheme,
    setTheme,

    // Drag
    startDrag,
    drag,
    dragAbsolute,
    endDrag,
    endDragAbsolute,
    endAllDrag,

    // Edit text
    startEditingText,
    editText,
    stopEditingText,
    isChildTextEditable,

    // Edit elements
    updateStyle,
    insertElement,
    removeElement,
    moveElement,
    groupElements,
    ungroupElements,
    insertImage,
    removeImage,
    handleBodyReady,

    // CMS
    setCmsData,
    findListAncestorOid,

    // Offline
    serializeDocumentForOffline,

    // Interactions runtime bridge
    playInteraction,
    pauseInteraction,
    scrubInteraction,
    applyInitialStates,
    reloadInteractions,
    applyInteractionsConfig,
    listInteractionTargets,
};

// Wrap all methods in a try/catch to prevent the preload script from crashing.
// captureScreenshot is intentionally excluded so callers receive the explicit
// "Screenshot capability not enabled" error rather than a silent null.
const wrappedMethods = Object.fromEntries(
    Object.entries(rawMethods).map(([key, fn]) => [key, withTryCatch(fn)]),
) as typeof rawMethods;

async function captureScreenshot() {
    if (!capabilities.allowScreenshot) {
        throw new Error('Screenshot capability not enabled');
    }
    return _captureScreenshot();
}

export const preloadMethods = { ...wrappedMethods, captureScreenshot };

export type PenpalChildMethods = typeof preloadMethods;
export type { ProcessDomResult };
