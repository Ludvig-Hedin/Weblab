import { CloneOutputFramework } from '@weblab/models';

const SHARED_GUIDANCE = `WEBSITE CLONE MODE:
- This is the first user message and the project is a blank slate.
- The user wants you to faithfully recreate an existing website using the provided source material.
- Treat the supplied screenshot as the visual source of truth: layout, hierarchy, spacing, typography, and color choices.
- Treat the markdown / page content as the textual source of truth: headlines, copy, navigation labels, footer links, CTAs.
- Treat the brand identity block (when present) as the canonical color palette, fonts, and component tokens — apply it consistently across the entire output.
- Recreate the page section by section in document order. Do not invent extra sections that are not in the source.
- Preserve the visual rhythm and hierarchy seen in the screenshot — match relative font sizes, weights, button shapes, and section padding.
- For images you do not have rights to mirror, use neutral placeholders or inline SVG that fits the section's purpose. Do not hotlink third-party assets.
- For icons, prefer Lucide / Heroicons (if available) or inline SVG.
- If the source uses a custom logo, replace it with a simple typographic wordmark using the brand's primary color and font.
- When the source content is incomplete (single-page scrape, missing sub-pages), build only the home page and link other navigation entries to "#" placeholders.`;

const NEXTJS_CLONE_PROMPT = `${SHARED_GUIDANCE}
- Output stack: Next.js (App Router) + Tailwind CSS + shadcn/ui.
- Put the page implementation in app/page.tsx and split repeatable sections into components under app/_components/ or components/.
- Use shadcn/ui primitives (Button, Card, Badge, etc.) when the source has a matching pattern.
- Use Tailwind utility classes only — do not introduce CSS modules or styled-components.
- Encode the brand colors as Tailwind arbitrary values or extend the existing theme config; do not hardcode hex strings deep in JSX when a design token is available.
`;

const STATIC_HTML_CLONE_PROMPT = `${SHARED_GUIDANCE}
- Output stack: a single index.html with Tailwind via the CDN script (already wired in the sandbox template) and minimal vanilla JS.
- Put all markup in index.html. Inline minor CSS overrides in a single <style> block; do not create separate .css files unless absolutely needed.
- Avoid frameworks, bundlers, or build steps. Anything that needs JS interactivity goes in a single <script> at the bottom of the body.
- Reference brand colors as Tailwind arbitrary values (e.g. bg-[#0F172A]) for one-off cases; use the config block in the <head> if a color repeats.
`;

export function getCloneSystemPrompt(framework: CloneOutputFramework): string {
    switch (framework) {
        case CloneOutputFramework.STATIC_HTML:
            return STATIC_HTML_CLONE_PROMPT;
        case CloneOutputFramework.NEXTJS:
        default:
            return NEXTJS_CLONE_PROMPT;
    }
}
