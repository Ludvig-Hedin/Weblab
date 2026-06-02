# Agent prompt — Fonts tab (Google fonts · Custom fonts · Adobe Fonts)

You are adding a **Fonts** tab to project settings in the Weblab editor. Fonts apply to the **user's project** (their generated site), not the Weblab app UI — so this tab writes into the project's code/assets, not just Convex. **Read the whole prompt before coding.**

## The core challenge

Changing a project's fonts means mutating the project's own source: a Next.js app uses `next/font` and/or Tailwind v4 theme tokens and/or a `<link>` in the root layout. Projects vary, so a naive blind injection can fight the user's existing setup. Scope accordingly and verify against a real running project.

## Where things live (study first)

- Settings tabs registry + enum: [with-project.tsx](../../apps/web/client/src/components/ui/settings-modal/with-project.tsx), [helpers.tsx](../../apps/web/client/src/components/ui/settings-modal/helpers.tsx). Register a new `FONTS = 'fonts'` tab in `projectTabs`; pick an icon (e.g. `Icons.Text` / a type icon).
- **File-write pattern to follow:** the SEO tab [seo-tab.tsx](../../apps/web/client/src/components/ui/settings-modal/seo-tab.tsx) reads/writes project files via `editorEngine.activeSandbox.readFile/writeFile/fileExists` (a load → edit → save editor). Reuse this shape.
- Sandbox API: [sandbox/index.ts](../../apps/web/client/src/components/store/editor/sandbox/index.ts) — `readFile`, `writeFile`, `fileExists`, `readDir`, `listFilesRecursively`. Access via `editorEngine.activeSandbox`.
- Image/asset upload precedent (for custom font files): the Site tab uses `editorEngine.image.upload(file, folder)` — see [site/index.tsx](../../apps/web/client/src/components/ui/settings-modal/site/index.tsx). Fonts need a parallel "upload binary asset to project" path; check whether `editorEngine.image.upload` is image-only or generic, and whether there's a generic file-upload helper. If none, write the font file via `activeSandbox.writeFile(path, uint8array)` into `public/fonts/`.
- Parser (if editing layout/config AST): [@weblab/parser](../../packages/parser/) — Babel-based JSX/TSX edits. Prefer simple, robust file writes over fragile AST edits where possible.
- There's likely an existing font system for the editor UI (`data-font-family` in [globals.css](../../apps/web/client/src/styles/globals.css)) — that's the **app** font, not the project font. Don't conflate them.

## Recommended scope (incremental, each piece complete)

1. **Google fonts (do first):** a searchable picker from a curated Google Fonts list. On select, the cleanest robust effect is to write a `@font-face`-free approach: add the font via the project's root layout using `next/font/google` if the project is Next (detect framework via `@weblab/framework` / project metadata), or inject a `<link rel="stylesheet" href="https://fonts.googleapis.com/...">` + a CSS variable as a fallback. Apply the family to a CSS variable the project's Tailwind theme reads. **Verify on a running project** that the font actually renders.
2. **Custom fonts (medium):** upload TTF/OTF/WOFF/WOFF2 (+ EOT for legacy) to `public/fonts/`, generate `@font-face` rules in a project CSS file, expose the family. Validate file types/sizes. The prompt's wording asks for TTF/OTF/EOT/WOFF for "maximum browser support."
3. **Adobe Fonts (last):** store the Adobe Fonts (Typekit) project/kit token in Convex (per project, `project.update`-guarded) and inject the Adobe embed `<link>`/script into the root layout. Token storage is easy; injection follows the same layout-edit path as Google fonts.

## Persistence
- Store the font configuration (selected Google families, custom font metadata, Adobe token) in Convex so the tab reflects current state without re-parsing project files. New table `projectFontSettings` or a JSON field on `projects` / `projectSettings`. Guard mutations with `requireCap(ctx, 'project.update', { projectId })`. Run `npx convex codegen` + `npx convex dev --once` after schema changes.
- The **source of truth for what actually renders** is the project's code/CSS; keep Convex and the written files in sync, and prefer reading current state from the written files where practical (like the SEO tab does).

## Acceptance criteria
- Selecting a Google font visibly changes the project's rendered font (verify in a running preview, not just compile).
- Custom font upload writes the file(s) to `public/fonts/` and a working `@font-face`; the family becomes selectable.
- Adobe token persists and the embed is injected; clearing it removes the embed.
- `bun typecheck` (0 errors), `bun lint` (0 warnings on touched files). Pure helpers (font-face generation, family slugging) unit-tested.
- New tab added to [docs/feature-catalog.md](../feature-catalog.md) + a `T-XXX` row in [docs/test-plan.md](../test-plan.md). User-facing → a changelog entry in [changelog-entries.ts](../../apps/web/client/src/lib/changelog-entries.ts).

## Gotchas
- Detect the project framework before choosing the injection mechanism (`next/font` only works for Next).
- Custom fonts are binary — `writeFile` accepts `Uint8Array`; don't UTF-8-mangle them.
- Don't break the user's existing font setup — read what's there first; make additive, reversible edits.
- Follow the existing tab layout + `@weblab/ui` primitives (Button/Input/Select); subtitles use `text-foreground-secondary`.
