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

/** Original approval identity. Source revision is captured separately for each save attempt. */
export interface CloudTextRenderMapping {
    readonly version: 1;
    readonly kind: 'keyed-prop-map';
    readonly mappingId: string;
    readonly callsite: Readonly<{ path: string; exportName: string; oid: string }>;
    readonly renderer: Readonly<{ path: string; exportName: string; oid: string }>;
}

export interface CloudTextApproval {
    readonly version: 2;
    readonly projectId: string;
    readonly branchId: string;
    readonly actorId: string;
    readonly path: string;
    readonly bindingId: string;
    readonly target: Readonly<{ kind: 'component-literal'; exportName: string; oid: string }
        | { kind: 'data-leaf'; exportName: string; itemId: string; property: string }>;
    readonly renderMapping?: CloudTextRenderMapping;
    readonly generation: number;
    readonly designRevision: number;
}

export interface CloudPropertyBinding {
    readonly bindingId: string;
    readonly label: string;
    readonly target: Readonly<
        { kind: 'component-literal-href'; exportName: string; oid: string; field: 'href' }
        | { kind: 'mapped-callsite-enum'; exportName: string; oid: string; field: 'tone'; renderMapping: CloudImageBinding['renderMapping'] }
    >;
    readonly options: ReadonlyArray<Readonly<{ id: string; label: string; value: string }>>;
}
export interface CloudPropertyApproval {
    readonly version: 1;
    readonly projectId: string;
    readonly branchId: string;
    readonly actorId: string;
    readonly path: string;
    readonly generation: number;
    readonly preparationId: string;
    readonly designRevision: number;
    readonly definitionHash: string;
    readonly binding: CloudPropertyBinding;
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
    /**
     * Set for whole-block edits of an element with inline children (spans,
     * <strong>, …). The source write then updates only these runs, keeping
     * the inline elements, instead of replacing the element's text.
     */
    textSlots?: TextSlotEdit[];
    cloudText?: CloudTextApproval;
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

export type TextRenderMode = 'legacy' | 'plain-string-v1';

export interface EditTextResult {
    textRenderMode?: TextRenderMode;
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

export type CssModuleProperty = 'margin-top' | 'max-width' | 'color' | 'font-weight';

/** A local, single-declaration edit with an unchanged JSX read dependency. */
export interface CssModuleStyleEdit {
    version: 1;
    sourcePath: string;
    source: string;
    oid: string;
    cssPath: string;
    className: string;
    property: CssModuleProperty;
    previousValue: string;
    value: string;
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
    /** Revalidated from source and disk on initial save, Undo and Redo. */
    cssModuleStyle?: CssModuleStyleEdit;
    /** Exact image approval and field survive undo/redo and selection changes. */
    cloudImage?: { readonly pin: CloudImageApproval; readonly field: 'src' | 'alt' };
    /** Semantic values survive history; source diffs are only one-dispatch proposals. */
    cloudProperty?: { readonly pin: CloudPropertyApproval; readonly previousValue: string; readonly value: string };
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
