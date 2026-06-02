# Agent prompt — SEO v2 (auto-generated sitemap · global canonical URL · staging indexing toggle)

You are extending the existing **SEO tab** in Weblab project settings. SEO v1 already shipped: `robots.txt` (with AI-bot/crawler quick-inserts), `llms.txt`, and a custom `sitemap.xml` — all file-backed editors written into the project's `public/`. This task adds the three remaining SEO items. **Read the whole prompt before coding.**

## Where things live (study first)

- SEO tab: [seo-tab.tsx](../../apps/web/client/src/components/ui/settings-modal/seo-tab.tsx). It has a reusable `FileEditorSection` (load → edit → save a `public/` file via `editorEngine.activeSandbox`). Reuse/extend it.
- Sandbox API: `editorEngine.activeSandbox.readFile/writeFile/fileExists` — [sandbox/index.ts](../../apps/web/client/src/components/store/editor/sandbox/index.ts).
- Pages tree (for auto-sitemap): `editorEngine.pages.tree` is `PageNode[]` (`{ id, kind: 'page'|'folder', path, slug, children?, ... }` — see [packages/models/src/pages/index.ts](../../packages/models/src/pages/index.ts)). The General/Overview tab already counts pages by walking this tree (`countPages` in [project/index.tsx](../../apps/web/client/src/components/ui/settings-modal/project/index.tsx)) — mirror that walk.
- Page metadata write path (for canonical): the Site tab writes root-page metadata via `editorEngine.pages.updateMetadataPage('/', metadata)` — see [site/index.tsx](../../apps/web/client/src/components/ui/settings-modal/site/index.tsx). `PageMetadata` (incl. `alternates`, `metadataBase`, `icons`) is in [packages/models/src/pages/index.ts](../../packages/models/src/pages/index.ts).
- The project's base/staging URL: `useQuery(api.domains.getAll, { projectId })` → `domains.published?.url ?? domains.preview?.url` (pattern already used in `site/index.tsx` and `domain/preview.tsx`).

## What to build

### 1. Auto-generated sitemap
- A toggle: **Auto-generate sitemap** vs use the custom `sitemap.xml` (the v1 editor). Persist the toggle in Convex (`projectSeoSettings` or a field on `projectSettings`), `project.update`-guarded.
- When auto is on, generate `public/sitemap.xml` from `editorEngine.pages.tree`: one `<url>` per `kind === 'page'` node, `<loc>` = `${baseUrl}${path}`, optional `<lastmod>`. Write on save (and ideally offer a "regenerate now" action).
- When auto is off, fall back to the v1 custom editor (don't clobber a hand-written file when auto is off).
- Decide + document the precedence: if auto is on, the generated file wins; warn before overwriting a custom file.

### 2. Global canonical URL
- An input for a site-wide canonical base. Write it into the root page metadata as `alternates.canonical` (or `metadataBase`) via `editorEngine.pages.updateMetadataPage('/', ...)` — follow the Site tab's metadata-merge pattern (spread existing metadata, set the field, save). Validate it's a valid absolute URL.
- Persist nothing extra in Convex if the page metadata is the source of truth (read current value back from `homePage.metadata`).

### 3. Staging indexing toggle
- A toggle: **Allow search engines to index the staging domain** (default off — staging usually shouldn't be indexed).
- Effect options: (a) write a `User-agent: *\nDisallow: /` block into `robots.txt` when off, or (b) emit a `<meta name="robots" content="noindex">` into the staging build. **Note the constraint:** staging is only meaningfully servable once publish is re-enabled (`TODO(publish-vercel)`), so "indexing on staging" can't be fully exercised yet — wire the persisted setting + the robots/meta output, and add a "applies to the staging site once published" hint + a BACKLOG note.

## Persistence
- Toggles (auto-sitemap, staging-indexing) → Convex, `project.update`-guarded; run `npx convex codegen` + `npx convex dev --once` after schema changes.
- File contents (sitemap.xml) and page metadata (canonical) remain the real source of truth — read current state back from the project where practical (the v1 SEO tab does this).

## Acceptance criteria
- Auto-sitemap produces valid XML listing every page in the tree, written to `public/sitemap.xml`; toggling back to custom preserves/uses the hand-written file.
- Canonical input writes a valid `alternates.canonical`/`metadataBase` into root metadata and reads back correctly.
- Staging-indexing toggle persists and emits the right robots/meta output, with the "applies once staging is served" hint.
- `bun typecheck` (0 errors), `bun lint` (0 warnings on touched files). Sitemap-generation + URL-validation pure helpers unit-tested.
- Update [docs/feature-catalog.md](../feature-catalog.md) F-781 (SEO tab) + add `T-XXX` rows in [docs/test-plan.md](../test-plan.md). Deferred staging-serving effect → [BACKLOG.md](../../BACKLOG.md).

## Gotchas
- `activeSandbox.readFile` returns `string | Uint8Array` — `String(...)` text files.
- Generate sitemap URLs against the live base URL; handle the no-base-yet (unpublished) case gracefully (relative or a placeholder + hint).
- Don't overwrite a user's hand-edited `sitemap.xml` without consent when flipping auto on.
- Follow the SEO tab's existing layout + `@weblab/ui` primitives; subtitles use `text-foreground-secondary`.
