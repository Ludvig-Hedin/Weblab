import FirecrawlApp from '@mendable/firecrawl-js';
import Exa from 'exa-js';
import { z } from 'zod';

import type { WebSearchResult } from '@weblab/models';
import { applyCodeChange } from '@weblab/ai';

import { env } from '@/env';
import { createTRPCRouter, protectedProcedure } from '../trpc';

export const utilsRouter = createTRPCRouter({
    applyDiff: protectedProcedure
        .input(
            z.object({
                originalCode: z.string(),
                updateSnippet: z.string(),
                instruction: z.string(),
                metadata: z
                    .object({
                        projectId: z.string().optional(),
                        conversationId: z.string().optional(),
                    })
                    .optional(),
            }),
        )
        .mutation(
            async ({ input, ctx }): Promise<{ result: string | null; error: string | null }> => {
                try {
                    const user = ctx.user;
                    const metadata = {
                        ...input.metadata,
                        userId: user.id,
                    };
                    const result = await applyCodeChange(
                        input.originalCode,
                        input.updateSnippet,
                        input.instruction,
                        metadata,
                    );
                    if (!result) {
                        throw new Error('Failed to apply code change. Please try again.');
                    }
                    return {
                        result,
                        error: null,
                    };
                } catch (error) {
                    console.error('Failed to apply code change', error);
                    return {
                        error: error instanceof Error ? error.message : 'Unknown error',
                        result: null,
                    };
                }
            },
        ),
    scrapeUrl: protectedProcedure
        .input(
            z.object({
                url: z.string().url(),
                formats: z
                    .array(z.enum(['markdown', 'html', 'json', 'branding', 'screenshot']))
                    .default(['markdown']),
                onlyMainContent: z.boolean().default(true),
                includeTags: z.array(z.string()).optional(),
                excludeTags: z.array(z.string()).optional(),
                waitFor: z.number().min(0).optional(),
            }),
        )
        .mutation(
            async ({
                input,
            }): Promise<{
                result: string | null;
                screenshotUrl: string | null;
                screenshotBase64: string | null;
                screenshotMimeType: string | null;
                error: string | null;
            }> => {
                try {
                    if (!env.FIRECRAWL_API_KEY) {
                        throw new Error('FIRECRAWL_API_KEY is not configured');
                    }

                    const app = new FirecrawlApp({ apiKey: env.FIRECRAWL_API_KEY });

                    // Cast formats to SDK type - 'branding' is supported by API but not in SDK types yet
                    const result = await app.scrapeUrl(input.url, {
                        formats: input.formats as any,
                        onlyMainContent: input.onlyMainContent,
                        ...(input.includeTags && { includeTags: input.includeTags }),
                        ...(input.excludeTags && { excludeTags: input.excludeTags }),
                        ...(input.waitFor !== undefined && { waitFor: input.waitFor }),
                    });

                    if (!result.success) {
                        throw new Error(`Failed to scrape URL: ${result.error || 'Unknown error'}`);
                    }

                    const hasBranding = input.formats.includes('branding');
                    const hasScreenshot = input.formats.includes('screenshot');
                    const hasContentFormats = input.formats.some((f) =>
                        ['markdown', 'html', 'json'].includes(f),
                    );

                    // Extract branding data if requested - access via type assertion since SDK types may not include it yet
                    const resultWithBranding = result as { branding?: unknown };
                    const brandingData =
                        hasBranding && resultWithBranding.branding
                            ? JSON.stringify(resultWithBranding.branding, null, 2)
                            : null;

                    // Screenshot URL is a CDN-hosted image returned by Firecrawl
                    // when the 'screenshot' format is requested. We also
                    // download it server-side and return the bytes inline as a
                    // base64 data URL so browser callers (the website cloner)
                    // don't have to issue cross-origin fetches against a
                    // third-party CDN. Failures here are non-fatal — the rest
                    // of the scrape (markdown, branding, URL) still returns.
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
                                screenshotMimeType =
                                    response.headers.get('content-type') ?? 'image/png';
                                screenshotBase64 = `data:${screenshotMimeType};base64,${Buffer.from(arrayBuffer).toString('base64')}`;
                            } else {
                                console.warn(
                                    `[scrapeUrl] screenshot download failed: ${response.status} ${response.statusText}`,
                                );
                            }
                        } catch (err) {
                            console.warn('[scrapeUrl] screenshot download threw', err);
                        }
                    }

                    // Return the primary content format (markdown by default)
                    // or the first available format if markdown isn't available
                    const content =
                        result.markdown ?? result.html ?? JSON.stringify(result.json, null, 2);

                    // Combine content and branding if both are requested
                    if (hasBranding && hasContentFormats) {
                        // Ensure at least one format is available
                        if (!content && !brandingData) {
                            throw new Error(
                                'No content or branding data was extracted from the URL',
                            );
                        }

                        const parts: string[] = [];
                        if (content) {
                            parts.push(content);
                        }
                        if (brandingData) {
                            // Only add separator if we have both content and branding
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

                    // Return branding only if it's the only text format requested
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

                    // Screenshot-only request: no text formats, no branding
                    if (hasScreenshot && !hasContentFormats && !hasBranding) {
                        if (!screenshotUrl) {
                            throw new Error('No screenshot was returned for the URL');
                        }
                        return {
                            result: null,
                            screenshotUrl,
                            screenshotBase64,
                            screenshotMimeType,
                            error: null,
                        };
                    }

                    // Return content only (existing behavior)
                    if (!content) {
                        throw new Error('No content was scraped from the URL');
                    }

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
        ),
    webSearch: protectedProcedure
        .input(
            z.object({
                query: z.string().min(2).describe('Search query'),
                allowed_domains: z
                    .array(z.string())
                    .optional()
                    .describe('Include only these domains'),
                blocked_domains: z.array(z.string()).optional().describe('Exclude these domains'),
            }),
        )
        .mutation(async ({ input }): Promise<WebSearchResult> => {
            try {
                if (!env.EXA_API_KEY) {
                    throw new Error('EXA_API_KEY is not configured');
                }

                const exa = new Exa(env.EXA_API_KEY);

                const searchOptions: Record<string, unknown> = {
                    type: 'auto',
                    numResults: 10,
                    contents: {
                        text: true,
                    },
                };

                if (input.allowed_domains && input.allowed_domains.length > 0) {
                    searchOptions.includeDomains = input.allowed_domains;
                }

                if (input.blocked_domains && input.blocked_domains.length > 0) {
                    searchOptions.excludeDomains = input.blocked_domains;
                }

                const result = await exa.searchAndContents(input.query, searchOptions);

                if (!result.results || result.results.length === 0) {
                    return {
                        result: [],
                        error: null,
                    };
                }

                const formattedResults = result.results.map((item) => ({
                    title: item.title ?? '',
                    url: item.url ?? '',
                    text: item.text ?? '',
                    publishedDate: item.publishedDate ?? null,
                    author: item.author ?? null,
                }));

                return {
                    result: formattedResults,
                    error: null,
                };
            } catch (error) {
                console.error('Error searching web:', error);
                return {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    result: [],
                };
            }
        }),
});
