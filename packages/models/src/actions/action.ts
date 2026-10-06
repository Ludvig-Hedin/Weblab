import type { CodeDiff } from '../code';
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

export interface CloudImageAsset {
    readonly path: string;
    readonly hash: string;
    readonly bytes: number;
}
/** The full agency policy stays with history, not just the currently selected image. */
export interface CloudImageBinding {
    readonly bindingId: string;
    readonly target: Readonly<{ kind: 'object-image'; exportName: string; srcProperty: 'imageSrc'; altProperty: 'imageAlt' }>;
    readonly fields: ReadonlyArray<'src' | 'alt'>;
    readonly allowImageUploads: boolean;
    readonly originalAsset: CloudImageAsset;
    readonly aspectRatio: Readonly<{ width: number; height: number }>;
    readonly allowedAssets: ReadonlyArray<CloudImageAsset>;
    readonly renderMapping: Readonly<{
        version: 1; kind: 'object-prop-image'; mappingId: string;
        callsite: Readonly<{ path: string; exportName: string; oid: string }>;
        renderer: Readonly<{ path: string; exportName: string; oid: string }>;
    }>;
}
export interface CloudImageApproval {
    readonly version: 2;
    readonly projectId: string;
    readonly branchId: string;
    readonly actorId: string;
    readonly path: string;
    readonly generation: number;
    readonly designRevision: number;
    readonly fingerprint: string;
    readonly binding: CloudImageBinding;
}

export interface EditTextAction {
    type: 'edit-text';
    targets: ActionTarget[];
    originalContent: string;
    newContent: string;
}

export interface EditTextResult {
    originalContent: string;
}

export interface GroupContainer {
    domId: string;
    oid: string;
    tagName: string;
    attributes: Record<string, string>;
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
    /** Exact image approval and field survive undo/redo and selection changes. */
    cloudImage?: { readonly pin: CloudImageApproval; readonly field: 'src' | 'alt' };
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
