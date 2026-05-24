'use node';

import FirecrawlApp from '@mendable/firecrawl-js';
import { v } from 'convex/values';
import Exa from 'exa-js';

import type { WebSearchResult } from '@weblab/models';
import { applyCodeChange } from '@weblab/ai';

import type { ActionCtx } from './_generated/server';
import { api } from './_generated/api';
import { action } from './_generated/server';

// Convex port of src/server/api/routers/code.ts (utilsRouter).
//
// Node runtime — Firecrawl + Exa SDKs use Node APIs internally. Each action
// validates the caller via `api.users.me` before invoking the external API.

async function requireCaller(ctx: ActionCtx) {
    const me = await ctx.runQuery(api.users.me, {});
    if (!me) throw new Error('UNAUTHORIZED');
    return me;
}

export const applyDiff = action({
    args: {
        originalCode: v.string(),
        updateSnippet: v.string(),
        instruction: v.string(),
        metadata: v.optional(
            v.object({
                projectId: v.optional(v.string()),
                conversationId: v.optional(v.string()),
            }),
        ),
    },
    handler: async (
        ctx,
        { originalCode, updateSnippet, instruction, metadata },
    ): Promise<{ result: string | null; error: string | null }> => {
        try {
            const me = await requireCaller(ctx);
            const result = await applyCodeChange(originalCode, updateSnippet, instruction, {
                ...metadata,
                userId: me._id,
            });
            if (!result) throw new Error('Failed to apply code change. Please try again.');
            return { result, error: null };
        } catch (error) {
            console.error('Failed to apply code change', error);
            return {
                error: error instanceof Error ? error.message : 'Unknown error',
                result: null,
            };
        }
    },
});

const scrapeFormat = v.union(
    v.literal('markdown'),
    v.literal('html'),
    v.literal('json'),
    v.literal('branding'),
    v.literal('screenshot'),
);

export const scrapeUrl = action({
    args: {
        url: v.string(),
        formats: v.optional(v.array(scrapeFormat)),
        onlyMainContent: v.optional(v.boolean()),
        includeTags: v.optional(v.array(v.string())),
        excludeTags: v.optional(v.array(v.string())),
        waitFor: v.optional(v.number()),
    },
    handler: async (
        ctx,
        input,
    ): Promise<{
        result: string | null;
        screenshotUrl: string | null;
        screenshotBase64: string | null;
        screenshotMimeType: string | null;
        error: string | null;
    }> => {
        try {
            await requireCaller(ctx);
            if (!process.env.FIRECRAWL_API_KEY) {
                throw new Error('FIRECRAWL_API_KEY is not configured');
            }

            const formats = input.formats ?? ['markdown'];
            const onlyMainContent = input.onlyMainContent ?? true;

            const app = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });

            // 'branding' is supported by the API but not in the SDK types.
            const result = (await app.scrapeUrl(input.url, {
                formats: formats as unknown as never,
                onlyMainContent,
                ...(input.includeTags ? { includeTags: input.includeTags } : {}),
                ...(input.excludeTags ? { excludeTags: input.excludeTags } : {}),
                ...(input.waitFor !== undefined ? { waitFor: input.waitFor } : {}),
            })) as {
                success: boolean;
                error?: string;
                markdown?: string;
                html?: string;
                json?: unknown;
                screenshot?: string | null;
                branding?: unknown;
            };

            if (!result.success) {
                throw new Error(`Failed to scrape URL: ${result.error || 'Unknown error'}`);
            }

            const hasBranding = formats.includes('branding');
            const hasScreenshot = formats.includes('screenshot');
            const hasContentFormats = formats.some((f) => ['markdown', 'html', 'json'].includes(f));

            const brandingData =
                hasBranding && result.branding ? JSON.stringify(result.branding, null, 2) : null;

            const screenshotUrl = hasScreenshot ? (result.screenshot ?? null) : null;
            let screenshotBase64: string | null = null;
            let screenshotMimeType: string | null = null;
            if (screenshotUrl) {
                try {
                    const response = await fetch(screenshotUrl, {
                        signal: AbortSignal.timeout(10000),
                    });
                    if (response.ok) {
                        const arrayBuffer = await response.arrayBuffer();
                        screenshotMimeType = response.headers.get('content-type') ?? 'image/png';
                        screenshotBase64 = `data:${screenshotMimeType};base64,${Buffer.from(
                            arrayBuffer,
                        ).toString('base64')}`;
                    } else {
                        console.warn(
                            `[scrapeUrl] screenshot download failed: ${response.status} ${response.statusText}`,
                        );
                    }
                } catch (err) {
                    console.warn('[scrapeUrl] screenshot download threw', err);
                }
            }

            const content = result.markdown ?? result.html ?? JSON.stringify(result.json, null, 2);

            if (hasBranding && hasContentFormats) {
                if (!content && !brandingData) {
                    throw new Error('No content or branding data was extracted from the URL');
                }
                const parts: string[] = [];
                if (content) parts.push(content);
                if (brandingData) {
                    if (content) {
                        parts.push('\n\n=== Brand Identity ===\n');
                        parts.push(
                            'The following brand identity information was extracted from the website:\n',
                        );
                    }
                    parts.push(brandingData);
                }
                return {
                    result: parts.join('\n'),
                    screenshotUrl,
                    screenshotBase64,
                    screenshotMimeType,
                    error: null,
                };
            }

            if (hasBranding && !hasContentFormats) {
                if (!brandingData && !screenshotUrl) {
                    throw new Error('No branding data was extracted from the URL');
                }
                return {
                    result: brandingData,
                    screenshotUrl,
                    screenshotBase64,
                    screenshotMimeType,
                    error: null,
                };
            }

            if (hasScreenshot && !hasContentFormats && !hasBranding) {
                if (!screenshotUrl) throw new Error('No screenshot was returned for the URL');
                return {
                    result: null,
                    screenshotUrl,
                    screenshotBase64,
                    screenshotMimeType,
                    error: null,
                };
            }

            if (!content) throw new Error('No content was scraped from the URL');
            return {
                result: content,
                screenshotUrl,
                screenshotBase64,
                screenshotMimeType,
                error: null,
            };
        } catch (error) {
            console.error('Error scraping URL:', error);
            return {
                error: error instanceof Error ? error.message : 'Unknown error',
                result: null,
                screenshotUrl: null,
                screenshotBase64: null,
                screenshotMimeType: null,
            };
        }
    },
});

export const webSearch = action({
    args: {
        query: v.string(),
        allowed_domains: v.optional(v.array(v.string())),
        blocked_domains: v.optional(v.array(v.string())),
    },
    handler: async (ctx, input): Promise<WebSearchResult> => {
        try {
            await requireCaller(ctx);
            if (!process.env.EXA_API_KEY) {
                throw new Error('EXA_API_KEY is not configured');
            }
            if (input.query.trim().length < 2) {
                throw new Error('BAD_REQUEST: query too short');
            }

            const exa = new Exa(process.env.EXA_API_KEY);

            const searchOptions: Record<string, unknown> = {
                type: 'auto',
                numResults: 10,
                contents: { text: true },
            };
            if (input.allowed_domains && input.allowed_domains.length > 0) {
                searchOptions.includeDomains = input.allowed_domains;
            }
            if (input.blocked_domains && input.blocked_domains.length > 0) {
                searchOptions.excludeDomains = input.blocked_domains;
            }

            const result = await exa.searchAndContents(input.query, searchOptions);
            if (!result.results || result.results.length === 0) {
                return { result: [], error: null };
            }
            const formattedResults = result.results.map((item) => ({
                title: item.title ?? '',
                url: item.url ?? '',
                text: item.text ?? '',
                publishedDate: item.publishedDate ?? null,
                author: item.author ?? null,
            }));
            return { result: formattedResults, error: null };
        } catch (error) {
            console.error('Error searching web:', error);
            return {
                error: error instanceof Error ? error.message : 'Unknown error',
                result: [],
            };
        }
    },
});
