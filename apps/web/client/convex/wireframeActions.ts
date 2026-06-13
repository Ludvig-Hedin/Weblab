import type { LanguageModel } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateObject } from 'ai';
import { v } from 'convex/values';
import { z } from 'zod';

import {
    BLOCK_CATEGORIES,
    blockCatalogForPrompt,
    coerceBlockId,
    getBlockMeta,
    isBlockCategory,
    WIREFRAME_BLOCK_IDS,
    type BlockCategory,
} from '@weblab/wireframe-blocks';

import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { action } from './_generated/server';

// =============================================================================
// AI generation for the wireframes feature. Mirrors the convex/chatActions.ts
// pattern: gate via an internal query (auth propagates through ctx.runQuery),
// call OpenRouter through the Vercel AI SDK's `generateObject` with a strict Zod
// schema, repair invalid JSON with a bounded retry, then persist via internal
// mutations. The block id is constrained to a Zod enum of the real registry so
// the model literally cannot hallucinate a block; every result is additionally
// coerced + schema-validated at the write boundary.
// =============================================================================

const MAX_PAGES = 20;
const MODEL = 'openai/gpt-5';

const requireOpenRouter = () => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        throw new Error(
            'OPENROUTER_API_KEY is not set on the Convex deployment. Run ' +
                '`bunx convex env set OPENROUTER_API_KEY <key>`.',
        );
    }
    return createOpenRouter({ apiKey });
};

async function runWithRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i += 1) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            console.warn(`[wireframeActions] generation attempt ${i + 1} failed`, err);
        }
    }
    throw lastErr instanceof Error ? lastErr : new Error('GENERATION_FAILED');
}

const categoryEnum = z.enum([...BLOCK_CATEGORIES] as [string, ...string[]]);
const blockIdEnum = z.enum([...WIREFRAME_BLOCK_IDS] as [string, ...string[]]);

// ── Schemas ──────────────────────────────────────────────────────────────────

const SitemapSchema = z.object({
    pages: z
        .array(
            z.object({
                title: z.string().min(1).max(80),
                description: z.string().max(400),
                sections: z
                    .array(
                        z.object({
                            title: z.string().min(1).max(80),
                            description: z.string().max(400),
                            intent: z.string().max(200),
                            suggestedBlockType: categoryEnum,
                        }),
                    )
                    .min(1)
                    .max(14),
            }),
        )
        .min(1)
        .max(MAX_PAGES),
});

const WireframeSchema = z.object({
    pages: z.array(
        z.object({
            sitemapPageId: z.string(),
            sections: z.array(
                z.object({
                    sitemapSectionId: z.string(),
                    blockId: blockIdEnum,
                    content: z.record(z.string(), z.unknown()),
                }),
            ),
        }),
    ),
});

const StyleGuideSchema = z.object({
    conceptName: z.string().min(1).max(60),
    rationale: z.string().max(400).optional(),
    tokens: z.object({
        background: z.string().optional(),
        foreground: z.string().optional(),
        primary: z.string().optional(),
        primaryForeground: z.string().optional(),
        secondary: z.string().optional(),
        secondaryForeground: z.string().optional(),
        muted: z.string().optional(),
        mutedForeground: z.string().optional(),
        accent: z.string().optional(),
        border: z.string().optional(),
        ring: z.string().optional(),
        brandAccent: z.string().optional(),
        radius: z.string().optional(),
        fontHeading: z.string().optional(),
        fontBody: z.string().optional(),
    }),
});

// ── Prompt builders ────────────────────────────────────────────────────────────

function briefSummary(brief: Doc<'wireframeDocs'>['brief']): string {
    const lines = [
        `Company/product: ${brief.companyName || 'Unnamed'}`,
        brief.industry ? `Industry: ${brief.industry}` : null,
        brief.audience ? `Target audience: ${brief.audience}` : null,
        brief.offer ? `Offer / value proposition: ${brief.offer}` : null,
        brief.tone ? `Tone/style: ${brief.tone}` : null,
        brief.references ? `References: ${brief.references}` : null,
    ].filter((l): l is string => l !== null);
    return lines.join('\n');
}

const SITEMAP_SYSTEM =
    'You are a senior web strategist. Produce a practical B2B/B2C landing-site sitemap as strict JSON. ' +
    'Rules: every page must start with a navbar section and end with a footer section. The homepage must ' +
    'include a hero, at least one proof/value section, and a CTA. No generic filler, no duplicate sections ' +
    'unless intentional. Each section needs a concrete title, a one-line description, an intent, and a ' +
    'suggestedBlockType chosen ONLY from the allowed categories.';

function buildSitemapPrompt(brief: Doc<'wireframeDocs'>['brief'], pageCount: number): string {
    return [
        briefSummary(brief),
        '',
        `Desired number of pages: ${pageCount}.`,
        `Allowed section categories (suggestedBlockType): ${BLOCK_CATEGORIES.join(', ')}.`,
        'Return JSON matching the schema. Make copy specific to the company and offer above.',
    ].join('\n');
}

function blockCatalogHint(): string {
    return blockCatalogForPrompt()
        .map((b) => {
            const meta = getBlockMeta(b.id);
            const shape = meta ? JSON.stringify(meta.defaultContent) : '{}';
            return `- ${b.id} [${b.category}] — ${b.name}. Use for: ${b.useCases.join('; ')}. content shape: ${shape}`;
        })
        .join('\n');
}

const WIREFRAME_SYSTEM =
    'You are a web designer assembling wireframes from a sitemap using a FIXED catalog of section blocks. ' +
    'For every sitemap section, pick the single best blockId from the catalog (you may ONLY use ids from the ' +
    'catalog) and fill its `content` to match that block\'s content shape exactly, with copy specific to the ' +
    'brief. Keep copy concise so it fits the layout. Return strict JSON matching the schema.';

function buildWireframePrompt(
    brief: Doc<'wireframeDocs'>['brief'],
    pages: Doc<'sitemapPages'>[],
    sections: Doc<'sitemapSections'>[],
): string {
    const sitemap = pages
        .map((page) => {
            const pageSections = sections
                .filter((s) => s.pageId === page._id)
                .sort((a, b) => a.order - b.order)
                .map(
                    (s) =>
                        `    - sitemapSectionId=${s._id} | ${s.title} | ${s.suggestedBlockType} | ${s.description}`,
                )
                .join('\n');
            return `  page sitemapPageId=${page._id} "${page.title}":\n${pageSections}`;
        })
        .join('\n');
    return [
        briefSummary(brief),
        '',
        'BLOCK CATALOG (choose blockId only from these):',
        blockCatalogHint(),
        '',
        'SITEMAP (map every section below to exactly one block; echo back the same ids):',
        sitemap,
    ].join('\n');
}

const STYLE_GUIDE_SYSTEM =
    'You are a brand designer. Produce ONE restrained, accessible style concept as strict JSON. Colors must ' +
    'be valid CSS color strings (oklch() or hex). Keep strong contrast between foreground and background and ' +
    'between primary and primaryForeground. radius is a CSS length like "0.5rem". fontHeading/fontBody are ' +
    'Google Font family names. Favor a mostly-neutral palette with a single accent.';

function buildStyleGuidePrompt(brief: Doc<'wireframeDocs'>['brief']): string {
    return [
        briefSummary(brief),
        '',
        'Return a single style concept (conceptName + tokens) appropriate for this company and audience.',
    ].join('\n');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function asCategory(value: string): BlockCategory | undefined {
    return isBlockCategory(value) ? value : undefined;
}

function validatedContent(blockId: string, content: unknown): unknown {
    const meta = getBlockMeta(blockId);
    if (!meta) return {};
    const parsed = meta.contentSchema.safeParse(content);
    return parsed.success ? parsed.data : meta.defaultContent;
}

// ── Actions ──────────────────────────────────────────────────────────────────

export const generateSitemap = action({
    args: { docId: v.id('wireframeDocs') },
    handler: async (ctx, { docId }): Promise<{ ok: true }> => {
        const doc = await ctx.runQuery(internal.wireframes._getDocForAction, { docId });
        if (!doc) throw new Error('NOT_FOUND: wireframeDoc');

        const openrouter = requireOpenRouter();
        const pageCount = Math.min(Math.max(doc.brief.pageCount ?? 4, 1), MAX_PAGES);
        const { object } = await runWithRetry(() =>
            generateObject({
                model: openrouter(MODEL) as unknown as LanguageModel,
                schema: SitemapSchema,
                messages: [
                    { role: 'system', content: SITEMAP_SYSTEM },
                    { role: 'user', content: buildSitemapPrompt(doc.brief, pageCount) },
                ],
                maxOutputTokens: 8000,
            }),
        );

        await ctx.runMutation(internal.wireframes._replaceSitemap, {
            docId,
            pages: object.pages.map((p) => ({
                title: p.title,
                description: p.description,
                sections: p.sections.map((s) => ({
                    title: s.title,
                    description: s.description,
                    intent: s.intent,
                    suggestedBlockType: s.suggestedBlockType,
                })),
            })),
        });
        return { ok: true };
    },
});

export const generateWireframe = action({
    args: { docId: v.id('wireframeDocs') },
    handler: async (ctx, { docId }): Promise<{ ok: true }> => {
        const { pages, sections } = await ctx.runQuery(internal.wireframes._getSitemapForAction, {
            docId,
        });
        if (pages.length === 0) throw new Error('BAD_REQUEST: generate a sitemap first');
        const doc = await ctx.runQuery(internal.wireframes._getDocForAction, { docId });
        if (!doc) throw new Error('NOT_FOUND: wireframeDoc');

        const openrouter = requireOpenRouter();
        const { object } = await runWithRetry(() =>
            generateObject({
                model: openrouter(MODEL) as unknown as LanguageModel,
                schema: WireframeSchema,
                messages: [
                    { role: 'system', content: WIREFRAME_SYSTEM },
                    { role: 'user', content: buildWireframePrompt(doc.brief, pages, sections) },
                ],
                maxOutputTokens: 16000,
            }),
        );

        // Lookup the model's choice per sitemap section (by id).
        const aiBySection = new Map<string, { blockId: string; content: unknown }>();
        for (const page of object.pages) {
            for (const section of page.sections) {
                aiBySection.set(section.sitemapSectionId, {
                    blockId: section.blockId,
                    content: section.content,
                });
            }
        }

        // Map EVERY sitemap section to a real block, coercing + validating. Any
        // section the model skipped falls back to its suggested category default.
        const wfPages = pages.map((page, pageIndex) => {
            const pageSections = sections
                .filter((s) => s.pageId === page._id)
                .sort((a, b) => a.order - b.order)
                .map((sec) => {
                    const ai = aiBySection.get(sec._id);
                    const blockId = coerceBlockId(
                        ai?.blockId ?? sec.suggestedBlockType,
                        asCategory(sec.suggestedBlockType),
                    );
                    const meta = getBlockMeta(blockId);
                    return {
                        sitemapSectionId: sec._id,
                        blockId,
                        blockCategory: meta?.category ?? 'feature',
                        content: validatedContent(blockId, ai?.content),
                    };
                });
            return {
                sitemapPageId: page._id,
                title: page.title,
                slug: page.slug,
                order: pageIndex,
                sections: pageSections,
            };
        });

        await ctx.runMutation(internal.wireframes._replaceWireframes, { docId, pages: wfPages });
        return { ok: true };
    },
});

export const generateStyleGuide = action({
    args: { docId: v.id('wireframeDocs') },
    handler: async (ctx, { docId }): Promise<{ ok: true }> => {
        const doc = await ctx.runQuery(internal.wireframes._getDocForAction, { docId });
        if (!doc) throw new Error('NOT_FOUND: wireframeDoc');

        const openrouter = requireOpenRouter();
        const { object } = await runWithRetry(() =>
            generateObject({
                model: openrouter(MODEL) as unknown as LanguageModel,
                schema: StyleGuideSchema,
                messages: [
                    { role: 'system', content: STYLE_GUIDE_SYSTEM },
                    { role: 'user', content: buildStyleGuidePrompt(doc.brief) },
                ],
                maxOutputTokens: 4000,
            }),
        );

        await ctx.runMutation(internal.wireframes._insertStyleGuide, {
            docId,
            conceptName: object.conceptName,
            tokens: object.tokens,
        });
        return { ok: true };
    },
});
