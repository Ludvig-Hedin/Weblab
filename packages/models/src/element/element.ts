interface BaseDomElement {
    domId: string;
    frameId: string;
    branchId: string;
    oid: string | null;
    instanceId: string | null;
    rect: DOMRect;
}

export interface ParentDomElement extends BaseDomElement {}

export interface DomElement extends BaseDomElement {
    tagName: string;
    styles: DomElementStyles | null;
    parent: ParentDomElement | null;
    /**
     * Raw className attribute from the iframe view, when available. Used by
     * the design-token layer to detect text-style-* / utility bindings.
     * Optional — older bridges leave it undefined.
     */
    className?: string;
}

export interface DomElementStyles {
    defined: Record<string, string>; // Styles from stylesheets or inline
    computed: Record<string, string>; // Browser computed styles
}

export interface ElementPosition {
    x: number;
    y: number;
}

export interface DropElementProperties {
    tagName: string;
    styles: Record<string, string>;
    textContent: string | null;
    attributes?: Record<string, string>;
    children?: DropElementProperties[];
}

export interface RectDimensions {
    width: number;
    height: number;
    top: number;
    left: number;
}

export interface ComponentInsertData {
    componentName: string;
    filePath: string;
    exportType: 'default' | 'named';
    /** ComponentKey when the insert refers to a discovered project component. */
    key?: string;
}
