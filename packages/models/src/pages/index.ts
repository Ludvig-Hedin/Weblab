import type { OGImage, OpenGraph } from './opengraph';

export type { OGImage };

export type PageNodeKind = 'page' | 'folder';

export type PageEditorIcon = 'file' | 'globe' | 'image' | 'section' | 'button' | 'text';

export interface PageEditorSettings {
    displayName?: string;
    editorIcon?: PageEditorIcon | null;
    draft?: boolean;
    published?: boolean;
}

export interface PageNode {
    id: string;
    kind: PageNodeKind;
    path: string;
    slug: string;
    defaultName: string;
    name: string;
    metadata?: PageMetadata;
    /**
     * Raw JSON-LD string injected into the page as
     * `<script type="application/ld+json">…</script>`. Source of truth lives in
     * the page file; this is populated by the page scan and round-trips through
     * `updatePageSchemaMarkupInSandbox`.
     */
    schemaMarkup?: string;
    settings?: PageEditorSettings;
    children?: PageNode[];
    isActive: boolean;
    isRoot?: boolean;
}

export interface TitleMetadata {
    template?: string;
    default?: string;
    absolute?: string;
}

export interface PageMetadata {
    title?: string | TitleMetadata;
    description?: string;
    applicationName?: string;
    metadataBase?: null | URL;
    icons?: null | Icons;
    openGraph?: null | OpenGraph;
    robots?: null | Robots;
    alternates?: null | Alternates;
}

/**
 * Next.js `metadata.alternates`. Currently only `canonical` is surfaced in the
 * page settings drawer; `languages` / `media` / `types` can be added later
 * without breaking the AST round-trip (generic object serializer).
 */
export interface Alternates {
    canonical?: string;
}

type IconURL = string | URL;
type Icon = IconURL | IconDescriptor;
type IconDescriptor = {
    url: string | URL;
    type?: string;
    sizes?: string;
    color?: string;
    /** defaults to rel="icon" unless superseded by Icons map */
    rel?: string;
    media?: string;
    /**
     * @see https://developer.mozilla.org/docs/Web/API/HTMLImageElement/fetchPriority
     */
    fetchPriority?: 'high' | 'low' | 'auto';
};
type Icons = {
    /** rel="icon" — single value, or an array (e.g. light/dark via `media`) */
    icon?: Icon | Icon[];
    /** rel="shortcut icon" */
    shortcut?: Icon;
    /**
     * @see https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html
     * rel="apple-touch-icon"
     */
    apple?: Icon;
    /** rel inferred from descriptor, defaults to "icon" */
    other?: IconDescriptor | IconDescriptor[];
};

export interface Robots {
    index?: boolean;
    follow?: boolean;
}
