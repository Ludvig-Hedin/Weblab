# AI Wireframes — deferred follow-ups (MVP shipped 2026-06-13)

- **Discovered:** 2026-06-13 (AI wireframes feature build — F-790…F-794). The feature is complete and green: real shadcn blocks render in-canvas and emit as real code to **both** local (desktop NodeFs bridge) and cloud (Vercel Sandbox). These are scoped enhancements.
- **Where:** `packages/wireframe-blocks/`, `apps/web/client/convex/wireframeEmit.ts`, `apps/web/client/src/app/project/[id]/wireframe/`
- **Items:**
  1. **Per-section AI regenerate** — wireframe "regenerate" is page/all-level only; add a per-section action that re-runs `generateObject` for one section (new copy / alternate block) instead of the user swapping variants manually. `#tech-debt`
  2. **Style-guide contrast guard** — `styleGuideToCssVars`/the token editor don't warn when fg/bg or primary/primary-foreground fall below a readable luminance ratio (spec edge case "style guide breaks contrast"). Add a luminance check + inline warning. `#tech-debt`
  3. **Real font loading** — `fontHeading`/`fontBody` are applied as `font-family` name + system fallback only; the Google webfont isn't actually loaded in the live preview or the emitted project (emit can't add a top `@import` after `@import 'tailwindcss'`). Inject a `<link>` in the emitted `layout.tsx` and a preview-scoped font loader. `#tech-debt`
  4. **Expand curated block set** — only ~15 of the 214 vendored pro blocks are registered (1–2 per category). Grow toward fuller coverage by adding prop-driven blocks to `packages/wireframe-blocks/src/blocks/` (+ any new primitives under `src/vendor/ui`) + `meta.ts` + regenerating emit assets; consider codegen from the manifest. `#tech-debt`
  5. **Infinite-canvas pan** — Sitemap is a card tree and Wireframe/Design are scaled frame strips with zoom controls (robust, no fragile custom canvas). A true zoom/pan infinite canvas (like the screenshots) is a polish follow-up. `#tech-debt`
  6. **Emit-asset drift guard** — `packages/wireframe-blocks/src/emit/emit-assets.generated.ts` is committed; add a CI step that re-runs `bun run generate:emit-assets` and fails on diff so block/primitive source edits can't desync from the bundle. `#test-gap` `#infra`
  7. **Cloud emit creates a new project** — `emitToCloud` provisions a fresh Vercel-Sandbox project (mirrors `createFromFigma`); local emit writes into the current project root. Consider unifying so cloud also emits into the current project's sandbox when one is live. `#tech-debt`
- **Risk if ignored:** all enhancements, not regressions — the feature works end-to-end (real shadcn blocks, local + cloud emit, all 13 categories, generation, editing, persistence).
- **Tags:** `#tech-debt` `#ai`
