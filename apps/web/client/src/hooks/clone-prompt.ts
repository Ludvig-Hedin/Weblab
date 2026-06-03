import { CloneOutputFramework } from '@weblab/models';

// Pure, dependency-light helpers for the website-clone flow. Kept out of
// `use-clone-website.ts` (a 'use client' hook that pulls in Convex/Next
// providers) so they stay unit-testable without a React/Convex runtime.
// See `clone-prompt.test.ts`.
//
// Note: the clone *prompt* itself is assembled server-side-of-the-editor in
// `use-start-project.tsx` (`resumeCreate`) from the seeded WEBSITE_URL +
// WEBSITE_SCRAPE + IMAGE context types via `getCloneSystemPrompt`. The hook
// only needs to (a) map the framework choice and (b) bound the scrape size
// before handing it to the `createFromWebsiteClone` action.

// Hard cap on the scraped page text we forward to the clone action. A full-page
// markdown dump can run into hundreds of KB, which (a) risks pushing the Convex
// create-request doc past its ~1MB limit and (b) bloats the AI's first prompt
// with low-signal boilerplate. 24k chars (~6k tokens) is plenty for the model
// to reproduce structure + copy while leaving headroom for the screenshot.
export const MAX_SCRAPE_CHARS = 24_000;

/**
 * Maps the dialog's framework choice to the literal the `createFromWebsiteClone`
 * action accepts. Anything that isn't an explicit static-HTML pick defaults to
 * Next.js — the only other framework the clone dialog offers and the one the AI
 * chat scaffolds best.
 */
export function toFrameworkLiteral(framework: CloneOutputFramework): 'nextjs' | 'static-html' {
    return framework === CloneOutputFramework.STATIC_HTML ? 'static-html' : 'nextjs';
}

/**
 * Bounds scraped page text to {@link MAX_SCRAPE_CHARS}. The `truncated` flag
 * lets a caller note that the content is partial.
 */
export function capScrapedContent(content: string | null | undefined): {
    content: string;
    truncated: boolean;
} {
    const full = content ?? '';
    if (full.length <= MAX_SCRAPE_CHARS) {
        return { content: full, truncated: false };
    }
    return { content: full.slice(0, MAX_SCRAPE_CHARS), truncated: true };
}
