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

// Length cap for the three string args of applyDiff. Bounds the LLM input
// size per call. 100 KB per arg matches a generous file/snippet ceiling
// while keeping the worst-case OpenRouter/Morph/Relace bill bounded per
// authenticated caller.
const APPLY_DIFF_MAX_STRING_BYTES = 100 * 1024;

// SSRF guard for scrapeUrl: reject non-http(s) protocols, loopback,
// link-local, RFC1918 private ranges, IPv6 ULA/link-local, IPv4-mapped IPv6,
// and the cloud-metadata endpoints (169.254.169.254, fd00:ec2::254,
// metadata.google.internal). Firecrawl performs its own egress hardening
// but treat that as defense-in-depth, not a primary control.
function isPrivateOrMetadataHost(hostname: string): boolean {
    const h = hostname.toLowerCase();
    if (h === 'localhost' || h === '::1' || h === '0.0.0.0') return true;
    // Cloud-metadata hostnames + IPv4.
    if (
        h === '169.254.169.254' ||
        h === 'metadata.google.internal' ||
        h === 'metadata.azure.com'
    ) {
        return true;
    }
    // IPv6 ranges. URL parser may surround in `[...]` — strip brackets.
    const v6 = h.startsWith('[') && h.endsWith(']') ? h.slice(1, -1) : h;
    // Unique-local (fc00::/7), link-local (fe80::/10), AWS metadata
    // (fd00:ec2::), IPv4-mapped (::ffff:0:0/96).
    if (
        v6.startsWith('fc') ||
        v6.startsWith('fd') ||
        v6.startsWith('fe8') ||
        v6.startsWith('fe9') ||
        v6.startsWith('fea') ||
        v6.startsWith('feb') ||
        v6.startsWith('::ffff:')
    ) {
        return true;
    }
    // IPv4 dotted notation — bail to private ranges if it parses.
    const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (v4) {
        const [a, b] = [parseInt(v4[1]!, 10), parseInt(v4[2]!, 10)];
        // 0/8 (unspecified, routes to localhost on some kernels),
        // 10/8, 127/8, 169.254/16, 192.168/16, 172.16/12
        if (a === 0 || a === 10 || a === 127) return true;
        if (a === 169 && b === 254) return true;
        if (a === 192 && b === 168) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
    }
    // Reject obviously obfuscated IPv4 (hex `0x...`, single-int notation
    // `2130706433`, or non-decimal). URL parser leaves these in `.hostname`
    // unnormalized. Anything that looks like an IPv4-attempt but doesn't
    // match the decimal-dotted pattern is rejected as suspect.
    if (/^(0x|0[oO]?\d|\d{8,})/i.test(h)) {
        return true;
    }
    return false;
}

function assertSafeHttpUrl(raw: string): void {
    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        throw new Error('BAD_REQUEST: invalid URL');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('BAD_REQUEST: URL must be http(s)');
    }
    if (isPrivateOrMetadataHost(parsed.hostname)) {
        throw new Error('BAD_REQUEST: URL host is not allowed');
    }
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
            // Bound input length so a malicious caller can't drive Morph/
            // Relace LLM spend with multi-MB payloads (each call is billed
            // per-token against the shared OpenRouter account).
            if (
                originalCode.length > APPLY_DIFF_MAX_STRING_BYTES ||
                updateSnippet.length > APPLY_DIFF_MAX_STRING_BYTES ||
                instruction.length > APPLY_DIFF_MAX_STRING_BYTES
            ) {
                throw new Error(
                    `BAD_REQUEST: input exceeds ${APPLY_DIFF_MAX_STRING_BYTES} bytes per field`,
                );
            }
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
        // Firecrawl per-scrape budget in ms. Default 30s was too short for
        // JS-heavy / large pages (408 "scrape operation timed out"). Default
        // bumped to 60s, caller-overridable, hard-capped at 120s so a single
        // scrape can't pin the action near the Convex runtime ceiling.
        timeout: v.optional(v.number()),
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
            assertSafeHttpUrl(input.url);
            if (!process.env.FIRECRAWL_API_KEY) {
                throw new Error('FIRECRAWL_API_KEY is not configured');
            }

            const formats = input.formats ?? ['markdown'];
            const onlyMainContent = input.onlyMainContent ?? true;

            const app = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });

            // Clamp the scrape budget to [10s, 120s]; default 60s.
            const timeout = Math.min(Math.max(input.timeout ?? 60_000, 10_000), 120_000);

            // 'branding' is supported by the API but not in the SDK types.
            const result = (await app.scrapeUrl(input.url, {
                formats: formats as unknown as never,
                onlyMainContent,
                timeout,
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
            // Bound the query length to prevent abuse — Exa bills per
            // request but very long queries don't make sense and may be
            // probes. 2 KB is generous for natural-language search.
            if (input.query.length > 2048) {
                throw new Error('BAD_REQUEST: query too long');
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
