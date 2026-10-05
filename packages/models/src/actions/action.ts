import type { CodeDiff } from '../code';
import type { DomElement } from '../element';
import type { Interaction } from '../interactions';
import { type ActionLocation, type IndexActionLocation } from './location';
import { type ActionTarget, type StyleActionTarget } from './target';

interface BaseActionElement {
    domId: string;
    oid: string;
    branchId: string;
    tagName: string;
    attributes: Record<string, string>;
    styles: Record<string, string>;
    textContent: string | null;
}

export interface ActionElement extends BaseActionElement {
    children: ActionElement[];
}

export interface UpdateStyleAction {
    type: 'update-style';
    targets: StyleActionTarget[];
}

export interface PasteParams {
    oid: string;
    domId: string;
}

// Reversible insert and remove actions
interface BaseInsertRemoveAction {
    type: string;
    targets: ActionTarget[];
    location: ActionLocation;
    element: ActionElement;
    editText: boolean | null;
    pasteParams: PasteParams | null;
    codeBlock: string | null;
}

export interface InsertElementAction extends BaseInsertRemoveAction {
    type: 'insert-element';
}

export interface RemoveElementAction extends BaseInsertRemoveAction {
    type: 'remove-element';
}

export interface MoveElementAction {
    type: 'move-element';
    targets: ActionTarget[];
    location: IndexActionLocation;
}

/**
 * One changed text run of a whole-block ("rich") inline text edit. `index` is
 * the gap between element children of the owner element `oid` (gap k sits
 * before its k-th non-<br> element child). `oldText` guards the source write:
 * it is only applied when the source gap still renders exactly that text.
 */
export interface TextSlotEdit {
    oid: string;
    index: number;
    oldText: string;
    newText: string;
}

export interface EditTextAction {
    type: 'edit-text';
    targets: ActionTarget[];
    originalContent: string;
    newContent: string;
    /**
     * Set for whole-block edits of an element with inline children (spans,
     * <strong>, …). The source write then updates only these runs, keeping
     * the inline elements, instead of replacing the element's text.
     */
    textSlots?: TextSlotEdit[];
}

/** A web font loaded inside the frame, shipped to the editor so the inline text editor renders in it. */
export interface EditTextFontFace {
    key: string;
    family: string;
    /** Font file as a data: URL (survives any serialization between frame and editor). */
    source: string;
    descriptors: {
        weight?: string;
        style?: string;
        stretch?: string;
        unicodeRange?: string;
    };
}

export interface EditTextResult {
    originalContent: string;
    /** The element actually being edited (may be a text-block ancestor of the hit element). */
    domEl?: DomElement;
    /** True when the element has inline element children and is edited as one block. */
    rich?: boolean;
    /** Exact computed typography of the edited element (camelCase CSS properties). */
    typography?: Record<string, string>;
    fontFaces?: EditTextFontFace[];
}

export interface GroupContainer {
    domId: string;
    oid: string;
    tagName: string;
    attributes: Record<string, string>;
    /** Original source wrapper, including expression/spread props and keys. */
    sourceCode?: string;
    /** Raw parent child index needed to restore an empty wrapper. */
    sourceIndex?: number;
}

// Reversible group and ungroup actions
export interface BaseGroupAction {
    type: string;
    parent: ActionTarget;
    children: ActionTarget[];
    container: GroupContainer;
}

export interface GroupElementsAction extends BaseGroupAction {
    type: 'group-elements';
}

export interface UngroupElementsAction extends BaseGroupAction {
    type: 'ungroup-elements';
}

export interface WriteCodeAction {
    type: 'write-code';
    diffs: CodeDiff[];
    /** Source saves and their replays stay in the branch that created them. */
    branchId?: string;
    /** Rebuild the visible token registry after a successful CSS replay. */
    refreshTokens?: boolean;
    /** Preview-only style change paired with an exact source snapshot. */
    previewStyle?: UpdateStyleAction;
}

export interface ImageContentData {
    originPath: string;
    content: string;
    fileName: string;
    mimeType: string;
}

interface BaseImageAction {
    targets: ActionTarget[];
    image: ImageContentData;
}
export interface InsertImageAction extends BaseImageAction {
    type: 'insert-image';
}

export interface RemoveImageAction extends BaseImageAction {
    type: 'remove-image';
}

export interface AddInteractionAction {
    type: 'add-interaction';
    next: Interaction;
    prev: null;
    branchId: string;
}

export interface UpdateInteractionAction {
    type: 'update-interaction';
    next: Interaction;
    prev: Interaction;
    branchId: string;
}

export interface RemoveInteractionAction {
    type: 'remove-interaction';
    next: null;
    prev: Interaction;
    branchId: string;
}

export type InteractionAction =
    | AddInteractionAction
    | UpdateInteractionAction
    | RemoveInteractionAction;

export type Action =
    | UpdateStyleAction
    | InsertElementAction
    | RemoveElementAction
    | MoveElementAction
    | EditTextAction
    | GroupElementsAction
    | UngroupElementsAction
    | WriteCodeAction
    | InsertImageAction
    | RemoveImageAction
    | AddInteractionAction
    | UpdateInteractionAction
    | RemoveInteractionAction;
