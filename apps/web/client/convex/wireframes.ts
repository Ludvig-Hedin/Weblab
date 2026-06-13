import { v } from 'convex/values';

import {
    coerceBlockId,
    getBlockMeta,
    isWireframeBlockId,
    type BlockCategory,
} from '@weblab/wireframe-blocks';

import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import type { Capability } from './lib/auth';
import { requireCap } from './lib/permissions';
import { dedupeSlug, nextOrder, slugify } from './lib/wireframeOrder';

// =============================================================================
// AI Wireframes — CRUD + sync. The sitemap is the source of truth; a wireframe
// section is paired 1:1 with a sitemap section (sitemapSection.linkedWireframe-
// SectionId <-> wireframeSection.sitemapSectionId). Convex has no FK cascade,
// so every delete cleans up its pair in-transaction; reorders mirror to the
// paired side so the two views never drift.
// =============================================================================

const briefValidator = v.object({
    companyName: v.string(),
    industry: v.optional(v.string()),
    audience: v.optional(v.string()),
    offer: v.optional(v.string()),
    tone: v.optional(v.string()),
    references: v.optional(v.string()),
    pageCount: v.optional(v.number()),
});

const vStatus = v.union(
    v.literal('brief'),
    v.literal('sitemap'),
    v.literal('wireframe'),
    v.literal('styleGuide'),
    v.literal('design'),
);

const MAX_PAGES = 20;

// ── Permission helpers ──────────────────────────────────────────────────────

async function gateDoc(
    ctx: QueryCtx | MutationCtx,
    docId: Id<'wireframeDocs'>,
    cap: Capability,
): Promise<Doc<'wireframeDocs'>> {
    const doc = await ctx.db.get(docId);
    if (!doc) throw new Error('NOT_FOUND: wireframeDoc');
    await requireCap(ctx, cap, { projectId: doc.projectId });
    return doc;
}

async function gateSitemapPage(
    ctx: QueryCtx | MutationCtx,
    pageId: Id<'sitemapPages'>,
    cap: Capability,
): Promise<{ page: Doc<'sitemapPages'>; doc: Doc<'wireframeDocs'> }> {
    const page = await ctx.db.get(pageId);
    if (!page) throw new Error('NOT_FOUND: sitemapPage');
    const doc = await gateDoc(ctx, page.docId, cap);
    return { page, doc };
}

async function gateSitemapSection(
    ctx: QueryCtx | MutationCtx,
    sectionId: Id<'sitemapSections'>,
    cap: Capability,
): Promise<{ section: Doc<'sitemapSections'>; doc: Doc<'wireframeDocs'> }> {
    const section = await ctx.db.get(sectionId);
    if (!section) throw new Error('NOT_FOUND: sitemapSection');
    const doc = await gateDoc(ctx, section.docId, cap);
    return { section, doc };
}

async function gateWireframeSection(
    ctx: QueryCtx | MutationCtx,
    sectionId: Id<'wireframeSections'>,
    cap: Capability,
): Promise<{ section: Doc<'wireframeSections'>; doc: Doc<'wireframeDocs'> }> {
    const section = await ctx.db.get(sectionId);
    if (!section) throw new Error('NOT_FOUND: wireframeSection');
    const doc = await gateDoc(ctx, section.docId, cap);
    return { section, doc };
}

/** Validate AI/user content against the block's schema; fall back to default. */
function safeContent(blockId: string, content: unknown): unknown {
    const meta = getBlockMeta(blockId);
    if (!meta) return {};
    const parsed = meta.contentSchema.safeParse(content);
    return parsed.success ? parsed.data : meta.defaultContent;
}

async function reindexSitemapSections(ctx: MutationCtx, pageId: Id<'sitemapPages'>): Promise<void> {
    const rows = await ctx.db
        .query('sitemapSections')
        .withIndex('by_page_order', (q) => q.eq('pageId', pageId))
        .collect();
    await Promise.all(rows.map((row, i) => (row.order === i ? null : ctx.db.patch(row._id, { order: i }))));
}

async function reindexWireframeSections(
    ctx: MutationCtx,
    pageId: Id<'wireframePages'>,
): Promise<void> {
    const rows = await ctx.db
        .query('wireframeSections')
        .withIndex('by_page_order', (q) => q.eq('wireframePageId', pageId))
        .collect();
    await Promise.all(rows.map((row, i) => (row.order === i ? null : ctx.db.patch(row._id, { order: i }))));
}

// ── Queries ─────────────────────────────────────────────────────────────────

export const getDoc = query({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }): Promise<Doc<'wireframeDocs'> | null> => {
        await requireCap(ctx, 'project.view', { projectId });
        return ctx.db
            .query('wireframeDocs')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .first();
    },
});

export interface FullWireframeDoc {
    doc: Doc<'wireframeDocs'>;
    sitemapPages: Doc<'sitemapPages'>[];
    sitemapSections: Doc<'sitemapSections'>[];
    wireframePages: Doc<'wireframePages'>[];
    wireframeSections: Doc<'wireframeSections'>[];
    styleGuides: Doc<'styleGuides'>[];
}

export const getFullDoc = query({
    args: { docId: v.id('wireframeDocs') },
    handler: async (ctx, { docId }): Promise<FullWireframeDoc | null> => {
        const doc = await ctx.db.get(docId);
        if (!doc) return null;
        await requireCap(ctx, 'project.view', { projectId: doc.projectId });
        const [sitemapPages, sitemapSections, wireframePages, wireframeSections, styleGuides] =
            await Promise.all([
                ctx.db.query('sitemapPages').withIndex('by_doc_order', (q) => q.eq('docId', docId)).collect(),
                ctx.db.query('sitemapSections').withIndex('by_doc', (q) => q.eq('docId', docId)).collect(),
                ctx.db.query('wireframePages').withIndex('by_doc', (q) => q.eq('docId', docId)).collect(),
                ctx.db.query('wireframeSections').withIndex('by_doc', (q) => q.eq('docId', docId)).collect(),
                ctx.db.query('styleGuides').withIndex('by_doc', (q) => q.eq('docId', docId)).collect(),
            ]);
        return { doc, sitemapPages, sitemapSections, wireframePages, wireframeSections, styleGuides };
    },
});

// ── Doc lifecycle ────────────────────────────────────────────────────────────

export const ensureDoc = mutation({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }): Promise<Id<'wireframeDocs'>> => {
        await requireCap(ctx, 'project.update', { projectId });
        const existing = await ctx.db
            .query('wireframeDocs')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .first();
        if (existing) return existing._id;
        return ctx.db.insert('wireframeDocs', {
            projectId,
            brief: { companyName: '' },
            status: 'brief',
            updatedAt: Date.now(),
        });
    },
});

export const updateBrief = mutation({
    args: { docId: v.id('wireframeDocs'), brief: briefValidator },
    handler: async (ctx, { docId, brief }): Promise<void> => {
        await gateDoc(ctx, docId, 'project.update');
        await ctx.db.patch(docId, { brief, updatedAt: Date.now() });
    },
});

export const setStatus = mutation({
    args: { docId: v.id('wireframeDocs'), status: vStatus },
    handler: async (ctx, { docId, status }): Promise<void> => {
        await gateDoc(ctx, docId, 'project.update');
        await ctx.db.patch(docId, { status, updatedAt: Date.now() });
    },
});

// ── Sitemap: pages ────────────────────────────────────────────────────────────

export const addPage = mutation({
    args: { docId: v.id('wireframeDocs'), title: v.string() },
    handler: async (ctx, { docId, title }): Promise<Id<'sitemapPages'>> => {
        await gateDoc(ctx, docId, 'project.update');
        const pages = await ctx.db
            .query('sitemapPages')
            .withIndex('by_doc', (q) => q.eq('docId', docId))
            .collect();
        if (pages.length >= MAX_PAGES) throw new Error(`BAD_REQUEST: max ${MAX_PAGES} pages`);
        const slug = dedupeSlug(slugify(title), pages.map((p) => p.slug));
        return ctx.db.insert('sitemapPages', {
            docId,
            title: title.trim() || 'Untitled',
            slug,
            order: nextOrder(pages.map((p) => p.order)),
        });
    },
});

export const updatePage = mutation({
    args: {
        pageId: v.id('sitemapPages'),
        title: v.optional(v.string()),
        description: v.optional(v.string()),
    },
    handler: async (ctx, { pageId, title, description }): Promise<void> => {
        const { page } = await gateSitemapPage(ctx, pageId, 'project.update');
        const patch: Partial<Doc<'sitemapPages'>> = {};
        if (title !== undefined) {
            patch.title = title.trim() || page.title;
            const siblings = await ctx.db
                .query('sitemapPages')
                .withIndex('by_doc', (q) => q.eq('docId', page.docId))
                .collect();
            patch.slug = dedupeSlug(
                slugify(patch.title),
                siblings.filter((p) => p._id !== pageId).map((p) => p.slug),
            );
        }
        if (description !== undefined) patch.description = description;
        await ctx.db.patch(pageId, patch);
    },
});

export const deletePage = mutation({
    args: { pageId: v.id('sitemapPages') },
    handler: async (ctx, { pageId }): Promise<void> => {
        const { page } = await gateSitemapPage(ctx, pageId, 'project.update');
        // Cascade: sitemap sections of this page, the paired wireframe page, and
        // that wireframe page's sections.
        const sections = await ctx.db
            .query('sitemapSections')
            .withIndex('by_page', (q) => q.eq('pageId', pageId))
            .collect();
        for (const s of sections) await ctx.db.delete(s._id);
        const wfPages = await ctx.db
            .query('wireframePages')
            .withIndex('by_sitemap_page', (q) => q.eq('sitemapPageId', pageId))
            .collect();
        for (const wfPage of wfPages) {
            const wfSections = await ctx.db
                .query('wireframeSections')
                .withIndex('by_page', (q) => q.eq('wireframePageId', wfPage._id))
                .collect();
            for (const ws of wfSections) await ctx.db.delete(ws._id);
            await ctx.db.delete(wfPage._id);
        }
        await ctx.db.delete(pageId);
        // Compact remaining page order.
        const remaining = await ctx.db
            .query('sitemapPages')
            .withIndex('by_doc_order', (q) => q.eq('docId', page.docId))
            .collect();
        await Promise.all(
            remaining.map((p, i) => (p.order === i ? null : ctx.db.patch(p._id, { order: i }))),
        );
    },
});

export const reorderPages = mutation({
    args: { docId: v.id('wireframeDocs'), orderedPageIds: v.array(v.id('sitemapPages')) },
    handler: async (ctx, { docId, orderedPageIds }): Promise<void> => {
        await gateDoc(ctx, docId, 'project.update');
        await Promise.all(
            orderedPageIds.map(async (id, i) => {
                const page = await ctx.db.get(id);
                if (page && page.docId === docId && page.order !== i) {
                    await ctx.db.patch(id, { order: i });
                }
            }),
        );
    },
});

// ── Sitemap: sections ──────────────────────────────────────────────────────────

export const addSection = mutation({
    args: {
        pageId: v.id('sitemapPages'),
        title: v.string(),
        description: v.optional(v.string()),
        intent: v.optional(v.string()),
        suggestedBlockType: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<Id<'sitemapSections'>> => {
        const { page, doc } = await gateSitemapPage(ctx, args.pageId, 'project.update');
        const sections = await ctx.db
            .query('sitemapSections')
            .withIndex('by_page', (q) => q.eq('pageId', args.pageId))
            .collect();
        const suggested = args.suggestedBlockType ?? 'feature';
        const sectionId = await ctx.db.insert('sitemapSections', {
            docId: doc._id,
            pageId: args.pageId,
            title: args.title.trim() || 'Section',
            description: args.description ?? '',
            intent: args.intent ?? '',
            suggestedBlockType: suggested,
            order: nextOrder(sections.map((s) => s.order)),
        });
        // If wireframes already exist for this page, keep them in sync by adding a
        // paired wireframe section using a real block coerced from the suggestion.
        const wfPage = await ctx.db
            .query('wireframePages')
            .withIndex('by_sitemap_page', (q) => q.eq('sitemapPageId', args.pageId))
            .first();
        if (wfPage) {
            await createPairedWireframeSection(ctx, doc._id, wfPage._id, sectionId, suggested);
        }
        return sectionId;
    },
});

export const updateSection = mutation({
    args: {
        sectionId: v.id('sitemapSections'),
        title: v.optional(v.string()),
        description: v.optional(v.string()),
        intent: v.optional(v.string()),
        suggestedBlockType: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<void> => {
        await gateSitemapSection(ctx, args.sectionId, 'project.update');
        const patch: Partial<Doc<'sitemapSections'>> = {};
        if (args.title !== undefined) patch.title = args.title;
        if (args.description !== undefined) patch.description = args.description;
        if (args.intent !== undefined) patch.intent = args.intent;
        if (args.suggestedBlockType !== undefined) patch.suggestedBlockType = args.suggestedBlockType;
        await ctx.db.patch(args.sectionId, patch);
    },
});

export const deleteSection = mutation({
    args: { sectionId: v.id('sitemapSections') },
    handler: async (ctx, { sectionId }): Promise<void> => {
        const { section } = await gateSitemapSection(ctx, sectionId, 'project.update');
        // Cascade the paired wireframe section.
        if (section.linkedWireframeSectionId) {
            const wf = await ctx.db.get(section.linkedWireframeSectionId);
            await ctx.db.delete(section.linkedWireframeSectionId);
            if (wf) await reindexWireframeSections(ctx, wf.wireframePageId);
        }
        await ctx.db.delete(sectionId);
        await reindexSitemapSections(ctx, section.pageId);
    },
});

export const reorderSections = mutation({
    args: { pageId: v.id('sitemapPages'), orderedSectionIds: v.array(v.id('sitemapSections')) },
    handler: async (ctx, { pageId, orderedSectionIds }): Promise<void> => {
        await gateSitemapPage(ctx, pageId, 'project.update');
        await Promise.all(
            orderedSectionIds.map(async (id, i) => {
                const s = await ctx.db.get(id);
                if (s && s.pageId === pageId) {
                    if (s.order !== i) await ctx.db.patch(id, { order: i });
                    // Mirror order to the paired wireframe section.
                    if (s.linkedWireframeSectionId) {
                        const wf = await ctx.db.get(s.linkedWireframeSectionId);
                        if (wf && wf.order !== i) await ctx.db.patch(wf._id, { order: i });
                    }
                }
            }),
        );
    },
});

// ── Wireframe sections ─────────────────────────────────────────────────────────

async function createPairedWireframeSection(
    ctx: MutationCtx,
    docId: Id<'wireframeDocs'>,
    wireframePageId: Id<'wireframePages'>,
    sitemapSectionId: Id<'sitemapSections'>,
    blockIdOrCategory: string,
): Promise<Id<'wireframeSections'>> {
    const blockId = coerceBlockId(blockIdOrCategory);
    const meta = getBlockMeta(blockId);
    const existing = await ctx.db
        .query('wireframeSections')
        .withIndex('by_page', (q) => q.eq('wireframePageId', wireframePageId))
        .collect();
    const wfId = await ctx.db.insert('wireframeSections', {
        docId,
        wireframePageId,
        sitemapSectionId,
        blockId,
        blockCategory: meta?.category ?? 'feature',
        content: meta?.defaultContent ?? {},
        order: nextOrder(existing.map((s) => s.order)),
    });
    await ctx.db.patch(sitemapSectionId, { linkedWireframeSectionId: wfId });
    return wfId;
}

export const setWireframeContent = mutation({
    args: { wireframeSectionId: v.id('wireframeSections'), content: v.any() },
    handler: async (ctx, { wireframeSectionId, content }): Promise<void> => {
        const { section } = await gateWireframeSection(ctx, wireframeSectionId, 'project.update');
        await ctx.db.patch(wireframeSectionId, { content: safeContent(section.blockId, content) });
    },
});

export const swapWireframeBlock = mutation({
    args: { wireframeSectionId: v.id('wireframeSections'), blockId: v.string() },
    handler: async (ctx, { wireframeSectionId, blockId }): Promise<void> => {
        const { section } = await gateWireframeSection(ctx, wireframeSectionId, 'project.update');
        if (!isWireframeBlockId(blockId)) throw new Error('BAD_REQUEST: unknown blockId');
        const meta = getBlockMeta(blockId);
        if (!meta) throw new Error('BAD_REQUEST: unknown blockId');
        // Preserve content if it still satisfies the new block; else reset.
        const parsed = meta.contentSchema.safeParse(section.content);
        await ctx.db.patch(wireframeSectionId, {
            blockId,
            blockCategory: meta.category,
            content: parsed.success ? parsed.data : meta.defaultContent,
        });
    },
});

export const addWireframeSection = mutation({
    args: { wireframePageId: v.id('wireframePages'), blockId: v.string() },
    handler: async (ctx, { wireframePageId, blockId }): Promise<Id<'wireframeSections'>> => {
        const wfPage = await ctx.db.get(wireframePageId);
        if (!wfPage) throw new Error('NOT_FOUND: wireframePage');
        const doc = await gateDoc(ctx, wfPage.docId, 'project.update');
        const resolvedBlockId = coerceBlockId(blockId);
        const meta = getBlockMeta(resolvedBlockId);
        // Create a paired sitemap section so the sitemap stays the source of truth.
        const smSections = await ctx.db
            .query('sitemapSections')
            .withIndex('by_page', (q) => q.eq('pageId', wfPage.sitemapPageId))
            .collect();
        const sitemapSectionId = await ctx.db.insert('sitemapSections', {
            docId: doc._id,
            pageId: wfPage.sitemapPageId,
            title: meta?.name ?? 'Section',
            description: '',
            intent: '',
            suggestedBlockType: meta?.category ?? 'feature',
            order: nextOrder(smSections.map((s) => s.order)),
        });
        return createPairedWireframeSection(
            ctx,
            doc._id,
            wireframePageId,
            sitemapSectionId,
            resolvedBlockId,
        );
    },
});

export const deleteWireframeSection = mutation({
    args: { wireframeSectionId: v.id('wireframeSections') },
    handler: async (ctx, { wireframeSectionId }): Promise<void> => {
        const { section } = await gateWireframeSection(ctx, wireframeSectionId, 'project.update');
        // Cascade the paired sitemap section.
        if (section.sitemapSectionId) {
            const sm = await ctx.db.get(section.sitemapSectionId);
            await ctx.db.delete(section.sitemapSectionId);
            if (sm) await reindexSitemapSections(ctx, sm.pageId);
        }
        await ctx.db.delete(wireframeSectionId);
        await reindexWireframeSections(ctx, section.wireframePageId);
    },
});

export const reorderWireframeSections = mutation({
    args: {
        wireframePageId: v.id('wireframePages'),
        orderedSectionIds: v.array(v.id('wireframeSections')),
    },
    handler: async (ctx, { wireframePageId, orderedSectionIds }): Promise<void> => {
        const wfPage = await ctx.db.get(wireframePageId);
        if (!wfPage) throw new Error('NOT_FOUND: wireframePage');
        await gateDoc(ctx, wfPage.docId, 'project.update');
        await Promise.all(
            orderedSectionIds.map(async (id, i) => {
                const s = await ctx.db.get(id);
                if (s && s.wireframePageId === wireframePageId) {
                    if (s.order !== i) await ctx.db.patch(id, { order: i });
                    if (s.sitemapSectionId) {
                        const sm = await ctx.db.get(s.sitemapSectionId);
                        if (sm && sm.order !== i) await ctx.db.patch(sm._id, { order: i });
                    }
                }
            }),
        );
    },
});

// ── Style guide ────────────────────────────────────────────────────────────────

export const applyStyleGuide = mutation({
    args: { styleGuideId: v.id('styleGuides') },
    handler: async (ctx, { styleGuideId }): Promise<void> => {
        const sg = await ctx.db.get(styleGuideId);
        if (!sg) throw new Error('NOT_FOUND: styleGuide');
        const doc = await gateDoc(ctx, sg.docId, 'project.update');
        const all = await ctx.db
            .query('styleGuides')
            .withIndex('by_doc', (q) => q.eq('docId', doc._id))
            .collect();
        await Promise.all(
            all.map((g) =>
                g._id === styleGuideId
                    ? ctx.db.patch(g._id, { isActive: true })
                    : g.isActive
                      ? ctx.db.patch(g._id, { isActive: false })
                      : null,
            ),
        );
        await ctx.db.patch(doc._id, { activeStyleGuideId: styleGuideId, updatedAt: Date.now() });
    },
});

export const updateStyleGuide = mutation({
    args: {
        styleGuideId: v.id('styleGuides'),
        conceptName: v.optional(v.string()),
        tokens: v.optional(v.any()),
    },
    handler: async (ctx, { styleGuideId, conceptName, tokens }): Promise<void> => {
        const sg = await ctx.db.get(styleGuideId);
        if (!sg) throw new Error('NOT_FOUND: styleGuide');
        await gateDoc(ctx, sg.docId, 'project.update');
        const patch: Partial<Doc<'styleGuides'>> = { updatedAt: Date.now() };
        if (conceptName !== undefined) patch.conceptName = conceptName;
        if (tokens !== undefined) patch.tokens = tokens;
        await ctx.db.patch(styleGuideId, patch);
    },
});

// ── Internal: action-facing read + bulk writes ───────────────────────────────

export const _getDocForAction = internalQuery({
    args: { docId: v.id('wireframeDocs') },
    handler: async (ctx, { docId }): Promise<Doc<'wireframeDocs'> | null> => {
        const doc = await ctx.db.get(docId);
        if (!doc) return null;
        // SECURITY: the public AI actions in wireframeActions.ts gate solely on
        // this lookup. Auth identity propagates from the calling action through
        // ctx.runQuery, so enforce the AI cap here — otherwise any caller with a
        // docId could drive OpenRouter spend against another project.
        await requireCap(ctx, 'project.use_ai', { projectId: doc.projectId });
        return doc;
    },
});

export const _getSitemapForAction = internalQuery({
    args: { docId: v.id('wireframeDocs') },
    handler: async (
        ctx,
        { docId },
    ): Promise<{ pages: Doc<'sitemapPages'>[]; sections: Doc<'sitemapSections'>[] }> => {
        const doc = await ctx.db.get(docId);
        if (!doc) throw new Error('NOT_FOUND: wireframeDoc');
        await requireCap(ctx, 'project.use_ai', { projectId: doc.projectId });
        const [pages, sections] = await Promise.all([
            ctx.db.query('sitemapPages').withIndex('by_doc_order', (q) => q.eq('docId', docId)).collect(),
            ctx.db.query('sitemapSections').withIndex('by_doc', (q) => q.eq('docId', docId)).collect(),
        ]);
        return { pages, sections };
    },
});

export const _getWireframeForEmit = internalQuery({
    args: { docId: v.id('wireframeDocs') },
    handler: async (
        ctx,
        { docId },
    ): Promise<{
        brief: Doc<'wireframeDocs'>['brief'];
        wireframePages: Doc<'wireframePages'>[];
        wireframeSections: Doc<'wireframeSections'>[];
        activeTokens: unknown;
    }> => {
        const doc = await ctx.db.get(docId);
        if (!doc) throw new Error('NOT_FOUND: wireframeDoc');
        await requireCap(ctx, 'project.use_ai', { projectId: doc.projectId });
        const [wireframePages, wireframeSections, styleGuides] = await Promise.all([
            ctx.db.query('wireframePages').withIndex('by_doc', (q) => q.eq('docId', docId)).collect(),
            ctx.db.query('wireframeSections').withIndex('by_doc', (q) => q.eq('docId', docId)).collect(),
            ctx.db.query('styleGuides').withIndex('by_doc', (q) => q.eq('docId', docId)).collect(),
        ]);
        const active =
            styleGuides.find((g) => g._id === doc.activeStyleGuideId) ??
            styleGuides.find((g) => g.isActive) ??
            null;
        return {
            brief: doc.brief,
            wireframePages,
            wireframeSections,
            activeTokens: active?.tokens ?? null,
        };
    },
});

async function clearWireframes(ctx: MutationCtx, docId: Id<'wireframeDocs'>): Promise<void> {
    const wfSections = await ctx.db
        .query('wireframeSections')
        .withIndex('by_doc', (q) => q.eq('docId', docId))
        .collect();
    for (const s of wfSections) await ctx.db.delete(s._id);
    const wfPages = await ctx.db
        .query('wireframePages')
        .withIndex('by_doc', (q) => q.eq('docId', docId))
        .collect();
    for (const p of wfPages) await ctx.db.delete(p._id);
    // Unlink sitemap sections.
    const smSections = await ctx.db
        .query('sitemapSections')
        .withIndex('by_doc', (q) => q.eq('docId', docId))
        .collect();
    for (const s of smSections) {
        if (s.linkedWireframeSectionId) await ctx.db.patch(s._id, { linkedWireframeSectionId: undefined });
    }
}

/** Replace the entire sitemap (and any derived wireframes) for a doc. */
export const _replaceSitemap = internalMutation({
    args: {
        docId: v.id('wireframeDocs'),
        pages: v.array(
            v.object({
                title: v.string(),
                description: v.optional(v.string()),
                sections: v.array(
                    v.object({
                        title: v.string(),
                        description: v.string(),
                        intent: v.string(),
                        suggestedBlockType: v.string(),
                    }),
                ),
            }),
        ),
    },
    handler: async (ctx, { docId, pages }): Promise<void> => {
        await clearWireframes(ctx, docId);
        const oldSections = await ctx.db
            .query('sitemapSections')
            .withIndex('by_doc', (q) => q.eq('docId', docId))
            .collect();
        for (const s of oldSections) await ctx.db.delete(s._id);
        const oldPages = await ctx.db
            .query('sitemapPages')
            .withIndex('by_doc', (q) => q.eq('docId', docId))
            .collect();
        for (const p of oldPages) await ctx.db.delete(p._id);

        const takenSlugs: string[] = [];
        let pageOrder = 0;
        for (const page of pages.slice(0, MAX_PAGES)) {
            const slug = dedupeSlug(slugify(page.title), takenSlugs);
            takenSlugs.push(slug);
            const pageId = await ctx.db.insert('sitemapPages', {
                docId,
                title: page.title.trim() || 'Untitled',
                slug,
                description: page.description,
                order: pageOrder,
            });
            pageOrder += 1;
            let sectionOrder = 0;
            for (const section of page.sections) {
                await ctx.db.insert('sitemapSections', {
                    docId,
                    pageId,
                    title: section.title,
                    description: section.description,
                    intent: section.intent,
                    suggestedBlockType: section.suggestedBlockType,
                    order: sectionOrder,
                });
                sectionOrder += 1;
            }
        }
        await ctx.db.patch(docId, { status: 'sitemap', updatedAt: Date.now() });
    },
});

/** Replace derived wireframes from a generated mapping, relinking sitemap sections. */
export const _replaceWireframes = internalMutation({
    args: {
        docId: v.id('wireframeDocs'),
        pages: v.array(
            v.object({
                sitemapPageId: v.id('sitemapPages'),
                title: v.string(),
                slug: v.string(),
                order: v.number(),
                sections: v.array(
                    v.object({
                        sitemapSectionId: v.id('sitemapSections'),
                        blockId: v.string(),
                        blockCategory: v.string(),
                        content: v.any(),
                    }),
                ),
            }),
        ),
    },
    handler: async (ctx, { docId, pages }): Promise<void> => {
        await clearWireframes(ctx, docId);
        for (const page of pages) {
            const wfPageId = await ctx.db.insert('wireframePages', {
                docId,
                sitemapPageId: page.sitemapPageId,
                title: page.title,
                slug: page.slug,
                order: page.order,
            });
            let order = 0;
            for (const section of page.sections) {
                const wfId = await ctx.db.insert('wireframeSections', {
                    docId,
                    wireframePageId: wfPageId,
                    sitemapSectionId: section.sitemapSectionId,
                    blockId: section.blockId,
                    blockCategory: section.blockCategory,
                    content: section.content,
                    order,
                });
                order += 1;
                await ctx.db.patch(section.sitemapSectionId, { linkedWireframeSectionId: wfId });
            }
        }
        await ctx.db.patch(docId, { status: 'wireframe', updatedAt: Date.now() });
    },
});

export const _insertStyleGuide = internalMutation({
    args: {
        docId: v.id('wireframeDocs'),
        conceptName: v.string(),
        tokens: v.any(),
    },
    handler: async (ctx, { docId, conceptName, tokens }): Promise<Id<'styleGuides'>> => {
        const existing = await ctx.db
            .query('styleGuides')
            .withIndex('by_doc', (q) => q.eq('docId', docId))
            .collect();
        for (const g of existing) {
            if (g.isActive) await ctx.db.patch(g._id, { isActive: false });
        }
        const id = await ctx.db.insert('styleGuides', {
            docId,
            conceptName,
            tokens,
            isActive: true,
            updatedAt: Date.now(),
        });
        await ctx.db.patch(docId, { activeStyleGuideId: id, status: 'styleGuide', updatedAt: Date.now() });
        return id;
    },
});

// Re-exported for the AI actions (avoids a second import path in wireframeActions).
export type { BlockCategory };
