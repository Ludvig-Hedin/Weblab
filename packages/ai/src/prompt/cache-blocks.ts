/**
 * Split system prompt into cacheable + volatile blocks.
 *
 * Anthropic prompt caching matches by content prefix up to a `cache_control`
 * breakpoint. To maximise hit rate, everything stable across requests goes
 * in front of the breakpoint; everything that changes per request goes after.
 *
 * Stable across requests for a single user:
 *   - <role> (per-framework system instructions)
 *   - <shadcn-block-catalog> (only changes when we ship new shadcn blocks)
 *   - <shell> (universal shell rules)
 *
 * Volatile per request:
 *   - <user-memories> (Mem0 returns different bullets per query text)
 *   - <available-skills> (changes when project skills file changes)
 *
 * For frameworks without shadcn, the stable block omits the catalog. The
 * shadcn catalog string is built once at module load and reused — it was
 * being concatenated from arrays on every single request before.
 */
import type { FrameworkId } from '@weblab/framework';
import {
    SHADCN_AVAILABLE_REGISTRY_HINT,
    SHADCN_BLOCKS,
    SHADCN_CORE_COMPONENTS,
} from '@weblab/constants';

import type { MemorySearchResult } from '../memory/types';
import type { SkillSummary } from '../skills/types';
import {
    frameworkSupportsShadcn,
    getSystemPromptForFramework,
    NEXTJS_ADDENDUM,
    SHELL_PROMPT,
} from './constants';
import { wrapXml } from './helpers';

/**
 * Built once at module load. The catalog only changes when we ship a new
 * shadcn block — rebuilding the same string per request was wasteful.
 */
const SHADCN_CATALOG_BLOCK = (() => {
    const installedBlocks = SHADCN_BLOCKS.map(
        (block) =>
            `- ${block.registryName}: ${block.label} (${block.category}) → import { ${block.componentName} } from "${block.importPath}" — ${block.description}`,
    ).join('\n');
    const installedPrimitives = SHADCN_CORE_COMPONENTS.map(
        (component) =>
            `- ${component.registryName}: import { ${component.componentName} } from "${component.importPath}"`,
    ).join('\n');
    return [
        'Installed shadcnblocks available in this project:',
        installedBlocks,
        '',
        'Installed shadcn/ui primitives available in this project:',
        installedPrimitives,
        '',
        SHADCN_AVAILABLE_REGISTRY_HINT,
    ].join('\n');
})();

/**
 * Per-framework stable blocks. Computed once per framework variant. The
 * Next.js variant appends NEXTJS_ADDENDUM so the cache key stays distinct
 * from generic JSX projects (otherwise we'd serve next/image advice to
 * Remix users).
 */
const STABLE_PROMPT_CACHE = new Map<string, string>();

function getStableBlock(framework: FrameworkId | null | undefined): string {
    const key = framework ?? 'default';
    const cached = STABLE_PROMPT_CACHE.get(key);
    if (cached) return cached;
    let block = '';
    block += wrapXml('role', getSystemPromptForFramework(framework));
    if (frameworkSupportsShadcn(framework)) {
        block += wrapXml('shadcn-block-catalog', SHADCN_CATALOG_BLOCK);
    }
    // NEXTJS_ADDENDUM is already included inside getSystemPromptForFramework
    // for Next.js, but reference it here for grep-discoverability — when a
    // future addendum needs to stay framework-stable, append it after the
    // role wrap, not inside.
    void NEXTJS_ADDENDUM;
    block += wrapXml('shell', SHELL_PROMPT);
    STABLE_PROMPT_CACHE.set(key, block);
    return block;
}

function buildVolatileBlock(
    memories: MemorySearchResult[] | undefined,
    skills: SkillSummary[] | undefined,
): string {
    let block = '';
    if (memories && memories.length > 0) {
        const bullets = memories.map((m) => `- ${m.memory}`).join('\n');
        block += wrapXml('user-memories', bullets);
    }
    if (skills && skills.length > 0) {
        const bullets = skills
            .map((s) => `- ${s.name}${s.description ? ` — ${s.description}` : ''}`)
            .join('\n');
        const intro =
            'These Agent Skills are available in this repository. Use read_skill to fetch a skill body when relevant.';
        block += wrapXml('available-skills', `${intro}\n${bullets}`);
    }
    return block;
}

/**
 * Public API. Returns the stable and volatile halves separately so the
 * caller (request-builder) can assemble them with an explicit cache_control
 * breakpoint between them.
 *
 * Always non-null strings — empty volatile is the empty string, not null.
 */
export interface CachedSystemBlocks {
    stable: string;
    volatile: string;
}

export function getCachedSystemBlocks(args: {
    framework?: FrameworkId | null;
    memories?: MemorySearchResult[];
    skills?: SkillSummary[];
    /** Extra stable suffix (e.g. CREATE/PLAN/ASK mode-specific instructions). */
    modeSuffix?: string;
}): CachedSystemBlocks {
    let stable = getStableBlock(args.framework);
    if (args.modeSuffix) {
        stable += '\n\n' + args.modeSuffix;
    }
    return {
        stable,
        volatile: buildVolatileBlock(args.memories, args.skills),
    };
}

/**
 * Concatenate the two halves into a single string for providers that don't
 * support per-block cache markers (OpenRouter non-Anthropic, Ollama). The
 * cache benefit is lost but the prompt content is preserved verbatim.
 */
export function flattenCachedBlocks(blocks: CachedSystemBlocks): string {
    if (!blocks.volatile) return blocks.stable;
    return `${blocks.stable}\n\n${blocks.volatile}`;
}

/**
 * Build the system prompt as the array-of-content-blocks shape that the
 * Vercel AI SDK forwards to Anthropic's `system` field with cache breakpoints.
 *
 * Returns the SDK's `SystemModelMessage`-compatible content array. The first
 * block carries the cache_control marker; the second is uncached. When the
 * caller is on a non-Anthropic provider, prefer flattenCachedBlocks instead.
 */
export interface AnthropicSystemContentBlock {
    type: 'text';
    text: string;
    providerOptions?: {
        anthropic?: { cacheControl?: { type: 'ephemeral' } };
    };
}

export function toAnthropicSystemBlocks(blocks: CachedSystemBlocks): AnthropicSystemContentBlock[] {
    const out: AnthropicSystemContentBlock[] = [
        {
            type: 'text',
            text: blocks.stable,
            providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
        },
    ];
    if (blocks.volatile) {
        out.push({ type: 'text', text: blocks.volatile });
    }
    return out;
}
