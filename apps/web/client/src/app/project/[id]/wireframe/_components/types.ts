import type { Doc, Id } from '@convex/_generated/dataModel';

/** Hydrated workspace shape returned by api.wireframes.getFullDoc. */
export interface FullDoc {
    doc: Doc<'wireframeDocs'>;
    sitemapPages: Doc<'sitemapPages'>[];
    sitemapSections: Doc<'sitemapSections'>[];
    wireframePages: Doc<'wireframePages'>[];
    wireframeSections: Doc<'wireframeSections'>[];
    styleGuides: Doc<'styleGuides'>[];
}

export type ProjectId = Id<'projects'>;
